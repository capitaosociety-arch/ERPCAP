'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { requirePermission, requireUser } from "../../lib/auth-guard";
import { createAuditLog } from "./audit";
import { effectiveAverageCost, recordInventoryCost, weightedAverageCost } from "../../lib/inventory-cost";
import { formatQuantityInput, maxQuantityForExistingItem } from "../../lib/quantity-input";
import { lockOrderItemRow, lockStockRow } from "../../lib/stock-lock";
import { resolveLinkedRental, type RentalBookingInput } from "../../lib/rental-booking";
import { assertFinancialPeriodOpen } from "./financial-periods";

const COMANDAS_ACCESS = ["permPDV", "permComandas"] as const;
const PAYMENT_ACCESS = ["permPDV", "permComandas", "permFinance"] as const;

export async function createComanda(name: string, customerId?: string | null) {
    if(!name) throw new Error("Name required");

    const user = await requirePermission([...COMANDAS_ACCESS]);
    const userId = user.id;

    const register = await prisma.cashRegister.findFirst({ where: { status: "OPEN" } });
    if (!register) throw new Error("Nenhum caixa aberto! Abra o caixa antes de criar novas comandas.");

    await prisma.order.create({
        data: {
            notes: name,
            userId: userId,
            status: "OPEN",
            total: 0,
            customerId: customerId || null
        }
    });

    if (customerId) {
        const { recalcScore } = await import('./score');
        await recalcScore(customerId);
    }

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}

export async function closeComanda(orderId: string) {
    await requirePermission([...COMANDAS_ACCESS]);

    await prisma.order.update({
        where: { id: orderId },
        data: { status: "CLOSED", closedAt: new Date() }
    });
    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}

export async function addItemToOrder(orderId: string, itemId: string, quantity: number, price: number, isService: boolean = false, rentalId?: string, rentalBooking?: RentalBookingInput) {
    await requirePermission([...COMANDAS_ACCESS]);

    await prisma.$transaction(async (tx) => {
        const linkedRental = rentalBooking
            ? await resolveLinkedRental(tx, { ...rentalBooking, amount: rentalBooking.amount ?? price * quantity })
            : null;
        const finalRentalId = rentalId || linkedRental?.id || null;
        if (finalRentalId) {
            const duplicateLink = await tx.orderItem.findFirst({
                where: { rentalId: finalRentalId, status: "ACTIVE" },
                select: { id: true },
            });
            if (duplicateLink) throw new Error("Esta reserva ja esta vinculada a um item ativo.");
        }
        const product = !isService
            ? await tx.product.findUnique({ where: { id: itemId }, select: { cost: true, isService: true, stockControlled: true, allowFractional: true } })
            : null;
        const trackStock = !isService && !!product && product.isService !== true && product.stockControlled !== false;
        const allowFractional = !!product?.allowFractional;
        if (!Number.isFinite(quantity) || quantity <= 0 || (!allowFractional && !Number.isInteger(quantity))) {
            throw new Error("Quantidade invalida.");
        }
        if (trackStock) {
            const stock = await lockStockRow(tx, itemId);
            if (!stock) throw new Error("Estoque nao cadastrado para este produto.");
            const currentQty = Number(stock.quantity) || 0;
            if (quantity > currentQty) {
                throw new Error(`Estoque insuficiente! Quantidade maxima permitida: ${formatQuantityInput(currentQty, allowFractional)}.`);
            }
        }

        const orderItem = await tx.orderItem.create({
            data: {
                orderId,
                productId: isService ? undefined : itemId,
                serviceId: isService ? itemId : undefined,
                quantity,
                unitPrice: price,
                subtotal: quantity * price,
                status: "ACTIVE",
                rentalId: finalRentalId || undefined
            }
        });

        await tx.order.update({
            where: { id: orderId },
            data: { total: { increment: quantity * price } }
        });

        if (trackStock) {
            const hasStock = await tx.stock.findUnique({ where: { productId: itemId }});
            if(hasStock) {
               const currentQty = Number(hasStock.quantity) || 0;
               const unitCost = effectiveAverageCost(hasStock.averageCost, product?.cost, currentQty);
               const newQty = currentQty - quantity;

               await tx.stock.update({
                   where: { productId: itemId },
                   data: { quantity: newQty, averageCost: unitCost }
               });
               
               const movement = await tx.stockMovement.create({
                   data: {
                       productId: itemId,
                       type: "OUT_SALE",
                       movementKind: "SALE",
                       orderId,
                       orderItemId: orderItem.id,
                       quantity,
                       unitCost,
                       notes: `Adicionado à comanda`
                   }
               });

               await recordInventoryCost(tx, {
                   productId: itemId,
                   location: 'BALCAO',
                   movementType: 'SALE',
                   quantity,
                   unitCost,
                   balanceQty: newQty,
                   balanceAvgCost: effectiveAverageCost(hasStock.averageCost, product?.cost, newQty),
                   referenceId: movement.id,
                   notes: `Venda comanda ${orderId}`,
               });
            }
        }
    });

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}

