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
    dueDateString?: string,
    unitCost?: number
) {
    if (!productId || quantity <= 0) {
        throw new Error("Dados inválidos para a movimentação");
    }

    const date = new Date();

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

        // Registrar o log (sempre com a data de lançamento atual no sistema)
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

        // Se for Entrada, podemos atualizar o preço de custo e opcionalmente criar um Contas a Pagar
        if (type === "IN") {
            if (unitCost && unitCost > 0) {
                await tx.product.update({
                    where: { id: productId },
                    data: { cost: unitCost }
                });
                
                await tx.priceHistory.create({
                    data: {
                        productId,
                        price: 0,
                        cost: unitCost,
                        invoice: document || null,
                        date
                    }
                });
            }

            if (dueDateString) {
                const product = await tx.product.findUnique({ where: { id: productId } });
                const cost = unitCost || product?.cost || 0;
                const totalCost = quantity * cost;
                
                if (totalCost > 0) {
                    await tx.financialEntry.create({
                        data: {
                            description: `Compra - ${product?.name || 'Insumo'} (Qtd: ${quantity}) - Balcão`,
                            type: 'PAYABLE',
                            amount: totalCost,
                            dueDate: new Date(dueDateString),
                            category: 'Fornecedor',
                            notes: notes || `Entrada manual de estoque para ${product?.name || 'Insumo'}`,
                            status: 'PENDING',
                            reference: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`
                        }
                    });
                }
            }
        }
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
    dueDateString?: string
) {
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

                // 1. Upsert do estoque
                await tx.stock.upsert({
                    where: { productId: mov.productId },
                    update: {},
                    create: { productId: mov.productId, quantity: 0, minQuantity: 5, unit: "UN" }
                });

                // 2. Atualizar estoque
                await tx.stock.update({
                    where: { productId: mov.productId },
                    data: { quantity: { increment: qty } }
                });

                // 3. Registrar movimentação (data atual)
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

                // 4. Atualizar preço de custo do produto se válido
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

            // Opcional: Criar lançamento de Conta a Pagar se dueDate for informado
            if (dueDateString && totalCost > 0) {
                await tx.financialEntry.create({
                    data: {
                        description: `NF ${document || 'S/N'} - Estoque Balcão`,
                        type: 'PAYABLE',
                        amount: totalCost,
                        dueDate: new Date(dueDateString),
                        category: 'Fornecedor',
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
