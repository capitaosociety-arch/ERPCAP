// ===========================================================================
// Ferramentas seguras do Copiloto de GestÃ£o.
//
// IMPORTANTE:
//  - Reutilizam os cÃ¡lculos oficiais (lib/dre.ts, lib/analytics.ts e as
//    agregaÃ§Ãµes do mÃ³dulo Financeiro/InteligÃªncia) â€” nada Ã© inventado.
//  - SÃ³ queries Prisma prÃ©-definidas (sem SQL livre).
//  - Retornam agregados de negÃ³cio. Nunca expÃµem senhas, chaves, CPF,
//    notas pessoais ou campos sensÃ­veis.
//  - Sempre trazem `meta { periodo, origem, nota }`.
// ===========================================================================

import { prisma } from '../prisma';
import { buildPeriods, isRentalItem, isFut5, isFut7, round2, fmtMoney } from '../analytics';
import {
  currentCuiabaMonth,
  formatMonthLabel,
  getFinancialMonth,
  getFinancialSeries,
  isMonthKey,
  monthRange,
  previousMonth,
  type FinancialRegime
} from '../official-financials';
import {
  getInventoryReconciliationReport,
  getOccupancyReport,
  getProductContributionReport,
  getRevenueMixReport,
} from '../commercial-analytics';
import {
  getManagementComparisonCached,
  getManagementHistoryCached,
} from '../management-analytics';
import {
  getForecastReportCached,
  getScenario,
  getStrategicRecommendationsCached,
  SCENARIO_PRESETS,
  type ScenarioInput,
} from '../strategic-analytics';
import {
  getPricingReport,
  simulatePricingScenario,
  type PriceScenario,
  type TargetSegment,
} from '../pricing-intelligence';
import { getCostCenterReport } from '../cost-centers';
import { isNewRulesDate, methodologyNoteForPeriod, rulesVersionForPeriod } from '../effective-rules';
import type { CopilotTool, PeriodoArg, ToolResult } from './types';
import { isAdmin } from './types';

const dayMs = 24 * 60 * 60 * 1000;

const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' });

function parsePeriodo(args: Record<string, unknown>) {
  const raw = String(args.periodo || 'month');
  if (isMonthKey(raw)) {
    const P = monthRange(raw, { capToToday: true });
    return {
      from: P.from,
      to: P.to,
      prevFrom: P.prevFrom,
      prevTo: P.prevTo,
      label: `${fmtDate(P.from)} a ${fmtDate(P.to)}`,
      key: raw
    };
  }

  if (raw !== 'month' && raw !== '7d' && raw !== '30d' && raw !== '90d') {
    throw new Error('PerÃ­odo invÃ¡lido. Use month, 7d, 30d, 90d ou AAAA-MM.');
  }

  const key = raw as PeriodoArg;
  const P = buildPeriods(key);
  return {
    from: P.from,
    to: P.to,
    prevFrom: P.prevFrom,
    prevTo: P.prevTo,
    label: `${fmtDate(P.from)} a ${fmtDate(P.to)}`,
    key
  };
}

function parseRegime(args: Record<string, unknown>): FinancialRegime {
  const raw = String(args.regime || 'competence');
  if (raw !== 'cash' && raw !== 'competence') {
    throw new Error('Regime invÃ¡lido. Use cash ou competence.');
  }
  return raw;
}

function resolveFinancialPeriod(args: Record<string, unknown>): string {
  const raw = String(args.periodo || 'month');
  if (raw === 'month') return currentCuiabaMonth();
  if (isMonthKey(raw)) return raw;
  throw new Error('Para DRE oficial, informe um mÃªs em AAAA-MM ou "month" para o mÃªs atual.');
}

function ok(data: unknown, meta: ToolResult['meta']): ToolResult {
  return { ok: true, data, meta };
}

function deny(reason = 'VocÃª nÃ£o tem permissÃ£o para acessar estes dados.'): ToolResult {
  return { ok: false, error: reason };
}

// ---------------------------------------------------------------------------
// Carga compartilhada
// ---------------------------------------------------------------------------

async function loadPayments(from: Date, to: Date) {
  return prisma.payment.findMany({
    where: { date: { gte: from, lte: to } },
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
  });
}

/** Divide um pagamento em aluguel(FUT5/FUT7) vs bar, pela proporÃ§Ã£o da comanda. */
function splitPayment(p: any) {
  const items = p.order?.items || [];
  const useNewRules = isNewRulesDate(p.date || p.order?.closedAt);
  const rentItems = items.filter((it: any) => isRentalItem(it, { useNewRules }));
  const totalSub = items.reduce((a: number, it: any) => a + (it.subtotal || 0), 0);
  const rentSub = rentItems.reduce((a: number, it: any) => a + (it.subtotal || 0), 0);
  const ratio = totalSub > 0 ? Math.min(1, rentSub / totalSub) : 0;
  const paidRent = p.amount * ratio;

  let f5 = 0, f7 = 0;
  rentItems.forEach((it: any) => {
    const nm = `${it.product?.name || ''} ${it.service?.name || ''}`.trim().toLowerCase();
    if (isFut5(nm)) f5 += it.subtotal || 0;
    else if (isFut7(nm)) f7 += it.subtotal || 0;
  });

  return {
    bar: p.amount - paidRent,
    fut5: rentSub > 0 ? paidRent * (f5 / rentSub) : 0,
    fut7: rentSub > 0 ? paidRent * (f7 / rentSub) : 0
  };
}

// ---------------------------------------------------------------------------
// 1. faturamento
// ---------------------------------------------------------------------------

const faturamentoTool: CopilotTool = {
  name: 'faturamento',
  description: 'Faturamento bruto (vendas de comandas + mensalidades) em um perÃ­odo, com comparativo com o perÃ­odo anterior e divisÃ£o por campo (FUT5/FUT7) e bar.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'month = mÃªs atual; 7d/30d/90d = janelas mÃ³veis; AAAA-MM = mÃªs histÃ³rico' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);

    const [payments, subPayments] = await Promise.all([
      loadPayments(P.prevFrom, P.to),
      prisma.subscriptionPayment.findMany({
        where: { paymentDate: { gte: P.prevFrom, lte: P.to } },
        select: { amount: true, paymentDate: true }
      })
    ]);

    let vendasCur = 0, vendasPrev = 0;
    let fut5Cur = 0, fut7Cur = 0, barCur = 0;
    payments.forEach(p => {
      const amt = p.amount || 0;
      if (p.date >= P.from && p.date <= P.to) {
        vendasCur += amt;
        const s = splitPayment(p);
        fut5Cur += s.fut5;
        fut7Cur += s.fut7;
        barCur += s.bar;
      } else if (p.date >= P.prevFrom && p.date <= P.prevTo) {
        vendasPrev += amt;
      }
    });

    let mensalCur = 0, mensalPrev = 0;
    subPayments.forEach(sp => {
      if (sp.paymentDate >= P.from && sp.paymentDate <= P.to) mensalCur += sp.amount;
      else if (sp.paymentDate >= P.prevFrom && sp.paymentDate <= P.prevTo) mensalPrev += sp.amount;
    });

    const totalCur = round2(vendasCur + mensalCur);
    const totalPrev = round2(vendasPrev + mensalPrev);
    const variacao = totalPrev > 0 ? round2(((totalCur - totalPrev) / totalPrev) * 100) : null;

    return ok({
      periodo: P.label,
      receitaVendas: round2(vendasCur),
      receitaMensalidades: round2(mensalCur),
      total: totalCur,
      variacaoVsAnteriorPct: variacao,
      porSegmento: { fut5: round2(fut5Cur), fut7: round2(fut7Cur), bar: round2(barCur) }
    }, {
      periodo: P.label,
      origem: ['Payment', 'SubscriptionPayment'],
      nota: 'Faturamento operacional em regime de caixa. NÃ£o substitui o DRE oficial; para resultado, CMV e margens use a ferramenta dre.'
    });
  }
};

// ---------------------------------------------------------------------------
// 2. dre (resultado + por que caiu)
// ---------------------------------------------------------------------------

