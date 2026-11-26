'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../../lib/auth-guard";
import { effectiveAverageCost, recordInventoryCost, weightedAverageCost } from "../../lib/inventory-cost";
import { formatQuantityInput } from "../../lib/quantity-input";
import { lockCashRegisterRow, lockOrderRow, lockStockRows } from "../../lib/stock-lock";
import { assertUniqueRentalBookings, resolveLinkedRental, type RentalBookingInput } from "../../lib/rental-booking";
import {
  buildOperationDetail,
  buildOperationMarker,
  isValidOperationKey,
  readOperationResourceId,
} from "../../lib/operation-idempotency";
import { publicActionErrorMessage } from "../../lib/action-errors";

const CHECKOUT_IDEMPOTENCY_ACTION = 'CheckoutIdempotency';
const CHECKOUT_FALLBACK_MESSAGE = 'Não foi possível finalizar a venda. Tente novamente.';
const CANCEL_ORDER_FALLBACK_MESSAGE = 'Não foi possível cancelar a venda. Tente novamente.';

type CheckoutResult =
  | { success: true; order: any; idempotent: boolean }
  | { success: false; error: string };

type CancelOrderResult = { success: true } | { success: false; error: string };

export async function processCheckoutAction(cart: any[], idempotencyKey?: string): Promise<CheckoutResult> {
  try {
    const user = await requirePermission("permPDV");
    const userId = user.id;

    if (!Array.isArray(cart) || cart.length === 0) {
      return { success: false, error: "Carrinho vazio!" };
    }

    const hasIdempotencyKey = typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0;
    if (hasIdempotencyKey && !isValidOperationKey(idempotencyKey)) {
      return { success: false, error: CHECKOUT_FALLBACK_MESSAGE };
    }
    const marker = hasIdempotencyKey
      ? buildOperationMarker('checkout', idempotencyKey as string)
      : null;

    const openRegister = await prisma.cashRegister.findFirst({ where: { status: "OPEN" } });
    if (!openRegister) {
      return { success: false, error: "Nenhum caixa aberto! Abra o caixa no menu Financeiro antes de vender." };
    }


  const productIds = cart
    .filter((item) => item?.product?.catalogType !== 'service' && item?.product?.id)
    .map((item) => item.product.id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, price: true, cost: true, isService: true, stockControlled: true, allowFractional: true },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  const safeCart = cart.map((item) => {
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Quantidade inválida.');
    }
    if (item?.product?.catalogType === 'service') {
      if (!Number.isInteger(quantity)) throw new Error('Quantidade inválida.');
      return { ...item, quantity };
    }
    const product = productById.get(item?.product?.id);
    if (!product) throw new Error('Produto não encontrado no catálogo.');
    if (!product.allowFractional && !Number.isInteger(quantity)) {
      throw new Error('Quantidade inválida.');
    }
    return {
      ...item,
      quantity,
      product: {
        ...item.product,
        price: product.price,
        cost: product.cost,
        isService: product.isService,
        stockControlled: product.stockControlled,
        allowFractional: product.allowFractional,
        catalogType: 'product',
      },
    };
  });

  const total = safeCart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);

  assertUniqueRentalBookings(
    safeCart
      .map((item): RentalBookingInput | null => item.rentalBooking || null)
      .filter((booking): booking is RentalBookingInput => booking !== null)
  );

  // Registra a venda como OPEN (Pendente de pagamento para usar Modal)
  const result = await prisma.$transaction(async (tx): Promise<CheckoutResult> => {
    if (marker) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${marker}))::text`;
      const prior = await tx.auditLog.findFirst({
        where: {
          userId,
          action: CHECKOUT_IDEMPOTENCY_ACTION,
          details: { startsWith: `${marker}#order:` },
        },
        select: { details: true },
        orderBy: { timestamp: 'desc' },
      });
      if (prior) {
        const existingOrderId = readOperationResourceId(prior.details, 'order');
        if (existingOrderId) {
          const existingOrder = await tx.order.findUnique({
            where: { id: existingOrderId },
            select: { id: true, total: true, discount: true, status: true },
          });
          if (existingOrder) {
            return { success: true, order: existingOrder, idempotent: true };
          }
        }
      }
    }

    await lockCashRegisterRow(tx, openRegister.id);
    const currentRegister = await tx.cashRegister.findUnique({
      where: { id: openRegister.id },
      select: { status: true },
    });
    if (!currentRegister || currentRegister.status !== 'OPEN') {
      throw new Error('O caixa foi fechado. Abra um novo caixa antes de vender.');
    }

    const linkedRentalIds = new Map<number, string>();
    for (let index = 0; index < safeCart.length; index++) {
      const item = safeCart[index];
      if (!item.rentalBooking) continue;
      const linked = await resolveLinkedRental(tx, {
        ...item.rentalBooking,
        amount: item.rentalBooking.amount ?? item.product.price * item.quantity,
      });
      linkedRentalIds.set(index, linked.id);
    }

    const newOrder = await tx.order.create({
      data: {
        userId,
        status: "OPEN",
        total,
        notes: "Caixa Rápido (PDV)",
      },
    });

    const createdItems = new Map<number, { id: string }>();
    for (let index = 0; index < safeCart.length; index++) {
      const item = safeCart[index];
      const created = await tx.orderItem.create({
        data: {
          orderId: newOrder.id,
          productId: item.product.catalogType === 'service' ? undefined : item.product.id,
          serviceId: item.product.catalogType === 'service' ? item.product.id : undefined,
          quantity: item.quantity,
          unitPrice: item.product.price,
          subtotal: item.product.price * item.quantity,
          rentalId: item.rentalId || linkedRentalIds.get(index) || undefined,
        },
      });
      createdItems.set(index, created);
    }

    // Baixa automática de estoque, com bloqueio prévio em ordem determinística.
    const tracked = safeCart
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !(item.product.catalogType === 'service' || item.product.isService === true || item.product.stockControlled === false));

    for (const { item } of tracked) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0 || (!item.product.allowFractional && !Number.isInteger(item.quantity))) {
        throw new Error('Quantidade inválida.');
      }
    }

    const requestedByProduct = new Map<string, number>();
    for (const { item } of tracked) {
      requestedByProduct.set(item.product.id, (requestedByProduct.get(item.product.id) || 0) + item.quantity);
    }

    const lockedStocks = await lockStockRows(tx, Array.from(requestedByProduct.keys()));
    for (const [productId, requestedQty] of requestedByProduct) {
      const stock = lockedStocks.get(productId);
      if (!stock) throw new Error('Estoque não cadastrado para este produto.');
      const currentQty = Number(stock.quantity) || 0;
      if (requestedQty > currentQty + 1e-9) {
        const sample = tracked.find(({ item }) => item.product.id === productId)?.item;
        throw new Error(`Estoque insuficiente! Quantidade máxima permitida: ${formatQuantityInput(currentQty, !!sample?.product.allowFractional)}.`);
      }
    }

    const runningStock = new Map<string, { quantity: number; averageCost: number }>();
    for (const [productId, stock] of lockedStocks) {
      if (stock) {
        runningStock.set(productId, {
          quantity: Number(stock.quantity) || 0,
          averageCost: Number(stock.averageCost) || 0,
        });
      }
    }

    const sortedTracked = [...tracked].sort((a, b) =>
      String(a.item.product.id).localeCompare(String(b.item.product.id)) || a.index - b.index
    );
    for (const { item, index } of sortedTracked) {
      const state = runningStock.get(item.product.id);
      if (!state) throw new Error('Estoque não cadastrado para este produto.');
      const currentQty = state.quantity;
      const unitCost = effectiveAverageCost(state.averageCost, item.product.cost, currentQty);
      const newQty = currentQty - item.quantity;

      await tx.stock.update({
        where: { productId: item.product.id },
        data: { quantity: newQty, averageCost: unitCost }
      });
      state.quantity = newQty;
      state.averageCost = unitCost;

      const createdItem = createdItems.get(index);
      if (!createdItem) throw new Error('Item da venda não encontrado.');

      const movement = await tx.stockMovement.create({
        data: {
          productId: item.product.id,
          type: 'OUT_SALE',
          movementKind: 'SALE',
          orderId: newOrder.id,
          orderItemId: createdItem.id,
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
        balanceAvgCost: unitCost,
        referenceId: movement.id,
        notes: `Venda PDV ${newOrder.id}`,
      });
    }

    if (marker) {
      await tx.auditLog.create({
        data: {
          userId,
          action: CHECKOUT_IDEMPOTENCY_ACTION,
          details: buildOperationDetail(marker, 'order', newOrder.id),
        },
      });
    }

    return { success: true, order: newOrder, idempotent: false };
  }, { maxWait: 10000, timeout: 30000 });

  if (!result.success) {
    return result;
  }

  try {
    revalidatePath('/dashboard');
    revalidatePath('/mesas');
  } catch (error) {
    console.error('ERRO_REVALIDATE_CHECKOUT:', error);
  }

  return result;
  } catch (error) {
    console.error('ERRO_CHECKOUT_PDV:', error);
    return { success: false, error: publicActionErrorMessage(error, CHECKOUT_FALLBACK_MESSAGE) };
  }
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

