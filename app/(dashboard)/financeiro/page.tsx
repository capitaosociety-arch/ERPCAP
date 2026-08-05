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
  // O módulo Clientes é independente do financeiro: mensalidades (Subscription)
  // e jogos/locações (Rental) são apenas informativos dentro do próprio Clientes.
  const [payments, cashRegisters, financialEntries, stockMovements] = await Promise.all([
    prisma.payment.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: { 
        order: {
          include: {
            items: {
              where: { status: 'ACTIVE' },
              include: { product: { include: { category: true } }, service: true }
            }
          }
        }
      }
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
    }),
    prisma.stockMovement.findMany({
      where: { type: 'OUT_SALE', date: { gte: startDate, lte: endDate } },
      include: { product: true }
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
      CREDIT: 0
  };

  const dailyRevenueMap: Record<string, { total: number, produtos: number, aluguel: number }> = {};
  const fieldRentalDailyMap: Record<string, { fut5Count: number; fut7Count: number; totalCount: number; fut5Amount: number; fut7Amount: number; totalAmount: number }> = {};

  // Init range dinâmico
  for (let i = rangeLimit; i >= 0; i--) {
        const d = new Date(endDate);
        d.setDate(d.getDate() - i);
        const st = d.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
        dailyRevenueMap[st] = { total: 0, produtos: 0, aluguel: 0 };
        fieldRentalDailyMap[st] = { fut5Count: 0, fut7Count: 0, totalCount: 0, fut5Amount: 0, fut7Amount: 0, totalAmount: 0 };
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

  // --- ESTATÍSTICAS DE ALUGUEL DE CAMPOS (caixa do diário: PDV e comandas) ---
  // Identifica itens de aluguel de campo nas comandas/PDV pagos no período.
  const isFut5 = (name: string) => /fut5|fut\s*5|futebol\s*5/i.test(name);
  const isFut7 = (name: string) => /fut7|fut\s*7|futebol\s*7/i.test(name);

  payments.forEach(p => {
      const day = p.date.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
      const bucket = fieldRentalDailyMap[day];
      if (!bucket) return;

      const orderItems = p.order?.items || [];
      orderItems.forEach(item => {
          const prodName = item.product?.name?.toLowerCase() || '';
          const catName = item.product?.category?.name?.toLowerCase() || '';
          const svcName = item.service?.name?.toLowerCase() || '';
          const isRental = !!item.serviceId || catName.includes('aluguel') || catName.includes('campo') || prodName.includes('aluguel') || prodName.includes('campo');
          if (!isRental) return;

          const qty = item.quantity || 0;
          const amt = item.subtotal || 0;
          bucket.totalCount += qty;
          bucket.totalAmount += amt;

          const itemName = `${prodName} ${svcName}`;
          if (isFut5(itemName)) {
              bucket.fut5Count += qty;
              bucket.fut5Amount += amt;
          } else if (isFut7(itemName)) {
              bucket.fut7Count += qty;
              bucket.fut7Amount += amt;
          }
      });
  });

  // Mensalidades e locações do módulo Clientes NÃO entram no financeiro.
  // Elas são apenas informação/controle dentro do próprio Clientes.

  // Calcular Pendências
  financialEntries.forEach(entry => {
      if (entry.status === 'PENDING') {
          if (entry.type === 'PAYABLE') totalPendingPayable += entry.amount;
          if (entry.type === 'RECEIVABLE') totalPendingReceivable += entry.amount;
      }
  });

  // --- DRE GERENCIAL (Demonstrativo de Resultados) ---
  // Regime de caixa, agrupado por mês/ano. Receitas realizadas = pagamentos recebidos
  // no período. Despesas = contas pagas (paymentDate) no período.
  type DreBucket = {
      key: string; // MM/YYYY
      receitasVendas: number;
      receitasOutras: number; // contas a receber pagas
      cmv: number; // custo das mercadorias vendidas (estoque OUT_SALE)
      despesas: Record<string, number>; // por categoria de conta paga
      despesasFinanceiras: number; // juros/multas etc (categoria específica, opcional)
      impostos: number;
  };

  const dreMap = new Map<string, DreBucket>();
  const getBucket = (key: string): DreBucket => {
      if (!dreMap.has(key)) {
          dreMap.set(key, { key, receitasVendas: 0, receitasOutras: 0, cmv: 0, despesas: {}, despesasFinanceiras: 0, impostos: 0 });
      }
      return dreMap.get(key)!;
  };
  const monthKey = (d: Date) => {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit' });
      const parts = f.formatToParts(d);
      const y = parts.find(p => p.type === 'year')!.value;
      const m = parts.find(p => p.type === 'month')!.value;
      return `${m}/${y}`;
  };

  // Receitas de vendas (payments de comandas/PDV)
  payments.forEach(p => {
      const b = getBucket(monthKey(p.date));
      b.receitasVendas += p.amount;
  });

  // CMV: custo dos produtos vendidos no período (movimentos de saída de venda)
  stockMovements.forEach(m => {
      if (m.type === 'OUT_SALE') {
          const b = getBucket(monthKey(m.date));
          b.cmv += (m.quantity * (m.unitCost ?? m.product?.cost ?? 0));
      }
  });

  // Contas a pagar/receber pagas no período (regime de caixa)
  financialEntries.forEach(entry => {
      if (entry.status !== 'PAID') return;
      const paidAt = entry.paymentDate || entry.dueDate;
      if (paidAt < startDate || paidAt > endDate) return;
      const b = getBucket(monthKey(paidAt));

      if (entry.type === 'RECEIVABLE') {
          // Receitas extras realizadas (não contabilizadas em vendas)
          b.receitasOutras += entry.amount;
      } else {
          const cat = (entry.category || 'Diversos').toLowerCase();
          if (cat.includes('imposto') || cat.includes('taxa') || cat.includes('darf') || cat.includes('simples')) {
              b.impostos += entry.amount;
          } else if (cat.includes('juros') || cat.includes('multa') || cat.includes('financeiro') || cat.includes('tarifa')) {
              b.despesasFinanceiras += entry.amount;
          } else {
              const catName = entry.category || 'Diversos';
              b.despesas[catName] = (b.despesas[catName] || 0) + entry.amount;
            }
      }
  });

  // Detalhamento por conta para o PDF (mesmas fontes do DRE, com data e descrição)
  type DreDetail = {
      key: string;
      vendas: { data: string; metodo: string; comanda: string; valor: number }[];
      outrasReceitas: { data: string; descricao: string; valor: number }[];
      despesas: { data: string; categoria: string; descricao: string; valor: number }[];
      cmv: { produto: string; qtd: number; custoUnit: number; total: number }[];
  };
  const detailMap = new Map<string, DreDetail>();
  const getDetail = (key: string): DreDetail => {
      if (!detailMap.has(key)) {
          detailMap.set(key, { key, vendas: [], outrasReceitas: [], despesas: [], cmv: [] });
      }
      return detailMap.get(key)!;
  };

  payments.forEach(p => {
      const b = getDetail(monthKey(p.date));
      b.vendas.push({
          data: p.date.toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' }),
          metodo: p.method,
          comanda: p.order?.id?.slice(-6) || '-',
          valor: Number(p.amount.toFixed(2))
      });
  });

  stockMovements.forEach(m => {
      if (m.type === 'OUT_SALE') {
          const b = getDetail(monthKey(m.date));
          b.cmv.push({
              produto: m.product?.name || 'Produto',
              qtd: m.quantity,
              custoUnit: Number((m.unitCost ?? m.product?.cost ?? 0).toFixed(2)),
              total: Number((m.quantity * (m.unitCost ?? m.product?.cost ?? 0)).toFixed(2))
          });
      }
  });

  financialEntries.forEach(entry => {
      if (entry.status !== 'PAID') return;
      const paidAt = entry.paymentDate || entry.dueDate;
      if (paidAt < startDate || paidAt > endDate) return;
      const b = getDetail(monthKey(paidAt));
      if (entry.type === 'RECEIVABLE') {
          b.outrasReceitas.push({
              data: paidAt.toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' }),
              descricao: entry.description,
              valor: Number(entry.amount.toFixed(2))
          });
      } else {
          b.despesas.push({
              data: paidAt.toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' }),
              categoria: entry.category || 'Diversos',
              descricao: entry.description,
              valor: Number(entry.amount.toFixed(2))
          });
      }
  });

  const dreDetails = Array.from(detailMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  // Se não houver nada no range, garante que o mês atual aparece
  const dreMonths = Array.from(dreMap.entries()).map(([key, b]) => {
      const totalReceitas = b.receitasVendas + b.receitasOutras;
      const totalDespesasOp = Object.values(b.despesas).reduce((a, v) => a + v, 0);
      const lucroBruto = totalReceitas - b.cmv;
      const ebitda = lucroBruto - totalDespesasOp;
      const resultadoLiquido = ebitda - b.impostos - b.despesasFinanceiras;
      return {
          key,
          receitasVendas: Number(b.receitasVendas.toFixed(2)),
          receitasOutras: Number(b.receitasOutras.toFixed(2)),
          totalReceitas: Number(totalReceitas.toFixed(2)),
          cmv: Number(b.cmv.toFixed(2)),
          lucroBruto: Number(lucroBruto.toFixed(2)),
          despesas: b.despesas,
          totalDespesasOp: Number(totalDespesasOp.toFixed(2)),
          despesasFinanceiras: Number(b.despesasFinanceiras.toFixed(2)),
          impostos: Number(b.impostos.toFixed(2)),
          ebitda: Number(ebitda.toFixed(2)),
          resultadoLiquido: Number(resultadoLiquido.toFixed(2)),
          margemBruta: totalReceitas > 0 ? Number((lucroBruto / totalReceitas * 100).toFixed(1)) : 0,
          margemEbitda: totalReceitas > 0 ? Number((ebitda / totalReceitas * 100).toFixed(1)) : 0,
          margemLiquida: totalReceitas > 0 ? Number((resultadoLiquido / totalReceitas * 100).toFixed(1)) : 0
      };
  }).sort((a, b) => a.key.localeCompare(b.key));

  // Formatar Arrays do Recharts
  const dailyChart = Object.keys(dailyRevenueMap).map(date => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      rawDate: date,
      produtos: Number(dailyRevenueMap[date].produtos.toFixed(2)),
      aluguel: Number(dailyRevenueMap[date].aluguel.toFixed(2)),
      total: Number(dailyRevenueMap[date].total.toFixed(2))
  })).sort((a, b) => a.rawDate.localeCompare(b.rawDate));

  const methodChart = Object.keys(methodTotals).map(m => ({
      name: m === 'CASH' ? 'Dinheiro' : m === 'PIX' ? 'Pix' : m === 'DEBIT' ? 'Débito' : 'Crédito',
      value: methodTotals[m]
  })).filter(x => x.value > 0);

  // --- GRAFICOS POR CAMPO/JOGOS REMOVIDOS DO FINANCEIRO ---
  // Jogos/locações (Rental) e mensalidades são dados do módulo Clientes,
  // usados apenas para informação e controle dentro do próprio Clientes.

  // --- ESTATÍSTICAS DE ALUGUEL DE CAMPOS PARA OS CARDS ---
  const fieldDailySeries = Object.keys(fieldRentalDailyMap).map(date => ({
      day: date,
      fut5Count: fieldRentalDailyMap[date].fut5Count,
      fut7Count: fieldRentalDailyMap[date].fut7Count,
      totalCount: fieldRentalDailyMap[date].totalCount,
      fut5Amount: Number(fieldRentalDailyMap[date].fut5Amount.toFixed(2)),
      fut7Amount: Number(fieldRentalDailyMap[date].fut7Amount.toFixed(2)),
      totalAmount: Number(fieldRentalDailyMap[date].totalAmount.toFixed(2))
  })).sort((a, b) => a.day.localeCompare(b.day));

  const sumField = (pick: (d: any) => number) => fieldDailySeries.reduce((acc, d) => acc + pick(d), 0);

  const fieldRentalStats = {
      periodLabel: `${startDate.toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' })} a ${endDate.toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' })}`,
      totalGames: sumField((d) => d.totalCount),
      totalAmount: sumField((d) => d.totalAmount),
      fut5Count: sumField((d) => d.fut5Count),
      fut7Count: sumField((d) => d.fut7Count),
      fut5Amount: sumField((d) => d.fut5Amount),
      fut7Amount: sumField((d) => d.fut7Amount),
      dailySeries: fieldDailySeries
  };

  const payload = {
      totalRevenue,
      totalPendingPayable,
      totalPendingReceivable,
      dailyChart,
      methodChart,
      cashRegisters,
      financialEntries,
      dreMonths,
      dreDetails,
      fieldRentalStats
  };

  return <FinanceiroClient payload={payload} />;
}