const dreTool: CopilotTool = {
  name: 'dre',
  description: 'DRE oficial de um mÃªs (AAAA-MM ou mÃªs atual): receita, CMV, despesas, lucro bruto, resultado operacional e lÃ­quido. Usa o snapshot da versÃ£o vigente quando o mÃªs estÃ¡ fechado e permite escolher caixa ou competÃªncia e comparar com outro mÃªs.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'AAAA-MM do mÃªs ou "month" para o mÃªs atual (padrÃ£o)' },
      regime: { type: 'string', enum: ['competence', 'cash'], description: 'competence = competÃªncia (padrÃ£o); cash = caixa' },
      compararCom: { type: 'string', description: 'AAAA-MM de comparaÃ§Ã£o. Se omitido, usa o mÃªs anterior somente quando o mÃªs consultado estÃ¡ fechado.' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();

    const period = resolveFinancialPeriod(args);
    const regime = parseRegime(args);
    const atual = await getFinancialMonth(period, regime);

    if (!atual.dre) {
      return { ok: false, error: atual.unavailableReason || 'NÃ£o hÃ¡ DRE oficial disponÃ­vel para este mÃªs/regime.' };
    }

    const compareRaw = String(args.compararCom || '').trim();
    let comparisonPeriod: string | null = null;
    if (compareRaw) {
      if (compareRaw === 'anterior' || compareRaw === 'previous') comparisonPeriod = previousMonth(period);
      else if (isMonthKey(compareRaw)) comparisonPeriod = compareRaw;
      else throw new Error('compararCom invÃ¡lido. Use AAAA-MM.');
    } else if (atual.status === 'CLOSED') {
      comparisonPeriod = previousMonth(period);
    }

    let anterior: any = null;
    let anteriorLabel: string | null = null;
    let anteriorStatus: 'OPEN' | 'CLOSED' | null = null;
    let anteriorVersion: number | null = null;
    let anteriorSource: 'snapshot' | 'live' | 'unavailable' | null = null;
    if (comparisonPeriod) {
      const prev = await getFinancialMonth(comparisonPeriod, regime);
      if (prev.dre) {
        anterior = prev.dre;
        anteriorLabel = prev.label;
        anteriorStatus = prev.status;
        anteriorVersion = prev.version;
        anteriorSource = prev.source;
      }
    }

    const delta = (a: number, b: number) => round2(a - b);
    const drivers: string[] = [];
    if (anterior) {
      const dRec = delta(atual.dre.totalReceitas, anterior.totalReceitas);
      const dCmv = delta(atual.dre.cmv, anterior.cmv);
      const dDesp = delta(
        atual.dre.totalDespesasOp + atual.dre.impostos + atual.dre.despesasFinanceiras,
        anterior.totalDespesasOp + anterior.impostos + anterior.despesasFinanceiras
      );
      if (dRec !== 0) drivers.push(dRec > 0 ? `receitas subiram ${fmtMoney(dRec)}` : `receitas caÃ­ram ${fmtMoney(Math.abs(dRec))}`);
      if (dCmv !== 0) drivers.push(dCmv > 0 ? `CMV subiu ${fmtMoney(dCmv)}` : `CMV caiu ${fmtMoney(Math.abs(dCmv))}`);
      if (dDesp !== 0) drivers.push(dDesp > 0 ? `despesas subiram ${fmtMoney(dDesp)}` : `despesas caÃ­ram ${fmtMoney(Math.abs(dDesp))}`);
    }

    const source = atual.source;
    const origem = source === 'snapshot'
      ? ['FinancialPeriodClose', 'FinancialPeriodAudit']
      : (regime === 'cash'
        ? ['Payment', 'StockMovement (OUT_SALE)', 'FinancialEntry']
        : ['Order', 'StockMovement (OUT_SALE)', 'FinancialEntry']);

    return ok({
      periodo: atual.label,
      mes: period,
      regime,
      status: atual.status,
      versao: atual.version,
      fonte: source,
      fechadoEm: atual.closedAt,
      atual: atual.dre,
      comparacao: anterior && comparisonPeriod
        ? {
          periodo: anteriorLabel,
          mes: comparisonPeriod,
          status: anteriorStatus,
          versao: anteriorVersion,
          fonte: anteriorSource,
          dre: anterior,
        }
        : null,
      comparacaoObservacao: anteriorStatus === 'OPEN'
        ? 'O perÃ­odo de comparaÃ§Ã£o estÃ¡ em aberto e usa cÃ¡lculo ao vivo, nÃ£o snapshot fechado.'
        : null,
      variacoes: anterior ? {
        receitasVendas: delta(atual.dre.receitasVendas, anterior.receitasVendas),
        receitasOutras: delta(atual.dre.receitasOutras, anterior.receitasOutras),
        cmv: delta(atual.dre.cmv, anterior.cmv),
        despesasOperacionais: delta(atual.dre.totalDespesasOp, anterior.totalDespesasOp),
        impostos: delta(atual.dre.impostos, anterior.impostos),
        despesasFinanceiras: delta(atual.dre.despesasFinanceiras, anterior.despesasFinanceiras),
        lucroBruto: delta(atual.dre.lucroBruto, anterior.lucroBruto),
        resultadoOperacional: delta(atual.dre.ebitda, anterior.ebitda),
        resultadoLiquido: delta(atual.dre.resultadoLiquido, anterior.resultadoLiquido),
        margemLiquida: round2(atual.dre.margemLiquida - anterior.margemLiquida)
      } : null,
      observacao: atual.status === 'OPEN'
        ? 'MÃªs em aberto: os valores sÃ£o oficiais do cÃ¡lculo ao vivo do mÃªs, incluindo lanÃ§amentos jÃ¡ cadastrados, e podem mudar com novos lanÃ§amentos.'
        : 'MÃªs fechado: valores oficiais do snapshot da versÃ£o vigente.',
      drivers
    }, {
      periodo: atual.label,
      origem,
      nota: `Regime de ${regime === 'cash' ? 'caixa' : 'competÃªncia'}; fonte: ${source === 'snapshot' ? `snapshot oficial v${atual.version}` : 'cÃ¡lculo ao vivo do mÃªs aberto'}.`,
      regime,
      versao: atual.version,
      status: atual.status,
      fonte: source,
    });
  }
};

