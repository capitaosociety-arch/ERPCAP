'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import {
  buildPeriods,
  fmtMoney,
  fmtPct,
  fmtNumber,
  round2,
  pctChange,
  getCuiabaDateStr,
  type PeriodoKey
} from '../../lib/analytics';
import { computeDre } from '../../lib/dre';

export type Secao = 'RISCO' | 'OPORTUNIDADE' | 'RECOMENDACAO' | 'TENDENCIA';

export interface Analise {
  id: string;
  secao: Secao;
  titulo: string;
  resumo: string;
  indicador: string;
  unidade: string;
  periodo: string;
  comparacao: string;
  variacaoPct: number | null;
  impacto: string;
  causa: string;
  acao: string;
  dados: string[];
  link: string;
  severidade?: 'ALTA' | 'MEDIA' | 'BAIXA';
  tendencia?: 'CRESCENDO' | 'ESTAVEL' | 'CAINDO';
}

export interface IntelligenceReport {
  periodoLabel: string;
  geradoEm: string;
  kpis: {
    receitaVendas: number;
    receitaMensalidades: number;
    ticketMedio: number;
    comandasPagas: number;
    margemBruta: number;
    resultadoLiquido: number;
    estoqueAbaixoMinimo: number;
    mensalidadesInadimplentes: number;
  };
  dre: {
    receitasVendas: number;
    receitasOutras: number;
    totalReceitas: number;
    cmv: number;
    lucroBruto: number;
    totalDespesasOp: number;
    resultadoLiquido: number;
    margemLiquida: number;
  };
  tendenciaSerie: { label: string; valor: number }[];
  analises: Analise[];
}

const dayMs = 24 * 60 * 60 * 1000;

