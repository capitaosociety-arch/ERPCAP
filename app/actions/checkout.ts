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


  const productIds = cart
    .filter((item) => item?.product?.catalogType !== 'service' && item?.product?.id)
    .map((item) => item.product.id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, price: true, cost: true, isService: true, stockControlled: true },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  const safeCart = cart.map((item) => {
    if (item?.product?.catalogType === 'service') return item;
    const product = productById.get(item?.product?.id);
    if (!product) throw new Error('Produto nao encontrado no catalogo.');
    return {
      ...item,
      product: {
        ...item.product,
        price: product.price,
        cost: product.cost,
        isService: product.isService,
        stockControlled: product.stockControlled,
        catalogType: 'product',
      },
    };
  });

  const total = safeCart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);

  // Registra a venda como OPEN (Pendente de pagamento para usar Modal)
  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        userId,
        status: "OPEN",
        total,
        notes: "Caixa Rápido (PDV)",
        items: {
          create: safeCart.map(item => ({
            productId: item.product.catalogType === 'service' ? undefined : item.product.id,
            serviceId: item.product.catalogType === 'service' ? item.product.id : undefined,
            quantity: item.quantity,
            unitPrice: item.product.price,
            subtotal: item.product.price * item.quantity
          }))
        }
      }
    });

    // Baixa Automática de Estoque imediata
    for (const item of safeCart) {
      if (item.product.catalogType === 'service' || item.product.isService === true || item.product.stockControlled === false) continue;
      
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
      const product = item.productId
        ? await tx.product.findUnique({ where: { id: item.productId }, select: { isService: true, stockControlled: true } })
        : null;
      const trackStock = !!item.productId && !!product && product.isService !== true && product.stockControlled !== false;
      if (trackStock) {
        const stock = await tx.stock.findUnique({ where: { productId: item.productId! } });
        if (stock) {
          const saleMovements = await tx.stockMovement.findMany({
            where: { orderId: order.id, productId: item.productId!, type: 'OUT_SALE' },
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
              productId: item.productId!,
              type: 'IN', // Devolução
              movementKind: 'RETURN',
              orderId: order.id,
              quantity: item.quantity,
              unitCost: returnCost,
              notes: `Estorno: Venda PDV Cancelada (Cod ${order.id})`
            }
          });

          await recordInventoryCost(tx, {
            productId: item.productId!,
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


