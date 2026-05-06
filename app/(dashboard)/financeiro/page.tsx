import { prisma } from "../../../lib/prisma";
import FinanceiroClient from "./FinanceiroClient";

export default async function FinanceiroRoute() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Execute all heavy queries in parallel
  const [payments, subPayments, cashRegisters, financialEntries] = await Promise.all([
    prisma.payment.findMany({
      where: { date: { gte: thirtyDaysAgo } },
      include: { user: true }
    }),
    prisma.subscriptionPayment.findMany({
      where: { paymentDate: { gte: thirtyDaysAgo } }
    }),
    prisma.cashRegister.findMany({
      where: { openedAt: { gte: thirtyDaysAgo } },
      orderBy: { openedAt: 'desc' },
      include: { 
          user: true, 
          payments: {
              include: {
                  order: {
                      include: {
                          items: {
                              include: { product: true, service: true }
                          }
                      }
                  }
              }
          } 
      }
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

  const dailyRevenueMap: Record<string, number> = {};

  // Init range (0 preenchido para dias vazios)
  for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const st = d.toISOString().split('T')[0];
        dailyRevenueMap[st] = 0;
  }

  payments.forEach(p => {
      totalRevenue += p.amount;
      if (!methodTotals[p.method]) methodTotals[p.method] = 0;
      methodTotals[p.method] += p.amount;
      
      const day = p.date.toISOString().split('T')[0];
      if (dailyRevenueMap[day] !== undefined) dailyRevenueMap[day] += p.amount;
  });

  subPayments.forEach(p => {
      totalRevenue += p.amount;
      methodTotals['SUBSCRIPTION'] += p.amount;
      
      const day = p.paymentDate.toISOString().split('T')[0];
      if (dailyRevenueMap[day] !== undefined) dailyRevenueMap[day] += p.amount;
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
      valor: dailyRevenueMap[date]
  })).sort((a, b) => a.rawDate.localeCompare(b.rawDate));

  const methodChart = Object.keys(methodTotals).map(m => ({
      name: m === 'CASH' ? 'Dinheiro' : m === 'PIX' ? 'Pix' : m === 'DEBIT' ? 'Débito' : m === 'CREDIT' ? 'Crédito' : 'Mensalidades',
      value: methodTotals[m]
  })).filter(x => x.value > 0);

  const payload = {
      totalRevenue,
      totalPendingPayable,
      totalPendingReceivable,
      dailyChart,
      methodChart,
      cashRegisters,
      financialEntries
  };

  return <FinanceiroClient payload={payload} />;
}
