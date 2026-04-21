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
    if (openRegister) throw new Error(`Já existe um caixa aberto no sistema por ${openRegister.user?.name || 'outro usuário'}. Feche-o e faça a conferência antes de abrir um novo para os próximos dias.`);

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

    if (registerToClose.userId !== userId && currentUser?.role !== 'ADMIN') {
        throw new Error(`Acesso negado: Apenas o operador que abriu este caixa (${registerToClose.user?.name || 'Usuário'}) ou um Administrador pode realizar o seu fechamento e conferência.`);
    }

    const cashPayments = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
            cashRegisterId: registerId,
            method: 'CASH'
        }
    });

    const expectedCashInDrawer = (registerToClose.openingBal || 0) + (cashPayments._sum.amount || 0);
    
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

    const cashSum = groupedPayments.find(p => p.method === 'CASH')?._sum?.amount || 0;
    const expectedCashInDrawer = (registerToClose.openingBal || 0) + cashSum;

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
                    notes: true,
                    total: true
                }
            }
        }
    });

    const productSummary: Record<string, any> = {};
    
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
            productSummary[key].totalDiscount += item.order.discount; 
        }
    });

    const productsSold = Object.values(productSummary).sort((a: any, b: any) => b.quantity - a.quantity);
    const sumAllPayments = formattedPayments.reduce((acc: number, p) => acc + (p.amount || 0), 0);
    
    const uniqueOrderIds = Array.from(new Set(orderItems.map(i => i.order.id)));
    const totalSessionDiscountsRaw = await prisma.order.aggregate({
        where: { id: { in: uniqueOrderIds } },
        _sum: { discount: true }
    });

    const discountedOrders = await prisma.order.findMany({
        where: { id: { in: uniqueOrderIds }, discount: { gt: 0 } },
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
        individualPayments,
        productsSold,
        closingNotes: registerToClose.notes || '',
        totalSessionDiscounts: totalSessionDiscountsRaw._sum.discount || 0,
        ordersWithDiscount: discountedOrders.map(o => ({
            id: o.id,
            notes: o.notes || 'S/ID',
            totalBruto: o.total,
            discount: o.discount,
            items: o.items.map(i => i.product?.name || i.service?.name || 'Item')
        }))
    }));
}

export async function deleteCashSessionAction(sessionId: string) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || session.user?.role !== 'ADMIN') {
            throw new Error("Acesso negado. Apenas administradores podem excluir sessões de caixa.");
        }

        await prisma.$transaction(async (tx) => {
            const payments = await tx.payment.findMany({
                where: { cashRegisterId: sessionId },
                select: { id: true, orderId: true }
            });

            const orderIds = Array.from(new Set(payments.map(p => p.orderId)));

            await tx.payment.deleteMany({
                where: { cashRegisterId: sessionId }
            });

            if (orderIds.length > 0) {
                await tx.order.deleteMany({
                    where: { id: { in: orderIds } }
                });
            }

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
        take: 50
    });

    const result = registers.map((reg: any) => {
        const declaredAmount = reg.closingBal || 0;
        const openingBal = reg.openingBal || 0;
        
        // Montante a depositar = dinheiro na gaveta - troco inicial
        const amountForDeposit = Math.max(0, declaredAmount - openingBal);
        
        // Quanto já foi depositado deste caixa específico
        const depositedAmount = reg.deposits?.reduce((acc: number, dep: any) => acc + dep.amount, 0) || 0;
        
        return {
            id: reg.id,
            operatorName: reg.user?.name || 'Operador',
            openedAt: reg.openedAt,
            closedAt: reg.closedAt,
            declaredAmount,
            openingBal,
            depositTarget: amountForDeposit,
            depositedAmount,
            remainingAmount: Math.max(0, amountForDeposit - depositedAmount),
            status: reg.status,
            deposits: reg.deposits
        };
    });

    return JSON.parse(JSON.stringify(result));
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

export async function recordGlobalCashDepositAction(amountToDeposit: number, notes?: string) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session) throw new Error('Unauthorized');

        if (amountToDeposit <= 0) throw new Error('Valor inválido');

        // Pega todos os caixas fechados, em ordem ascendente (mais antigos primeiro) para ir abatendo o depósito
        const registers = await prisma.cashRegister.findMany({
            where: { status: 'CLOSED' },
            include: { deposits: true },
            orderBy: { closedAt: 'asc' }
        });

        let remainingGlobalDeposit = amountToDeposit;
        let totalDepositedInThisAction = 0;

        for (const reg of registers) {
            if (remainingGlobalDeposit <= 0) break;

            const declaredAmount = reg.closingBal || 0;
            const openingBal = reg.openingBal || 0;
            const amountForDeposit = Math.max(0, declaredAmount - openingBal);
            const alreadyDeposited = reg.deposits?.reduce((acc: number, d: any) => acc + d.amount, 0) || 0;
            
            const pendingForSession = Math.max(0, amountForDeposit - alreadyDeposited);

            if (pendingForSession > 0) {
                const depositForThisSession = Math.min(pendingForSession, remainingGlobalDeposit);
                
                await prisma.cashDeposit.create({
                    data: {
                        cashRegisterId: reg.id,
                        amount: depositForThisSession,
                        notes: notes || 'Depósito Global Unificado'
                    }
                });

                remainingGlobalDeposit -= depositForThisSession;
                totalDepositedInThisAction += depositForThisSession;
            }
        }

        await createAuditLog("Depósito Bancário Global", `Registrado depósito global/ciclo de R$ ${totalDepositedInThisAction.toFixed(2)}.`);

        revalidatePath('/financeiro');
        revalidatePath('/dashboard');
        return { success: true, deposited: totalDepositedInThisAction };
    } catch (error: any) {
        console.error("ERRO_GLOBAL_DEPOSIT:", error);
        return { success: false, error: error.message };
    }
}
