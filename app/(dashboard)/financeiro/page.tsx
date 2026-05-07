import { prisma } from "../../../lib/prisma";
import FinanceiroClient from "./FinanceiroClient";

export default async function FinanceiroRoute() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Execute all heavy queries in parallel
  const [payments, subPayments, rentals, cashRegisters, financialEntries] = await Promise.all([
    prisma.payment.findMany({
      where: { date: { gte: thirtyDaysAgo } },
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
    prisma.subscriptionPayment.findMany({
      where: { paymentDate: { gte: thirtyDaysAgo } }
    }),
    prisma.rental.findMany({
      where: { startTime: { gte: thirtyDaysAgo }, status: 'PAID' }
    }),
    prisma.cashRegister.findMany({
      where: { openedAt: { gte: thirtyDaysAgo } },
      orderBy: { openedAt: 'desc' },
      include: { user: true }
    }),
    prisma.financialEntry.findMany({
      orderBy: { dueDate: 'asc' }
    })
  ]);

  // Consolidação de Informações
  let totalRevenue = 0;
  let totalPendingPayable = 0;
  let totalPendingReceivable = 0;

  const methodTotals: Record<string, number> = {
      CASH: 0,
      PIX: 0,
      DEBIT: 0,
      CREDIT: 0,
      SUBSCRIPTION: 0
  };

  const dailyRevenueMap: Record<string, { total: number, produtos: number, aluguel: number }> = {};

  // Init range (0 preenchido para dias vazios)
  for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const st = d.toISOString().split('T')[0];
        dailyRevenueMap[st] = { total: 0, produtos: 0, aluguel: 0 };
  }

  // Processar Pagamentos de Comandas
  payments.forEach(p => {
      totalRevenue += p.amount;
      if (!methodTotals[p.method]) methodTotals[p.method] = 0;
      methodTotals[p.method] += p.amount;
      
      const day = p.date.toISOString().split('T')[0];
      if (dailyRevenueMap[day]) {
          dailyRevenueMap[day].total += p.amount;
          
          // Tenta identificar se o pagamento é majoritariamente de aluguel ou produtos
          // Como o pagamento é do total da comanda, vamos olhar os itens
          const orderItems = p.order?.items || [];
          let orderAluguel = 0;
          let orderProdutos = 0;

          orderItems.forEach(item => {
              const isRental = !!item.serviceId || item.product?.category?.name.toLowerCase().includes('aluguel') || item.product?.category?.name.toLowerCase().includes('campo');
              if (isRental) orderAluguel += item.subtotal;
              else orderProdutos += item.subtotal;
          });

          // Proporcionaliza o pagamento baseado no conteúdo da comanda
          const totalOrder = orderAluguel + orderProdutos;
          if (totalOrder > 0) {
              const ratioAluguel = orderAluguel / totalOrder;
              dailyRevenueMap[day].aluguel += p.amount * ratioAluguel;
              dailyRevenueMap[day].produtos += p.amount * (1 - ratioAluguel);
          } else {
              dailyRevenueMap[day].produtos += p.amount; // Default
          }
      }
  });

  // Mensalidades são sempre Aluguel
  subPayments.forEach(p => {
      totalRevenue += p.amount;
      methodTotals['SUBSCRIPTION'] += p.amount;
      
      const day = p.paymentDate.toISOString().split('T')[0];
      if (dailyRevenueMap[day]) {
          dailyRevenueMap[day].total += p.amount;
          dailyRevenueMap[day].aluguel += p.amount;
      }
  });

  // Locações avulsas diretas
  rentals.forEach(r => {
      totalRevenue += r.totalAmount;
      const day = r.startTime.toISOString().split('T')[0];
      if (dailyRevenueMap[day]) {
          dailyRevenueMap[day].total += r.totalAmount;
          dailyRevenueMap[day].aluguel += r.totalAmount;
      }
  });

  // Calcular Pendências
  financialEntries.forEach(entry => {
      if (entry.status === 'PENDING') {
          if (entry.type === 'PAYABLE') totalPendingPayable += entry.amount;
          if (entry.type === 'RECEIVABLE') totalPendingReceivable += entry.amount;
      }
  });

  // Formatar Arrays do Recharts
  const dailyChart = Object.keys(dailyRevenueMap).map(date => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      rawDate: date,
      produtos: Number(dailyRevenueMap[date].produtos.toFixed(2)),
      aluguel: Number(dailyRevenueMap[date].aluguel.toFixed(2)),
      total: Number(dailyRevenueMap[date].total.toFixed(2))
  })).sort((a, b) => a.rawDate.localeCompare(b.rawDate));

  const methodChart = Object.keys(methodTotals).map(m => ({
      name: m === 'CASH' ? 'Dinheiro' : m === 'PIX' ? 'Pix' : m === 'DEBIT' ? 'Débito' : m === 'CREDIT' ? 'Crédito' : 'Mensalidades',
      value: methodTotals[m]
  })).filter(x => x.value > 0);

  // Agrupar aluguéis por campo (resource) e por dia
  const fieldNames = Array.from(new Set(rentals.map(r => r.resource))).sort();
  
  const fieldDailyMap: Record<string, Record<string, number>> = {};
  // Init: todos os campos em todos os dias = 0
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const st = d.toISOString().split('T')[0];
    fieldDailyMap[st] = {};
    fieldNames.forEach(name => { fieldDailyMap[st][name] = 0; });
  }

  rentals.forEach(r => {
    const day = r.startTime.toISOString().split('T')[0];
    if (fieldDailyMap[day]) {
      if (!fieldDailyMap[day][r.resource]) fieldDailyMap[day][r.resource] = 0;
      fieldDailyMap[day][r.resource] += r.totalAmount;
    }
  });

  // Mensalidades: só contam como aluguel genérico (sem campo específico identificado)
  // subPayments não têm resource, então somamos como "Mensalistas"
  const subFieldName = 'Mensalistas';
  if (subPayments.length > 0) {
    fieldNames.push(subFieldName);
    Object.keys(fieldDailyMap).forEach(day => { fieldDailyMap[day][subFieldName] = 0; });
    subPayments.forEach(p => {
      const day = p.paymentDate.toISOString().split('T')[0];
      if (fieldDailyMap[day]) fieldDailyMap[day][subFieldName] += p.amount;
    });
  }

  const fieldChart = Object.keys(fieldDailyMap)
    .sort()
    .map(date => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      rawDate: date,
      ...Object.fromEntries(
        Object.entries(fieldDailyMap[date]).map(([k, v]) => [k, Number(v.toFixed(2))])
      )
    }));

  // --- CONTAGEM UNITÁRIA DE LOCAÇÕES POR CAMPO ---
  // Apenas rentals avulsos (sem mensalistas, pois eles não têm resource)
  const countFieldNames = Array.from(new Set(rentals.map(r => r.resource))).sort();

  const fieldCountMap: Record<string, Record<string, number>> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const st = d.toISOString().split('T')[0];
    fieldCountMap[st] = {};
    countFieldNames.forEach(name => { fieldCountMap[st][name] = 0; });
  }

  rentals.forEach(r => {
    const day = r.startTime.toISOString().split('T')[0];
    if (fieldCountMap[day]) {
      if (!fieldCountMap[day][r.resource]) fieldCountMap[day][r.resource] = 0;
      fieldCountMap[day][r.resource] += 1; // contagem unitária
    }
  });

  const fieldCountChart = Object.keys(fieldCountMap)
    .sort()
    .map(date => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      rawDate: date,
      ...Object.fromEntries(
        Object.entries(fieldCountMap[date]).map(([k, v]) => [k, v])
      )
    }));

  const payload = {
      totalRevenue,
      totalPendingPayable,
      totalPendingReceivable,
      dailyChart,
      methodChart,
      fieldChart,
      fieldNames: [...fieldNames],
      fieldCountChart,
      fieldCountNames: countFieldNames,
      cashRegisters,
      financialEntries
  };

  return <FinanceiroClient payload={payload} />;
}
