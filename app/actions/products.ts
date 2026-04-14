'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateProductPrice(
    productId: string,
    price: number,
    cost: number,
    invoice: string | null,
    dateValue: string
) {
    if (!productId || price < 0 || cost < 0) {
        throw new Error("Valores inválidos para atualização de preço.");
    }

    const date = new Date(dateValue);

    await prisma.$transaction(async (tx) => {
        // Atualiza os valores do produto principal
        await tx.product.update({
            where: { id: productId },
            data: {
                price,
                cost
            }
        });

        // Cria a entrada no histórico de preços
        await tx.priceHistory.create({
            data: {
                productId,
                price,
                cost,
                invoice: invoice || null,
                date
            }
        });
    });

    revalidatePath("/produtos");
    revalidatePath("/pdv");
    return { success: true };
}

export async function upsertProduct(data: {
    id?: string,
    name: string,
    categoryId: string,
    price: number,
    cost: number,
    iconUrl: string,
    unit: string
}) {
    if (!data.name || !data.categoryId || data.price < 0) {
        throw new Error("Campos obrigatórios inválidos");
    }

    if (data.id) {
        await prisma.product.update({
            where: { id: data.id },
            data: {
                name: data.name,
                categoryId: data.categoryId,
                price: data.price,
                cost: data.cost,
                iconUrl: data.iconUrl,
                unit: data.unit
            }
        });
    } else {
        await prisma.product.create({
            data: {
                name: data.name,
                categoryId: data.categoryId,
                price: data.price,
                cost: data.cost,
                iconUrl: data.iconUrl,
                unit: data.unit,
                isActive: true
            }
        });
    }

    revalidatePath("/produtos");
    revalidatePath("/pdv");
    return { success: true };
}

export async function toggleProductStatus(productId: string, isActive: boolean) {
    if (!productId) throw new Error("ID inválido");

    await prisma.product.update({
        where: { id: productId },
        data: { isActive }
    });

    revalidatePath("/produtos");
    revalidatePath("/pdv");
    return { success: true };
}
