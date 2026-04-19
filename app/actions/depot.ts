'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { revalidatePath } from 'next/cache';
import { createAuditLog } from './audit';

async function verifyAuth(requiredPerm: string = 'permDepot') {
    const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
    if (!session || !session.user || !session.user.id) throw new Error('Unauthorized');

    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser) throw new Error('User not found');
    
    // Fix for the Type Error in build: safety casting to unknown then to the record
    if (dbUser.role !== 'ADMIN') {
        const dbPerms = dbUser as unknown as Record<string, boolean>;
        if (!dbPerms[requiredPerm]) throw new Error('Access denied');
    }
    return dbUser;
}

// 1. Listar todo o inventário (visão geral do Depósito)
export async function getDepotInventory() {
    await verifyAuth();
    
    return await prisma.product.findMany({
        where: { isActive: true },
        include: {
            depotStock: true,
            category: true,
            stock: true
        },
        orderBy: { name: 'asc' }
    });
}

// 2. Adicionar Fundo de Depósito (Abastecer)
export async function addDepotStock(productId: string, quantity: number, document?: string, notes?: string) {
    if (quantity <= 0) throw new Error('A quantidade deve ser maior que zero.');
    await verifyAuth();

    await prisma.$transaction(async (tx) => {
        // Upsert do Saldo no Depósito
        await tx.depotStock.upsert({
            where: { productId },
            update: { quantity: { increment: quantity } },
            create: { productId, quantity }
        });

        // Registrar o Histórico no Depósito
        await tx.depotMovement.create({
            data: {
                productId,
                type: 'IN',
                quantity,
                document,
                notes: notes || 'Entrada manual em Depósito'
            }
        });

        const product = await tx.product.findUnique({ where: { id: productId } });
        await createAuditLog("Entrada em Depósito", `Adicionou ${quantity} unidades de ${product?.name} ao depósito geral. Documento/NF: ${document || 'N/A'}`);
    });

    revalidatePath('/deposito');
}

// 3. SOLICITAR TRANSFERÊNCIA: Depot -> Estoque de Vendas
export async function requestTransfer(productId: string, quantity: number, notes?: string) {
    if (quantity <= 0) throw new Error('A quantidade deve ser maior que zero.');
    const user = await verifyAuth();

    // Validar se tem saldo no depósito antes de sequer solicitar (opcional mas recomendado)
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

    const product = await prisma.product.findUnique({ where: { id: productId } });
    await createAuditLog("Solicitação de Transferência", `Solicitou a transferência de ${quantity} unidades de ${product?.name} para o estoque de vendas.`);

    revalidatePath('/deposito');
}

// 4. LISTAR SOLICITAÇÕES
export async function getTransferRequests() {
    await verifyAuth();
    return await prisma.transferRequest.findMany({
        include: {
            product: true,
            user: true,
            authorizedBy: true
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

        const depot = await tx.depotStock.findUnique({ where: { productId: request.productId } });
        if (!depot || depot.quantity < request.quantity) {
            throw new Error(`Saldo insuficiente no depósito! Tentativa: ${request.quantity}, Disponível: ${depot?.quantity || 0}`);
        }

        // A) Deduzir do Depósito
        await tx.depotStock.update({
            where: { productId: request.productId },
            data: { quantity: { decrement: request.quantity } }
        });
        
        await tx.depotMovement.create({
            data: {
                productId: request.productId,
                type: 'OUT_TRANSFER',
                quantity: request.quantity,
                notes: `Transferência Autorizada por ${user.name} [Ref: ${request.id.slice(-4)}]`
            }
        });

        // B) Abastecer Estoque "Frente de Loja"
        await tx.stock.upsert({
            where: { productId: request.productId },
            update: { quantity: { increment: request.quantity } },
            create: { productId: request.productId, quantity: request.quantity }
        });

        await tx.stockMovement.create({
            data: {
                productId: request.productId,
                type: 'IN',
                quantity: request.quantity,
                notes: `RECEBIMENTO VIA DEPÓSITO (Autorizado por ${user.name})`
            }
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
        
        await tx.depotStock.update({
            where: { productId },
            data: { quantity: { decrement: quantityLost } }
        });

        await tx.depotMovement.create({
            data: {
                productId,
                type: 'LOSS',
                quantity: quantityLost,
                notes: notes || 'Perda registrada no Depósito'
            }
        });

        const product = await tx.product.findUnique({ where: { id: productId } });
        await createAuditLog("Baixa em Depósito", `Perda/Quebra de ${quantityLost} unidades de ${product?.name} registrada no Depósito central.`);
    });
    
    revalidatePath('/deposito');
}

// 8. TRANSFERÊNCIA DIRETA (Apenas para ADMINS)
export async function directTransfer(productId: string, quantity: number, notes?: string) {
    const user = await verifyAuth();
    if (user.role !== 'ADMIN') throw new Error('Apenas administradores podem realizar transferência direta sem autorização prévia.');

    await prisma.$transaction(async (tx) => {
        const depot = await tx.depotStock.findUnique({ where: { productId } });
        if (!depot || depot.quantity < quantity) {
            throw new Error(`Saldo insuficiente no depósito!`);
        }

        await tx.depotStock.update({
            where: { productId },
            data: { quantity: { decrement: quantity } }
        });

        await tx.stock.upsert({
            where: { productId },
            update: { quantity: { increment: quantity } },
            create: { productId, quantity }
        });

        await tx.depotMovement.create({
            data: { productId, type: 'OUT_TRANSFER', quantity, notes: notes || 'Transferência Direta (Admin)' }
        });

        await tx.stockMovement.create({
            data: { productId, type: 'IN', quantity, notes: 'Transferência Direta vinda do Depósito' }
        });
    });

    revalidatePath('/deposito');
    revalidatePath('/estoque');
}