const historicoTool: CopilotTool = {
  name: 'historico_financeiro',
  description: 'SÃ©rie mensal do DRE oficial para os Ãºltimos N meses (atÃ© 24), em caixa ou competÃªncia. Meses fechados usam snapshot oficial; o mÃªs aberto usa cÃ¡lculo ao vivo. Serve para evoluÃ§Ã£o, tendÃªncia e comparaÃ§Ã£o entre meses.',
  parameters: {
    type: 'object',
    properties: {
      meses: { type: 'number', description: 'Quantidade de meses (1 a 24; padrÃ£o 6)' },
      regime: { type: 'string', enum: ['competence', 'cash'], description: 'competence = competÃªncia (padrÃ£o); cash = caixa' },
      ate: { type: 'string', description: 'MÃªs final em AAAA-MM; padrÃ£o mÃªs atual' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();

    const meses = Math.min(24, Math.max(1, Number(args.meses) || 6));
    const regime = parseRegime(args);
    const ateRaw = String(args.ate || 'month');
    const ate = ateRaw === 'month' ? currentCuiabaMonth() : ateRaw;
    if (!isMonthKey(ate)) throw new Error('ate invÃ¡lido. Use AAAA-MM.');

    const series = await getFinancialSeries(ate, meses, regime);
    const rows = series.map((month) => ({
      mes: month.period,
      periodo: month.label,
      status: month.status,
      versao: month.version,
      fonte: month.source,
      disponivel: !!month.dre,
      receita: month.dre?.totalReceitas ?? null,
      cmv: month.dre?.cmv ?? null,
      despesas: month.dre ? round2(month.dre.totalDespesasOp + month.dre.impostos + month.dre.despesasFinanceiras) : null,
      lucroBruto: month.dre?.lucroBruto ?? null,
      resultadoOperacional: month.dre?.ebitda ?? null,
      resultadoLiquido: month.dre?.resultadoLiquido ?? null,
      margemLiquida: month.dre?.margemLiquida ?? null,
      motivoIndisponivel: month.unavailableReason ?? null,
    }));

    if (!rows.some((row) => row.disponivel)) {
      return { ok: false, error: `NÃ£o hÃ¡ DRE oficial disponÃ­vel para ${formatMonthLabel(ate)} no regime de ${regime === 'cash' ? 'caixa' : 'competÃªncia'}.` };
    }

    return ok({
      periodo: `${rows[0].periodo} a ${rows[rows.length - 1].periodo}`,
      regime,
      meses: rows,
      disponiveis: rows.filter((row) => row.disponivel).length,
      indisponiveis: rows.filter((row) => !row.disponivel).length,
    }, {
      periodo: `${rows[0].periodo} a ${rows[rows.length - 1].periodo}`,
      origem: ['FinancialPeriodClose', 'FinancialPeriodAudit', 'Payment', 'Order', 'StockMovement', 'FinancialEntry'],
      nota: `SÃ©rie oficial em regime de ${regime === 'cash' ? 'caixa' : 'competÃªncia'}. Meses fechados vÃªm de snapshots; o mÃªs aberto Ã© cÃ¡lculo ao vivo.`,
      regime,
    });
  }
};

// ---------------------------------------------------------------------------
// 2b. historico_gerencial
// ---------------------------------------------------------------------------

const historicoGerencialTool: CopilotTool = {
  name: 'historico_gerencial',
  description: 'HistÃ³rico gerencial mensal: DRE oficial, fechamentos/versÃµes, receita de aluguel e produtos, margem de contribuiÃ§Ã£o, ocupaÃ§Ã£o e alertas. Respeita regime caixa/competÃªncia e usa cache curto.',
  parameters: {
    type: 'object',
    properties: {
      meses: { type: 'number', description: 'Quantidade de meses (1 a 24; padrÃ£o 6)' },
      ate: { type: 'string', description: 'MÃªs final em AAAA-MM; padrÃ£o mÃªs atual' },
      regime: { type: 'string', enum: ['competence', 'cash'], description: 'competence = competÃªncia (padrÃ£o); cash = caixa' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const meses = Math.min(24, Math.max(1, Number(args.meses) || 6));
    const ateRaw = String(args.ate || 'month');
    const ate = ateRaw === 'month' ? currentCuiabaMonth() : ateRaw;
    if (!isMonthKey(ate)) throw new Error('ate invÃ¡lido. Use AAAA-MM.');
    const regime = parseRegime(args);
    const history = await getManagementHistoryCached(ate, meses, regime);
    return ok({
      regime,
      meses: history.rows.map(row => ({
        mes: row.period,
        periodo: row.label,
        status: row.status,
        versao: row.version,
        fonte: row.source,
        receita: row.revenue,
        cmv: row.cmv,
        despesas: row.expenses,
        resultado: row.netResult,
        margemLiquida: row.netMargin,
        ocupacaoPct: row.occupancyPct,
        aluguelComandas: row.rentalRevenue,
        produtosComandas: row.productRevenue,
        margemProdutos: row.productMarginPct,
        metodologia: row.rulesVersion,
        notaMetodologia: row.methodologyNote,
        disponivel: row.available,
        motivoIndisponivel: row.reason || null,
      })),
      alertas: history.alerts,
      criterios: history.criteria,
      fontes: history.sources,
      observacao: history.note,
      metodologiaAtual: rulesVersionForPeriod(ate),
    }, {
      periodo: `${history.rows[0]?.label || ate} a ${history.rows[history.rows.length - 1]?.label || ate}`,
      origem: history.sources,
      nota: `${history.note} ${methodologyNoteForPeriod(ate)}`,
      regime,
    });
  }
};

// ---------------------------------------------------------------------------
// 2c. comparar_periodos
// ---------------------------------------------------------------------------

const compararPeriodosTool: CopilotTool = {
  name: 'comparar_periodos',
  description: 'Compara dois meses do DRE oficial e do comercial: receita, CMV, despesas, lucro bruto, resultado operacional/lÃ­quido, margem, ocupaÃ§Ã£o, aluguel, produtos e margem de contribuiÃ§Ã£o. Informa status/versÃ£o/fonte de cada mÃªs.',
  parameters: {
    type: 'object',
    properties: {
      periodoAtual: { type: 'string', description: 'MÃªs atual em AAAA-MM ou "month"' },
      periodoAnterior: { type: 'string', description: 'MÃªs de comparaÃ§Ã£o em AAAA-MM; omitido = mÃªs anterior' },
      regime: { type: 'string', enum: ['competence', 'cash'], description: 'competence = competÃªncia (padrÃ£o); cash = caixa' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const currentPeriod = resolveFinancialPeriod(args.periodoAtual ? { periodo: args.periodoAtual } : args);
    const previousRaw = String(args.periodoAnterior || '').trim();
    const previousPeriod = previousRaw ? (isMonthKey(previousRaw) ? previousRaw : (() => { throw new Error('periodoAnterior invÃ¡lido. Use AAAA-MM.'); })()) : previousMonth(currentPeriod);
    const regime = parseRegime(args);
    const comparison = await getManagementComparisonCached(currentPeriod, previousPeriod, regime);
    return ok({
      regime,
      atual: comparison.current,
      anterior: comparison.previous,
      comparacaoDisponivel: comparison.comparisonAvailable,
      observacao: comparison.comparisonNote,
      variacoes: comparison.deltas,
      drivers: comparison.drivers,
      alertas: comparison.alerts,
      conciliacaoAtual: comparison.currentReconciliation
        ? {
          disponivel: comparison.currentReconciliation.available,
          produtosComDivergencia: comparison.currentReconciliation.produtosComDivergencia,
          quantidadeDivergente: comparison.currentReconciliation.quantidadeDivergente,
          quantidadeSemCusto: comparison.currentReconciliation.quantidadeSemCusto,
          linhas: comparison.currentReconciliation.linhas.slice(0, 10),
          observacao: comparison.currentReconciliation.note,
        }
        : null,
      criterios: comparison.criteria,
      fontes: comparison.sources,
    }, {
      periodo: `${comparison.current.label} vs ${comparison.previous.label}`,
      origem: comparison.sources,
      nota: comparison.note,
      regime,
      versao: comparison.current.version,
      status: comparison.current.status,
      fonte: comparison.current.source,
    });
  }
};

// ---------------------------------------------------------------------------
// 2d. alertas_gestao
// ---------------------------------------------------------------------------

const alertasGestaoTool: CopilotTool = {
  name: 'alertas_gestao',
  description: 'Alertas gerenciais com critÃ©rios explÃ­citos: queda de faturamento, aumento de despesas, queda de margem, baixa ocupaÃ§Ã£o, margem negativa de produto e inconsistÃªncia de estoque. NÃ£o sÃ£o previsÃµes.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'MÃªs de referÃªncia em AAAA-MM ou "month"' },
      regime: { type: 'string', enum: ['competence', 'cash'], description: 'competence = competÃªncia (padrÃ£o); cash = caixa' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const period = resolveFinancialPeriod(args);
    const regime = parseRegime(args);
    const history = await getManagementHistoryCached(period, 6, regime);
    const comparison = await getManagementComparisonCached(period, previousMonth(period), regime);
    const alerts = [...history.alerts, ...comparison.alerts].filter((alert, index, list) => list.findIndex(a => a.id === alert.id) === index);
    return ok({
      periodo: period,
      regime,
      alertas: alerts,
      criterios: history.criteria,
      fontes: history.sources,
      observacao: 'Alertas sÃ£o regras determinÃ­sticas com limiares explÃ­citos; nÃ£o sÃ£o previsÃµes nem garantias.',
    }, {
      periodo: period,
      origem: history.sources,
      nota: 'Alertas determinÃ­sticos; diferenÃ§as de estoque nÃ£o sÃ£o automaticamente perda.',
      regime,
    });
  }
};

// ---------------------------------------------------------------------------
// 2e. simular_cenario
// ---------------------------------------------------------------------------

const simularCenarioTool: CopilotTool = {
  name: 'simular_cenario',
  description: 'Simula hipÃ³teses de preÃ§o/ocupaÃ§Ã£o de quadras e preÃ§o/custo de produtos. Retorna impacto estimado, premissas, limitaÃ§Ãµes e avisos; nÃ£o Ã© previsÃ£o nem resultado garantido.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'MÃªs base em AAAA-MM ou "month"' },
      preset: { type: 'string', enum: ['conservative', 'base', 'optimistic'], description: 'CenÃ¡rio prÃ©-definido; pode ser sobrescrito pelos campos abaixo' },
      rentalPriceChangePct: { type: 'number', description: 'VariaÃ§Ã£o de preÃ§o do aluguel em %' },
      occupancyChangePp: { type: 'number', description: 'VariaÃ§Ã£o absoluta de ocupaÃ§Ã£o em pontos percentuais' },
      productPriceChangePct: { type: 'number', description: 'VariaÃ§Ã£o de preÃ§o dos produtos em %' },
      productCostChangePct: { type: 'number', description: 'VariaÃ§Ã£o de custo dos produtos em %' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const period = resolveFinancialPeriod(args);
    const presetKey = String(args.preset || 'base') as keyof typeof SCENARIO_PRESETS;
    const preset = SCENARIO_PRESETS[presetKey] || SCENARIO_PRESETS.base;
    const input: ScenarioInput = {
      rentalPriceChangePct: args.rentalPriceChangePct != null ? Number(args.rentalPriceChangePct) : preset.rentalPriceChangePct,
      occupancyChangePp: args.occupancyChangePp != null ? Number(args.occupancyChangePp) : preset.occupancyChangePp,
      productPriceChangePct: args.productPriceChangePct != null ? Number(args.productPriceChangePct) : preset.productPriceChangePct,
      productCostChangePct: args.productCostChangePct != null ? Number(args.productCostChangePct) : preset.productCostChangePct,
    };
    const result = await getScenario(period, input);
    return ok(result, {
      periodo: result.label,
      origem: result.sources,
      nota: 'CENÃRIO HIPOTÃ‰TICO. Receita de aluguel nÃ£o tem custo de quadra; produtos usam CMV snapshot. NÃ£o Ã© resultado garantido.',
    });
  }
};

// ---------------------------------------------------------------------------
// 2f. previsao_financeira
// ---------------------------------------------------------------------------

const previsaoFinanceiraTool: CopilotTool = {
  name: 'previsao_financeira',
  description: 'Projeta faturamento, CMV, despesas e resultado para 3, 6 e 12 meses com tendÃªncia linear, intervalo de 80%, premissas e limitaÃ§Ãµes. HistÃ³rico insuficiente ou sazonalidade nÃ£o aplicÃ¡vel sÃ£o informados.',
  parameters: {
    type: 'object',
    properties: {
      regime: { type: 'string', enum: ['competence', 'cash'], description: 'competence = competÃªncia (padrÃ£o); cash = caixa' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const regime = parseRegime(args);
    const forecast = await getForecastReportCached(regime);
    const compact = (rows: any[]) => rows.map(row => ({
      periodo: row.label,
      receita: row.revenue,
      receitaMin: row.revenueLow,
      receitaMax: row.revenueHigh,
      cmv: row.cmv,
      despesas: row.expenses,
      resultado: row.netResult,
      resultadoMin: row.netLow,
      resultadoMax: row.netHigh,
    }));
    return ok({
      disponivel: forecast.available,
      motivoIndisponivel: forecast.reason || null,
      regime,
      historicoMeses: forecast.historyMonths,
      confianca: forecast.confidence,
      sazonalidadeAplicada: forecast.seasonalityApplied,
      intervalo: forecast.interval,
      previsoes: {
        tresMeses: compact(forecast.horizons[3]),
        seisMeses: compact(forecast.horizons[6]),
        dozeMeses: compact(forecast.horizons[12]),
      },
      premissas: forecast.assumptions,
      limitacoes: forecast.limitations,
      fontes: forecast.sources,
    }, {
      periodo: 'prÃ³ximos 3/6/12 meses',
      origem: forecast.sources,
      nota: 'PREVISÃƒO ESTATÃSTICA, nÃ£o garantia. Intervalo aproximado de 80%.',
      regime,
    });
  }
};

// ---------------------------------------------------------------------------
// 2g. recomendacoes_estrategicas
// ---------------------------------------------------------------------------

const recomendacoesEstrategicasTool: CopilotTool = {
  name: 'recomendacoes_estrategicas',
  description: 'RecomendaÃ§Ãµes consultivas priorizadas por impacto estimado, confianÃ§a e facilidade: horÃ¡rios ociosos, margem de produtos, despesas em alta e oportunidades de preÃ§o. NÃ£o executa alteraÃ§Ãµes.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'MÃªs de referÃªncia em AAAA-MM ou "month"' },
      regime: { type: 'string', enum: ['competence', 'cash'], description: 'competence = competÃªncia (padrÃ£o); cash = caixa' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const period = resolveFinancialPeriod(args);
    const regime = parseRegime(args);
    const report = await getStrategicRecommendationsCached(period, regime);
    return ok({
      disponivel: report.available,
      motivoIndisponivel: report.reason || null,
      periodo: report.label,
      regime,
      recomendacoes: report.recommendations,
      criterios: report.criteria,
      fontes: report.sources,
      observacao: report.note,
    }, {
      periodo: report.label,
      origem: report.sources,
      nota: 'RecomendaÃ§Ãµes consultivas; nenhuma alteraÃ§Ã£o automÃ¡tica.',
      regime,
    });
  }
};

// ---------------------------------------------------------------------------
// 2h. precificacao_oportunidades
// ---------------------------------------------------------------------------

const precificacaoOportunidadesTool: CopilotTool = {
  name: 'precificacao_oportunidades',
  description: 'Analisa preÃ§os praticados, ocupaÃ§Ã£o regular/extraordinÃ¡ria, frequÃªncia de clientes, cancelamentos, canibalizaÃ§Ã£o e oportunidades comerciais. NÃ£o altera preÃ§os nem reservas.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'MÃªs de referÃªncia em AAAA-MM ou "month"' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const period = resolveFinancialPeriod(args);
    const report = await getPricingReport(period, isAdmin(ctx) || !!ctx.user.permCustomers);
    return ok({
      disponivel: report.available,
      motivoIndisponivel: report.reason || null,
      periodo: report.period,
      ocupacaoRegularPct: report.occupancy.overall.ocupacaoEfetivaPct,
      extraordinario: {
        horas: report.occupancy.overall.extraHoras || 0,
        receita: report.occupancy.overall.extraReceita || 0,
        reservas: report.occupancy.overall.extraReservas || 0,
      },
      precos: {
        regular: report.regularHistory,
        extraordinario: report.extraHistory,
      },
      clientes: {
        total: report.customers.length,
        comRegular: report.regularCustomerCount,
        recorrentes: report.recurringCustomerCount,
        somenteExtra: report.extraOnlyCustomerCount,
        top: report.customers.slice(0, 8).map(c => ({ nome: c.name, reservas: c.bookings, regular: c.regularBookings, extra: c.extraBookings, receita: round2(c.regularRevenue + c.extraRevenue) })),
      },
      sazonalidadeObservada: report.monthly,
      canibalizacao: report.candidates,
      oportunidades: report.opportunities,
      premissas: report.assumptions,
      limitacoes: report.limitations,
      fontes: report.sources,
    }, {
      periodo: report.period,
      origem: report.sources,
      nota: 'InteligÃªncia consultiva. Nenhum preÃ§o, reserva ou desconto Ã© alterado. Regular e extraordinÃ¡rio separados.',
    });
  }
};

// ---------------------------------------------------------------------------
// 2i. simular_precificacao
// ---------------------------------------------------------------------------

const simularPrecificacaoTool: CopilotTool = {
  name: 'simular_precificacao',
  description: 'Simula desconto, pacote, reservas adicionais, preÃ§o extraordinÃ¡rio ou promoÃ§Ã£o, separando receita adicional projetada, receita em risco por migraÃ§Ã£o e risco de canibalizaÃ§Ã£o. NÃ£o altera dados.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'MÃªs de referÃªncia em AAAA-MM ou "month"' },
      cenario: { type: 'string', enum: ['maintain', 'regular_idle_discount', 'new_group_package', 'existing_extra_bookings', 'extra_dynamic_price', 'temporary_promo'] },
      descontoPct: { type: 'number' },
      variacaoPrecoPct: { type: 'number' },
      reservasAdicionais: { type: 'number' },
      publico: { type: 'string', enum: ['new_or_inactive', 'existing_extra', 'regular_customers', 'all'] },
      migracaoPct: { type: 'number' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const period = resolveFinancialPeriod(args);
    const report = await getPricingReport(period, isAdmin(ctx) || !!ctx.user.permCustomers);
    const scenario = String(args.cenario || 'new_group_package') as PriceScenario;
    const target = String(args.publico || 'new_or_inactive') as TargetSegment;
    const result = simulatePricingScenario(report, {
      scenario,
      discountPct: Number(args.descontoPct) || 0,
      priceChangePct: Number(args.variacaoPrecoPct) || 0,
      additionalBookings: Number(args.reservasAdicionais) || 0,
      targetSegment: target,
      migrationRiskPct: Number(args.migracaoPct) || 0,
    });
    return ok(result, {
      periodo: report.period,
      origem: ['Rental', 'Customer'],
      nota: 'PROJEÃ‡ÃƒO HIPOTÃ‰TICA. Nenhum preÃ§o/reserva alterado. Custo de quadra nÃ£o conhecido; margem nÃ£o calculada.',
    });
  }
};

// ---------------------------------------------------------------------------
// 3. campos_rentabilidade
// ---------------------------------------------------------------------------

const camposTool: CopilotTool = {
  name: 'campos_rentabilidade',
  description: 'Rentabilidade por campo (FUT5 e FUT7): receita gerada, reservas e ocupaÃ§Ã£o no perÃ­odo. Ãštil para saber qual campo rende mais.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'month = mÃªs atual; 7d/30d/90d = janelas mÃ³veis; AAAA-MM = mÃªs histÃ³rico' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);

    const [payments, occupancy] = await Promise.all([
      loadPayments(P.from, P.to),
      getOccupancyReport(P.from, P.to),
    ]);

    let revF5 = 0, revF7 = 0;
    payments.forEach(p => {
      const s = splitPayment(p);
      revF5 += s.fut5;
      revF7 += s.fut7;
    });

    const field = (name: string) => occupancy.fields.find((f: any) => (name === 'FUT5' ? isFut5(f.campo) : isFut7(f.campo)));
    const f5 = field('FUT5');
    const f7 = field('FUT7');
    const fut5 = {
      receita: round2(revF5),
      reservas: f5?.reservas || 0,
      horasOcupadas: f5?.efetivoHoras || 0,
      capacidadeHoras: f5?.capacidadeHoras || 0,
      ocupacaoPct: f5?.ocupacaoEfetivaPct || 0,
      receitaAgenda: f5?.receitaAgenda || 0,
      extraHoras: f5?.extraHoras || 0,
      extraReceita: f5?.extraReceita || 0,
      extraReservas: f5?.extraReservas || 0,
      extraPorHora: f5?.extraPorHora || [],
    };
    const fut7 = {
      receita: round2(revF7),
      reservas: f7?.reservas || 0,
      horasOcupadas: f7?.efetivoHoras || 0,
      capacidadeHoras: f7?.capacidadeHoras || 0,
      ocupacaoPct: f7?.ocupacaoEfetivaPct || 0,
      receitaAgenda: f7?.receitaAgenda || 0,
      extraHoras: f7?.extraHoras || 0,
      extraReceita: f7?.extraReceita || 0,
      extraReservas: f7?.extraReservas || 0,
      extraPorHora: f7?.extraPorHora || [],
    };

    return ok({
      periodo: P.label,
      disponivel: occupancy.available,
      fut5,
      fut7,
      maisRentavel: fut5.receita >= fut7.receita ? 'FUT5' : 'FUT7',
      receitaTotal: round2(revF5 + revF7),
      extraordinario: {
        horas: occupancy.overall.extraHoras || 0,
        receita: occupancy.overall.extraReceita || 0,
        reservas: occupancy.overall.extraReservas || 0,
      },
      ocupacaoConfig: occupancy.config,
      motivoIndisponivel: occupancy.reason || null,
    }, {
      periodo: P.label,
      origem: ['Payment', 'OrderItem', 'Rental'],
      nota: `Receita por campo vem das comandas pagas. OcupaÃ§Ã£o regular por campo/dia/hora: ${occupancy.config.note} Reservas fora da grade sÃ£o separadas como extraordinÃ¡rias; no-show Ã© separado.`
    });
  }
};

// ---------------------------------------------------------------------------
// 4. margens_produtos
// ---------------------------------------------------------------------------

const margensTool: CopilotTool = {
  name: 'margens_produtos',
  description: 'Margem de contribuiÃ§Ã£o realizada por produto em comandas fechadas: receita lÃ­quida com desconto rateado, CMV snapshot das saÃ­das de estoque, margem em R$ e %. Separa aluguel de quadra de produtos e informa custo incompleto.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'month = mÃªs atual; 7d/30d/90d = janelas mÃ³veis; AAAA-MM = mÃªs histÃ³rico' },
      topN: { type: 'number', description: 'Quantos itens trazer (padrÃ£o 10)' }
    }
  },
  requiredPerm: 'permStock',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permStock) return deny();
    const P = parsePeriodo(args);
    const topN = Math.min(50, Math.max(1, Number(args.topN) || 10));
    const report = await getProductContributionReport(P.from, P.to);

    return ok({
      periodo: P.label,
      disponivel: report.available,
      motivoIndisponivel: report.reason || null,
      produtoReceitaLiquida: report.produtoReceitaLiquida,
      cmvTotal: report.cmvTotal,
      margemContribuicaoTotal: report.margemContribuicaoTotal,
      margemPct: report.margemPct,
      custoIncompleto: report.custoIncompleto,
      topPorReceita: [...report.produtos].sort((a, b) => b.receitaLiquida - a.receitaLiquida).slice(0, topN),
      topPorContribuicao: [...report.produtos].filter(p => p.margemContribuicao != null).sort((a, b) => (b.margemContribuicao || 0) - (a.margemContribuicao || 0)).slice(0, topN),
      menoresMargens: report.menoresMargens.slice(0, Math.min(5, topN)),
      totalItens: report.produtos.length,
    }, {
      periodo: P.label,
      origem: ['OrderItem', 'StockMovement'],
      nota: report.note
    });
  }
};

// ---------------------------------------------------------------------------
// 4b. mix_receita
// ---------------------------------------------------------------------------

const mixReceitaTool: CopilotTool = {
  name: 'mix_receita',
  description: 'Separa receita de aluguel de quadra e venda de produtos nas comandas fechadas, alÃ©m da agenda operacional de locaÃ§Ãµes (paga, pendente, no-show). NÃ£o soma a agenda ao DRE.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'month = mÃªs atual; 7d/30d/90d = janelas mÃ³veis; AAAA-MM = mÃªs histÃ³rico' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);
    const report = await getRevenueMixReport(P.from, P.to);
    return ok({
      periodo: P.label,
      disponivel: report.available,
      motivoIndisponivel: report.reason || null,
      aluguelComandas: report.aluguelComandas,
      produtosComandas: report.produtosComandas,
      descontoTotal: report.descontoTotal,
      totalComandas: report.totalComandas,
      agendaAluguel: report.agendaAluguel,
      observacao: report.note,
    }, {
      periodo: P.label,
      origem: ['OrderItem', 'Rental'],
      nota: report.note,
    });
  }
};

// ---------------------------------------------------------------------------
// 4c. conciliacao_estoque
// ---------------------------------------------------------------------------

const conciliacaoEstoqueTool: CopilotTool = {
  name: 'conciliacao_estoque',
  description: 'Concilia quantidade de produtos em comandas fechadas com saÃ­das OUT_SALE lÃ­quidas de devoluÃ§Ãµes, por produto e perÃ­odo, e aponta custo incompleto. NÃ£o afirma perda automaticamente; a diferenÃ§a exige investigaÃ§Ã£o.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'month = mÃªs atual; 7d/30d/90d = janelas mÃ³veis; AAAA-MM = mÃªs histÃ³rico' }
    }
  },
  requiredPerm: 'permStock',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permStock) return deny();
    const P = parsePeriodo(args);
    const report = await getInventoryReconciliationReport(P.from, P.to);
    return ok({
      periodo: P.label,
      disponivel: report.available,
      motivoIndisponivel: report.reason || null,
      produtosComDivergencia: report.produtosComDivergencia,
      quantidadeDivergente: report.quantidadeDivergente,
      quantidadeSemCusto: report.quantidadeSemCusto,
      linhas: report.linhas.slice(0, 20),
      observacao: report.note,
    }, {
      periodo: P.label,
      origem: ['OrderItem', 'StockMovement'],
      nota: report.note,
    });
  }
};

