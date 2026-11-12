'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { revalidatePath } from 'next/cache';
import { createAuditLog } from './audit';
import { effectiveAverageCost, recordInventoryCost, weightedAverageCost } from '../../lib/inventory-cost';

async function verifyAuth(requiredPerm: string = 'permDepot') {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) throw new Error('Unauthorized');

    const userId = (session.user as any).id;
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) throw new Error('User not found');
    
    if (dbUser.role !== 'ADMIN') {
        const dbPerms = dbUser as any;
        if (!dbPerms[requiredPerm]) throw new Error('Access denied');
    }
    return dbUser;
}

function assertStockControlled(product: { isService: boolean; stockControlled: boolean } | null) {
    if (!product || product.isService === true || product.stockControlled === false) {
        throw new Error('Este item nao controla estoque.');
    }
}


// 1. Listar todo o inventário (visão geral do Depósito)
export async function getDepotInventory() {
    await verifyAuth();
    
    return await prisma.product.findMany({
        where: { isActive: true, isService: false, stockControlled: true },
        include: {
            depotStock: true,
            category: true,
            stock: true
        },
        orderBy: { name: 'asc' }
    });
}

// 2. Adicionar Fundo de Depósito (Abastecer)
export async function addDepotStock(
    productId: string, 
    quantity: number, 
    document?: string, 
    notes?: string,
    dueDateString?: string,
    unitCost?: number
) {
    if (quantity <= 0) throw new Error('A quantidade deve ser maior que zero.');
    await verifyAuth();

    await prisma.$transaction(async (tx) => {
        const date = new Date();
        const product = await tx.product.findUnique({ where: { id: productId } });
        assertStockControlled(product);
        const depot = await tx.depotStock.upsert({
            where: { productId },
            update: {},
            create: { productId, quantity: 0, minQuantity: 5, unit: "UN" }
        });

        const currentQty = Number(depot.quantity) || 0;
        const fallbackCost = Number(product?.cost) || 0;
        const currentAvg = effectiveAverageCost(depot.averageCost, fallbackCost, currentQty);
        const incomingCost = unitCost != null && Number.isFinite(unitCost) && unitCost >= 0
            ? Number(unitCost)
            : fallbackCost;
        const newQuantity = currentQty + quantity;
        const newAverageCost = weightedAverageCost(currentQty, currentAvg, quantity, incomingCost);

        await tx.depotStock.update({
            where: { productId },
            data: { quantity: newQuantity, averageCost: newAverageCost }
        });

        const movement = await tx.depotMovement.create({
            data: {
                productId,
                type: 'IN',
                movementKind: 'PURCHASE',
                quantity,
                unitCost: incomingCost,
                document,
                notes: notes || 'Entrada manual em Depósito',
                date
            }
        });

        await recordInventoryCost(tx, {
            productId,
            location: 'DEPOT',
            movementType: 'PURCHASE',
            quantity,
            unitCost: incomingCost,
            balanceQty: newQuantity,
            balanceAvgCost: newAverageCost,
            referenceId: movement.id,
            notes: notes || null,
        });

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
                        description: `Compra - ${product?.name || 'Insumo'} (Qtd: ${quantity}) - Matriz`,
                        type: 'PAYABLE',
                        amount: totalCost,
                        dueDate: new Date(dueDateString),
                        category: 'Fornecedor',
                        entryKind: 'INVENTORY_PURCHASE',
                        competenceDate: new Date(dueDateString),
                        notes: notes || `Entrada manual de depósito para ${product?.name || 'Insumo'}`,
                        status: 'PENDING',
                        reference: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`
                    }
                });
            }
        }

        await createAuditLog("Entrada em Depósito", `Adicionou ${quantity} unidades de ${product?.name} ao depósito geral. Documento/NF: ${document || 'N/A'}`);
    });

    revalidatePath('/deposito');
}

// 3. SOLICITAR TRANSFERÊNCIA: Depot -> Estoque de Vendas
export async function requestTransfer(productId: string, quantity: number, notes?: string) {
    if (quantity <= 0) throw new Error('A quantidade deve ser maior que zero.');
    const user = await verifyAuth();

    // Validar se tem saldo no depósito antes de sequer solicitar (opcional mas recomendado)
    const product = await prisma.product.findUnique({ where: { id: productId } });
    assertStockControlled(product);
    const depot = await prisma.depotStock.findUnique({ where: { productId } });
    if (!depot || depot.quantity < quantity) {
        throw new Error(`Saldo insuficiente no depósito para solicitar transferência. Disponível: ${depot?.quantity || 0}`);
    }

    await prisma.transferRequest.create({
        data: {
            productId,
            quantity,
            userId: user.id,
            notes: notes || 'Solicitação de abastecimento de balcão',
            status: 'PENDING'
        }
    });

    await createAuditLog("Solicitação de Transferência", `Solicitou a transferência de ${quantity} unidades de ${product?.name} para o estoque de vendas.`);

    revalidatePath('/deposito');
}

// 4. LISTAR SOLICITAÇÕES
export async function getTransferRequests() {
    await verifyAuth();
    return await prisma.transferRequest.findMany({
        include: {
            product: true,
            user: { select: { name: true } },
            authorizedBy: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
}

// 5. AUTORIZAR TRANSFERÊNCIA (Execução da movimentação física)
export async function authorizeTransfer(requestId: string) {
    const user = await verifyAuth(); // Garante que tem permDepot
    
    // Apenas Gerentes ou Admins podem autorizar (ou conforme regra de negócio)
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
        throw new Error('Apenas administradores ou gerentes podem autorizar transferências de estoque.');
    }

    await prisma.$transaction(async (tx) => {
        const request = await tx.transferRequest.findUnique({
            where: { id: requestId },
            include: { product: true }
        });

        if (!request || request.status !== 'PENDING') {
            throw new Error('Solicitação não encontrada ou já processada.');
        }

        const product = await tx.product.findUnique({ where: { id: request.productId } });
        assertStockControlled(product);
        const depot = await tx.depotStock.findUnique({ where: { productId: request.productId } });
        if (!depot || depot.quantity < request.quantity) {
            throw new Error(`Saldo insuficiente no depósito! Tentativa: ${request.quantity}, Disponível: ${depot?.quantity || 0}`);
        }

        const fallbackCost = Number(product?.cost) || 0;
        const depotAvg = effectiveAverageCost(depot.averageCost, fallbackCost, depot.quantity);
        const newDepotQty = Number(depot.quantity) - request.quantity;

        // A) Deduzir do Depósito, mantendo o custo médio da origem
        await tx.depotStock.update({
            where: { productId: request.productId },
            data: { quantity: newDepotQty }
        });
        
        const depotMovement = await tx.depotMovement.create({
            data: {
                productId: request.productId,
                type: 'OUT_TRANSFER',
                movementKind: 'TRANSFER_OUT',
                quantity: request.quantity,
                unitCost: depotAvg,
                notes: `Transferência Autorizada por ${user.name} [Ref: ${request.id.slice(-4)}]`
            }
        });

        await recordInventoryCost(tx, {
            productId: request.productId,
            location: 'DEPOT',
            movementType: 'TRANSFER_OUT',
            quantity: request.quantity,
            unitCost: depotAvg,
            balanceQty: newDepotQty,
            balanceAvgCost: depotAvg,
            referenceId: depotMovement.id,
            notes: `Transferência para Balcão [Ref: ${request.id.slice(-4)}]`,
        });

        // B) Abastecer Estoque "Frente de Loja" pelo custo da origem
        const stock = await tx.stock.upsert({
            where: { productId: request.productId },
            update: {},
            create: { productId: request.productId, quantity: 0, minQuantity: 5, unit: "UN" }
        });
        const stockQty = Number(stock.quantity) || 0;
        const stockAvg = effectiveAverageCost(stock.averageCost, fallbackCost, stockQty);
        const newStockQty = stockQty + request.quantity;
        const newStockAvg = weightedAverageCost(stockQty, stockAvg, request.quantity, depotAvg);

        await tx.stock.update({
            where: { productId: request.productId },
            data: { quantity: newStockQty, averageCost: newStockAvg }
        });

        const stockMovement = await tx.stockMovement.create({
            data: {
                productId: request.productId,
                type: 'IN',
                movementKind: 'TRANSFER_IN',
                quantity: request.quantity,
                unitCost: depotAvg,
                notes: `RECEBIMENTO VIA DEPÓSITO (Autorizado por ${user.name})`
            }
        });

        await recordInventoryCost(tx, {
            productId: request.productId,
            location: 'BALCAO',
            movementType: 'TRANSFER_IN',
            quantity: request.quantity,
            unitCost: depotAvg,
            balanceQty: newStockQty,
            balanceAvgCost: newStockAvg,
            referenceId: stockMovement.id,
            notes: `Recebimento do Depósito [Ref: ${request.id.slice(-4)}]`,
        });

        // C) Atualizar Status da Solicitação
        await tx.transferRequest.update({
            where: { id: requestId },
            data: {
                status: 'APPROVED',
                authorizedById: user.id,
                updatedAt: new Date()
            }
        });

        await createAuditLog("Transferência Autorizada", `Autorizou e executou a transferência de ${request.quantity} unidades de ${request.product.name} do Depósito para o Balcão.`);
    });

    revalidatePath('/deposito');
    revalidatePath('/estoque');
}

// 6. REJEITAR SOLICITAÇÃO
export async function rejectTransfer(requestId: string, reason?: string) {
    const user = await verifyAuth();
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
        throw new Error('Sem permissão para rejeitar solicitações.');
    }

    await prisma.transferRequest.update({
        where: { id: requestId },
        data: {
            status: 'REJECTED',
            authorizedById: user.id,
            notes: reason ? `REJEITADO: ${reason}` : 'Rejeitado pelo supervisor',
            updatedAt: new Date()
        }
    });

    revalidatePath('/deposito');
}

// 7. REGISTRAR QUEBRA/PERDA NO DEPÓSITO
export async function adjustDepotStockLoss(productId: string, quantityLost: number, notes?: string) {
    if (quantityLost <= 0) throw new Error('A quantidade deve ser maior que zero.');
    await verifyAuth();

    await prisma.$transaction(async (tx) => {
        const depot = await tx.depotStock.findUnique({ where: { productId } });
        if (!depot || depot.quantity < quantityLost) {
            throw new Error(`Estoque insuficiente no depósito para declarar perda!`);
        }

        const product = await tx.product.findUnique({ where: { id: productId } });
        assertStockControlled(product);
        const fallbackCost = Number(product?.cost) || 0;
        const depotAvg = effectiveAverageCost(depot.averageCost, fallbackCost, depot.quantity);
        const newQty = Number(depot.quantity) - quantityLost;
        
        await tx.depotStock.update({
            where: { productId },
            data: { quantity: newQty, averageCost: depotAvg }
        });

        const movement = await tx.depotMovement.create({
            data: {
                productId,
                type: 'LOSS',
                movementKind: 'LOSS',
                quantity: quantityLost,
                unitCost: depotAvg,
                notes: notes || 'Perda registrada no Depósito'
            }
        });

        await recordInventoryCost(tx, {
            productId,
            location: 'DEPOT',
            movementType: 'LOSS',
            quantity: quantityLost,
            unitCost: depotAvg,
            balanceQty: newQty,
            balanceAvgCost: depotAvg,
            referenceId: movement.id,
            notes: notes || 'Perda registrada no Depósito',
        });

        await createAuditLog("Baixa em Depósito", `Perda/Quebra de ${quantityLost} unidades de ${product?.name} registrada no Depósito central.`);
    });
    
    revalidatePath('/deposito');
}

// 8. TRANSFERÊNCIA DIRETA (Apenas para ADMINS)
export async function directTransfer(productId: string, quantity: number, notes?: string) {
    const user = await verifyAuth();
    if (user.role !== 'ADMIN') throw new Error('Apenas administradores podem realizar transferência direta sem autorização prévia.');

    await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: productId } });
        assertStockControlled(product);
        const depot = await tx.depotStock.findUnique({ where: { productId } });
        if (!depot || depot.quantity < quantity) {
            throw new Error(`Saldo insuficiente no depósito!`);
        }

        const fallbackCost = Number(product?.cost) || 0;
        const depotAvg = effectiveAverageCost(depot.averageCost, fallbackCost, depot.quantity);
        const newDepotQty = Number(depot.quantity) - quantity;

        await tx.depotStock.update({
            where: { productId },
            data: { quantity: newDepotQty }
        });

        const depotMovement = await tx.depotMovement.create({
            data: { productId, type: 'OUT_TRANSFER', movementKind: 'TRANSFER_OUT', quantity, unitCost: depotAvg, notes: notes || 'Transferência Direta (Admin)' }
        });

        await recordInventoryCost(tx, {
            productId,
            location: 'DEPOT',
            movementType: 'TRANSFER_OUT',
            quantity,
            unitCost: depotAvg,
            balanceQty: newDepotQty,
            balanceAvgCost: depotAvg,
            referenceId: depotMovement.id,
            notes: notes || 'Transferência Direta (Admin)',
        });

        const stock = await tx.stock.upsert({
            where: { productId },
            update: {},
            create: { productId, quantity: 0, minQuantity: 5, unit: "UN" }
        });
        const stockQty = Number(stock.quantity) || 0;
        const stockAvg = effectiveAverageCost(stock.averageCost, fallbackCost, stockQty);
        const newStockQty = stockQty + quantity;
        const newStockAvg = weightedAverageCost(stockQty, stockAvg, quantity, depotAvg);

        await tx.stock.update({
            where: { productId },
            data: { quantity: newStockQty, averageCost: newStockAvg }
        });

        const stockMovement = await tx.stockMovement.create({
            data: { productId, type: 'IN', movementKind: 'TRANSFER_IN', quantity, unitCost: depotAvg, notes: 'Transferência Direta vinda do Depósito' }
        });

        await recordInventoryCost(tx, {
            productId,
            location: 'BALCAO',
            movementType: 'TRANSFER_IN',
            quantity,
            unitCost: depotAvg,
            balanceQty: newStockQty,
            balanceAvgCost: newStockAvg,
            referenceId: stockMovement.id,
            notes: notes || 'Transferência Direta (Admin)',
        });
    });

    revalidatePath('/deposito');
    revalidatePath('/estoque');
}

// 9. ATUALIZAR ESTOQUE MÍNIMO DO DEPÓSITO
export async function updateDepotMinStock(productId: string, minQuantity: number) {
    const user = await verifyAuth();
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') throw new Error("Acesso negado");

    const product = await prisma.product.findUnique({ where: { id: productId } });
    assertStockControlled(product);

    await prisma.depotStock.upsert({
        where: { productId },
        update: { minQuantity },
        create: { productId, minQuantity, quantity: 0, unit: "UN" }
    });

    revalidatePath('/deposito');
    return { success: true };
}

// 10. MOVIMENTAÇÃO EM LOTE NO DEPÓSITO (OCR / NF)
export async function registerBatchDepotStockMovement(
    movements: { productId: string, quantity: number, price?: number }[],
    document: string,
    imagePath: string | null,
    notes: string,
    dueDateString?: string,
    issueDateString?: string,
    receivedDateString?: string
) {
    const user = await verifyAuth();
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') throw new Error("Acesso negado");


    if (!movements || movements.length === 0) {
        throw new Error("Nenhum item válido para movimentar.");
    }

    try {
        const date = new Date(); // A data de lançamento é sempre hoje

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
                const depot = await tx.depotStock.upsert({
                    where: { productId: mov.productId },
                    update: {},
                    create: { productId: mov.productId, quantity: 0, minQuantity: 5, unit: "UN" }
                });

                const currentQty = Number(depot.quantity) || 0;
                const fallbackCost = Number(product?.cost) || 0;
                const currentAvg = effectiveAverageCost(depot.averageCost, fallbackCost, currentQty);
                const incomingCost = costPrice > 0 ? costPrice : fallbackCost;
                const newQuantity = currentQty + qty;
                const newAverageCost = weightedAverageCost(currentQty, currentAvg, qty, incomingCost);

                await tx.depotStock.update({
                    where: { productId: mov.productId },
                    data: { quantity: newQuantity, averageCost: newAverageCost }
                });

                const movement = await tx.depotMovement.create({
                    data: {
                        productId: mov.productId,
                        type: "IN",
                        movementKind: "PURCHASE",
                        quantity: qty,
                        unitCost: incomingCost,
                        notes: notes || "Entrada via NF (IA) no Depósito",
                        document: document || null,
                        // Guarda o caminho do Storage; a URL assinada é gerada na leitura.
                        imageUrl: imagePath || null,
                        issueDate: issueDateString ? new Date(issueDateString) : null,
                        receivedDate: receivedDateString ? new Date(receivedDateString) : null,
                        date
                    }
                });

                await recordInventoryCost(tx, {
                    productId: mov.productId,
                    location: 'DEPOT',
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
                        description: `NF ${document || 'S/N'} - Depósito Matriz`,
                        type: 'PAYABLE',
                        amount: totalCost,
                        dueDate: new Date(dueDateString),
                        category: 'Fornecedor',
                        entryKind: 'INVENTORY_PURCHASE',
                        competenceDate: new Date(dueDateString),
                        notes: notes || 'Gerado automaticamente via importação de NF no Depósito',
                        status: 'PENDING',
                        reference: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`
                    }
                });
            }

            return { success: true };
        }, {
            timeout: 30000 
        });

        await createAuditLog("Importação NF Matriz", `Importação de depósito via nota fiscal (${document}).`);

        revalidatePath("/deposito");
        return { success: true };
    } catch (error: any) {
        console.error("ERRO NO REGISTER_BATCH_DEPOTSTOCK_MOVEMENT:", error);
        return { success: false, error: error.message || "Erro interno ao processar lote no depósito." };
    }
}

