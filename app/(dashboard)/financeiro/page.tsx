import { prisma } from "../../../lib/prisma";
import FinanceiroClient from "./FinanceiroClient";

export default async function FinanceiroRoute({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const p = await searchParams;
  const from = p.from;
  const to = p.to;

  // Ajuste de fuso horário para Cuiabá nos filtros
  const endDate = to ? new Date(to + 'T23:59:59-04:00') : new Date();
  const startDate = from ? new Date(from + 'T00:00:00-04:00') : new Date();
  
  if (!from) {
    // Se não houver data de início, pegamos a data atual em Cuiabá e voltamos 30 dias
    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' });
    const [{ value: year }, , { value: month }, , { value: day }] = formatter.formatToParts(new Date());
    const todayCuiaba = new Date(`${year}-${month}-${day}T00:00:00-04:00`);
    startDate.setTime(todayCuiaba.getTime() - (30 * 24 * 60 * 60 * 1000));
  }

  // Diferença de dias para inicializar o mapa
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  const rangeLimit = diffDays > 366 ? 366 : diffDays; // Limite de 1 ano para evitar crash de memória

  // Execute all heavy queries in parallel
  const [payments, subPayments, rentals, cashRegisters, financialEntries] = await Promise.all([
    prisma.payment.findMany({
      where: { date: { gte: startDate, lte: endDate } },
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
      where: { paymentDate: { gte: startDate, lte: endDate } }
    }),
    prisma.rental.findMany({
      where: { startTime: { gte: startDate, lte: endDate } }
    }),
    prisma.cashRegister.findMany({
      where: { openedAt: { gte: startDate, lte: endDate } },
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

  // Init range dinâmico
  for (let i = rangeLimit; i >= 0; i--) {
        const d = new Date(endDate);
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

  // Locações avulsas diretas (Rentals já pagos fora de comanda se existirem)
  rentals.forEach(r => {
      if (r.status === 'PAID') {
          // Evitar bitagem dupla: se a locação foi paga via comanda, ela já está nos payments
          // Verificamos se existe um pagamento vinculado a esta locação (não implementado no schema diretamente)
          // Por segurança, rentals aqui só contam se não estiverem em comandas (mas no erp atual tudo vira comanda/pagamento)
          // totalRevenue += r.totalAmount;
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
  const rentalFieldNames = Array.from(new Set(rentals.map(r => r.resource)));
  const productFieldNames: string[] = [];
  
  // Usar um Map de Orders para evitar duplicidade por pagamentos
  const uniqueOrdersMap = new Map();
  payments.forEach(p => {
    if (p.order && !uniqueOrdersMap.has(p.order.id)) {
      uniqueOrdersMap.set(p.order.id, p.order);
    }
  });
  const uniqueOrders = Array.from(uniqueOrdersMap.values());

  uniqueOrders.forEach((order: any) => {
    order.items?.forEach((it: any) => {
      const isRental = !!it.serviceId || it.product?.category?.name.toLowerCase().includes('aluguel') || it.product?.category?.name.toLowerCase().includes('campo') || it.product?.name.toLowerCase().includes('aluguel');
      if (isRental && it.product?.name) {
        if (!productFieldNames.includes(it.product.name)) productFieldNames.push(it.product.name);
      }
    });
  });

  const allFieldNames = Array.from(new Set([...rentalFieldNames, ...productFieldNames])).filter(Boolean).sort();
  
  const fieldDailyMap: Record<string, Record<string, number>> = {};
  const fieldCountMap: Record<string, Record<string, number>> = {};

  // Inicializar mapas para o período selecionado
  for (let i = rangeLimit; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const st = d.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    fieldDailyMap[st] = {};
    fieldCountMap[st] = {};
    allFieldNames.forEach(name => { 
      fieldDailyMap[st][name] = 0; 
      fieldCountMap[st][name] = 0;
    });
  }

  // 1. Processar Faturamento Real (Vindo dos Pagamentos)
  payments.forEach(p => {
    const day = p.date.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    if (fieldDailyMap[day]) {
      const orderItems = p.order?.items || [];
      const totalOrder = orderItems.reduce((sum: number, it: any) => sum + it.subtotal, 0);
      
      orderItems.forEach((it: any) => {
        const isRental = !!it.serviceId || it.product?.category?.name.toLowerCase().includes('aluguel') || it.product?.category?.name.toLowerCase().includes('campo') || it.product?.name.toLowerCase().includes('aluguel');
        if (isRental && it.product?.name) {
          const ratio = totalOrder > 0 ? it.subtotal / totalOrder : 1;
          fieldDailyMap[day][it.product.name] = (fieldDailyMap[day][it.product.name] || 0) + (p.amount * ratio);
        }
      });
    }
  });

  // 2. Processar Quantidade (Deduplicada)
  // Primeiro: Contamos todos os agendamentos (Rentals)
  rentals.forEach(r => {
    const day = r.startTime.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    if (fieldCountMap[day]) {
      fieldCountMap[day][r.resource] = (fieldCountMap[day][r.resource] || 0) + 1;
    }
  });

  // Segundo: Contamos vendas de balcão (Orders) que NÃO foram originadas de um agendamento
  // Como não há link direto, vamos contar apenas se o total de vendas for maior que o de agendamentos no dia para aquele recurso
  // Ou melhor: para este ERP, vamos considerar que Rentals são a fonte primária de 'Quantidade' e Orders a de 'Receita'.
  // Se o usuário lança direto no PDV sem agendar, precisamos capturar.
  // Ajuste: Vamos contar agendamentos, e do PDV apenas o que exceder a quantidade de agendamentos (heurística de proteção)
  const posCountBuffer: Record<string, Record<string, number>> = {};
  uniqueOrders.forEach((order: any) => {
    const day = (order.closedAt || order.openedAt).toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    if (fieldCountMap[day]) {
      order.items?.forEach((it: any) => {
        const isRental = !!it.serviceId || it.product?.category?.name.toLowerCase().includes('aluguel') || it.product?.category?.name.toLowerCase().includes('campo') || it.product?.name.toLowerCase().includes('aluguel');
        if (isRental && it.product?.name) {
          if (!posCountBuffer[day]) posCountBuffer[day] = {};
          posCountBuffer[day][it.product.name] = (posCountBuffer[day][it.product.name] || 0) + it.quantity;
        }
      });
    }
  });

  // Mesclar: se a venda no PDV for maior que os agendamentos, usamos a venda (evita bitagem)
  Object.keys(fieldCountMap).forEach(day => {
    allFieldNames.forEach(name => {
      const rentalCount = fieldCountMap[day][name] || 0;
      const posCount = posCountBuffer[day]?.[name] || 0;
      // Heurística: o maior valor entre agendamento e venda balcão representa a realidade
      fieldCountMap[day][name] = Math.max(rentalCount, posCount);
    });
  });

  // Mensalidades: Categoria Genérica (Apenas Receita)
  const subFieldName = 'Mensalistas';
  if (subPayments.length > 0) {
    Object.keys(fieldDailyMap).forEach(day => { if (fieldDailyMap[day]) fieldDailyMap[day][subFieldName] = 0; });
    subPayments.forEach(p => {
      const day = p.paymentDate.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
      if (fieldDailyMap[day]) {
        fieldDailyMap[day][subFieldName] = (fieldDailyMap[day][subFieldName] || 0) + p.amount;
      }
    });
  }

  const fieldChart = Object.keys(fieldDailyMap)
    .sort()
    .map(date => {
      const dayEntries = Object.entries(fieldDailyMap[date]);
      const dayTotal = dayEntries.reduce((sum, [_, val]) => sum + val, 0);
      return {
        date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        rawDate: date,
        total_geral: Number(dayTotal.toFixed(2)),
        ...Object.fromEntries(
          dayEntries.map(([k, v]) => [k, Number(v.toFixed(2))])
        )
      };
    });

  const fieldCountChart = Object.keys(fieldCountMap)
    .sort()
    .map(date => {
      const dayEntries = Object.entries(fieldCountMap[date]);
      const dayTotal = dayEntries.reduce((sum, [_, val]) => sum + val, 0);
      return {
        date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        rawDate: date,
        total_geral: dayTotal,
        ...Object.fromEntries(
          dayEntries.map(([k, v]) => [k, v])
        )
      };
    });

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