// ---------------------------------------------------------------------------
// 5. clientes_inativos
// ---------------------------------------------------------------------------

const inativosTool: CopilotTool = {
  name: 'clientes_inativos',
  description: 'Clientes inativos (sem reserva ou comanda vinculada hÃ¡ N dias) e inadimplentes (mensalidade vencida). Retorna apenas nomes e prazos â€” sem dados pessoais.',
  parameters: {
    type: 'object',
    properties: {
      dias: { type: 'number', description: 'Dias sem atividade para considerar inativo (padrÃ£o 60)' }
    }
  },
  requiredPerm: 'permCustomers',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permCustomers) return deny();
    const dias = Math.min(720, Math.max(7, Number(args.dias) || 60));
    const hoje = ctx.hoje;
    const corte = new Date(hoje.getTime() - dias * dayMs);

    const [customers, rentals, linkedOrders, subs] = await Promise.all([
      prisma.customer.findMany({ select: { id: true, name: true } }),
      prisma.rental.findMany({ where: { startTime: { gte: corte } }, select: { customerId: true, startTime: true } }),
      prisma.order.findMany({ where: { customerId: { not: null }, closedAt: { gte: corte } }, select: { customerId: true, closedAt: true } }),
      prisma.subscription.findMany({ include: { customer: { select: { name: true } } } })
    ]);

    const lastRental: Record<string, Date> = {};
    rentals.forEach(r => {
      if (r.customerId && (!lastRental[r.customerId] || r.startTime > lastRental[r.customerId])) lastRental[r.customerId] = r.startTime;
    });
    const lastOrder: Record<string, Date> = {};
    linkedOrders.forEach(o => {
      if (o.customerId && o.closedAt && (!lastOrder[o.customerId] || o.closedAt > lastOrder[o.customerId])) lastOrder[o.customerId] = o.closedAt;
    });

    const inativos: { name: string; diasSemAtividade: number; ultimaAtividade: string }[] = [];
    customers.forEach(c => {
      const r = lastRental[c.id];
      const o = lastOrder[c.id];
      const ultima = r && o ? (r > o ? r : o) : (r || o);
      if (!ultima) {
        inativos.push({ name: c.name, diasSemAtividade: dias, ultimaAtividade: 'â€”' });
        return;
      }
      const semAtividade = Math.floor((hoje.getTime() - ultima.getTime()) / dayMs);
      if (semAtividade >= dias) {
        inativos.push({ name: c.name, diasSemAtividade: semAtividade, ultimaAtividade: ultima.toLocaleDateString('pt-BR') });
      }
    });
    inativos.sort((a, b) => b.diasSemAtividade - a.diasSemAtividade);

    const inadimplentes = subs
      .filter(s => new Date(s.nextDueDate).getTime() < hoje.getTime())
      .map(s => ({ name: s.customer?.name || 'â€”', valorMensalidade: s.amount, vencidoDesde: new Date(s.nextDueDate).toLocaleDateString('pt-BR') }));

    return ok({
      diasConsiderados: dias,
      inativos,
      inadimplentes,
      totalInativos: inativos.length,
      totalInadimplentes: inadimplentes.length
    }, {
      periodo: `atividade nos Ãºltimos ${dias} dias (referÃªncia ${fmtDate(hoje)})`,
      origem: ['Customer', 'Rental', 'Order', 'Subscription'],
      nota: 'Inatividade = sem reserva (Rental) e sem comanda vinculada fechada no perÃ­odo.'
    });
  }
};

