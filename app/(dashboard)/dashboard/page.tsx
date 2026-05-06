import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";
import RevenueChart from "../../../components/RevenueChart";
import TopProductsChart from "../../../components/TopProductsChart";
import { DollarSign, Coffee, Users, ShoppingBag } from "lucide-react";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  
  // Basic KPI queries in parallel for better performance
  const [totalUsers, totalProducts, openOrders, todayOrders] = await Promise.all([
    prisma.user.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.count({ where: { status: 'OPEN' } }),
    prisma.order.findMany({
      where: { 
        openedAt: { 
          gte: new Date(new Date().setHours(0, 0, 0, 0)) 
        }, 
        status: 'CLOSED' 
      },
      select: { total: true, discount: true }
    })
  ]);
  
  const todayRevenue = todayOrders.reduce((acc, order) => acc + (order.total - (order.discount || 0)), 0);

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Bem-vindo, {session?.user?.name?.split(' ')[0]} 👋</h1>
      <p className="text-gray-500 mb-8">Aqui está o resumo da sua operação de hoje.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-soft border border-gray-100 flex items-center gap-4">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
            <DollarSign size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Faturamento Hoje</p>
            <h3 className="text-2xl font-bold text-gray-800">R$ {todayRevenue.toFixed(2).replace('.',',')}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-soft border border-gray-100 flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <Coffee size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Comandas Abertas</p>
            <h3 className="text-2xl font-bold text-gray-800">{openOrders}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-soft border border-gray-100 flex items-center gap-4">
          <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center">
            <ShoppingBag size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Produtos Ativos</p>
            <h3 className="text-2xl font-bold text-gray-800">{totalProducts}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-soft border border-gray-100 flex items-center gap-4">
          <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
            <Users size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Equipe</p>
            <h3 className="text-2xl font-bold text-gray-800">{totalUsers}</h3>
          </div>
        </div>
      </div>
      
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
