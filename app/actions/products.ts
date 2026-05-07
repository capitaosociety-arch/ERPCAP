'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { createAuditLog, formatChangeLog } from "./audit";

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
        const oldProduct = await prisma.product.findUnique({ where: { id: data.id } });
        
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

        const details = oldProduct ? await formatChangeLog(oldProduct, data, {
            name: "Nome",
            price: "Preço",
            cost: "Custo",
            unit: "Unidade",
            categoryId: "Categoria"
        }) : `Editou informações do produto ${data.name}.`;

        await createAuditLog("Edição de Produto", details);
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
        await createAuditLog("Novo Produto", `Criou o produto ${data.name} com preço R$ ${data.price}.`);
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

export async function quickCreateProductFromInvoice(name: string, cost: number) {
    if (!name) throw new Error("Nome é obrigatório");

    let category = await prisma.productCategory.findFirst({ where: { name: 'Geral' } });
    if (!category) {
        category = await prisma.productCategory.create({ data: { name: 'Geral' } });
    }

    const newProduct = await prisma.product.create({
        data: {
            name,
            categoryId: category.id,
            price: cost * 1.5, // Preço de venda padrão (margem genérica de 50%)
            cost,
            iconUrl: '🆕',
            unit: 'UN',
            isActive: true
        }
    });

    revalidatePath("/estoque");
    revalidatePath("/produtos");
    revalidatePath("/pdv");

    return { success: true, product: newProduct };
}
export async function deleteProduct(productId: string) {
    if (!productId) return { success: false, error: "ID inválido" };

    try {
        // 1. Verificar se o produto já foi vendido (OrderItem) para manter integridade histórica/financeira
        const hasSales = await prisma.orderItem.findFirst({
            where: { productId }
        });

        if (hasSales) {
            return { 
                success: false, 
                error: "Não é possível excluir este produto pois ele já possui histórico de vendas vinculadas. Recomendamos apenas 'Desativar' o produto para que ele não apareça mais no cardápio." 
            };
        }

        // 2. Executar deleção em transação para garantir que o estoque e as movimentações sejam limpos
        await prisma.$transaction(async (tx) => {
            // Deletar registro de estoque
            await tx.stock.deleteMany({
                where: { productId }
            });

            // Deletar todas as movimentações de estoque (entradas/saídas manuais)
            await tx.stockMovement.deleteMany({
                where: { productId }
            });

            // Deletar o produto (PriceHistory será deletado via cascade definido no schema.prisma)
            await tx.product.delete({
                where: { id: productId }
            });
        });

        // Registrar Log de Auditoria
        await createAuditLog("Exclusão de Produto", `O produto ID ${productId} foi excluído permanentemente.`);

        revalidatePath("/produtos");
        revalidatePath("/pdv");
        revalidatePath("/estoque");

        return { success: true };
    } catch (error: any) {
        console.error("ERRO_DELETE_PRODUCT:", error);
        return { 
            success: false, 
            error: "Erro técnico ao excluir produto. Tente desativá-lo ou entre em contato com o suporte." 
        };
    }
}