export async function cancelOrderAction(orderId: string): Promise<CancelOrderResult> {
  try {
    const actor = await requirePermission(['permPDV', 'permComandas']);
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) {
      return { success: false, error: 'Pedido não encontrado.' };
    }

    const result = await prisma.$transaction(async (tx): Promise<CancelOrderResult> => {
      await lockOrderRow(tx, normalizedOrderId);
      const order = await tx.order.findUnique({
        where: { id: normalizedOrderId },
        include: { items: true, payments: true }
      });

      if (!order) return { success: false, error: 'Pedido não encontrado.' };
      if (order.status !== 'OPEN') {
        return { success: false, error: 'Apenas pedidos abertos podem ser cancelados.' };
      }
      const received = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
      if (received > 0.01) {
        return {
          success: false,
          error: 'Pedido possui pagamento parcial. Estorne o valor recebido antes de cancelar; os registros financeiros serão preservados.',
        };
      }

      // Ordem consistente de bloqueios: Order -> Stock (produtos ordenados).
      const lockedStocks = await lockStockRows(
        tx,
        order.items
          .map((item) => item.productId)
          .filter((id): id is string => !!id),
      );
      const runningStock = new Map<string, { quantity: number; averageCost: number }>();
      for (const [productId, stock] of lockedStocks) {
        if (stock) {
          runningStock.set(productId, {
            quantity: Number(stock.quantity) || 0,
            averageCost: Number(stock.averageCost) || 0,
          });
        }
      }

      // Estorna estoque usando o custo originalmente registrado na venda.
      for (const item of order.items) {
        const product = item.productId
          ? await tx.product.findUnique({ where: { id: item.productId }, select: { isService: true, stockControlled: true } })
          : null;
        const trackStock = !!item.productId && !!product && product.isService !== true && product.stockControlled !== false;
        if (trackStock) {
          const state = item.productId ? runningStock.get(item.productId) : null;
          if (state) {
            const saleMovements = await tx.stockMovement.findMany({
              where: { orderId: order.id, productId: item.productId!, type: 'OUT_SALE' },
              select: { quantity: true, unitCost: true }
            });
            const saleQty = saleMovements.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
            const saleValue = saleMovements.reduce((acc, m) => acc + ((Number(m.quantity) || 0) * (Number(m.unitCost) || 0)), 0);
            const returnCost = saleQty > 0
              ? Number((saleValue / saleQty).toFixed(6))
              : effectiveAverageCost(state.averageCost, 0, state.quantity);

            const currentQty = state.quantity;
            const currentAvg = effectiveAverageCost(state.averageCost, returnCost, currentQty);
            const newQty = currentQty + item.quantity;
            const newAvg = weightedAverageCost(currentQty, currentAvg, item.quantity, returnCost);

            await tx.stock.update({
              where: { productId: item.productId! },
              data: { quantity: newQty, averageCost: newAvg }
            });
            state.quantity = newQty;
            state.averageCost = newAvg;

            const movement = await tx.stockMovement.create({
              data: {
                productId: item.productId!,
                type: 'IN',
                movementKind: 'RETURN',
                orderId: order.id,
                orderItemId: item.id,
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

      const linkedRentalIds = Array.from(new Set(order.items.map(item => item.rentalId).filter((id): id is string => !!id)));
      if (linkedRentalIds.length > 0) {
        await tx.rental.updateMany({
          where: { id: { in: linkedRentalIds }, status: { not: 'CANCELED' } },
          data: { status: 'CANCELED', cancelledAt: new Date() },
        });
      }

      await tx.order.update({
        where: { id: normalizedOrderId },
        data: { status: "CANCELED", notes: (order.notes || "") + " [CANCELADO]" }
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'Cancelamento de Venda PDV',
          details: `Pedido [${normalizedOrderId.slice(-6)}] cancelado. Estoque devolvido quando aplicável; pagamentos e histórico preservados.`,
        },
      });

      return { success: true };
    }, { maxWait: 10000, timeout: 30000 });

    if (!result.success) {
      return result;
    }

    try {
      revalidatePath('/dashboard');
      revalidatePath('/mesas');
      revalidatePath('/estoque');
    } catch (error) {
      console.error('ERRO_REVALIDATE_CANCELAMENTO_PDV:', error);
    }

    return result;
  } catch (error) {
    console.error('ERRO_CANCELAMENTO_PDV:', error);
    return { success: false, error: publicActionErrorMessage(error, CANCEL_ORDER_FALLBACK_MESSAGE) };
  }
}