export async function getIntelligenceReport(periodo: PeriodoKey): Promise<{ success: boolean; error?: string; report?: IntelligenceReport }> {
  try {
    const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
    if (!session || !session.user?.id) {
      return { success: false, error: "Sessão não encontrada. Faça login novamente." };
    }

    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permInteligencia)) {
      return { success: false, error: "Sem permissão para acessar a Central de Inteligência." };
    }

    const P = buildPeriods(periodo);
    const { from, to, prevFrom, prevTo } = P;
    const todayStr = getCuiabaDateStr();
    const todayStart = new Date(`${todayStr}T00:00:00-04:00`);

    const inCur = (d: Date) => d >= from && d <= to;
    const inPrev = (d: Date) => d >= prevFrom && d <= prevTo;
    const days = Math.round((to.getTime() - from.getTime()) / dayMs) + 1;

    const [
      payments,
      subPayments,
      outSales,
      allOutSales,
      depotMoves,
      products,
      financialEntries,
      rentals,
      subList,
      orderItems,
      dre
    ] = await Promise.all([
      prisma.payment.findMany({
        where: { date: { gte: prevFrom, lte: to } },
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
      prisma.subscriptionPayment.findMany({
        where: { paymentDate: { gte: prevFrom, lte: to } },
        select: { amount: true, paymentDate: true }
      }),
      prisma.stockMovement.findMany({
        where: { type: 'OUT_SALE', date: { gte: prevFrom, lte: to } },
        select: { quantity: true, unitCost: true, date: true, product: { select: { cost: true } } }
      }),
      prisma.stockMovement.findMany({
        where: { type: 'OUT_SALE' },
        select: { productId: true, date: true }
      }),
      prisma.depotMovement.findMany({
        select: { productId: true, date: true }
      }),
      prisma.product.findMany({
        where: { isActive: true },
        include: { stock: true, depotStock: true, category: true }
      }),
      prisma.financialEntry.findMany({
        select: { type: true, amount: true, status: true, dueDate: true, paymentDate: true, category: true, description: true }
      }),
      prisma.rental.findMany({
        where: { startTime: { gte: prevFrom, lte: to }, status: { not: 'CANCELED' } },
        select: { startTime: true, endTime: true }
      }),
      prisma.subscription.findMany({
        where: { isActive: true },
        include: {
          customer: { select: { name: true } },
          payments: { orderBy: { paymentDate: 'desc' }, take: 1 }
        }
      }),
      prisma.orderItem.findMany({
        where: { status: 'ACTIVE', order: { status: 'CLOSED', closedAt: { gte: prevFrom, lte: to } } },
        select: { quantity: true, subtotal: true, product: { select: { name: true, price: true, cost: true } }, service: { select: { name: true } } }
      }),
      computeDre(from, to)
    ]);

    // ---- Receitas e CMV (período atual vs anterior) ----
    let receitasCur = 0, receitasPrev = 0;
    const paidOrdersCur = new Set<string>();
    const paidOrdersPrev = new Set<string>();
    const hourAmountCur: Record<number, number> = {};
    const methodAmountCur: Record<string, number> = {};

    payments.forEach(p => {
      if (inCur(p.date)) {
        receitasCur += p.amount;
        if (p.orderId) paidOrdersCur.add(p.orderId);
        const h = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Cuiaba' }).format(p.date), 10);
        hourAmountCur[h] = (hourAmountCur[h] || 0) + p.amount;
        methodAmountCur[p.method] = (methodAmountCur[p.method] || 0) + p.amount;
      }
      if (inPrev(p.date)) {
        receitasPrev += p.amount;
        if (p.orderId) paidOrdersPrev.add(p.orderId);
      }
    });

    let mensalCur = 0, mensalPrev = 0;
    subPayments.forEach(sp => {
      if (inCur(sp.paymentDate)) mensalCur += sp.amount;
      if (inPrev(sp.paymentDate)) mensalPrev += sp.amount;
    });

    let cmvCur = 0, cmvPrev = 0;
    outSales.forEach(m => {
      const c = m.quantity * (m.unitCost ?? m.product?.cost ?? 0);
      if (inCur(m.date)) cmvCur += c;
      if (inPrev(m.date)) cmvPrev += c;
    });

    const ticketCur = paidOrdersCur.size > 0 ? receitasCur / paidOrdersCur.size : 0;
    const ticketPrev = paidOrdersPrev.size > 0 ? receitasPrev / paidOrdersPrev.size : 0;
    const margemCur = receitasCur > 0 ? ((receitasCur - cmvCur) / receitasCur) * 100 : 0;
    const margemPrev = receitasPrev > 0 ? ((receitasPrev - cmvPrev) / receitasPrev) * 100 : 0;

    // ---- Ocupação de quadras ----
    const hoursOf = (range: [Date, Date]) => {
      const [a, b] = range;
      let h = 0;
      rentals.forEach(r => {
        if (r.startTime >= a && r.startTime <= b) h += (r.endTime.getTime() - r.startTime.getTime()) / 3600000;
      });
      return h;
    };
    const occCur = (hoursOf([from, to]) / (16 * days)) * 100;
    const prevDays = Math.round((prevTo.getTime() - prevFrom.getTime()) / dayMs) + 1;
    const occPrev = (hoursOf([prevFrom, prevTo]) / (16 * prevDays)) * 100;

    // ---- Estoque parado (Balcão + Depósito) ----
    const lastSaleByProduct: Record<string, Date> = {};
    allOutSales.forEach(m => {
      const cur = lastSaleByProduct[m.productId];
      if (!cur || m.date > cur) lastSaleByProduct[m.productId] = m.date;
    });
    const lastMoveByProduct: Record<string, Date> = {};
    depotMoves.forEach(m => {
      const cur = lastMoveByProduct[m.productId];
      if (!cur || m.date > cur) lastMoveByProduct[m.productId] = m.date;
    });

    const stagnant: { name: string; days: number; capital: number }[] = [];
    let stagnantCapital = 0;
    products.forEach(prod => {
      const qtyBalcao = prod.stock?.quantity || 0;
      const qtyDepot = prod.depotStock?.quantity || 0;
      if (qtyBalcao <= 0 && qtyDepot <= 0) return;
      const lastSale = lastSaleByProduct[prod.id];
      const lastMove = lastMoveByProduct[prod.id];
      const lastAny = lastSale && lastMove ? (lastSale > lastMove ? lastSale : lastMove) : (lastSale || lastMove);
      if (!lastAny) return;
      const daysStagnant = Math.floor((todayStart.getTime() - lastAny.getTime()) / dayMs);
      if (daysStagnant < 30) return;
      const capital = (qtyBalcao + qtyDepot) * (prod.cost || 0);
      stagnantCapital += capital;
      stagnant.push({ name: prod.name, days: daysStagnant, capital });
    });
    stagnant.sort((a, b) => b.capital - a.capital);

    // ---- Estoque abaixo do mínimo ----
    const abaixoMinimo: { name: string; local: string; atual: number; minimo: number }[] = [];
    products.forEach(prod => {
      if (prod.stock && prod.stock.quantity <= prod.stock.minQuantity) {
        abaixoMinimo.push({ name: prod.name, local: 'Balcão', atual: prod.stock.quantity, minimo: prod.stock.minQuantity });
      }
      if (prod.depotStock && prod.depotStock.quantity <= prod.depotStock.minQuantity) {
        abaixoMinimo.push({ name: prod.name, local: 'Depósito', atual: prod.depotStock.quantity, minimo: prod.depotStock.minQuantity });
      }
    });
    const abaixoMinimoNomes = new Set(abaixoMinimo.map(i => i.name));
    abaixoMinimo.sort((a, b) => (a.atual - a.minimo) - (b.atual - b.minimo));

    // ---- Contas vencidas ----
    const vencidas = financialEntries
      .filter(e => e.type === 'PAYABLE' && e.status === 'PENDING' && e.dueDate < todayStart)
      .sort((a, b) => b.amount - a.amount);
    const totalVencido = vencidas.reduce((a, e) => a + e.amount, 0);

    // ---- Métodos de pagamento ----
    const totalMetodos = Object.values(methodAmountCur).reduce((a, v) => a + v, 0);
    let topMethod = '';
    let topMethodShare = 0;
    Object.entries(methodAmountCur).forEach(([m, v]) => {
      const share = totalMetodos > 0 ? (v / totalMetodos) * 100 : 0;
      if (share > topMethodShare) { topMethodShare = share; topMethod = m; }
    });
    const methodLabels: Record<string, string> = { CASH: 'Dinheiro', PIX: 'Pix', DEBIT: 'Débito', CREDIT: 'Crédito' };

    // ---- Top produtos (quantidade vendida no período) ----
    const prodAgg: Record<string, { name: string; qty: number; revenue: number; marginPct: number }> = {};
    orderItems.forEach(it => {
      if (!it.product) return;
      const name = it.product.name;
      const a = prodAgg[name] || (prodAgg[name] = { name, qty: 0, revenue: 0, marginPct: 0 });
      a.qty += it.quantity;
      a.revenue += it.subtotal;
      a.marginPct = it.product.price > 0 ? ((it.product.price - it.product.cost) / it.product.price) * 100 : 0;
    });
    const topProdutos = Object.values(prodAgg).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const margemBaixa = Object.values(prodAgg)
      .filter(a => a.marginPct >= 0 && a.marginPct < 15)
      .sort((a, b) => b.revenue - a.revenue);

    // ---- Mensalidades ----
    const inadimplentes = subList.filter(s => {
      const last = s.payments[0]?.paymentDate;
      if (!last) return true;
      return last.getTime() < todayStart.getTime() - 60 * dayMs;
    });
    const inadimplentesTotal = inadimplentes.reduce((a, s) => a + s.amount, 0);

    // ---- Tendência / série ----
    const daily: Record<string, number> = {};
    payments.forEach(p => {
      if (!inCur(p.date)) return;
      const key = p.date.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
      daily[key] = (daily[key] || 0) + p.amount;
    });
    const serie: { label: string; valor: number }[] = [];
    if (days <= 31) {
      const keys = Object.keys(daily).sort();
      keys.forEach(k => {
        const [, m, d] = k.split('-');
        serie.push({ label: `${d}/${m}`, valor: round2(daily[k]) });
      });
    } else {
      const buckets: { label: string; valor: number }[] = [];
      const keys = Object.keys(daily).sort();
      keys.forEach(k => {
        const [, m, d] = k.split('-');
        const dayNum = new Date(Date.UTC(parseInt(k.slice(0, 4), 10), parseInt(m, 10) - 1, parseInt(d, 10)));
        const idx = Math.floor((dayNum.getTime() - new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())).getTime()) / (7 * dayMs));
        const b = buckets[idx] || (buckets[idx] = { label: `Semana ${idx + 1}`, valor: 0 });
        b.valor += daily[k];
      });
      buckets.forEach(b => b.valor = round2(b.valor));
      serie.push(...buckets);
    }

    const crescimento = pctChange(receitasCur, receitasPrev);
    const tendencia: 'CRESCENDO' | 'ESTAVEL' | 'CAINDO' = crescimento >= 5 ? 'CRESCENDO' : crescimento <= -5 ? 'CAINDO' : 'ESTAVEL';

    // ==================== MONTAGEM DAS 13 ANÁLISES ====================
    const analises: Analise[] = [];

    // ---- RISCOS ----
    analises.push({
      id: 'estoque-parado',
      secao: 'RISCO',
      titulo: 'Capital imobilizado em estoque parado',
      resumo: `${stagnant.length} produto(s) sem saída há 30 dias ou mais (Balcão + Depósito), representando ${fmtMoney(stagnantCapital)} em capital parado.`,
      indicador: fmtMoney(stagnantCapital),
      unidade: 'capital imobilizado',
      periodo: P.label,
      comparacao: 'Faixas de parada: 30–59 dias (Atenção), 60–89 (Crítico), 90+ (Muito crítico)',
      variacaoPct: null,
      impacto: 'Financeiro / Gestão',
      causa: 'Sem saída (venda/transferência) há 30+ dias. Itens sem giro acumulam custo de aquisição e ocupam espaço.',
      acao: 'Priorize promoções/liquidação, agrupe em combos ou considere baixa. Revise a compra desses itens.',
      dados: stagnant.slice(0, 5).map(i => `${i.name} — ${i.days} dias parado · ${fmtMoney(i.capital)}`),
      link: '/estoque',
      severidade: stagnant.some(i => i.days >= 90) ? 'ALTA' : stagnant.some(i => i.days >= 60) ? 'MEDIA' : 'BAIXA'
    });

    analises.push({
      id: 'estoque-critico',
      secao: 'RISCO',
      titulo: 'Itens abaixo do estoque mínimo',
      resumo: `${abaixoMinimo.length} registro(s) de estoque igual ou abaixo do mínimo configurado (Balcão e/ou Depósito).`,
      indicador: fmtNumber(abaixoMinimo.length),
      unidade: 'registros abaixo do mínimo',
      periodo: P.label,
      comparacao: 'Nível mínimo definido em Estoque / Depósito',
      variacaoPct: null,
      impacto: 'Operacional / Vendas',
      causa: 'Quantidade atual ≤ quantidade mínima configurada (inclui itens zerados).',
      acao: 'Reponha com urgência os itens zerados para não perder vendas por falta de mercadoria.',
      dados: abaixoMinimo.slice(0, 5).map(i => `${i.name} — ${i.local}: ${i.atual} (mín. ${i.minimo})`),
      link: '/estoque',
      severidade: abaixoMinimo.some(i => i.atual <= 0) ? 'ALTA' : 'MEDIA'
    });

    analises.push({
      id: 'contas-vencidas',
      secao: 'RISCO',
      titulo: 'Contas a pagar vencidas',
      resumo: `${vencidas.length} conta(s) a pagar vencida(s), somando ${fmtMoney(totalVencido)} em passivo atrasado.`,
      indicador: fmtMoney(totalVencido),
      unidade: 'passivo vencido',
      periodo: 'Hoje',
      comparacao: `Total de contas pendentes: ${fmtMoney(financialEntries.filter(e => e.type === 'PAYABLE' && e.status === 'PENDING').reduce((a, e) => a + e.amount, 0))}`,
      variacaoPct: null,
      impacto: 'Financeiro',
      causa: 'Contas PAYABLE com status PENDING e vencimento anterior à data atual.',
      acao: 'Priorize quitar as vencidas para evitar juros/multas e cobranças adicionais.',
      dados: vencidas.slice(0, 5).map(e => `${e.description || e.category || 'Conta'} — venc. ${e.dueDate.toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' })} · ${fmtMoney(e.amount)}`),
      link: '/financeiro',
      severidade: totalVencido > 0 ? 'ALTA' : 'BAIXA'
    });

    analises.push({
      id: 'ticket-medio',
      secao: 'RISCO',
      titulo: 'Evolução do ticket médio',
      resumo: `Ticket médio de ${fmtMoney(ticketCur)} por comanda no período${ticketPrev > 0 ? ` vs ${fmtMoney(ticketPrev)} no período anterior` : ''}.`,
      indicador: fmtMoney(ticketCur),
      unidade: 'ticket médio',
      periodo: P.label,
      comparacao: `Período anterior: ${fmtMoney(ticketPrev)} (${fmtPct(pctChange(ticketCur, ticketPrev))})`,
      variacaoPct: round2(pctChange(ticketCur, ticketPrev)),
      impacto: 'Vendas',
      causa: 'Receita de vendas ÷ número de comandas pagas no período. Queda sinaliza consumo menor por comanda.',
      acao: ticketCur < ticketPrev
        ? 'Revise o cardápio, incentive combos e acompanhamentos para elevar o valor por comanda.'
        : 'Mantenha as ações de venda que elevaram o ticket e amplie para horários ociosos.',
      dados: [`Comandas pagas no período: ${fmtNumber(paidOrdersCur.size)}`, `Receita: ${fmtMoney(receitasCur)}`],
      link: '/dashboard',
      severidade: ticketCur < ticketPrev ? (pctChange(ticketCur, ticketPrev) <= -10 ? 'ALTA' : 'MEDIA') : 'BAIXA'
    });

    analises.push({
      id: 'margem-bruta',
      secao: 'RISCO',
      titulo: 'Margem bruta das vendas',
      resumo: `Margem bruta de ${margemCur.toFixed(1).replace('.', ',')}% no período (${fmtMoney(receitasCur)} de vendas vs ${fmtMoney(cmvCur)} de custo).`,
      indicador: `${margemCur.toFixed(1).replace('.', ',')}%`,
      unidade: 'margem bruta',
      periodo: P.label,
      comparacao: `Período anterior: ${margemPrev.toFixed(1).replace('.', ',')}% (${fmtPct(margemCur - margemPrev)} pontos)`,
      variacaoPct: round2(margemCur - margemPrev),
      impacto: 'Financeiro / Vendas',
      causa: '(Receita − CMV) ÷ Receita. CMV usa o custo unitário da saída de estoque (snapshot).',
      acao: margemCur < margemPrev
        ? 'Revise preços de itens com margem baixa e negocie fornecedores para recuperar a margem.'
        : 'Margem saudável — mantenha a política de preços atual.',
      dados: [`CMV do período: ${fmtMoney(cmvCur)}`, `Lucro bruto: ${fmtMoney(receitasCur - cmvCur)}`],
      link: '/financeiro',
      severidade: margemCur < margemPrev ? (margemCur - margemPrev <= -3 ? 'ALTA' : 'MEDIA') : 'BAIXA'
    });

    analises.push({
      id: 'ocupacao-quadras',
      secao: 'RISCO',
      titulo: 'Ocupação das quadras',
      resumo: `Ocupação de ${occCur.toFixed(0).replace('.', ',')}% no período (referência: 16h/dia úteis).`,
      indicador: `${occCur.toFixed(0).replace('.', ',')}%`,
      unidade: 'taxa de ocupação',
      periodo: P.label,
      comparacao: `Período anterior: ${occPrev.toFixed(0).replace('.', ',')}% (${fmtPct(occCur - occPrev)} pontos)`,
      variacaoPct: round2(occCur - occPrev),
      impacto: 'Vendas / Gestão',
      causa: 'Horas reservadas ÷ (16h × dias do período), via agendamentos de quadra.',
      acao: occCur < 30
        ? 'Impulsione horários ociosos com promoções de horário cheio e pacotes de jogos.'
        : 'Mantenha a política atual de reservas e aproveite para preencher horários livres.',
      dados: [`Horas reservadas: ${hoursOf([from, to]).toFixed(1).replace('.', ',')}h`, `Dias analisados: ${days}`],
      link: '/dashboard',
      severidade: occCur < 30 ? 'MEDIA' : 'BAIXA'
    });

    // ---- OPORTUNIDADES ----
    let picoH = -1, picoVal = 0, ociosoH = -1, ociosoVal = Number.MAX_SAFE_INTEGER;
    Object.entries(hourAmountCur).forEach(([h, v]) => {
      const hh = parseInt(h, 10);
      if (v > picoVal) { picoVal = v; picoH = hh; }
      if (v < ociosoVal) { ociosoVal = v; ociosoH = hh; }
    });

    analises.push({
      id: 'pico-horario',
      secao: 'OPORTUNIDADE',
      titulo: 'Horário de pico e ociosidade',
      resumo: picoH >= 0
        ? `Pico de vendas às ${String(picoH).padStart(2, '0')}h (${fmtMoney(picoVal)}). Horário mais ocioso: ${String(ociosoH).padStart(2, '0')}h (${fmtMoney(ociosoVal)}).`
        : 'Sem vendas registradas no período.',
      indicador: picoH >= 0 ? `${String(picoH).padStart(2, '0')}h` : '-',
      unidade: 'horário de pico',
      periodo: P.label,
      comparacao: 'Distribuição das vendas por hora (fuso Cuiabá)',
      variacaoPct: null,
      impacto: 'Vendas',
      causa: 'Somatório de receita por hora do dia no período analisado.',
      acao: 'Crie ações para o horário ocioso (promoções, happy hour) e garanta estrutura no horário de pico.',
      dados: picoH >= 0
        ? [`Pico: ${String(picoH).padStart(2, '0')}h → ${fmtMoney(picoVal)}`, `Ociosidade: ${String(ociosoH).padStart(2, '0')}h → ${fmtMoney(ociosoVal)}`]
        : ['Nenhuma venda no período.'],
      link: '/dashboard'
    });

    analises.push({
      id: 'top-produtos',
      secao: 'OPORTUNIDADE',
      titulo: 'Produtos mais vendidos',
      resumo: topProdutos.length > 0
        ? `${topProdutos[0].name} lidera com ${fmtNumber(topProdutos[0].qty)} un. vendidas no período.`
        : 'Nenhuma venda de produto no período.',
      indicador: topProdutos.length > 0 ? topProdutos[0].name : '-',
      unidade: 'líder de vendas',
      periodo: P.label,
      comparacao: 'Ranking por quantidade vendida (comandas fechadas)',
      variacaoPct: null,
      impacto: 'Vendas',
      causa: 'Quantidade vendida por produto nas comandas fechadas no período.',
      acao: 'Destaque os líderes em posições visíveis do PDV e garanta estoque suficiente para eles.',
      dados: topProdutos.map(p => `${p.name} — ${fmtNumber(p.qty)} un · margem ${p.marginPct.toFixed(0).replace('.', ',')}%`),
      link: '/produtos'
    });

    analises.push({
      id: 'metodos-pagamento',
      secao: 'OPORTUNIDADE',
      titulo: 'Concentração de métodos de pagamento',
      resumo: totalMetodos > 0 && topMethod
        ? `${methodLabels[topMethod] || topMethod} concentra ${topMethodShare.toFixed(0).replace('.', ',')}% do recebido no período.`
        : 'Sem recebimentos no período.',
      indicador: topMethod ? `${topMethodShare.toFixed(0).replace('.', ',')}%` : '-',
      unidade: 'participação do principal método',
      periodo: P.label,
      comparacao: 'Participação por método (CASH, PIX, DEBIT, CREDIT)',
      variacaoPct: null,
      impacto: 'Financeiro',
      causa: 'Soma de recebimentos por método de pagamento no período.',
      acao: topMethodShare >= 50
        ? 'Estimule alternativas (Pix, débito) para reduzir risco de caixa e taxas elevadas.'
        : 'Distribuição saudável entre os métodos — mantenha.',
      dados: Object.entries(methodAmountCur)
        .sort((a, b) => b[1] - a[1])
        .map(([m, v]) => `${methodLabels[m] || m}: ${fmtMoney(v)} (${totalMetodos > 0 ? ((v / totalMetodos) * 100).toFixed(0).replace('.', ',') : 0}%)`),
      link: '/financeiro'
    });

    analises.push({
      id: 'mensalidades',
      secao: 'OPORTUNIDADE',
      titulo: 'Receita recorrente e mensalidades',
      resumo: `${fmtMoney(mensalCur)} recebidos em mensalidades no período. ${subList.length} assinatura(s) ativa(s) e ${inadimplentes.length} sem confirmação há 60+ dias.`,
      indicador: fmtMoney(mensalCur),
      unidade: 'receita de mensalidades',
      periodo: P.label,
      comparacao: `Período anterior: ${fmtMoney(mensalPrev)} (${fmtPct(pctChange(mensalCur, mensalPrev))})`,
      variacaoPct: round2(pctChange(mensalCur, mensalPrev)),
      impacto: 'Clientes / Financeiro',
      causa: 'Pagamentos de mensalidades (SubscriptionPayment) no período; inadimplência = assinatura ativa sem pagamento há 60 dias.',
      acao: inadimplentes.length > 0
        ? 'Cobre as mensalidades em atraso e reforce o canal de cobrança antes do vencimento.'
        : 'Receita recorrente saudável — mantenha o ciclo de cobrança.',
      dados: [
        `Assinaturas ativas: ${subList.length}`,
        `Inadimplentes (60d+): ${inadimplentes.length} · ${fmtMoney(inadimplentesTotal)}`
      ],
      link: '/clientes'
    });

    // ---- RECOMENDAÇÕES ----
    analises.push({
      id: 'reposicao',
      secao: 'RECOMENDACAO',
      titulo: 'Sugestão de reposição',
      resumo: `${abaixoMinimo.length} registro(s) de estoque abaixo do mínimo — verifique os itens listados para compra.`,
      indicador: fmtNumber(abaixoMinimo.length),
      unidade: 'itens para reposição',
      periodo: 'Momento atual',
      comparacao: 'Base: quantidade atual ≤ mínimo configurado',
      variacaoPct: null,
      impacto: 'Operacional',
      causa: 'Itens com estoque igual ou abaixo do mínimo em Balcão ou Depósito.',
      acao: 'Gere ordem de compra para os itens zerados/baixos, priorizando os críticos.',
      dados: abaixoMinimo.slice(0, 6).map(i => `${i.name} — ${i.local}: ${i.atual} (mín. ${i.minimo})`),
      link: '/estoque'
    });

    analises.push({
      id: 'reajuste-preco',
      secao: 'RECOMENDACAO',
      titulo: 'Revisão de preço (margem baixa)',
      resumo: `${margemBaixa.length} produto(s) vendido(s) no período com margem bruta abaixo de 15% — candidatos a reajuste.`,
      indicador: fmtNumber(margemBaixa.length),
      unidade: 'produtos com margem < 15%',
      periodo: P.label,
      comparacao: 'Margem unitária = (preço − custo) ÷ preço',
      variacaoPct: null,
      impacto: 'Financeiro',
      causa: 'Produtos com venda no período e margem bruta unitária abaixo de 15% (ou custo maior que o preço).',
      acao: 'Avalie o reajuste desses preços ou renegocie o custo de aquisição.',
      dados: margemBaixa.slice(0, 6).map(p => `${p.name} — margem ${p.marginPct.toFixed(1).replace('.', ',')}% · ${fmtMoney(p.revenue)} vendidos`),
      link: '/produtos'
    });

    // ---- TENDÊNCIAS ----
    analises.push({
      id: 'tendencia-receita',
      secao: 'TENDENCIA',
      titulo: 'Tendência de receita',
      resumo: `Receita de ${fmtMoney(receitasCur)} no período${receitasPrev > 0 ? ` vs ${fmtMoney(receitasPrev)} no anterior (${fmtPct(crescimento)})` : ''}. ${tendencia === 'CRESCENDO' ? 'Sinal de crescimento.' : tendencia === 'CAINDO' ? 'Sinal de queda — atenção.' : 'Estabilidade no faturamento.'}`,
      indicador: fmtPct(crescimento),
      unidade: 'variação de receita',
      periodo: P.label,
      comparacao: `Período anterior: ${fmtMoney(receitasPrev)}`,
      variacaoPct: round2(crescimento),
      impacto: 'Vendas / Gestão',
      causa: 'Comparação da receita de vendas (comandas/PDV) entre o período e o anterior.',
      acao: crescimento < 0
        ? 'Investigue a queda (dias/horários/produtos) e atue no marketing e na oferta.'
        : crescimento > 5
          ? 'Aproveite o momento para consolidar e ampliar o desempenho.'
          : 'Monitoramento mantido — sem variação relevante.',
      dados: [`Receita no período: ${fmtMoney(receitasCur)}`, `Receita anterior: ${fmtMoney(receitasPrev)}`],
      link: '/financeiro',
      tendencia
    });

    return {
      success: true,
      report: {
        periodoLabel: P.label,
        geradoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' }),
        kpis: {
          receitaVendas: round2(receitasCur),
          receitaMensalidades: round2(mensalCur),
          ticketMedio: round2(ticketCur),
          comandasPagas: paidOrdersCur.size,
          margemBruta: round2(margemCur),
          resultadoLiquido: dre.resultadoLiquido,
          estoqueAbaixoMinimo: abaixoMinimoNomes.size,
          mensalidadesInadimplentes: inadimplentes.length
        },
        dre: {
          receitasVendas: dre.receitasVendas,
          receitasOutras: dre.receitasOutras,
          totalReceitas: dre.totalReceitas,
          cmv: dre.cmv,
          lucroBruto: dre.lucroBruto,
          totalDespesasOp: dre.totalDespesasOp,
          resultadoLiquido: dre.resultadoLiquido,
          margemLiquida: dre.margemLiquida
        },
        tendenciaSerie: serie,
        analises
      }
    };
  } catch (error: any) {
    console.error('ERRO_INTELIGENCIA:', error);
    return { success: false, error: 'Falha ao gerar o relatório de inteligência: ' + (error?.message || 'Erro desconhecido') };
  }
}
