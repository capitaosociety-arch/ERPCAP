'use server'

import { prisma } from "../../lib/prisma";

export async function getRevenueData(filter: 'day' | 'week' | 'month' | 'year') {
  const now = new Date();
  const startDate = new Date();
  
  if (filter === 'day') {
    startDate.setHours(0, 0, 0, 0);
  } else if (filter === 'week') {
    startDate.setDate(now.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else if (filter === 'month') {
    startDate.setMonth(now.getMonth() - 1);
  } else if (filter === 'year') {
    startDate.setFullYear(now.getFullYear() - 1);
  }

  // Buscar pagamentos de comandas e mensalidades (Igual ao Financeiro)
  const [payments, subscriptionPayments] = await Promise.all([
    prisma.payment.findMany({
      where: { date: { gte: startDate } },
      select: { amount: true, date: true }
    }),
    prisma.subscriptionPayment.findMany({
      where: { paymentDate: { gte: startDate } },
      select: { amount: true, paymentDate: true }
    })
  ]);

  const grouped: Record<string, number> = {};

  // Processar pagamentos comuns
  payments.forEach(p => {
    let key = '';
    const date = new Date(p.date);
    
    if (filter === 'day') {
      // Pega a hora exata em Cuiabá
      const hour = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Cuiaba' }).format(date);
      key = `${hour}h`;
    } else if (filter === 'week' || filter === 'month') {
      key = date.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    } else if (filter === 'year') {
      const parts = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: '2-digit', timeZone: 'America/Cuiaba' }).format(date).split('/');
      key = `${parts[1]}-${parts[0]}`;
    }

    grouped[key] = (grouped[key] || 0) + p.amount;
  });

  // Processar mensalidades
  subscriptionPayments.forEach(p => {
    let key = '';
    const date = new Date(p.paymentDate);
    
    if (filter === 'day') {
      const hour = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Cuiaba' }).format(date);
      key = `${hour}h`;
    } else if (filter === 'week' || filter === 'month') {
      key = date.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    } else if (filter === 'year') {
      const parts = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: '2-digit', timeZone: 'America/Cuiaba' }).format(date).split('/');
      key = `${parts[1]}-${parts[0]}`;
    }

    grouped[key] = (grouped[key] || 0) + p.amount;
  });

  const chartData = Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => {
        let label = key;
        if (filter === 'week' || filter === 'month') {
            const parts = key.split('-');
            label = `${parts[2]}/${parts[1]}`;
        } else if (filter === 'year') {
            const parts = key.split('-');
            label = `${parts[1]}/${parts[0]}`;
        }
        return { label, value };
    });

  return chartData;
}

export async function getTopProducts() {
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: { status: "CLOSED" }
    },
    select: {
      quantity: true,
      product: {
        select: { name: true }
      }
    }
  });

  const totals: Record<string, number> = {};

  orderItems.forEach(item => {
    if (item.product) {
      totals[item.product.name] = (totals[item.product.name] || 0) + item.quantity;
    }
  });

  const topProducts = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  return topProducts;
}
export async function getDashboardKpis() {
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
  const startOfDay = new Date(todayStr + 'T00:00:00');
  const endOfDay = new Date(todayStr + 'T23:59:59');

  const [rentals, payments, orderItems] = await Promise.all([
    prisma.rental.findMany({ 
      where: { startTime: { gte: startOfDay, lte: endOfDay } } 
    }),
    prisma.payment.findMany({
      where: { date: { gte: startOfDay, lte: endOfDay } },
      include: { 
        order: { 
          include: { 
            items: { 
              include: { product: { include: { category: true } } } 
            } 
          } 
        } 
      }
    }),
    prisma.orderItem.findMany({
      where: { 
        order: { status: 'CLOSED', closedAt: { gte: startOfDay, lte: endOfDay } } 
      },
      include: { product: true }
    })
  ]);

  // 1. Taxa de Ocupação
  // Assumindo 2 quadras operando 8h por dia (16h às 00h) = 16h total de capacidade
  const totalBookedHours = rentals.reduce((acc, r) => {
      const duration = (r.endTime.getTime() - r.startTime.getTime()) / (1000 * 60 * 60);
      return acc + duration;
  }, 0);
  const totalCapacity = 16; 
  const occupancyRate = (totalBookedHours / totalCapacity) * 100;

  // 2. Ticket Médio Bar
  const barOrders = payments.filter(p => 
    p.order?.items.some(it => !it.serviceId && !it.product?.category?.name?.toLowerCase().includes('aluguel'))
  );
  const totalBarRevenue = barOrders.reduce((acc, p) => acc + p.amount, 0);
  const barTicketAverage = barOrders.length > 0 ? totalBarRevenue / barOrders.length : 0;

  // 3. Faturamento por Campo
  const fieldRevenue: Record<string, number> = {};
  rentals.forEach(r => {
      if (r.status === 'PAID') {
          fieldRevenue[r.resource] = (fieldRevenue[r.resource] || 0) + r.totalAmount;
      }
  });
  // Somar também aluguéis lançados como produtos no PDV
  payments.forEach(p => {
      p.order?.items.forEach(it => {
          const isFieldProduct = it.product?.category?.name?.toLowerCase().includes('aluguel') || 
                                it.product?.category?.name?.toLowerCase().includes('campo') ||
                                it.product?.name?.toLowerCase().includes('aluguel');
          if (isFieldProduct && it.product?.name) {
              fieldRevenue[it.product.name] = (fieldRevenue[it.product.name] || 0) + it.subtotal;
          }
      });
  });

  // 4. Lucro do Dia (Receita - Custo)
  const todayRevenue = payments.reduce((acc, p) => acc + p.amount, 0);
  const totalCost = orderItems.reduce((acc, it) => acc + ((it.product?.cost || 0) * it.quantity), 0);
  const dailyProfit = todayRevenue - totalCost;

  return {
      occupancyRate: Math.min(occupancyRate, 100),
      barTicketAverage,
      fieldRevenue,
      dailyProfit,
      totalRentals: rentals.length
  };
}