// ---------------------------------------------------------------------------
// 6. horarios_ociosos
// ---------------------------------------------------------------------------

const horariosTool: CopilotTool = {
  name: 'horarios_ociosos',
  description: 'Ociosidade de horÃ¡rios por dia da semana no perÃ­odo, com base nas reservas de campos. Ãštil para decidir onde oferecer promoÃ§Ãµes.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'month = mÃªs atual; 7d/30d/90d = janelas mÃ³veis; AAAA-MM = mÃªs histÃ³rico' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);
    const occupancy = await getOccupancyReport(P.from, P.to);

    const byWeekday = new Map<string, { effective: number; capacity: number }>();
    occupancy.fields.forEach((field: any) => {
      field.porDia.forEach((day: any) => {
        const row = byWeekday.get(day.diaSemana) || { effective: 0, capacity: 0 };
        row.effective += day.efetivoMin;
        row.capacity += day.capacidadeMin;
        byWeekday.set(day.diaSemana, row);
      });
    });
    const porDia = Array.from(byWeekday.entries()).map(([dia, row]) => ({
      dia,
      horasOcupadas: round2(row.effective / 60),
      disponivel: round2(row.capacity / 60),
      ocupacaoPct: row.capacity > 0 ? round2((row.effective / row.capacity) * 100) : 0,
    })).sort((a, b) => a.ocupacaoPct - b.ocupacaoPct);

    const maisOciosos = porDia.slice(0, 3);
    const pico = [...porDia].sort((a, b) => b.ocupacaoPct - a.ocupacaoPct)[0] || null;

    return ok({
      periodo: P.label,
      disponivel: occupancy.available,
      porDia,
      diasMaisOciosos: maisOciosos,
      diaDePico: pico,
      extraordinario: {
        horas: occupancy.overall.extraHoras || 0,
        receita: occupancy.overall.extraReceita || 0,
        reservas: occupancy.overall.extraReservas || 0,
        porCampo: occupancy.fields.map((f: any) => ({
          campo: f.campo,
          horas: f.extraHoras || 0,
          receita: f.extraReceita || 0,
          reservas: f.extraReservas || 0,
          porHora: f.extraPorHora || [],
        })),
      },
      ocupacaoConfig: occupancy.config,
      motivoIndisponivel: occupancy.reason || null,
    }, {
      periodo: P.label,
      origem: ['Rental'],
      nota: `OcupaÃ§Ã£o regular por dia da semana e campo. ${occupancy.config.note} Reservas fora da grade sÃ£o extraordinÃ¡rias; no-show e cancelamentos sÃ£o tratados separadamente.`
    });
  }
};

