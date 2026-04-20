'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { revalidatePath } from 'next/cache';
import { createAuditLog } from './audit';

export async function openGlobalCashRegister(openingBal: number) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id || (await prisma.user.findFirst())?.id;
    if (!userId) throw new Error('Unauthorized');


    const openRegister = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' }, include: { user: true } });
    if (openRegister) throw new Error(`Já existe um caixa aberto no sistema por ${openRegister.user.name}. Feche-o e faça a conferência antes de abrir um novo para os próximos dias.`);

    await prisma.cashRegister.create({
        data: {
            userId,
            status: 'OPEN',
            openingBal
        }
    });

    await createAuditLog("Abertura de Caixa", `Abriu o caixa do dia com saldo inicial de R$ ${openingBal}.`);

    revalidatePath('/financeiro');
    revalidatePath('/pdv');
    revalidatePath('/dashboard');
}

export async function closeGlobalCashRegister(registerId: string, closingBal: number, notes?: string) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id || (await prisma.user.findFirst())?.id;
    if (!userId) throw new Error('Unauthorized');


    const registerToClose = await prisma.cashRegister.findUnique({
        where: { id: registerId },
        include: { user: true }
    });

    if (!registerToClose) throw new Error('Caixa não encontrado.');

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });

    // Permite fechar apenas se for o mesmo usuário que abriu OU se for um ADMINISTRADOR
    if (registerToClose.userId !== userId && currentUser?.role !== 'ADMIN') {
        throw new Error(`Acesso negado: Apenas o operador que abriu este caixa (${registerToClose.user.name}) ou um Administrador pode realizar o seu fechamento e conferência.`);
    }

    // 1) Impedir fechamento se existirem comandas em aberto
    const openOrdersCount = await prisma.order.count({
        where: { status: 'OPEN' }
    });

    if (openOrdersCount > 0) {
        throw new Error(`AÇÃO BLOQUEADA: Existem ${openOrdersCount} comanda(s) ou venda(s) em aberto no sistema! Conclua os pagamentos pendentes ou cancele as vendas travadas antes de iniciar o fechamento do caixa.`);
    }

    // 2) Validar Diferença da Gaveta Físicamente informada
    const cashPayments = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
            cashRegisterId: registerId,
            method: 'CASH'
        }
    });

    const expectedCashInDrawer = registerToClose.openingBal + (cashPayments._sum.amount || 0);
    const diff = closingBal - expectedCashInDrawer;

    // Se a diferença for além de meros centavos/flutuação decimal...
    if (Math.abs(diff) > 0.01) {
        if (diff < 0) {
            throw new Error(`DIFERENÇA DE CAIXA DETECTADA! O valor inserido está incorreto. Está FALTANDO R$ ${Math.abs(diff).toFixed(2).replace('.', ',')} na gaveta. Contabilize novamente! O valor esperado de sangria é exato e não pode haver divergência.`);
        } else {
            throw new Error(`DIFERENÇA DE CAIXA DETECTADA! O valor inserido é superior. Está SOBRANDO R$ ${Math.abs(diff).toFixed(2).replace('.', ',')} na gaveta. Contabilize novamente! O valor provado em troco ou pagamentos em dinheiro deve bater exato.`);
        }
    }

    await prisma.cashRegister.update({
        where: { id: registerId },
        data: {
            status: 'CLOSED',
            closingBal,
            notes,
            closedAt: new Date()
        }
    });

    await createAuditLog("Fechamento de Caixa", `Fechou o caixa id [${registerId.slice(-6)}] com saldo final de R$ ${closingBal}.`);

    revalidatePath('/financeiro');
    revalidatePath('/pdv');
    revalidatePath('/dashboard');
}

