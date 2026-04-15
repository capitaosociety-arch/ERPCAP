'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { revalidatePath } from 'next/cache';

export async function openGlobalCashRegister(openingBal: number) {
    const session = await getServerSession(authOptions) as any;
    const userId = session?.user?.id || (await prisma.user.findFirst())?.id;
    if (!userId) throw new Error('Unauthorized');

    const openRegister = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' }, include: { user: true } });
    if (openRegister) throw new Error(`Já existe um caixa aberto no sistema por ${openRegister.user.name}. Feche-o e faça a conferência antes de abrir um novo para os próximos dias.`);

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

    const registerToClose = await prisma.cashRegister.findUnique({
        where: { id: registerId },
        include: { user: true }
    });

    if (!registerToClose) throw new Error('Caixa não encontrado.');

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });

    // Permite fechar apenas se for o mesmo usuário que abriu OU se for um ADMINISTRADOR
    if (registerToClose.userId !== userId && currentUser?.role !== 'ADMIN') {
        throw new Error(`Acesso negado: Apenas o operador que abriu este caixa (${registerToClose.user.name}) ou um Administrador pode realizar o seu fechamento e conferência.`);
    }

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