export async function processPayment(orderId: string, amount: number, method: string, discount: number = 0) {
    const user = await requirePermission([...PAYMENT_ACCESS]);
    const userId = user.id;

    if (!userId) throw new Error("Usuário não logado");

    // Garante que existe um Caixa ("CashRegister") aberto onde esse pagamento vai cair
    const register = await prisma.cashRegister.findFirst({
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
            include: { payments: true, items: { select: { rentalId: true } } }
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
                const rentalIds = Array.from(new Set(order.items.map(item => item.rentalId).filter((id): id is string => !!id)));
                if (rentalIds.length > 0) {
                    await tx.rental.updateMany({
                        where: { id: { in: rentalIds }, status: { not: 'CANCELED' } },
                        data: { status: 'PAID' },
                    });
                }
            }
        }
    });

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}
export async function updateOrderItemQuantity(orderItemId: string, newQuantity: number) {
    await requirePermission([...COMANDAS_ACCESS]);

    if (newQuantity <= 0) throw new Error("A quantidade deve ser maior que zero.");

    await prisma.$transaction(async (tx) => {
        await lockOrderItemRow(tx, orderItemId);
        const item = await tx.orderItem.findUnique({
            where: { id: orderItemId },
            include: { order: true }
        });

        if (!item) throw new Error("Item não encontrado");
        if (item.order.status !== "OPEN") throw new Error("Apenas itens de comandas em aberto podem ser alterados");

        const delta = newQuantity - item.quantity;
        if (delta === 0) return;

        // Verifica e ajusta o estoque caso seja produto (não serviço)
        const product = item.productId
            ? await tx.product.findUnique({ where: { id: item.productId }, select: { cost: true, isService: true, stockControlled: true, allowFractional: true } })
            : null;
        const allowFractional = !!product?.allowFractional;
        if (!allowFractional && !Number.isInteger(newQuantity)) {
            throw new Error("A quantidade deve ser um numero inteiro positivo.");
        }
        const trackStock = !!item.productId && !!product && product.isService !== true && product.stockControlled !== false;

        if (trackStock) {
            const stock = await lockStockRow(tx, item.productId!);
            if (!stock) throw new Error("Estoque nao cadastrado para este produto.");
            {
                const currentQty = Number(stock.quantity) || 0;
                const maxQuantity = maxQuantityForExistingItem(item.quantity, currentQty);
                if (delta > 0 && newQuantity > maxQuantity + 1e-9) {
                    throw new Error(`Estoque insuficiente! Quantidade maxima permitida: ${formatQuantityInput(maxQuantity, allowFractional)}.`);
                }
                const currentAvg = effectiveAverageCost(stock.averageCost, product?.cost, currentQty);
                let unitCost = currentAvg;
                const newQty = currentQty - delta;
                let newAvg = currentAvg;

                if (delta < 0) {
                    const saleMovements = await tx.stockMovement.findMany({
                        where: { orderItemId: item.id, productId: item.productId!, type: 'OUT_SALE' },
                        select: { quantity: true, unitCost: true }
                    });
                    const saleQty = saleMovements.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
                    const saleValue = saleMovements.reduce((acc, m) => acc + ((Number(m.quantity) || 0) * (Number(m.unitCost) || 0)), 0);
                    unitCost = saleQty > 0 ? Number((saleValue / saleQty).toFixed(6)) : currentAvg;
                    newAvg = weightedAverageCost(currentQty, currentAvg, Math.abs(delta), unitCost);
                }

                await tx.stock.update({
                    where: { id: stock.id },
                    data: { quantity: newQty, averageCost: newAvg }
                });

                const movement = await tx.stockMovement.create({
                    data: {
                        productId: item.productId!,
                        type: delta > 0 ? "OUT_SALE" : "IN",
                        movementKind: delta > 0 ? "SALE" : "RETURN",
                        orderId: item.orderId,
                        orderItemId: item.id,
                        quantity: Math.abs(delta),
                        unitCost,
                        notes: `Ajuste de quantidade na comanda (${item.quantity} -> ${newQuantity})`
                    }
                });

                await recordInventoryCost(tx, {
                    productId: item.productId!,
                    location: 'BALCAO',
                    movementType: delta > 0 ? 'SALE' : 'RETURN',
                    quantity: Math.abs(delta),
                    unitCost,
                    balanceQty: newQty,
                    balanceAvgCost: newAvg,
                    referenceId: movement.id,
                    notes: `Ajuste comanda ${item.orderId}`,
                });
            }
        }

        // Atualiza o item e o total da ordem
        const newSubtotal = newQuantity * item.unitPrice;
        await tx.orderItem.update({
            where: { id: orderItemId },
            data: { quantity: newQuantity, subtotal: newSubtotal }
        });

        await tx.order.update({
            where: { id: item.orderId },
            data: { total: { increment: newSubtotal - item.subtotal } }
        });
    });

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
    revalidatePath("/pdv");
}

