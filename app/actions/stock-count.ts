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
        if (cleanItems.length === 0) throw new Error('Nenhum item válido informado.');

        const saveCounts = () => prisma.$transaction(async (tx) => {
            for (const item of cleanItems) {
                let systemQuantity: number | null = null;
                if (location === 'DEPOT') {
                    const depot = await tx.depotStock.findUnique({
                        where: { productId: item.productId },
                        select: { quantity: true }
                    });
                    systemQuantity = Number(depot?.quantity) || 0;
                }

                await tx.stockCount.upsert({
                    where: { productId_date_location: { productId: item.productId, date: dateStr, location } },
                    update: {
                        quantity: item.quantity,
                        ...(location === 'DEPOT' ? { systemQuantity } : {})
                    },
                    create: {
                        productId: item.productId,
                        location,
                        date: dateStr,
                        quantity: item.quantity,
                        ...(location === 'DEPOT' ? { systemQuantity } : {})
                    }
                });
            }
        }, { isolationLevel: 'Serializable', timeout: 30000 });

        for (let attempt = 0; ; attempt++) {
            try {
                await saveCounts();
                break;
            } catch (error: any) {
                if (error?.code === 'P2034' && attempt < 2) continue;
                throw error;
            }
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
        select: { productId: true, quantity: true, systemQuantity: true, date: true, location: true }
    });
}
