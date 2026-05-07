import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";
import RevenueChart from "../../../components/RevenueChart";
import TopProductsChart from "../../../components/TopProductsChart";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Basic KPI queries in parallel for better performance
  const [totalUsers, totalProducts, openOrders, todayPayments, todaySubscriptions] = await Promise.all([
    prisma.user.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.count({ where: { status: 'OPEN' } }),
    prisma.payment.findMany({
      where: { date: { gte: today } },
      include: { 
        order: { select: { customerName: true } },
        user: { select: { name: true } }
      },
      orderBy: { date: 'desc' }
    }),
    prisma.subscriptionPayment.findMany({
      where: { paymentDate: { gte: today } },
      include: { 
        subscription: { 
            include: { customer: { select: { name: true } } } 
        } 
      },
      orderBy: { paymentDate: 'desc' }
    })
  ]);
  
  // Transform data for the client component
  const paymentsList = [
    ...todayPayments.map(p => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        date: p.date,
        order: { customerName: p.order?.customerName || 'Venda Balcão' },
        user: { name: p.user?.name || 'Sistema' },
        type: 'ORDER' as const
    })),
    ...todaySubscriptions.map(p => ({
        id: p.id,
        amount: p.amount,
        method: 'SUBSCRIPTION',
        date: p.paymentDate,
        order: { customerName: p.subscription?.customer?.name || 'Mensalista' },
        user: { name: 'Sistema' },
        type: 'SUBSCRIPTION' as const
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const todayRevenue = paymentsList.reduce((acc, p) => acc + p.amount, 0);

  const stats = {
      totalUsers,
      totalProducts,
      openOrders,
      todayRevenue
  };

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      <DashboardClient 
        stats={stats} 
        payments={paymentsList}
        userName={session?.user?.name?.split(' ')[0] || ''} 
        userRole={session?.user?.role || ''}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
            <RevenueChart />
        </div>
        <div className="lg:col-span-1">
            <TopProductsChart />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Módulos Disponíveis</h3>
        <p className="text-gray-500 text-sm">Navegue pelas opções no menu esquerdo. As funcionalidades foram limitadas conforme seu perfil de acesso ({session?.user?.role}).</p>
      </div>
    </div>
  );
}