export async function removeItemFromOrder(orderItemId: string) {
    await requirePermission([...COMANDAS_ACCESS]);

    await prisma.$transaction(async (tx) => {
        const item = await tx.orderItem.findUnique({
            where: { id: orderItemId },
            include: { order: true }
        });

        if (!item) throw new Error("Item não encontrado");
        if (item.order.status !== "OPEN") throw new Error("Apenas itens de comandas em aberto podem ser removidos");

        // 1. Estorna estoque se for produto, usando o custo original da venda
        const product = item.productId
            ? await tx.product.findUnique({ where: { id: item.productId }, select: { isService: true, stockControlled: true } })
            : null;
        const trackStock = !!item.productId && !!product && product.isService !== true && product.stockControlled !== false;

        if (trackStock) {
            const stock = await tx.stock.findUnique({ where: { productId: item.productId! } });
            if (stock) {
                const saleMovements = await tx.stockMovement.findMany({
                    where: { orderItemId: item.id, productId: item.productId!, type: 'OUT_SALE' },
                    select: { quantity: true, unitCost: true }
                });
                const saleQty = saleMovements.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
                const saleValue = saleMovements.reduce((acc, m) => acc + ((Number(m.quantity) || 0) * (Number(m.unitCost) || 0)), 0);
                const currentQty = Number(stock.quantity) || 0;
                const currentAvg = effectiveAverageCost(stock.averageCost, 0, currentQty);
                const unitCost = saleQty > 0 ? Number((saleValue / saleQty).toFixed(6)) : currentAvg;
                const newQty = currentQty + item.quantity;
                const newAvg = weightedAverageCost(currentQty, currentAvg, item.quantity, unitCost);

                await tx.stock.update({
                    where: { id: stock.id },
                    data: { quantity: newQty, averageCost: newAvg }
                });

                const movement = await tx.stockMovement.create({
                    data: {
                        productId: item.productId!,
                        type: "IN",
                        movementKind: "RETURN",
                        orderId: item.orderId,
                        orderItemId: item.id,
                        quantity: item.quantity,
                        unitCost,
                        notes: `Estorno: Item removido da comanda (Cod ${item.orderId})`
                    }
                });

                await recordInventoryCost(tx, {
                    productId: item.productId!,
                    location: 'BALCAO',
                    movementType: 'RETURN',
                    quantity: item.quantity,
                    unitCost,
                    balanceQty: newQty,
                    balanceAvgCost: newAvg,
                    referenceId: movement.id,
                    notes: `Remoção item comanda ${item.orderId}`,
                });
            }
        }

        // 2. Atualiza o total da ordem
        await tx.order.update({
            where: { id: item.orderId },
            data: { total: { decrement: item.subtotal } }
        });

        if (item.rentalId) {
            await tx.rental.updateMany({
                where: { id: item.rentalId, status: { not: 'CANCELED' } },
                data: { status: 'CANCELED', cancelledAt: new Date() },
            });
        }

        // 3. Deleta o item
        await tx.orderItem.delete({
            where: { id: orderItemId }
        });
    });

    revalidatePath("/mesas");
    revalidatePath("/dashboard");
}

