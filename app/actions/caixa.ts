'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { revalidatePath } from 'next/cache';

export async function openGlobalCashRegister(openingBal: number) {
    const session = await getServerSession(authOptions) as any;
    const userId = session?.user?.id || (await prisma.user.findFirst())?.id;
    if (!userId) throw new Error('Unauthorized');

    const openRegister = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' } });
    if (openRegister) throw new Error('Já existe um caixa aberto no sistema. Feche-o antes de abrir um novo.');

    await prisma.cashRegister.create({
        data: {
            userId,
            status: 'OPEN',
            openingBal
        }
    });
    revalidatePath('/financeiro');
    revalidatePath('/pdv');
    revalidatePath('/dashboard');
}

export async function closeGlobalCashRegister(registerId: string, closingBal: number) {
    const session = await getServerSession(authOptions) as any;
    const userId = session?.user?.id || (await prisma.user.findFirst())?.id;
    if (!userId) throw new Error('Unauthorized');

    await prisma.cashRegister.update({
        where: { id: registerId },
        data: {
            status: 'CLOSED',
            closingBal,
            closedAt: new Date()
        }
    });
    revalidatePath('/financeiro');
    revalidatePath('/pdv');
    revalidatePath('/dashboard');
}