export async function getRegisterSummary(registerId: string) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    const registerToClose = await prisma.cashRegister.findUnique({
        where: { id: registerId }
    });

    if (!registerToClose) throw new Error('Caixa não encontrado');

    const openOrdersCount = await prisma.order.count({
        where: { status: 'OPEN' }
    });

    const payments = await prisma.payment.groupBy({
        by: ['method'],
        where: { cashRegisterId: registerId },
        _sum: { amount: true }
    });

    const expectedCashInDrawer = registerToClose.openingBal + (payments.find(p => p.method === 'CASH')?._sum?.amount || 0);

    const methodsMap: Record<string, string> = {
        'CASH': 'Dinheiro',
        'PIX': 'PIX',
        'CREDIT': 'Cartão de Crédito',
        'DEBIT': 'Cartão de Débito'
    };

    const formattedPayments = payments.map(p => ({
        methodName: methodsMap[p.method] || p.method,
        amount: p._sum.amount || 0
    }));

    // Busca apenas ordens que contenham pagamentos ligados a este caixa específico (ou seja, vendas concluídas neste período)
    const orderItems = await prisma.orderItem.findMany({
        where: {
            status: 'ACTIVE',
            order: {
                payments: {
                    some: { cashRegisterId: registerId }
                }
            }
        },
        include: {
            product: true,
            service: true,
            order: {
                select: {
                    id: true,
                    discount: true,
                    notes: true
                }
            }
        }
    });

    const productSummary: Record<string, { name: string, quantity: number, total: number, hasDiscount: boolean, totalDiscount: number }> = {};
    
    orderItems.forEach(item => {
        const key = item.productId ? `p_${item.productId}` : (item.serviceId ? `s_${item.serviceId}` : item.id);
        const name = item.product?.name || item.service?.name || 'Item Avulso/Desconhecido';
        
        if (!productSummary[key]) {
            productSummary[key] = { name, quantity: 0, total: 0, hasDiscount: false, totalDiscount: 0 };
        }
        productSummary[key].quantity += item.quantity;
        productSummary[key].total += item.subtotal;
        
        if (item.order.discount > 0) {
            productSummary[key].hasDiscount = true;
            // Nota: O desconto é no nível da ordem, então somamos aqui apenas para indicar que houve desconto relevante
            productSummary[key].totalDiscount += item.order.discount; 
        }
    });

    const productsSold = Object.values(productSummary).sort((a, b) => b.quantity - a.quantity);
    const sumAllPayments = formattedPayments.reduce((acc: number, p) => acc + p.amount, 0);
    const totalDiscounts = orderItems.reduce((acc, item) => {
        // Para não duplicar o desconto da ordem se ela tiver múltiplos itens, vamos agrupar por ordem
        return acc;
    }, 0);

    // Cálculo correto de descontos totais da sessão e detalhamento das vendas
    const uniqueOrders = Array.from(new Set(orderItems.map(i => i.order.id)));
    const totalSessionDiscounts = await prisma.order.aggregate({
        where: { id: { in: uniqueOrders } },
        _sum: { discount: true }
    });

    const discountedOrders = await prisma.order.findMany({
        where: { id: { in: uniqueOrders }, discount: { gt: 0 } },
        include: {
            items: {
                include: { product: true, service: true }
            }
        }
    });

    return {
        openOrdersCount,
        openingBal: registerToClose.openingBal,
        expectedCashInDrawer,
        sumAllPayments,
        payments: formattedPayments,
        productsSold,
        closingNotes: registerToClose.notes,
        totalSessionDiscounts: totalSessionDiscounts._sum.discount || 0,
        ordersWithDiscount: discountedOrders.map(o => ({
            id: o.id,
            notes: o.notes,
            totalBruto: o.total,
            discount: o.discount,
            items: o.items.map(i => i.product?.name || i.service?.name || 'Item')
        }))
    };
}

export async function deleteCashSessionAction(sessionId: string) {
    const session = await getServerSession(authOptions) as any;
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error("Acesso negado. Apenas administradores podem excluir sessões de caixa.");
    }

    await prisma.$transaction(async (tx) => {
        // 1. Identificar pagamentos e ordens desta sessão
        const payments = await tx.payment.findMany({
            where: { cashRegisterId: sessionId },
            select: { id: true, orderId: true }
        });

        const orderIds = Array.from(new Set(payments.map(p => p.orderId)));

        // 2. Deletar pagamentos da sessão
        await tx.payment.deleteMany({
            where: { cashRegisterId: sessionId }
        });

        // 3. Deletar ordens vinculadas (Lógica agressiva para limpeza de testes)
        // Isso removerá todos os pedidos que foram liquidados neste caixa.
        if (orderIds.length > 0) {
            await tx.order.deleteMany({
                where: { id: { in: orderIds } }
            });
        }

        // 4. Deletar a sessão de caixa
        await tx.cashRegister.delete({
            where: { id: sessionId }
        });
        
        await createAuditLog(`Exclusão de Sessão de Caixa ID: ${sessionId}`, `Toda a sessão e ordens liquidadas foram removidas.`);
    });

    revalidatePath("/financeiro");
    revalidatePath("/dashboard");
}