export async function deleteComandaAction(orderId: string) {
    const actor = await requireUser();
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
        throw new Error("Apenas administradores ou gerentes podem cancelar uma comanda inteira.");
    }

    await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { items: true, payments: true }
        });

        if (!order) throw new Error("Comanda não encontrada");
        if (order.status !== "OPEN") throw new Error("Apenas comandas abertas podem ser canceladas");

        // 1. Estorna estoque de todos os itens usando o custo original da venda
        for (const item of order.items) {
        const product = item.productId
            ? await tx.product.findUnique({ where: { id: item.productId }, select: { cost: true, isService: true, stockControlled: true } })
            : null;
        const trackStock = !!item.productId && !!product && product.isService !== true && product.stockControlled !== false;

        if (trackStock) {
            const stock = await tx.stock.findUnique({ where: { productId: item.productId! } });
            if (stock) {
                    const saleMovements = await tx.stockMovement.findMany({
                        where: { orderId, productId: item.productId!, type: 'OUT_SALE' },
                        select: { quantity: true, unitCost: true }
                    });
                    const saleQty = saleMovements.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
                    const saleValue = saleMovements.reduce((acc, m) => acc + ((Number(m.quantity) || 0) * (Number(m.unitCost) || 0)), 0);
                    const currentQty = Number(stock.quantity) || 0;
                    const currentAvg = effectiveAverageCost(stock.averageCost, 0, currentQty);
                    const unitCost = saleQty > 0 ? Number((saleValue / saleQty).toFixed(6)) : currentAvg;
                    const newQty = currentQty + item.quantity;
                    const newAvg = weightedAverageCost(currentQty, currentAvg, item.quantity, unitCost);

                    await tx.stock.update({
                        where: { id: stock.id },
                        data: { quantity: newQty, averageCost: newAvg }
                    });

                    const movement = await tx.stockMovement.create({
                        data: {
                            productId: item.productId!,
                            type: "IN",
                            movementKind: "RETURN",
                            orderId,
                            orderItemId: item.id,
                            quantity: item.quantity,
                            unitCost,
                            notes: `Estorno: Comanda Inteira Cancelada (Cod ${orderId})`
                        }
                    });

                    await recordInventoryCost(tx, {
                        productId: item.productId!,
                        location: 'BALCAO',
                        movementType: 'RETURN',
                        quantity: item.quantity,
                        unitCost,
                        balanceQty: newQty,
                        balanceAvgCost: newAvg,
                        referenceId: movement.id,
                        notes: `Cancelamento comanda ${orderId}`,
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

        const linkedRentalIds = Array.from(new Set(order.items.map(item => item.rentalId).filter((id): id is string => !!id)));
        if (linkedRentalIds.length > 0) {
            await tx.rental.updateMany({
                where: { id: { in: linkedRentalIds }, status: { not: 'CANCELED' } },
                data: { status: 'CANCELED', cancelledAt: new Date() },
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
        const actor = await requirePermission(['permFinance', 'permComandas', 'permPDV']);
        const normalizedPaymentId = String(paymentId || '').trim();
        if (!normalizedPaymentId) throw new Error("Pagamento invalido.");
        const idempotencyMarker = `payment-void:${normalizedPaymentId}`;

        const result = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyMarker}))::text`;
            const prior = await tx.auditLog.findFirst({
                where: { action: 'PaymentVoidIdempotency', details: idempotencyMarker },
                select: { id: true },
            });
            if (prior) {
                return { alreadyApplied: true };
            }

            const payment = await tx.payment.findUnique({
                where: { id: normalizedPaymentId },
                include: { order: true }
            });

            if (!payment) throw new Error("Pagamento nao encontrado.");
            await assertFinancialPeriodOpen(payment.date);

            await tx.payment.delete({
                where: { id: normalizedPaymentId }
            });

            if (payment.order.status === "CLOSED") {
                await tx.order.update({
                    where: { id: payment.orderId },
                    data: {
                        status: "OPEN",
                        closedAt: null
                    }
                });
                const linkedItems = await tx.orderItem.findMany({
                    where: { orderId: payment.orderId, rentalId: { not: null } },
                    select: { rentalId: true },
                });
                const rentalIds = Array.from(new Set(linkedItems.map(item => item.rentalId).filter((id): id is string => !!id)));
                if (rentalIds.length > 0) {
                    await tx.rental.updateMany({
                        where: { id: { in: rentalIds }, status: 'PAID' },
                        data: { status: 'PENDING' },
                    });
                }
            }

            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: "Estorno de Pagamento",
                    details: `Estornou R$ ${payment.amount.toFixed(2)} (${payment.method}) da comanda [${payment.orderId.slice(-6)}].`,
                },
            });
            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: 'PaymentVoidIdempotency',
                    details: idempotencyMarker,
                },
            });

            return {
                alreadyApplied: false,
                orderId: payment.orderId,
                amount: payment.amount,
                method: payment.method,
            };
        }, { maxWait: 10000, timeout: 15000 });

        try {
            revalidatePath("/mesas");
            revalidatePath("/financeiro");
            revalidatePath("/dashboard");
            revalidatePath("/pdv");
        } catch (error) {
            console.error("ERRO_REVALIDATE_ESTORNO:", error);
        }

        return { success: true, idempotent: result.alreadyApplied === true };
    } catch (error: any) {
        console.error("ERRO_ESTORNO:", error);
        return { success: false, error: error.message };
    }
}
export async function editPaymentAction(paymentId: string, newMethod: string, newAmount: number) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || session.user?.role !== 'ADMIN') {
            throw new Error("Apenas administradores podem editar pagamentos.");
        }

        const payment = await prisma.payment.findUnique({
            where: { id: paymentId }
        });

        if (!payment) throw new Error("Pagamento não encontrado.");
        await assertFinancialPeriodOpen(payment.date);

        await prisma.payment.update({
            where: { id: paymentId },
            data: { 
                method: newMethod,
                amount: newAmount
            }
        });

        await createAuditLog(
            "Edição de Pagamento", 
            `Alterou pagamento [${paymentId.slice(-6)}] para ${newMethod} (R$ ${newAmount}).`
        );

        revalidatePath("/financeiro");
        revalidatePath("/mesas");
        revalidatePath("/pdv");
        revalidatePath("/dashboard");

        return { success: true };
    } catch (error: any) {
        console.error("ERRO_EDITAR_PAGAMENTO:", error);
        return { success: false, error: error.message };
    }
}
