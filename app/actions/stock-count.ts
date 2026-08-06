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
const validLocation = (l: string) => l === 'DEPOT' || l === 'BALCAO';

// Salva a contagem diária de estoque (informativa - NÃO altera o estoque real)
export async function saveStockCounts(
    dateStr: string,
    items: { productId: string; quantity: number }[],
    location: 'DEPOT' | 'BALCAO' = 'DEPOT'
) {
    try {
        if (!validDate(dateStr)) throw new Error('Data inválida.');
        if (!validLocation(location)) throw new Error('Local inválido.');
        if (!items || items.length === 0) throw new Error('Nenhum item informado.');

        await verifyAuth();

        const cleanItems = items.filter(i => i.productId && Number.isFinite(i.quantity) && i.quantity >= 0);

        for (const item of cleanItems) {
            await prisma.stockCount.upsert({
                where: { productId_date_location: { productId: item.productId, date: dateStr, location } },
                update: { quantity: item.quantity },
                create: { productId: item.productId, location, date: dateStr, quantity: item.quantity }
            });
        }

        const locLabel = location === 'BALCAO' ? 'Balcão' : 'Matriz';
        await createAuditLog("Contagem de Estoque", `Contagem diária registrada para ${cleanItems.length} produto(s) no ${locLabel} no dia ${dateStr}.`);

        revalidatePath('/deposito');
        revalidatePath('/estoque');
        revalidatePath('/produtos');
        return { success: true, saved: cleanItems.length };
    } catch (error: any) {
        console.error("ERRO_SAVE_STOCK_COUNT:", error);
        return { success: false, error: error?.message || 'Erro ao salvar contagem.' };
    }
}

// Lista as contagens de um dia específico
export async function getStockCountsForDate(dateStr: string, location: 'DEPOT' | 'BALCAO' = 'DEPOT') {
    await verifyAuth();
    if (!validDate(dateStr)) throw new Error('Data inválida.');
    if (!validLocation(location)) throw new Error('Local inválido.');

    return prisma.stockCount.findMany({
        where: { date: dateStr, location },
        select: { productId: true, quantity: true, date: true, location: true }
    });
}
