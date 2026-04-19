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
    if (dbUser.role !== 'ADMIN' && !(dbUser as Record<string, boolean>)[requiredPerm]) {
        throw new Error('Access denied');
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
            category: true
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

// 3. TRANSFERÊNCIA: Depot -> Estoque de Vendas
export async function transferToFrontStock(productId: string, quantity: number, notes?: string) {
    if (quantity <= 0) throw new Error('A quantidade transferida deve ser maior que zero.');
    await verifyAuth();

    await prisma.$transaction(async (tx) => {
        const depot = await tx.depotStock.findUnique({ where: { productId } });
        if (!depot || depot.quantity < quantity) {
            throw new Error(`Saldo insuficiente no depósito! Tentativa: ${quantity}, Disponível: ${depot?.quantity || 0}`);
        }

        const product = await tx.product.findUnique({ where: { id: productId } });

        // 3.1) Deduzir do Depósito
        await tx.depotStock.update({
            where: { productId },
            data: { quantity: { decrement: quantity } }
        });
        
        await tx.depotMovement.create({
            data: {
                productId,
                type: 'OUT_TRANSFER',
                quantity: quantity,
                notes: notes || 'Transferência unilateral para Prateleiras/Pdv'
            }
        });

        // 3.2) Abastecer Estoque "Frente de Loja"
        await tx.stock.upsert({
            where: { productId },
            update: { quantity: { increment: quantity } },
            create: { productId, quantity }
        });

        await tx.stockMovement.create({
            data: {
                productId,
                type: 'IN', // Transferência
                quantity: quantity,
                notes: (notes ? notes : `MERCADORIA TRANSFERIDA DO DEPÓSITO`)
            }
        });

        await createAuditLog("Transferência de Estoque", `Enviou ${quantity} unidades de ${product?.name} do Depósito central para o Balcão/Vendas (Estoque de Retirada).`);
    });

    revalidatePath('/deposito');
    revalidatePath('/estoque');
    revalidatePath('/pdv');
}

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
