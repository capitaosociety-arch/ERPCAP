'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../../lib/auth-guard";
import { effectiveAverageCost, recordInventoryCost, weightedAverageCost } from "../../lib/inventory-cost";

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
        const currentQty = Number(stock.quantity) || 0;
        const unitCost = effectiveAverageCost(stock.averageCost, item.product.cost, currentQty);
        const newQty = currentQty - item.quantity;

        await tx.stock.update({
          where: { id: stock.id },
          data: { quantity: newQty, averageCost: unitCost }
        });
        
        const movement = await tx.stockMovement.create({
          data: {
            productId: item.product.id,
            type: 'OUT_SALE',
            movementKind: 'SALE',
            orderId: newOrder.id,
            quantity: item.quantity,
            unitCost,
            notes: `Lançado via PDV Rápido (Cod ${newOrder.id})`
          }
        });

        await recordInventoryCost(tx, {
          productId: item.product.id,
          location: 'BALCAO',
          movementType: 'SALE',
          quantity: item.quantity,
          unitCost,
          balanceQty: newQty,
          balanceAvgCost: effectiveAverageCost(stock.averageCost, item.product.cost, newQty),
          referenceId: movement.id,
          notes: `Venda PDV ${newOrder.id}`,
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

    // Estorna Estoque usando o custo originalmente registrado na venda
    for (const item of order.items) {
      if (item.productId) {
        const stock = await tx.stock.findUnique({ where: { productId: item.productId } });
        if (stock) {
          const saleMovements = await tx.stockMovement.findMany({
            where: { orderId: order.id, productId: item.productId, type: 'OUT_SALE' },
            select: { quantity: true, unitCost: true }
          });
          const saleQty = saleMovements.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
          const saleValue = saleMovements.reduce((acc, m) => acc + ((Number(m.quantity) || 0) * (Number(m.unitCost) || 0)), 0);
          const returnCost = saleQty > 0
            ? Number((saleValue / saleQty).toFixed(6))
            : effectiveAverageCost(stock.averageCost, 0, stock.quantity);

          const currentQty = Number(stock.quantity) || 0;
          const currentAvg = effectiveAverageCost(stock.averageCost, returnCost, currentQty);
          const newQty = currentQty + item.quantity;
          const newAvg = weightedAverageCost(currentQty, currentAvg, item.quantity, returnCost);

          await tx.stock.update({
            where: { id: stock.id },
            data: { quantity: newQty, averageCost: newAvg }
          });

          const movement = await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'IN', // Devolução
              movementKind: 'RETURN',
              orderId: order.id,
              quantity: item.quantity,
              unitCost: returnCost,
              notes: `Estorno: Venda PDV Cancelada (Cod ${order.id})`
            }
          });

          await recordInventoryCost(tx, {
            productId: item.productId,
            location: 'BALCAO',
            movementType: 'RETURN',
            quantity: item.quantity,
            unitCost: returnCost,
            balanceQty: newQty,
            balanceAvgCost: newAvg,
            referenceId: movement.id,
            notes: `Estorno PDV ${order.id}`,
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


