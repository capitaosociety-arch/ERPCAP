'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../../lib/auth-guard";

export async function processCheckoutAction(cart: any[]) {
  const user = await requirePermission("permPDV");
  const userId = user.id;

  const openRegister = await prisma.cashRegister.findFirst({ where: { status: "OPEN" } });
  if (!openRegister) throw new Error("Nenhum caixa aberto! Abra o caixa no menu Financeiro antes de vender.");


  const total = cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);

  // Registra a venda como OPEN (Pendente de pagamento para usar Modal)
  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        userId,
        status: "OPEN",
        total,
        notes: "Caixa RÃ¡pido (PDV)",
        items: {
          create: cart.map(item => ({
            productId: item.product.isService ? undefined : item.product.id,
            serviceId: item.product.isService ? item.product.id : undefined,
            quantity: item.quantity,
            unitPrice: item.product.price,
            subtotal: item.product.price * item.quantity
          }))
        }
      }
    });

    // Baixa AutomÃ¡tica de Estoque imediata
    for (const item of cart) {
      if (item.product.isService) continue;
      
      const stock = await tx.stock.findUnique({ where: { productId: item.product.id }});
      if (stock) {
        await tx.stock.update({
          where: { id: stock.id },
          data: { quantity: { decrement: item.quantity } } 
        });
        
        await tx.stockMovement.create({
          data: {
            productId: item.product.id,
            type: 'OUT_SALE',
            quantity: item.quantity,
            unitCost: item.product.cost ?? null,
            notes: `Lançado via PDV Rápido (Cod ${newOrder.id})`
          }
        });
      }
    }
    return newOrder;
  });

  revalidatePath('/dashboard');
  revalidatePath('/mesas');
  return { success: true, order: order };
}

export async function getOrderWithPayments(orderId: string) {
    await requirePermission(['permPDV', 'permComandas']);

    return await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            payments: { orderBy: { date: 'desc' } },
            items: {
                include: {
                    product: true,
                    service: true
                }
            }
        }
    });
}

export async function cancelOrderAction(orderId: string) {
  await requirePermission(['permPDV', 'permComandas']);

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) throw new Error("Pedido não encontrado");
    if (order.status !== "OPEN") throw new Error("Apenas pedidos abertos podem ser cancelados");

    // Estorna Estoque
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
              type: 'IN', // Devolução
              quantity: item.quantity,
              notes: `Estorno: Venda PDV Cancelada (Cod ${order.id})`
            }
          });
        }
      }
    }

    // Marca como cancelado (Podemos também deletar para não lixar o banco, mas CANCELED é melhor para auditoria)
    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELED", notes: (order.notes || "") + " [CANCELADO]" }
    });
  });

  revalidatePath('/dashboard');
  revalidatePath('/mesas');
  revalidatePath('/estoque');
  return { success: true };
}


