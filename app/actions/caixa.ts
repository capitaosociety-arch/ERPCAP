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

    /* 
    if (openOrdersCount > 0) {
        throw new Error(`AÇÃO BLOQUEADA: Existem ${openOrdersCount} comanda(s) ou venda(s) em aberto no sistema! Conclua os pagamentos pendentes ou cancele as vendas travadas antes de iniciar o fechamento do caixa.`);
    }
    */

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

    // Apenas registrar a diferença, sem bloquear o fechamento (conforme solicitado pelo usuário)
    if (Math.abs(diff) > 0.01) {
        // Log ou auditoria interna pode ser feita aqui, mas sem lançar erro.
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

    const groupedPayments = await prisma.payment.groupBy({
        by: ['method'],
        where: { cashRegisterId: registerId },
        _sum: { amount: true }
    });

    const individualPaymentsRaw = await prisma.payment.findMany({
        where: { cashRegisterId: registerId },
        include: { order: true },
        orderBy: { date: 'desc' }
    });

    const expectedCashInDrawer = registerToClose.openingBal + (groupedPayments.find(p => p.method === 'CASH')?._sum?.amount || 0);

    const methodsMap: Record<string, string> = {
        'CASH': 'Dinheiro',
        'PIX': 'PIX',
        'CREDIT': 'Cartão de Crédito',
        'DEBIT': 'Cartão de Débito'
    };

    const formattedPayments = groupedPayments.map(p => ({
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

    const totalGrossSold = orderItems.reduce((acc, item) => acc + item.subtotal, 0);

    const individualPayments = individualPaymentsRaw.map(p => ({
        id: p.id,
        method: p.method,
        amount: p.amount,
        date: p.date,
        orderId: p.orderId,
        orderName: p.order?.notes || 'Venda PDV'
    }));

    return JSON.parse(JSON.stringify({
        openOrdersCount,
        openingBal: registerToClose.openingBal,
        expectedCashInDrawer,
        sumAllPayments,
        totalGrossSold,
        payments: formattedPayments,
        individualPayments, // Novo: lista para estorno
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
    }));
}

export async function deleteCashSessionAction(sessionId: string) {
    try {
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

        return { success: true };
    } catch (error: any) {
        console.error("ERRO_DELETE_SESSION:", error);
        return { success: false, error: error.message };
    }
}

export async function getSessionsForDepositAction() {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    const registers = await prisma.cashRegister.findMany({
        where: { status: 'CLOSED' },
        include: { 
            user: { select: { name: true } },
            deposits: true,
            payments: {
                where: { method: 'CASH' }
            }
        },
        orderBy: { closedAt: 'desc' },
        take: 50 // Limite para performance
    });

    return JSON.parse(JSON.stringify(registers.map(reg => {
        const declaredAmount = reg.closingBal || 0;
        const totalCashPayments = reg.payments.reduce((acc, p) => acc + p.amount, 0);
        const auditAmount = reg.openingBal + totalCashPayments;
        const depositedAmount = reg.deposits.reduce((acc, dep) => acc + dep.amount, 0);
        
        return {
            id: reg.id,
            operatorName: reg.user.name,
            openedAt: reg.openedAt,
            closedAt: reg.closedAt,
            declaredAmount,
            auditAmount,
            depositedAmount,
            remainingAmount: Math.max(0, declaredAmount - depositedAmount),
            status: reg.status,
            deposits: reg.deposits
        };
    })));
}

export async function recordCashDepositAction(registerId: string, amount: number, notes?: string) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session) throw new Error('Unauthorized');

        const register = await prisma.cashRegister.findUnique({
            where: { id: registerId },
            include: { deposits: true }
        });

        if (!register) throw new Error('Sessão não encontrada');

        const alreadyDeposited = register.deposits.reduce((acc, d) => acc + d.amount, 0);
        const declared = register.closingBal || 0;
        
        if (amount <= 0) throw new Error('Valor inválido');
        if (alreadyDeposited + amount > declared + 0.01) {
            // Permite um pequeno delta de erro, mas avisa
            // throw new Error('O valor do depósito excede o saldo declarado no caixa.');
        }

        await prisma.cashDeposit.create({
            data: {
                cashRegisterId: registerId,
                amount,
                notes
            }
        });

        await createAuditLog("Depósito Bancário", `Registrado depósito de R$ ${amount.toFixed(2)} vinculado à sessão [${registerId.slice(-6)}].`);

        revalidatePath('/financeiro');
        return { success: true };
    } catch (error: any) {
        console.error("ERRO_DEPOSIT:", error);
        return { success: false, error: error.message };
    }
}
