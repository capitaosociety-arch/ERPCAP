'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";

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

