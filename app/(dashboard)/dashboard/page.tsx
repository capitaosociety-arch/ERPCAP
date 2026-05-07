import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";
import RevenueChart from "../../../components/RevenueChart";
import TopProductsChart from "../../../components/TopProductsChart";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  
  // Buscar o último caixa aberto/fechado
  const lastRegister = await prisma.cashRegister.findFirst({
    orderBy: { openedAt: 'desc' },
    select: { id: true }
  });

  // Basic KPI queries in parallel for better performance
  const [totalUsers, totalProducts, openOrders, lastRegisterPayments] = await Promise.all([
    prisma.user.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.count({ where: { status: 'OPEN' } }),
    lastRegister ? prisma.payment.findMany({
      where: { cashRegisterId: lastRegister.id },
      include: { 
        order: { 
            include: { 
                customer: { select: { name: true } },
                items: {
                    where: { status: 'ACTIVE' },
                    include: { product: { select: { cost: true } } }
                }
            } 
        },
        user: { select: { name: true } }
      },
      orderBy: { date: 'desc' }
    }) : Promise.resolve([])
  ]);
  
  // Transform data for the client component
  let totalCost = 0;
  const paymentsList = lastRegisterPayments.map(p => {
        // Calcular custo desta venda
        const orderCost = p.order?.items.reduce((acc, item) => acc + ((item.product?.cost || 0) * item.quantity), 0) || 0;
        totalCost += orderCost;

        return {
            id: p.id,
            amount: p.amount,
            method: p.method,
            date: p.date,
            order: { customerName: p.order?.customer?.name || 'Venda Balcão' },
            user: { name: p.user?.name || 'Sistema' },
            type: 'ORDER' as const
        };
  });

  const lastRevenue = paymentsList.reduce((acc, p) => acc + p.amount, 0);
  const grossProfit = lastRevenue - totalCost;

  const stats = {
      totalUsers,
      totalProducts,
      openOrders,
      todayRevenue: lastRevenue,
      grossProfit
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
