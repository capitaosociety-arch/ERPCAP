'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { createAuditLog } from "./audit";

export async function createComanda(name: string) {
    if(!name) throw new Error("Name required");

    const session = await getServerSession(authOptions) as any;
    const userId = session?.user?.id || (await prisma.user.findFirst())?.id;

    let register = await prisma.cashRegister.findFirst({ where: { status: "OPEN" } });
    if (!register) throw new Error("Nenhum caixa aberto! Abra o caixa antes de criar novas comandas.");

    await prisma.order.create({
        data: {
            notes: name,
            userId: userId,
            status: "OPEN",
            total: 0
        }
    });

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}

export async function closeComanda(orderId: string) {
    await prisma.order.update({
        where: { id: orderId },
        data: { status: "CLOSED", closedAt: new Date() }
    });
    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}

export async function addItemToOrder(orderId: string, itemId: string, quantity: number, price: number, isService: boolean = false) {
    await prisma.$transaction(async (tx) => {
        await tx.orderItem.create({
            data: {
                orderId,
                productId: isService ? undefined : itemId,
                serviceId: isService ? itemId : undefined,
                quantity,
                unitPrice: price,
                subtotal: quantity * price,
                status: "ACTIVE"
            }
        });

        await tx.order.update({
            where: { id: orderId },
            data: { total: { increment: quantity * price } }
        });

        if (!isService) {
            const hasStock = await tx.stock.findUnique({ where: { productId: itemId }});
            if(hasStock) {
               await tx.stock.update({
                   where: { productId: itemId },
                   data: { quantity: { decrement: quantity } }
               });
               
               await tx.stockMovement.create({
                   data: {
                       productId: itemId,
                       type: "OUT_SALE",
                       quantity,
                       notes: `Adicionado Ã  comanda`
                   }
               });
            }
        }
    });

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}

export async function processPayment(orderId: string, amount: number, method: string, discount: number = 0) {
    const session = await getServerSession(authOptions) as any;
    const userId = session?.user?.id || (await prisma.user.findFirst())?.id;

    if (!userId) throw new Error("UsuÃ¡rio nÃ£o logado");

    // Garante que existe um Caixa ("CashRegister") aberto onde esse pagamento vai cair
    let register = await prisma.cashRegister.findFirst({
        where: { status: "OPEN" }
    });

    if (!register) {
        throw new Error("Nenhum caixa aberto! Abra o caixa no menu Financeiro antes de processar pagamentos.");
    }


    await prisma.$transaction(async (tx) => {
        // 1. Cria o Pagamento (Pode ser parcial)
        await tx.payment.create({
            data: {
                orderId,
                cashRegisterId: register!.id,
                userId,
                method,
                amount
            }
        });

        // 2. Registra o Desconto, se um desconto real foi inserido agora
        if (discount > 0) {
            await tx.order.update({
                where: { id: orderId },
                data: { discount: { increment: discount } }
            });
        }

        // 3. Avalia o Fechamento
        const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { payments: true }
        });

        if (order) {
            const totalPaid = order.payments.reduce((acc, p) => acc + p.amount, 0);
            const balance = order.total - order.discount - totalPaid;

            // Se o saldo ficar zerado, fecha e encerra a conta de vez (Margem flutuante para double)
            if (balance <= 0.01) {
                await tx.order.update({
                    where: { id: orderId },
                    data: { status: "CLOSED", closedAt: new Date() }
                });
            }
        }
    });

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}
export async function removeItemFromOrder(orderItemId: string) {
    await prisma.$transaction(async (tx) => {
        const item = await tx.orderItem.findUnique({
            where: { id: orderItemId },
            include: { order: true }
        });

        if (!item) throw new Error("Item não encontrado");
        if (item.order.status !== "OPEN") throw new Error("Apenas itens de comandas em aberto podem ser removidos");

        // 1. Estorna estoque se for produto
        if (item.productId) {
            const stock = await tx.stock.findUnique({ where: { productId: item.productId } });
            if (stock) {
                await tx.stock.update({
                    where: { id: stock.id },
                    data: { quantity: { increment: item.quantity } }
                });

                await tx.stockMovement.create({
                    data: {
                        productId: item.productId,
                        type: "IN",
                        quantity: item.quantity,
                        notes: `Estorno: Item removido da comanda (Cod ${item.orderId})`
                    }
                });
            }
        }

        // 2. Atualiza o total da ordem
        await tx.order.update({
            where: { id: item.orderId },
            data: { total: { decrement: item.subtotal } }
        });

        // 3. Deleta o item
        await tx.orderItem.delete({
            where: { id: orderItemId }
        });
    });

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}

export async function deleteComandaAction(orderId: string) {
    const session = await getServerSession(authOptions) as any;
    if (!session) throw new Error("Unauthorized");

    await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { items: true, payments: true }
        });

        if (!order) throw new Error("Comanda não encontrada");
        if (order.status !== "OPEN") throw new Error("Apenas comandas abertas podem ser canceladas");

        // 1. Estorna estoque de todos os itens
        for (const item of order.items) {
            if (item.productId) {
                const stock = await tx.stock.findUnique({ where: { productId: item.productId } });
                if (stock) {
                    await tx.stock.update({
                        where: { id: stock.id },
                        data: { quantity: { increment: item.quantity } }
                    });

                    await tx.stockMovement.create({
                        data: {
                            productId: item.productId,
                            type: "IN",
                            quantity: item.quantity,
                            notes: `Estorno: Comanda Inteira Cancelada (Cod ${orderId})`
                        }
                    });
                }
            }
        }

        // 2. Remove pagamentos vinculados (se houver parciais) para não sujar o caixa
        if (order.payments.length > 0) {
            await tx.payment.deleteMany({
                where: { orderId: orderId }
            });
        }

        // 3. Marca como cancelado
        await tx.order.update({
            where: { id: orderId },
            data: { status: "CANCELED", notes: (order.notes || "") + " [CANCELADO]" }
        });
    });

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}

export async function voidPaymentAction(paymentId: string) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session) throw new Error("Não autorizado");

        const result = await prisma.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({
                where: { id: paymentId },
                include: { order: true }
            });

            if (!payment) throw new Error(`Pagamento não encontrado! Tentou ID: [${paymentId}]`);

            // 1. Remove o pagamento
            await tx.payment.delete({
                where: { id: paymentId }
            });

            // 2. Se a ordem estava fechada, reabre ela
            if (payment.order.status === "CLOSED") {
                await tx.order.update({
                    where: { id: payment.orderId },
                    data: { 
                        status: "OPEN", 
                        closedAt: null 
                    }
                });
            }

            return { orderId: payment.orderId, amount: payment.amount, method: payment.method };
        });

        await createAuditLog(
            "Estorno de Pagamento", 
            `Estornou R$ ${result.amount.toFixed(2)} (${result.method}) da comanda [${result.orderId.slice(-6)}].`
        );

        revalidatePath("/mesas");
        revalidatePath("/financeiro");
        revalidatePath("/dashboard");
        revalidatePath("/pdv");

        return { success: true };
    } catch (error: any) {
        console.error("ERRO_ESTORNO:", error);
        return { success: false, error: error.message };
    }
}
