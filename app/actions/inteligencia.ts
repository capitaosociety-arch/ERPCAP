'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import {
  fmtMoney,
  fmtPct,
  fmtNumber,
  round2,
  pctChange,
  getCuiabaDateStr,
  isRentalItem
} from '../../lib/analytics';
import {
  getFinancialMonth,
  isMonthKey,
  monthRange,
  previousMonth,
  type FinancialRegime,
  type FinancialSource
} from '../../lib/official-financials';
import { getCommercialSnapshot, getOccupancyReport } from '../../lib/commercial-analytics';
import { NEW_RULES_EFFECTIVE_PERIOD, isNewRulesDate, methodologyNoteForPeriod, rulesVersionForPeriod, type RulesVersion } from '../../lib/effective-rules';

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
  previousPeriodLabel: string;
  geradoEm: string;
  regime: FinancialRegime;
  status: 'OPEN' | 'CLOSED';
  version: number | null;
  source: FinancialSource;
  isSnapshot: boolean;
  comparisonAvailable: boolean;
  availableRegimes: FinancialRegime[];
  methodology: { rulesEffectiveFrom: string; rulesVersion: RulesVersion; note: string };
  kpis: {
    receitaVendas: number;
    receitaMensalidades: number;
    ticketMedio: number;
    comandasPagas: number;
    margemBruta: number;
    resultadoOperacional: number;
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
    resultadoOperacional: number;
    resultadoLiquido: number;
    margemLiquida: number;
    previousLabel: string;
    comparisonAvailable: boolean;
  };
  tendenciaSerie: { label: string; valor: number }[];
  commercial: {
    occupancy: any;
    productContribution: any;
    revenueMix: any;
    reconciliation: any;
  };
  analises: Analise[];
}

const dayMs = 24 * 60 * 60 * 1000;

