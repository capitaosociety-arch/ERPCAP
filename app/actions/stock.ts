'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";

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

    const date = dateString ? new Date(dateString) : new Date();

    await prisma.$transaction(async (tx) => {
        for (const mov of movements) {
            // Obter ou criar o estoque atual
            const stock = await tx.stock.upsert({
                where: { productId: mov.productId },
                update: {},
                create: { productId: mov.productId, quantity: 0, minQuantity: 5, unit: "UN" }
            });

            // Atualizar estoque (sempre IN pois é NF)
            await tx.stock.update({
                where: { productId: mov.productId },
                data: { quantity: stock.quantity + mov.quantity }
            });

            // Registrar movimentação
            await tx.stockMovement.create({
                data: {
                    productId: mov.productId,
                    type: "IN",
                    quantity: mov.quantity,
                    notes: notes || "Entrada via NF (IA)",
                    document: document || null,
                    imageUrl: imageUrl || null,
                    date
                }
            });

            // Opcional: Atualizar preço de custo do produto se vier na nota
            if (mov.price && mov.price > 0) {
                 await tx.product.update({
                      where: { id: mov.productId },
                      data: { cost: mov.price }
                 });
                 
                 // Obter ou criar historico
                 await tx.priceHistory.create({
                      data: {
                           productId: mov.productId,
                           price: 0, 
                           cost: mov.price,
                           invoice: document || null,
                           date
                      }
                 });
            }
        }
    });

    revalidatePath("/estoque");
    return { success: true };
}
