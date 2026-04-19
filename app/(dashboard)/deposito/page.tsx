import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '../../../lib/prisma';
import DepotClient from './DepotClient';

export default async function DepotPage() {
    const session = await getServerSession(authOptions) as any;
    if (!session) redirect('/login');

    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id }
    });

    if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permDepot)) {
        redirect('/dashboard');
    }

    const inventory = await prisma.product.findMany({
        where: { isActive: true },
        include: {
            depotStock: true,
            category: true,
            stock: true
        },
        orderBy: { name: 'asc' }
    });

    return <DepotClient initialInventory={inventory} />;
}
