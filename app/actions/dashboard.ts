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
  try {
    // Pegar a data atual em Cuiabá e forçar o início e fim do dia absoluto
    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    
    if (!year || !month || !day) throw new Error("Falha ao formatar data");
    
    const todayStr = `${year}-${month}-${day}`;
    
    // Criar datas que o Prisma entenderá como o dia correto em Cuiabá (UTC-4)
    const startOfDay = new Date(`${todayStr}T00:00:00-04:00`);
    const endOfDay = new Date(`${todayStr}T23:59:59-04:00`);

    const [rentals, payments, orderItems, closedOrders, subPayments] = await Promise.all([
      prisma.rental.findMany({ 
        where: { startTime: { gte: startOfDay, lte: endOfDay } } 
      }),
      prisma.payment.findMany({
        where: { date: { gte: startOfDay, lte: endOfDay } },
        include: { 
          order: { 
            include: { 
              items: { 
                include: { product: { include: { category: true } }, service: true } 
              } 
            } 
          } 
        }
      }),
      prisma.orderItem.findMany({
        where: { 
          status: 'ACTIVE',
          order: { status: 'CLOSED', closedAt: { gte: startOfDay, lte: endOfDay } } 
        },
        include: { product: true }
      }),
      prisma.order.findMany({
          where: { status: 'CLOSED', closedAt: { gte: startOfDay, lte: endOfDay } },
          include: { items: { where: { status: 'ACTIVE' }, include: { product: { include: { category: true } }, service: true } } }
      }),
      prisma.subscriptionPayment.findMany({
          where: { paymentDate: { gte: startOfDay, lte: endOfDay } }
      })
    ]);

    // Helpers de identificação de aluguéis de campo (mesma lógica do Financeiro)
    const isRentalItem = (it: any) => {
        const prodName = it.product?.name?.toLowerCase() || '';
        const catName = it.product?.category?.name?.toLowerCase() || '';
        const svcName = it.service?.name?.toLowerCase() || '';
        return !!it.serviceId || catName.includes('aluguel') || catName.includes('campo') || 
               prodName.includes('aluguel') || prodName.includes('campo') || 
               svcName.includes('aluguel') || svcName.includes('campo');
    };
    const isFut5 = (name: string) => /fut5|fut\s*5|futebol\s*5/i.test(name);
    const isFut7 = (name: string) => /fut7|fut\s*7|futebol\s*7/i.test(name);

    // 1. Taxa de Ocupação (Capacidade: 16h/dia)
    const totalBookedHours = rentals.reduce((acc, r) => {
        const duration = (r.endTime.getTime() - r.startTime.getTime()) / (1000 * 60 * 60);
        return acc + duration;
    }, 0);
    const occupancyRate = (totalBookedHours / 16) * 100;

    // 2. Ticket Médio Bar (Apenas produtos, excluindo aluguéis de campo)
    const barOrdersToday = closedOrders.filter(order => 
      order.items.some(it => !isRentalItem(it))
    );
    
    let totalBarRevenue = 0;
    barOrdersToday.forEach(order => {
        order.items.forEach(it => {
            if (!isRentalItem(it)) totalBarRevenue += it.subtotal;
        });
    });
    
    const barTicketAverage = barOrdersToday.length > 0 ? totalBarRevenue / barOrdersToday.length : 0;

    // 3. Faturamento por Campo (hoje, separado por FUT5/FUT7)
    const fieldRevenue = { fut5: 0, fut7: 0, total: 0 };

    // Pagamentos de PDV e comandas (evitando duplicidade com Rentals)
    payments.forEach(p => {
        p.order?.items.forEach(it => {
            if (!isRentalItem(it)) return;
            const amt = it.subtotal || 0;
            fieldRevenue.total += amt;
            const itemName = `${it.product?.name?.toLowerCase() || ''} ${it.service?.name?.toLowerCase() || ''}`;
            if (isFut5(itemName)) fieldRevenue.fut5 += amt;
            else if (isFut7(itemName)) fieldRevenue.fut7 += amt;
        });
    });

    // 4. Lucro Líquido do Dia (Faturamento Total - Custo dos Produtos)
    const subRevenue = subPayments.reduce((acc, sp) => acc + sp.amount, 0);
    const todayRevenue = payments.reduce((acc, p) => acc + p.amount, 0) + subRevenue;
    const totalCost = orderItems.reduce((acc, it) => acc + ((it.product?.cost || 0) * it.quantity), 0);
    const dailyProfit = todayRevenue - totalCost;

    return {
        occupancyRate: Math.min(occupancyRate, 100),
        barTicketAverage,
        fieldRevenue,
        dailyProfit,
        totalRentals: rentals.length,
        todayRevenue
    };
  } catch (error) {
    console.error("Erro ao calcular KPIs do Dashboard:", error);
    return {
      occupancyRate: 0,
      barTicketAverage: 0,
      fieldRevenue: { fut5: 0, fut7: 0, total: 0 },
      dailyProfit: 0,
      totalRentals: 0,
      todayRevenue: 0
    };
  }
}
