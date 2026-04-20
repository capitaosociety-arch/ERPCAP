import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '../../../lib/prisma';
import DepotClient from './DepotClient';

export default async function DepotPage() {
    const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
    if (!session || !session.user || !session.user.id) redirect('/login');

    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id }
    });

    if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permDepot)) {
        redirect('/dashboard');
    }

    // Carregar Inventário
    const inventory = await prisma.product.findMany({
        where: { isActive: true },
        include: {
            depotStock: true,
            category: true,
            stock: true
        },
        orderBy: { name: 'asc' }
    });

    // Carregar Solicitações (Pendentes primeiro)
    const requests = await prisma.transferRequest.findMany({
        include: {
            product: true,
            user: true,
            authorizedBy: true
        },
        orderBy: { createdAt: 'desc' }
    });

    // Carregar Histórico de Movimentações (Recentes)
    const movements = await prisma.depotMovement.findMany({
        include: {
            product: true
        },
        orderBy: { date: 'desc' },
        take: 100
    });

    return <DepotClient 
        initialInventory={inventory} 
        initialRequests={requests} 
        initialMovements={movements}
        userRole={dbUser.role} 
    />;
}