// ---------------------------------------------------------------------------
// 7. contas_a_pagar
// ---------------------------------------------------------------------------

const contasTool: CopilotTool = {
  name: 'contas_a_pagar',
  description: 'Valor e lista de contas a pagar (FinancialEntry PAYABLE) pendentes: vencidas e a vencer.',
  parameters: { type: 'object', properties: {} },
  requiredPerm: 'permFinance',
  async execute(ctx) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const hoje = ctx.hoje;

    const entries = await prisma.financialEntry.findMany({
      where: { type: 'PAYABLE', status: 'PENDING' },
      select: { description: true, category: true, amount: true, dueDate: true, installmentNum: true, installmentTotal: true }
    });

    const vencidas = entries.filter(e => e.dueDate < hoje).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const aVencer = entries.filter(e => e.dueDate >= hoje).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    const map = (list: typeof entries) => list.map(e => ({
      descricao: e.description || (e.category || 'Conta'),
      categoria: e.category || 'Diversos',
      valor: e.amount,
      vencimento: e.dueDate.toLocaleDateString('pt-BR'),
      parcela: e.installmentTotal && e.installmentTotal > 1 ? `${e.installmentNum}/${e.installmentTotal}` : null
    }));

    const totalVencidas = round2(vencidas.reduce((a, e) => a + e.amount, 0));
    const totalAVencer = round2(aVencer.reduce((a, e) => a + e.amount, 0));

    return ok({
      totalPendente: round2(totalVencidas + totalAVencer),
      totalVencidas,
      vencidas: map(vencidas),
      totalAVencer,
      aVencer: map(aVencer)
    }, {
      periodo: 'saldo pendente em ' + fmtDate(hoje),
      origem: ['FinancialEntry'],
      nota: 'Apenas lanÃ§amentos PAYABLE com status PENDING.'
    });
  }
};

