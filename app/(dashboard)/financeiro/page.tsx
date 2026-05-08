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
      where: { startTime: { gte: thirtyDaysAgo } }
    }),
    prisma.cashRegister.findMany({
      where: { openedAt: { gte: thirtyDaysAgo } },
      orderBy: { openedAt: 'desc' },
      include: { 
        user: true,
        payments: { include: { order: { include: { items: true } } } }
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

  const dailyRevenueMap: Record<string, { total: number, produtos: number, aluguel: number }> = {};

  // Init range (0 preenchido para dias vazios)
  for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const st = d.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
        dailyRevenueMap[st] = { total: 0, produtos: 0, aluguel: 0 };
  }

  // Processar Pagamentos de Comandas
  payments.forEach(p => {
      totalRevenue += p.amount;
      if (!methodTotals[p.method]) methodTotals[p.method] = 0;
      methodTotals[p.method] += p.amount;
      
      const day = p.date.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
      if (dailyRevenueMap[day]) {
          dailyRevenueMap[day].total += p.amount;
          
          // Tenta identificar se o pagamento é majoritariamente de aluguel ou produtos
          // Como o pagamento é do total da comanda, vamos olhar os itens
          const orderItems = p.order?.items || [];
          let orderAluguel = 0;
          let orderProdutos = 0;

          orderItems.forEach(item => {
              const prodName = item.product?.name?.toLowerCase() || '';
              const catName = item.product?.category?.name?.toLowerCase() || '';
              const isRental = !!item.serviceId || catName.includes('aluguel') || catName.includes('campo') || prodName.includes('aluguel') || prodName.includes('campo');
              
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
      
      const day = p.paymentDate.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
      if (dailyRevenueMap[day]) {
          dailyRevenueMap[day].total += p.amount;
          dailyRevenueMap[day].aluguel += p.amount;
      }
  });

  // Locações avulsas diretas
  rentals.forEach(r => {
      if (r.status === 'PAID') {
          totalRevenue += r.totalAmount;
          const day = r.startTime.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
          if (dailyRevenueMap[day]) {
              dailyRevenueMap[day].total += r.totalAmount;
              dailyRevenueMap[day].aluguel += r.totalAmount;
          }
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

  // --- UNIFICAÇÃO DE DADOS DE CAMPOS (RENTALS + PRODUTOS DE ALUGUEL) ---
  
  // 1. Coletar nomes únicos de campos de Agendamentos E de Itens de Pedido
  const rentalFieldNames = Array.from(new Set(rentals.map(r => r.resource)));
  const productFieldNames: string[] = [];
  
  payments.forEach(p => {
    p.order?.items?.forEach((it: any) => {
      const isRental = !!it.serviceId || it.product?.category?.name.toLowerCase().includes('aluguel') || it.product?.category?.name.toLowerCase().includes('campo') || it.product?.name.toLowerCase().includes('aluguel');
      if (isRental && it.product?.name) {
        if (!productFieldNames.includes(it.product.name)) productFieldNames.push(it.product.name);
      }
    });
  });

  const allFieldNames = Array.from(new Set([...rentalFieldNames, ...productFieldNames])).sort();
  
  const fieldDailyMap: Record<string, Record<string, number>> = {};
  const fieldCountMap: Record<string, Record<string, number>> = {};

  // Inicializar mapas para os últimos 30 dias
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const st = d.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    fieldDailyMap[st] = {};
    fieldCountMap[st] = {};
    allFieldNames.forEach(name => { 
      fieldDailyMap[st][name] = 0; 
      fieldCountMap[st][name] = 0;
    });
  }

  // 2. Processar Agendamentos (Rentals)
  rentals.forEach(r => {
    const day = r.startTime.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    if (fieldDailyMap[day]) {
      if (r.status === 'PAID') {
        fieldDailyMap[day][r.resource] = (fieldDailyMap[day][r.resource] || 0) + r.totalAmount;
      }
      fieldCountMap[day][r.resource] = (fieldCountMap[day][r.resource] || 0) + 1;
    }
  });

  // 3. Processar Itens de Pedido (Produtos que são aluguel)
  payments.forEach(p => {
    const day = p.date.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    if (fieldDailyMap[day]) {
      p.order?.items?.forEach((it: any) => {
        const isRental = !!it.serviceId || it.product?.category?.name.toLowerCase().includes('aluguel') || it.product?.category?.name.toLowerCase().includes('campo') || it.product?.name.toLowerCase().includes('aluguel');
        if (isRental && it.product?.name) {
          // Volume financeiro proporcional (se houver mais itens na comanda)
          const totalOrder = p.order.items.reduce((sum: number, i: any) => sum + i.subtotal, 0);
          const ratio = totalOrder > 0 ? it.subtotal / totalOrder : 1;
          
          fieldDailyMap[day][it.product.name] = (fieldDailyMap[day][it.product.name] || 0) + (p.amount * ratio);
          fieldCountMap[day][it.product.name] = (fieldCountMap[day][it.product.name] || 0) + it.quantity;
        }
      });
    }
  });

  // Mensalidades: Categoria Genérica
  const subFieldName = 'Mensalistas';
  if (subPayments.length > 0) {
    Object.keys(fieldDailyMap).forEach(day => { fieldDailyMap[day][subFieldName] = 0; });
    subPayments.forEach(p => {
      const day = p.paymentDate.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
      if (fieldDailyMap[day]) {
        fieldDailyMap[day][subFieldName] = (fieldDailyMap[day][subFieldName] || 0) + p.amount;
      }
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

  const fieldCountChart = Object.keys(fieldCountMap)
    .sort()
    .map(date => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      rawDate: date,
      ...Object.fromEntries(
        Object.entries(fieldCountMap[date]).map(([k, v]) => [k, v])
      )
    }));

  const finalFieldNames = Array.from(new Set([...allFieldNames, subPayments.length > 0 ? subFieldName : ''])).filter(Boolean).sort();

  const payload = {
      totalRevenue,
      totalPendingPayable,
      totalPendingReceivable,
      dailyChart,
      methodChart,
      fieldChart,
      fieldNames: finalFieldNames,
      fieldCountChart,
      fieldCountNames: allFieldNames,
      cashRegisters,
      financialEntries
  };

  return <FinanceiroClient payload={payload} />;
}