export async function getIntelligenceReport(
  period: string,
  regime: FinancialRegime = 'competence'
): Promise<{ success: boolean; error?: string; report?: IntelligenceReport }> {
  try {
    const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
    if (!session || !session.user?.id) {
      return { success: false, error: "Sessão não encontrada. Faça login novamente." };
    }

    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permInteligencia)) {
      return { success: false, error: "Sem permissão para acessar a Central de Inteligência." };
    }

    if (!isMonthKey(period)) {
      return { success: false, error: 'Período inválido. Use o formato AAAA-MM.' };
    }

    const previousPeriod = previousMonth(period);
    const [official, previousOfficial] = await Promise.all([
      getFinancialMonth(period, regime),
      getFinancialMonth(previousPeriod, regime),
    ]);

    if (!official.dre) {
      return {
        success: false,
        error: official.unavailableReason || 'Não há DRE oficial disponível para o regime selecionado.'
      };
    }

    const officialDre = official.dre;
    const previousDre = previousOfficial.dre;
    const comparisonAvailable = official.status === 'CLOSED' && !!previousDre;
    const P = monthRange(period, { capToToday: true });
    const { from, to, prevFrom, prevTo } = P;
    const todayStr = getCuiabaDateStr();
    const todayStart = new Date(`${todayStr}T00:00:00-04:00`);

    const inCur = (d: Date) => d >= from && d <= to;
    const inPrev = (d: Date) => d >= prevFrom && d <= prevTo;
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / dayMs));

    const [
      payments,
      subPayments,
      allOutSales,
      depotMoves,
      products,
      financialEntries,
      subList,
      orderItems,
      commercial,
      previousOccupancy
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
        where: { type: 'OUT_SALE' },
        select: { productId: true, date: true }
      }),
      prisma.depotMovement.findMany({
        select: { productId: true, date: true }
      }),
      prisma.product.findMany({
        where: { isActive: true, isService: false, stockControlled: true },
        include: { stock: true, depotStock: true, category: true }
      }),
      prisma.financialEntry.findMany({
        select: { type: true, amount: true, status: true, dueDate: true, paymentDate: true, category: true, description: true }
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
        select: { quantity: true, subtotal: true, order: { select: { closedAt: true } }, product: { select: { name: true, price: true, cost: true, isService: true, stockControlled: true } }, service: { select: { name: true } } }
      }),
      getCommercialSnapshot(from, to),
      getOccupancyReport(prevFrom, prevTo)
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

    const ticketCur = paidOrdersCur.size > 0 ? receitasCur / paidOrdersCur.size : 0;
    const ticketPrev = paidOrdersPrev.size > 0 ? receitasPrev / paidOrdersPrev.size : 0;
    const margemCur = officialDre.margemBruta;
    const margemPrev = comparisonAvailable && previousDre ? previousDre.margemBruta : null;

    // ---- Ocupação de quadras (serviço por campo/dia/hora) ----
    const occCur = commercial.occupancy.available ? commercial.occupancy.overall.ocupacaoEfetivaPct : 0;
    const occPrev = previousOccupancy.available ? previousOccupancy.overall.ocupacaoEfetivaPct : 0;

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
      if (!it.product || isRentalItem(it, { useNewRules: isNewRulesDate(it.order?.closedAt) })) return;
      const name = it.product.name;
      const a = prodAgg[name] || (prodAgg[name] = { name, qty: 0, revenue: 0, marginPct: 0 });
      a.qty += it.quantity;
      a.revenue += it.subtotal;
      a.marginPct = it.product.price > 0 ? ((it.product.price - it.product.cost) / it.product.price) * 100 : 0;
    });
    const topProdutos = Object.values(prodAgg).sort((a, b) => b.qty - a.qty).slice(0, 5);

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

    const crescimento = comparisonAvailable && previousDre
      ? pctChange(officialDre.totalReceitas, previousDre.totalReceitas)
      : null;
    const tendencia: 'CRESCENDO' | 'ESTAVEL' | 'CAINDO' | null = crescimento == null
      ? null
      : crescimento >= 5 ? 'CRESCENDO' : crescimento <= -5 ? 'CAINDO' : 'ESTAVEL';

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
      causa: 'Quantidade atual â‰¤ quantidade mínima configurada (inclui itens zerados).',
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
      resumo: `Margem bruta oficial de ${margemCur.toFixed(1).replace('.', ',')}% em ${official.label} (${fmtMoney(officialDre.totalReceitas)} de receita vs ${fmtMoney(officialDre.cmv)} de CMV).`,
      indicador: `${margemCur.toFixed(1).replace('.', ',')}%`,
      unidade: 'margem bruta oficial',
      periodo: official.label,
      comparacao: margemPrev != null
        ? `Período anterior (${previousOfficial.label}): ${margemPrev.toFixed(1).replace('.', ',')}% (${fmtPct(margemCur - margemPrev)} pontos)`
        : 'Comparação oficial indisponível para período em aberto.',
      variacaoPct: margemPrev != null ? round2(margemCur - margemPrev) : null,
      impacto: 'Financeiro / Vendas',
      causa: '(Receita âˆ’ CMV) ÷ Receita no DRE oficial, usando snapshot de fechamento ou cálculo ao vivo do mês aberto.',
      acao: margemPrev != null && margemCur < margemPrev
        ? 'Revise preços de itens com margem baixa e negocie fornecedores para recuperar a margem.'
        : 'Margem saudável — mantenha a política de preços atual.',
      dados: [
        `CMV oficial: ${fmtMoney(officialDre.cmv)}`,
        `Lucro bruto oficial: ${fmtMoney(officialDre.lucroBruto)}`,
        `Fonte: ${official.source === 'snapshot' ? `snapshot v${official.version}` : 'cálculo ao vivo'}`
      ],
      link: '/financeiro',
      severidade: margemPrev != null && margemCur < margemPrev ? (margemCur - margemPrev <= -3 ? 'ALTA' : 'MEDIA') : 'BAIXA'
    });

    analises.push({
      id: 'ocupacao-quadras',
      secao: 'RISCO',
      titulo: 'Ocupação das quadras',
      resumo: commercial.occupancy.available
        ? `Ocupação regular de ${occCur.toFixed(1).replace('.', ',')}% no período; ${Number(commercial.occupancy.overall.extraHoras || 0).toFixed(1).replace('.', ',')}h e ${fmtMoney(commercial.occupancy.overall.extraReceita || 0)} em reservas extraordinárias. ${commercial.occupancy.config.note}`
        : `Sem reservas de quadras no período. ${commercial.occupancy.reason}`,
      indicador: commercial.occupancy.available ? `${occCur.toFixed(1).replace('.', ',')}%` : '—',
      unidade: 'taxa de ocupação regular',
      periodo: P.label,
      comparacao: commercial.occupancy.available && previousOccupancy.available && comparisonAvailable
        ? `Período anterior: ${occPrev.toFixed(1).replace('.', ',')}% (${fmtPct(occCur - occPrev)} pontos)`
        : 'Sem comparação de ocupação disponível para período em aberto.',
      variacaoPct: commercial.occupancy.available && previousOccupancy.available && comparisonAvailable ? round2(occCur - occPrev) : null,
      impacto: 'Vendas / Gestão',
      causa: `Ocupação = horas efetivas confirmadas/pagas ÷ capacidade por campo/dia. ${commercial.occupancy.config.note}`,
      acao: commercial.occupancy.available && occCur < 30
        ? 'Priorize ações nos horários/dias de menor ocupação; veja a lista de oportunidades na Central.'
        : 'Mantenha a política atual de reservas e acompanhe horários livres.',
      dados: commercial.occupancy.available
        ? commercial.occupancy.fields.map((f: any) => `${f.campo}: ${f.ocupacaoEfetivaPct}% regular (${f.efetivoHoras}h de ${f.capacidadeHoras}h) · extraordinário ${f.extraHoras || 0}h / ${fmtMoney(f.extraReceita || 0)} · agenda regular ${fmtMoney(f.receitaAgenda)}`)
        : ['Nenhuma reserva não cancelada no período.'],
      link: '/dashboard',
      severidade: commercial.occupancy.available && occCur < 30 ? 'MEDIA' : 'BAIXA'
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
        ? [`Pico: ${String(picoH).padStart(2, '0')}h â†’ ${fmtMoney(picoVal)}`, `Ociosidade: ${String(ociosoH).padStart(2, '0')}h â†’ ${fmtMoney(ociosoVal)}`]
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
      dados: topProdutos.map(p => `${p.name} — ${fmtNumber(p.qty)} un · margem de catálogo ${p.marginPct.toFixed(0).replace('.', ',')}%`),
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
      comparacao: 'Base: quantidade atual â‰¤ mínimo configurado',
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
      titulo: 'Revisão de preço (margem de contribuição)',
      resumo: commercial.productContribution.available
        ? `${commercial.productContribution.menoresMargens.length} produto(s) com menor margem de contribuição realizada no período.`
        : `Sem base de margem realizada. ${commercial.productContribution.reason || ''}`,
      indicador: fmtNumber(commercial.productContribution.menoresMargens.length),
      unidade: 'produtos com menor margem',
      periodo: P.label,
      comparacao: 'Margem realizada = receita líquida do produto âˆ’ CMV snapshot; não usa preço/custo atual do cadastro.',
      variacaoPct: null,
      impacto: 'Financeiro',
      causa: 'Produtos com menor margem de contribuição realizada em comandas fechadas; custo incompleto pode limitar a conclusão.',
      acao: 'Avalie reajuste ou renegociação apenas após confirmar custo histórico completo.',
      dados: commercial.productContribution.menoresMargens.slice(0, 6).map((p: any) => `${p.produto} — margem ${p.margemPct == null ? 'indisponível' : `${p.margemPct.toFixed(1).replace('.', ',')}%`} · ${fmtMoney(p.receitaLiquida)} líquidos`),
      link: '/produtos',
      severidade: commercial.productContribution.custoIncompleto ? 'MEDIA' : 'BAIXA'
    });

    // ---- TENDÊNCIAS ----
    analises.push({
      id: 'tendencia-receita',
      secao: 'TENDENCIA',
      titulo: 'Tendência de receita',
      resumo: crescimento != null && previousDre
        ? `Receita oficial de ${fmtMoney(officialDre.totalReceitas)} em ${official.label} vs ${fmtMoney(previousDre.totalReceitas)} em ${previousOfficial.label} (${fmtPct(crescimento)}). ${tendencia === 'CRESCENDO' ? 'Sinal de crescimento.' : tendencia === 'CAINDO' ? 'Sinal de queda — atenção.' : 'Estabilidade no faturamento.'}`
        : `Receita oficial de ${fmtMoney(officialDre.totalReceitas)} em ${official.label}. Comparação mensal oficial disponível após o fechamento do período.`,
      indicador: crescimento != null ? fmtPct(crescimento) : '—',
      unidade: 'variação de receita oficial',
      periodo: official.label,
      comparacao: crescimento != null && previousDre
        ? `Período anterior (${previousOfficial.label}): ${fmtMoney(previousDre.totalReceitas)}`
        : 'Sem comparação oficial para período em aberto.',
      variacaoPct: crescimento != null ? round2(crescimento) : null,
      impacto: 'Vendas / Gestão',
      causa: 'Comparação da receita total no DRE oficial, com snapshot para meses fechados e cálculo ao vivo para meses abertos.',
      acao: crescimento != null && crescimento < 0
        ? 'Investigue a queda (dias/horários/produtos) e atue no marketing e na oferta.'
        : crescimento != null && crescimento > 5
          ? 'Aproveite o momento para consolidar e ampliar o desempenho.'
          : 'Monitoramento mantido — sem variação relevante ou comparação disponível.',
      dados: [
        `Receita oficial: ${fmtMoney(officialDre.totalReceitas)}`,
        crescimento != null && previousDre ? `Receita anterior oficial: ${fmtMoney(previousDre.totalReceitas)}` : 'Período em aberto: sem comparação oficial.',
        `Fonte: ${official.source === 'snapshot' ? `snapshot v${official.version}` : 'cálculo ao vivo'}`
      ],
      link: '/financeiro',
      tendencia: tendencia || undefined
    });

    const mix = commercial.revenueMix;
    analises.push({
      id: 'mix-receita',
      secao: 'OPORTUNIDADE',
      titulo: 'Separacao de receita: aluguel x produtos',
      resumo: mix.available
        ? `Nas comandas fechadas: aluguel ${fmtMoney(mix.aluguelComandas)} e produtos ${fmtMoney(mix.produtosComandas)}. Agenda de locacoes: ${fmtMoney(mix.agendaAluguel.total)} (${mix.agendaAluguel.reservas} reservas), dos quais ${fmtMoney(mix.agendaAluguel.pago)} pagos.`
        : `Sem dados de receita no periodo. ${mix.reason || ''}`,
      indicador: mix.available ? `${mix.totalComandas > 0 ? ((mix.aluguelComandas / mix.totalComandas) * 100).toFixed(1).replace('.', ',') : '0,0'}%` : '-',
      unidade: 'participacao do aluguel nas comandas',
      periodo: P.label,
      comparacao: mix.note,
      variacaoPct: null,
      impacto: 'Financeiro / Comercial',
      causa: 'Receita de aluguel e produtos separada por item da comanda. A agenda Rental e operacional e nao e somada ao DRE.',
      acao: 'Use a agenda para ocupar horarios e a margem de produtos para decidir mix e precos.',
      dados: mix.available ? [
        `Aluguel em comandas: ${fmtMoney(mix.aluguelComandas)}`,
        `Produtos em comandas: ${fmtMoney(mix.produtosComandas)}`,
        `Agenda: pago ${fmtMoney(mix.agendaAluguel.pago)}, pendente ${fmtMoney(mix.agendaAluguel.pendente)}, no-show ${fmtMoney(mix.agendaAluguel.noShow)}`
      ] : ['Sem dados no periodo.'],
      link: '/financeiro'
    });

    const pc = commercial.productContribution;
    analises.push({
      id: 'margem-contribuicao-produtos',
      secao: 'RECOMENDACAO',
      titulo: 'Margem de contribuicao por produto',
      resumo: pc.available
        ? `Receita liquida de produtos ${fmtMoney(pc.produtoReceitaLiquida)}, CMV ${fmtMoney(pc.cmvTotal)} e margem de contribuicao ${pc.margemContribuicaoTotal == null ? 'indisponivel por custo incompleto' : fmtMoney(pc.margemContribuicaoTotal)}.`
        : `Sem vendas de produtos vinculadas no periodo. ${pc.reason || ''}`,
      indicador: pc.margemPct == null ? '—' : `${pc.margemPct.toFixed(1).replace('.', ',')}%`,
      unidade: 'margem de contribuicao sobre produtos',
      periodo: P.label,
      comparacao: pc.note,
      variacaoPct: null,
      impacto: 'Financeiro / Comercial',
      causa: 'Receita liquida de itens de produto com desconto rateado, menos CMV snapshot das saidas de estoque.',
      acao: pc.custoIncompleto
        ? 'Priorize completar o custo historico das saidas; a margem nao deve ser usada como realizada enquanto houver custo incompleto.'
        : 'Priorize os produtos com maior margem e revise os de menor margem.',
      dados: pc.available
        ? pc.produtos.slice(0, 6).map((p: any) => `${p.produto}: ${fmtMoney(p.receitaLiquida)} receita, ${fmtMoney(p.cmv)} CMV, margem ${p.margemPct == null ? 'indisponivel' : `${p.margemPct.toFixed(1).replace('.', ',')}%`}`)
        : ['Sem dados no periodo.'],
      link: '/produtos'
    });

    const rec = commercial.reconciliation;
    analises.push({
      id: 'conciliacao-estoque',
      secao: 'RISCO',
      titulo: 'Conciliacao entre comandas e saidas de estoque',
      resumo: rec.available
        ? `${rec.produtosComDivergencia} produto(s) com diferenca agregada entre comandas e saidas; ${rec.quantidadeDivergente} unidade(s) de diferenca e ${rec.quantidadeSemCusto} unidade(s) sem custo.`
        : `Sem dados para conciliar. ${rec.reason || ''}`,
      indicador: rec.available ? fmtNumber(rec.produtosComDivergencia) : '—',
      unidade: 'produtos com diferenca',
      periodo: P.label,
      comparacao: 'Comparacao por produto e periodo; nao ha vinculo orderItemId nas saidas.',
      variacaoPct: null,
      impacto: 'Estoque / Financeiro',
      causa: 'Diferenca entre quantidade ativa em comandas fechadas e movimentos OUT_SALE liquidos de devolucao.',
      acao: 'Investigue as maiores diferencas antes de concluir perda; verifique vendas sem baixa, transferencias e horario da contagem.',
      dados: rec.available
        ? rec.linhas.slice(0, 6).map((r: any) => `${r.produto}: comandas ${r.quantidadeComandas}, saidas ${r.quantidadeSaidas}, diferenca ${r.diferenca}`)
        : ['Sem dados no periodo.'],
      link: '/estoque',
      severidade: rec.produtosComDivergencia > 0 || rec.quantidadeSemCusto > 0 ? 'MEDIA' : 'BAIXA'
    });

    const opportunity = commercial.occupancy.opportunities[0];
    analises.push({
      id: 'oportunidade-ociosa',
      secao: 'OPORTUNIDADE',
      titulo: 'Oportunidade em horarios ociosos',
      resumo: commercial.occupancy.available && opportunity
        ? `${opportunity.campo} tem ${opportunity.horasOciosas}h ociosas no horario ${String(opportunity.hora).padStart(2, '0')}h. Potencial estimado: ${opportunity.potencialEstimado == null ? 'indisponivel' : fmtMoney(opportunity.potencialEstimado)}.`
        : 'Sem dados suficientes para estimar oportunidade de horarios ociosos.',
      indicador: opportunity?.potencialEstimado == null ? '—' : fmtMoney(opportunity.potencialEstimado),
      unidade: 'potencial estimado (nao realizado)',
      periodo: P.label,
      comparacao: opportunity?.premissa || 'Estimativa exige historico e premissa de preco.',
      variacaoPct: null,
      impacto: 'Vendas',
      causa: 'Horas sem reserva efetiva dentro da janela operacional configurada, multiplicadas pela receita media por hora efetiva do campo.',
      acao: 'Valide a janela operacional real e teste promocoes nos horarios/dias com maior ociosidade.',
      dados: commercial.occupancy.opportunities.slice(0, 5).map((o: any) => `${o.campo} ${String(o.hora).padStart(2, '0')}h: ${o.horasOciosas}h ociosas${o.potencialEstimado == null ? '' : ` · estimativa ${fmtMoney(o.potencialEstimado)}`}`),
      link: '/dashboard'
    });

    return {
      success: true,
      report: {
        periodoLabel: official.label,
        previousPeriodLabel: previousOfficial.label,
        geradoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' }),
        regime,
        status: official.status,
        version: official.version,
        source: official.source,
        isSnapshot: official.isSnapshot,
        comparisonAvailable,
        availableRegimes: official.availableRegimes,
        methodology: {
          rulesEffectiveFrom: NEW_RULES_EFFECTIVE_PERIOD,
          rulesVersion: rulesVersionForPeriod(official.period),
          note: methodologyNoteForPeriod(official.period),
        },
        kpis: {
          receitaVendas: officialDre.receitasVendas,
          receitaMensalidades: round2(mensalCur),
          ticketMedio: round2(ticketCur),
          comandasPagas: paidOrdersCur.size,
          margemBruta: officialDre.margemBruta,
          resultadoOperacional: officialDre.ebitda,
          resultadoLiquido: officialDre.resultadoLiquido,
          estoqueAbaixoMinimo: abaixoMinimoNomes.size,
          mensalidadesInadimplentes: inadimplentes.length
        },
        dre: {
          receitasVendas: officialDre.receitasVendas,
          receitasOutras: officialDre.receitasOutras,
          totalReceitas: officialDre.totalReceitas,
          cmv: officialDre.cmv,
          lucroBruto: officialDre.lucroBruto,
          totalDespesasOp: officialDre.totalDespesasOp,
          resultadoOperacional: officialDre.ebitda,
          resultadoLiquido: officialDre.resultadoLiquido,
          margemLiquida: officialDre.margemLiquida,
          previousLabel: previousOfficial.label,
          comparisonAvailable
        },
        commercial,
        tendenciaSerie: serie,
        analises
      }
    };
  } catch (error: any) {
    console.error('ERRO_INTELIGENCIA:', error);
    return { success: false, error: 'Falha ao gerar o relatório de inteligência: ' + (error?.message || 'Erro desconhecido') };
  }
}
