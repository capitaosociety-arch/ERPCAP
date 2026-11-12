'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../../lib/auth-guard";
import { createAuditLog } from "./audit";
import { effectiveAverageCost, recordInventoryCost, weightedAverageCost } from "../../lib/inventory-cost";

export async function updateMinStock(productId: string, minQuantity: number) {
    await requirePermission("permStock");

    if (!productId || minQuantity < 0) {
        throw new Error("Valores inválidos");
    }

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { isService: true, stockControlled: true } });
    if (!product || product.isService === true || product.stockControlled === false) {
        throw new Error("Este item nao controla estoque.");
    }

    await prisma.stock.upsert({
        where: { productId },
        update: { minQuantity },
        create: { productId, minQuantity, quantity: 0, unit: "UN" } // defaults
    });

    revalidatePath("/estoque");
    return { success: true };
}

export async function registerStockMovement(
    productId: string, 
    type: string, 
    quantity: number, 
    notes: string, 
    document: string, 
    dueDateString?: string,
    unitCost?: number
) {
    await requirePermission("permStock");

    if (!productId || quantity <= 0) {
        throw new Error("Dados inválidos para a movimentação");
    }

    const date = new Date();

    await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product || product.isService === true || product.stockControlled === false) {
            throw new Error("Este item nao controla estoque.");
        }
        const stock = await tx.stock.upsert({
            where: { productId },
            update: {},
            create: { productId, quantity: 0, minQuantity: 5, unit: "UN" }
        });

        const currentQty = Number(stock.quantity) || 0;
        const fallbackCost = Number(product?.cost) || 0;
        const currentAvg = effectiveAverageCost(stock.averageCost, fallbackCost, currentQty);
        const isPositive = type === "IN";
        const incomingCost = unitCost != null && Number.isFinite(unitCost) && unitCost >= 0
            ? Number(unitCost)
            : fallbackCost;

        let newQuantity: number;
        let newAverageCost = currentAvg;
        let snapshotCost = currentAvg;
        let movementKind = type;

        if (isPositive) {
            newQuantity = currentQty + quantity;
            newAverageCost = weightedAverageCost(currentQty, currentAvg, quantity, incomingCost);
            snapshotCost = incomingCost;
            movementKind = "PURCHASE";
        } else {
            newQuantity = currentQty - quantity;
            snapshotCost = currentAvg;
        }

        await tx.stock.update({
            where: { productId },
            data: { quantity: newQuantity, averageCost: newAverageCost }
        });

        const movement = await tx.stockMovement.create({
            data: {
                productId,
                type,
                movementKind,
                quantity,
                unitCost: snapshotCost,
                notes: notes || null,
                document: document || null,
                date
            }
        });

        await recordInventoryCost(tx, {
            productId,
            location: 'BALCAO',
            movementType: movementKind,
            quantity,
            unitCost: snapshotCost,
            balanceQty: newQuantity,
            balanceAvgCost: newAverageCost,
            referenceId: movement.id,
            notes: notes || null,
        });

        if (isPositive) {
            if (incomingCost > 0) {
                await tx.product.update({
                    where: { id: productId },
                    data: { cost: incomingCost }
                });
                
                await tx.priceHistory.create({
                    data: {
                        productId,
                        price: 0,
                        cost: incomingCost,
                        quantity,
                        landedUnitCost: incomingCost,
                        invoice: document || null,
                        date
                    }
                });
            }

            if (dueDateString) {
                const totalCost = quantity * incomingCost;
                
                if (totalCost > 0) {
                    await tx.financialEntry.create({
                        data: {
                            description: `Compra - ${product?.name || 'Insumo'} (Qtd: ${quantity}) - Balcão`,
                            type: 'PAYABLE',
                            category: 'Fornecedor',
                            entryKind: 'INVENTORY_PURCHASE',
                            competenceDate: new Date(dueDateString),
                            amount: totalCost,
                            dueDate: new Date(dueDateString),
                            notes: notes || `Entrada manual de estoque para ${product?.name || 'Insumo'}`,
                            status: 'PENDING',
                            reference: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`
                        }
                    });
                }
            }
        }
    });

    await createAuditLog("Movimentação de Estoque", `${type === 'IN' ? 'Entrada' : 'Saída'} manual de ${quantity} unidades.`);

    revalidatePath("/estoque");
    return { success: true };
}

export async function registerBatchStockMovement(
    movements: { productId: string, quantity: number, price?: number }[],
    document: string,
    imagePath: string | null,
    notes: string,
    dueDateString?: string
) {
    await requirePermission("permStock");

    if (!movements || movements.length === 0) {
        throw new Error("Nenhum item válido para movimentar.");
    }

    try {
        // A data de lançamento no estoque é sempre agora (data atual do sistema)
        const date = new Date();

        let totalCost = 0;
        for (const mov of movements) {
            totalCost += (Number(mov.quantity) || 0) * (Number(mov.price) || 0);
        }

        const result = await prisma.$transaction(async (tx) => {
            for (const mov of movements) {
                const qty = Number(mov.quantity) || 0;
                const costPrice = Number(mov.price) || 0;

                if (qty <= 0) continue;

                const product = await tx.product.findUnique({ where: { id: mov.productId } });
                if (!product || product.isService === true || product.stockControlled === false) continue;
                const stock = await tx.stock.upsert({
                    where: { productId: mov.productId },
                    update: {},
                    create: { productId: mov.productId, quantity: 0, minQuantity: 5, unit: "UN" }
                });

                const currentQty = Number(stock.quantity) || 0;
                const fallbackCost = Number(product?.cost) || 0;
                const currentAvg = effectiveAverageCost(stock.averageCost, fallbackCost, currentQty);
                const incomingCost = costPrice > 0 ? costPrice : fallbackCost;
                const newQuantity = currentQty + qty;
                const newAverageCost = weightedAverageCost(currentQty, currentAvg, qty, incomingCost);

                await tx.stock.update({
                    where: { productId: mov.productId },
                    data: { quantity: newQuantity, averageCost: newAverageCost }
                });

                const movement = await tx.stockMovement.create({
                    data: {
                        productId: mov.productId,
                        type: "IN",
                        movementKind: "PURCHASE",
                        quantity: qty,
                        unitCost: incomingCost,
                        notes: notes || "Entrada via NF (IA)",
                        document: document || null,
                        // Guarda o caminho do Storage; a URL assinada é gerada na leitura.
                        imageUrl: imagePath || null,
                        date
                    }
                });

                await recordInventoryCost(tx, {
                    productId: mov.productId,
                    location: 'BALCAO',
                    movementType: 'PURCHASE',
                    quantity: qty,
                    unitCost: incomingCost,
                    balanceQty: newQuantity,
                    balanceAvgCost: newAverageCost,
                    referenceId: movement.id,
                    notes: notes || null,
                });

                if (incomingCost > 0) {
                    await tx.product.update({
                        where: { id: mov.productId },
                        data: { cost: incomingCost }
                    });
                    
                    await tx.priceHistory.create({
                        data: {
                            productId: mov.productId,
                            price: 0, 
                            cost: incomingCost,
                            quantity: qty,
                            landedUnitCost: incomingCost,
                            invoice: document || null,
                            date
                        }
                    });
                }
            }

            // Opcional: Criar lançamento de Conta a Pagar se dueDate for informado
            if (dueDateString && totalCost > 0) {
                await tx.financialEntry.create({
                    data: {
                        description: `NF ${document || 'S/N'} - Estoque Balcão`,
                        type: 'PAYABLE',
                        amount: totalCost,
                        dueDate: new Date(dueDateString),
                        category: 'Fornecedor',
                        entryKind: 'INVENTORY_PURCHASE',
                        competenceDate: new Date(dueDateString),
                        notes: notes || 'Gerado automaticamente via importação de NF no Estoque',
                        status: 'PENDING',
                        reference: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`
                    }
                });
            }

            return { success: true };
        }, {
            timeout: 30000
        });

        await createAuditLog("Importação NF-e", `Importação de estoque via nota fiscal (${document}).`);

        revalidatePath("/estoque");
        return { success: true };
    } catch (error: any) {
        console.error("ERRO NO REGISTER_BATCH_STOCK_MOVEMENT:", error);
        return { success: false, error: error.message || "Erro interno ao processar lote de estoque." };
    }
}