// ---------------------------------------------------------------------------
// 8. previsao_fechamento
// ---------------------------------------------------------------------------

const previsaoTool: CopilotTool = {
  name: 'previsao_fechamento',
  description: 'PrevisÃ£o de fechamento do mÃªs: realizado atÃ© hoje + pendÃªncias + projeÃ§Ã£o pela mÃ©dia diÃ¡ria. O resultado Ã© uma ESTIMATIVA, sempre rotulada como tal.',
  parameters: { type: 'object', properties: {} },
  requiredPerm: 'permFinance',
  async execute(ctx) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();

    const hoje = ctx.hoje;
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const from = new Date(ano, mes, 1);
    const to = new Date(ano, mes + 1, 0, 23, 59, 59);
    const fimMes = new Date(ano, mes + 1, 0);

    const [payments, subPayments, financial] = await Promise.all([
      prisma.payment.findMany({ where: { date: { gte: from, lte: to } }, select: { amount: true, date: true } }),
      prisma.subscriptionPayment.findMany({ where: { paymentDate: { gte: from, lte: to } }, select: { amount: true, paymentDate: true } }),
      prisma.financialEntry.findMany({ where: { status: 'PENDING' }, select: { type: true, amount: true, dueDate: true } })
    ]);

    let realizadoVendas = 0;
    payments.forEach(p => { if (p.date <= hoje) realizadoVendas += p.amount; });
    let realizadoMensal = 0;
    subPayments.forEach(s => { if (s.paymentDate <= hoje) realizadoMensal += s.amount; });
    const realizado = realizadoVendas + realizadoMensal;

    let aReceber = 0, aPagar = 0;
    financial.forEach(f => {
      if (f.dueDate < from || f.dueDate > to) return;
      if (f.type === 'RECEIVABLE') aReceber += f.amount;
      else aPagar += f.amount;
    });

    const diaAtual = hoje.getDate();
    const diasTotais = fimMes.getDate();
    const diasRestantes = Math.max(0, diasTotais - diaAtual);
    const ritmoDiario = diaAtual > 0 ? realizado / diaAtual : 0;
    const projetadoPeloRitmo = realizado + ritmoDiario * diasRestantes;

    const saldoProjetado = round2(realizado + aReceber - aPagar);
    const projecaoComRitmo = round2(projetadoPeloRitmo + aReceber - aPagar);

    return ok({
      mes: `${String(mes + 1).padStart(2, '0')}/${ano}`,
      estimativa: true,
      realizadoAteHoje: round2(realizado),
      diasDecorridos: diaAtual,
      diasTotais,
      aReceberNoMes: round2(aReceber),
      aPagarNoMes: round2(aPagar),
      saldoProjetado: saldoProjetado,
      projecaoComRitmo: projecaoComRitmo
    }, {
      periodo: `${fmtDate(from)} a ${fmtDate(hoje)} (referÃªncia)`,
      origem: ['Payment', 'SubscriptionPayment', 'FinancialEntry'],
      nota: 'ESTIMATIVA. "projecaoComRitmo" assume a mÃ©dia diÃ¡ria atual atÃ© o fim do mÃªs; nÃ£o Ã© garantia de fechamento.'
    });
  }
};

// ---------------------------------------------------------------------------
// 9. resumo_operacional
// ---------------------------------------------------------------------------

const resumoTool: CopilotTool = {
  name: 'resumo_operacional',
  description: 'Resumo operacional do perÃ­odo: comandas pagas, ticket mÃ©dio, top produtos vendidos, mÃ©todos de pagamento, mensalidades recebidas e total de reservas.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'month = mÃªs atual; 7d/30d/90d = janelas mÃ³veis; AAAA-MM = mÃªs histÃ³rico' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);

    const [payments, subPayments, orderItems, rentals] = await Promise.all([
      loadPayments(P.from, P.to),
      prisma.subscriptionPayment.findMany({ where: { paymentDate: { gte: P.from, lte: P.to } }, select: { amount: true, paymentDate: true } }),
      prisma.orderItem.findMany({
        where: { status: 'ACTIVE', order: { status: 'CLOSED', closedAt: { gte: P.from, lte: P.to } } },
        select: { quantity: true, subtotal: true, product: { select: { name: true, isService: true, stockControlled: true } } }
      }),
      prisma.rental.findMany({ where: { startTime: { gte: P.from, lte: P.to }, status: { not: 'CANCELED' } }, select: { startTime: true, endTime: true } })
    ]);

    const comandasPagas = new Set(payments.filter(p => p.orderId).map(p => p.orderId)).size;
    const receitaVendas = payments.reduce((a, p) => a + (p.amount || 0), 0);
    const mensalidades = subPayments.reduce((a, s) => a + s.amount, 0);
    const ticket = comandasPagas > 0 ? round2(receitaVendas / comandasPagas) : 0;

    const methodMap: Record<string, string> = { CASH: 'Dinheiro', PIX: 'Pix', DEBIT: 'DÃ©bito', CREDIT: 'CrÃ©dito' };
    const methods: Record<string, number> = {};
    payments.forEach(p => {
      const label = methodMap[p.method] || p.method || 'Outros';
      methods[label] = round2((methods[label] || 0) + p.amount);
    });

    const prodAgg: Record<string, number> = {};
    orderItems.forEach(it => {
      if (!it.product || it.product.isService === true || it.product.stockControlled === false) return;
      prodAgg[it.product.name] = (prodAgg[it.product.name] || 0) + it.quantity;
    });
    const topProdutos = Object.entries(prodAgg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, qtd]) => ({ nome, qtd }));

    const horasOcupadas = rentals.reduce((a, r) => a + (r.endTime.getTime() - r.startTime.getTime()) / 3600000, 0);

    return ok({
      periodo: P.label,
      comandasPagas,
      receitaVendas: round2(receitaVendas),
      receitaMensalidades: round2(mensalidades),
      ticketMedio: ticket,
      metodosPagamento: methods,
      topProdutos,
      totalReservas: rentals.length,
      horasReservadas: round2(horasOcupadas)
    }, {
      periodo: P.label,
      origem: ['Payment', 'OrderItem', 'SubscriptionPayment', 'Rental'],
      nota: 'Ticket mÃ©dio = receita de vendas / comandas pagas no perÃ­odo.'
    });
  }
};

// ---------------------------------------------------------------------------
// 10. sessoes_caixa
// ---------------------------------------------------------------------------

