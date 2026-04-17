'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit";

export async function updateMinStock(productId: string, minQuantity: number) {
    if (!productId || minQuantity < 0) {
        throw new Error("Valores inválidos");
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
    dateString: string
) {
    if (!productId || quantity <= 0) {
        throw new Error("Dados inválidos para a movimentação");
    }

    const date = new Date(dateString);

    await prisma.$transaction(async (tx) => {
        // Obter ou criar o estoque atual
        const stock = await tx.stock.upsert({
            where: { productId },
            update: {},
            create: { productId, quantity: 0, minQuantity: 5, unit: "UN" }
        });

        const isPositive = type === "IN";
        const newQuantity = isPositive ? stock.quantity + quantity : stock.quantity - quantity;

        // Atualizar estoque
        await tx.stock.update({
            where: { productId },
            data: { quantity: newQuantity }
        });

            // Registrar o log
            await tx.stockMovement.create({
                data: {
                    productId,
                    type,
                    quantity,
                    notes: notes || null,
                    document: document || null,
                    date
                }
            });
        });

        // Registrar Log de Auditoria
        await createAuditLog("Movimentação de Estoque", `${type === 'IN' ? 'Entrada' : 'Saída'} manual de ${quantity} unidades.`);

        revalidatePath("/estoque");
    return { success: true };
}

export async function registerBatchStockMovement(
    movements: { productId: string, quantity: number, price?: number }[],
    document: string,
    imageUrl: string | null,
    notes: string,
    dateString: string
) {
    if (!movements || movements.length === 0) {
        throw new Error("Nenhum item válido para movimentar.");
    }

    try {
        // Garantir data válida
        let date = new Date();
        if (dateString) {
            const parsedDate = new Date(dateString);
            if (!isNaN(parsedDate.getTime())) {
                date = parsedDate;
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            for (const mov of movements) {
                // 1. Garantir que quantidade seja válida
                const qty = Number(mov.quantity) || 0;
                const costPrice = Number(mov.price) || 0;

                if (qty <= 0) continue;

                // 2. Upsert do estoque (garante que a linha existe antes de incrementar)
                await tx.stock.upsert({
                    where: { productId: mov.productId },
                    update: {},
                    create: { productId: mov.productId, quantity: 0, minQuantity: 5, unit: "UN" }
                });

                // 3. Atualizar estoque usando atomic increment (evita sobrescrever em itens duplicados)
                await tx.stock.update({
                    where: { productId: mov.productId },
                    data: { quantity: { increment: qty } }
                });

                // 4. Registrar movimentação
                await tx.stockMovement.create({
                    data: {
                        productId: mov.productId,
                        type: "IN",
                        quantity: qty,
                        notes: notes || "Entrada via NF (IA)",
                        document: document || null,
                        imageUrl: imageUrl || null,
                        date
                    }
                });

                // 5. Atualizar preço de custo do produto se válido
                if (costPrice > 0) {
                    await tx.product.update({
                        where: { id: mov.productId },
                        data: { cost: costPrice }
                    });
                    
                    await tx.priceHistory.create({
                        data: {
                            productId: mov.productId,
                            price: 0, 
                            cost: costPrice,
                            invoice: document || null,
                            date
                        }
                    });
                }
            }
            return { success: true };
        }, {
            timeout: 10000 // Aumentar timeout para transações maiores
        });

        // Registrar Log de Auditoria
        await createAuditLog("Importação NF-e", `Importação de estoque via nota fiscal (${document}).`);

        revalidatePath("/estoque");
        return result;
    } catch (error: any) {
        console.error("ERRO NO REGISTER_BATCH_STOCK_MOVEMENT:", error);
        throw new Error(error.message || "Erro interno ao processar lote de estoque.");
    }
}
