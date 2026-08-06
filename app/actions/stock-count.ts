'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { revalidatePath } from 'next/cache';
import { createAuditLog } from './audit';

async function verifyAuth() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) throw new Error('Unauthorized');

    const userId = (session.user as any).id;
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) throw new Error('User not found');

    if (dbUser.role !== 'ADMIN' && !dbUser.permDepot) throw new Error('Access denied');
    return dbUser;
}

const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

// Salva a contagem diária de estoque (informativa - NÃO altera o estoque real)
export async function saveStockCounts(
    dateStr: string,
    items: { productId: string; quantity: number }[]
) {
    if (!validDate(dateStr)) throw new Error('Data inválida.');
    if (!items || items.length === 0) throw new Error('Nenhum item informado.');

    await verifyAuth();

    const cleanItems = items.filter(i => i.productId && Number.isFinite(i.quantity) && i.quantity >= 0);

    await prisma.$transaction(async (tx) => {
        for (const item of cleanItems) {
            await tx.stockCount.upsert({
                where: { productId_date: { productId: item.productId, date: dateStr } },
                update: { quantity: item.quantity },
                create: { productId: item.productId, date: dateStr, quantity: item.quantity }
            });
        }
    });

    await createAuditLog("Contagem de Estoque", `Contagem diária registrada para ${cleanItems.length} produto(s) no dia ${dateStr}.`);

    revalidatePath('/deposito');
    revalidatePath('/produtos');
    return { success: true, saved: cleanItems.length };
}

// Lista as contagens de um dia específico
export async function getStockCountsForDate(dateStr: string) {
    await verifyAuth();
    if (!validDate(dateStr)) throw new Error('Data inválida.');

    return prisma.stockCount.findMany({
        where: { date: dateStr },
        select: { productId: true, quantity: true, date: true }
    });
}