const sessoesTool: CopilotTool = {
  name: 'sessoes_caixa',
  description: 'SessÃµes de caixa do perÃ­odo: por turno, soma das formas de pagamento (Dinheiro/Pix/DÃ©bito/CrÃ©dito), fundo de troco, saldo final, auditoria de vendas e fÃ­sica. Permite somar quanto entrou em cada mÃ©todo em um perÃ­odo.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'month = mÃªs atual; 7d/30d/90d = janelas mÃ³veis; AAAA-MM = mÃªs histÃ³rico' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);

    const sessions = await prisma.cashRegister.findMany({
      where: { openedAt: { gte: P.from, lte: P.to } },
      orderBy: { openedAt: 'desc' },
      include: {
        user: { select: { name: true } },
        payments: { include: { order: { include: { items: { where: { status: 'ACTIVE' } } } } } }
      }
    });

    const porSessao = sessions.map(s => {
      const byMethod = (s.payments || []).reduce((acc: any, p: any) => {
        acc[p.method] = (acc[p.method] || 0) + p.amount;
        return acc;
      }, { CASH: 0, PIX: 0, DEBIT: 0, CREDIT: 0 });

      const uniqueOrdersMap = new Map();
      (s.payments || []).forEach((p: any) => {
        if (p.order && !uniqueOrdersMap.has(p.order.id)) uniqueOrdersMap.set(p.order.id, p.order);
      });
      const uniqueOrders = Array.from(uniqueOrdersMap.values());
      const totalGrossSold = uniqueOrders.reduce((acc: number, o: any) =>
        acc + (o.items?.reduce((sum: number, it: any) => sum + it.subtotal, 0) || 0), 0);
      const totalDiscounts = uniqueOrders.reduce((acc: number, o: any) => acc + (o.discount || 0), 0);
      const totalPaymentsReceived = (s.payments || []).reduce((acc: number, p: any) => acc + p.amount, 0);
      const auditVendas = (totalGrossSold - totalDiscounts) - totalPaymentsReceived;
      const expectedCash = s.openingBal + (byMethod.CASH || 0);
      const auditFisico = s.closingBal !== null ? s.closingBal - expectedCash : 0;

      return {
        operador: s.user?.name || 'â€”',
        status: s.status === 'OPEN' ? 'Aberto' : 'Fechado',
        abertura: s.openedAt.toLocaleString('pt-BR'),
        fechamento: s.closedAt ? s.closedAt.toLocaleString('pt-BR') : 'Em curso',
        pagamentos: {
          dinheiro: round2(byMethod.CASH),
          pix: round2(byMethod.PIX),
          debito: round2(byMethod.DEBIT),
          credito: round2(byMethod.CREDIT)
        },
        fundoTroco: round2(s.openingBal),
        saldoFinal: s.closingBal !== null ? round2(s.closingBal) : null,
        auditoriaVendas: round2(auditVendas),
        auditoriaFisica: s.closingBal !== null ? round2(auditFisico) : null
      };
    });

    const total = porSessao.reduce((acc: any, s: any) => {
      acc.dinheiro += s.pagamentos.dinheiro;
      acc.pix += s.pagamentos.pix;
      acc.debito += s.pagamentos.debito;
      acc.credito += s.pagamentos.credito;
      return acc;
    }, { dinheiro: 0, pix: 0, debito: 0, credito: 0 });

    return ok({
      periodo: P.label,
      totalSessoes: sessions.length,
      totalPorForma: { dinheiro: round2(total.dinheiro), pix: round2(total.pix), debito: round2(total.debito), credito: round2(total.credito) },
      porSessao
    }, {
      periodo: P.label,
      origem: ['CashRegister', 'Payment', 'OrderItem'],
      nota: 'Regime de caixa. Auditorias: vendas = (bruto âˆ’ descontos) âˆ’ pago; fÃ­sica = saldo final âˆ’ (fundo de troco + dinheiro).'
    });
  }
};

// ---------------------------------------------------------------------------
// 11. estoque
// ---------------------------------------------------------------------------

const estoqueTool: CopilotTool = {
  name: 'estoque',
  description: 'VisÃ£o de estoque: saldo atual por produto no balcÃ£o e no depÃ³sito, produtos abaixo do mÃ­nimo (alerta de reposiÃ§Ã£o) e resumo de movimentaÃ§Ãµes (entradas, vendas, perdas, transferÃªncias) em um perÃ­odo.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'month = mÃªs atual; 7d/30d/90d = janelas mÃ³veis; AAAA-MM = mÃªs histÃ³rico' },
      abaixoMinimo: { type: 'boolean', description: 'true = retornar somente produtos abaixo do mÃ­nimo (alerta de reposiÃ§Ã£o)' }
    }
  },
  requiredPerm: 'permStock',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permStock) return deny();
    const P = parsePeriodo(args);
    const abaixoMinimo = args.abaixoMinimo === true;

    const [stocks, depotStocks, stockMovs, depotMovs] = await Promise.all([
      prisma.stock.findMany({ where: { product: { isService: false, stockControlled: true } }, include: { product: { select: { name: true, unit: true } } } }),
      prisma.depotStock.findMany({ where: { product: { isService: false, stockControlled: true } }, include: { product: { select: { name: true, unit: true } } } }),
      prisma.stockMovement.findMany({
        where: { date: { gte: P.from, lte: P.to }, product: { isService: false } },
        select: { type: true, quantity: true }
      }),
      prisma.depotMovement.findMany({
        where: { date: { gte: P.from, lte: P.to }, product: { isService: false } },
        select: { type: true, quantity: true }
      })
    ]);

    const saldoBalcao = stocks.map(s => ({
      produto: s.product?.name || 'â€”',
      quantidade: round2(s.quantity),
      minimo: round2(s.minQuantity),
      unidade: s.unit
    })).sort((a, b) => a.quantidade - b.quantidade);

    const saldoDeposito = depotStocks.map(s => ({
      produto: s.product?.name || 'â€”',
      quantidade: round2(s.quantity),
      minimo: round2(s.minQuantity),
      unidade: s.unit
    })).sort((a, b) => a.quantidade - b.quantidade);

    const abaixo = [...saldoBalcao, ...saldoDeposito]
      .filter(s => s.quantidade <= s.minimo)
      .sort((a, b) => a.quantidade - b.quantidade);

    const resumoBalcao = { IN: 0, OUT_SALE: 0, OUT_MANUAL: 0, LOSS: 0 };
    stockMovs.forEach(m => {
      if (m.type in resumoBalcao) resumoBalcao[m.type as keyof typeof resumoBalcao] = round2(resumoBalcao[m.type as keyof typeof resumoBalcao] + m.quantity);
    });
    const resumoDeposito = { IN: 0, OUT_TRANSFER: 0, LOSS: 0 };
    depotMovs.forEach(m => {
      if (m.type in resumoDeposito) resumoDeposito[m.type as keyof typeof resumoDeposito] = round2(resumoDeposito[m.type as keyof typeof resumoDeposito] + m.quantity);
    });

    return ok({
      periodo: P.label,
      totalProdutosBalcao: saldoBalcao.length,
      totalProdutosDeposito: saldoDeposito.length,
      saldoBalcao: abaixoMinimo ? saldoBalcao.filter(s => s.quantidade <= s.minimo) : saldoBalcao,
      saldoDeposito: abaixoMinimo ? saldoDeposito.filter(s => s.quantidade <= s.minimo) : saldoDeposito,
      abaixoDoMinimo: abaixo,
      totalAbaixoDoMinimo: abaixo.length,
      movimentacoesPeriodo: { balcao: resumoBalcao, deposito: resumoDeposito }
    }, {
      periodo: P.label,
      origem: ['Stock', 'DepotStock', 'StockMovement', 'DepotMovement'],
      nota: 'Saldo atual (posiÃ§Ã£o em tempo real). MovimentaÃ§Ãµes somadas no perÃ­odo por tipo; transferÃªncias depÃ³sitoâ†’balcÃ£o contam como OUT_TRANSFER no depÃ³sito e IN no balcÃ£o.'
    });
  }
};

const custosCentrosTool: CopilotTool = {
  name: 'custos_centros',
  description: 'Custos por centro de custo no mes: custo alocado, custo planejado por regra, receita das quadras, horas e margem de contribuicao. Informa quando nao ha alocacao/rateio e nao inventa custos.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', description: 'Mes no formato AAAA-MM. Se omitido, usa o mes atual.' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const raw = String(args.periodo || '');
    const period = isMonthKey(raw) ? raw : currentCuiabaMonth();
    const data = await getCostCenterReport(period);
    return ok(data, {
      periodo: data.period,
      origem: data.source,
      nota: data.note
    });
  }
};

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

export const COPILOT_TOOLS: CopilotTool[] = [
  faturamentoTool,
  dreTool,
  historicoTool,
  historicoGerencialTool,
  compararPeriodosTool,
  alertasGestaoTool,
  simularCenarioTool,
  previsaoFinanceiraTool,
  recomendacoesEstrategicasTool,
  precificacaoOportunidadesTool,
  simularPrecificacaoTool,
  camposTool,
  margensTool,
  mixReceitaTool,
  conciliacaoEstoqueTool,
  inativosTool,
  horariosTool,
  contasTool,
  previsaoTool,
  resumoTool,
  sessoesTool,
  estoqueTool,
  custosCentrosTool
];
