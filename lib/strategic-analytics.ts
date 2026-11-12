import {
  currentCuiabaMonth,
  formatMonthLabel,
  getFinancialSeries,
  monthRange,
  nextMonth,
  type FinancialRegime,
} from './official-financials';
import {
  getOccupancyReport,
  getProductContributionReport,
} from './commercial-analytics';
import { cacheWrap, managementTtlMs } from './intelligence-cache';

export type ScenarioPreset = 'conservative' | 'base' | 'optimistic';
export type Confidence = 'ALTA' | 'MEDIA' | 'BAIXA';
export type Effort = 'BAIXO' | 'MEDIO' | 'ALTO';

export interface ScenarioInput {
  rentalPriceChangePct: number;
  occupancyChangePp: number;
  productPriceChangePct: number;
  productCostChangePct: number;
}

export interface ScenarioBase {
  period: string;
  label: string;
  occupancyAvailable: boolean;
  occupancyPct: number;
  effectiveHours: number;
  rentalRevenue: number;
  rentalAgendaRevenue: number;
  extraRevenue: number;
  extraHours: number;
  extraReservations: number;
  productRevenue: number;
  productCmv: number;
  productContribution: number | null;
  productMarginPct: number | null;
  productDataComplete: boolean;
  occupancyConfigNote: string;
  source: string[];
}

export interface ScenarioResult {
  period: string;
  label: string;
  input: ScenarioInput;
  base: ScenarioBase;
  scenario: {
    rentalRevenue: number | null;
    productRevenue: number | null;
    productCmv: number | null;
    productContribution: number | null;
    productMarginPct: number | null;
    totalRevenue: number | null;
    totalCost: number | null;
  };
  deltas: {
    rentalRevenue: number | null;
    productRevenue: number | null;
    productCmv: number | null;
    productContribution: number | null;
    totalRevenue: number | null;
    productMarginPts: number | null;
  };
  rentalCostKnown: false;
  rentalMarginAvailable: false;
  assumptions: string[];
  warnings: string[];
  sources: string[];
  isEstimate: true;
  note: string;
}

export const SCENARIO_PRESETS: Record<ScenarioPreset, ScenarioInput> = {
  conservative: { rentalPriceChangePct: -5, occupancyChangePp: -2, productPriceChangePct: -3, productCostChangePct: 0 },
  base: { rentalPriceChangePct: 0, occupancyChangePp: 0, productPriceChangePct: 0, productCostChangePct: 0 },
  optimistic: { rentalPriceChangePct: 5, occupancyChangePp: 2, productPriceChangePct: 3, productCostChangePct: 0 },
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function simulateScenario(base: ScenarioBase, input: ScenarioInput): ScenarioResult {
  const rentalPrice = Number(input.rentalPriceChangePct) || 0;
  const occupancyChange = Number(input.occupancyChangePp) || 0;
  const productPrice = Number(input.productPriceChangePct) || 0;
  const productCost = Number(input.productCostChangePct) || 0;
  const newOccupancy = clamp(base.occupancyPct + occupancyChange, 0, 100);
  const rentalAvailable = base.occupancyAvailable && base.occupancyPct > 0 && base.rentalRevenue > 0;
  const rentalRevenue = rentalAvailable
    ? round2(base.rentalRevenue * (newOccupancy / base.occupancyPct) * (1 + rentalPrice / 100))
    : null;

  const productAvailable = base.productContribution != null;
  const productRevenue = productAvailable
    ? round2(base.productRevenue * (1 + productPrice / 100))
    : null;
  const productCmv = productAvailable
    ? round2(base.productCmv * (1 + productCost / 100))
    : null;
  const productContribution = productRevenue != null && productCmv != null
    ? round2(productRevenue - productCmv)
    : null;
  const productMarginPct = productRevenue != null && productRevenue > 0 && productContribution != null
    ? round1((productContribution / productRevenue) * 100)
    : null;

  const extraRevenue = base.extraRevenue || 0;
  const totalRevenue = [rentalRevenue, productRevenue].filter((v): v is number => v != null).reduce((a, b) => a + b, 0) + extraRevenue;
  const totalCost = productCmv;

  const warnings: string[] = [];
  if (!base.occupancyAvailable) {
    warnings.push('Ocupação indisponível: janela operacional não configurada. O cenário de aluguel não foi calculado.');
  } else if (!rentalAvailable && base.rentalRevenue > 0) {
    warnings.push('Sem horas efetivas pagas no período; não foi possível aplicar variação de ocupação/preço ao aluguel.');
  }
  if (!base.productDataComplete) {
    warnings.push('A margem de produtos está incompleta por custo/quantidade ausente; o cenário de produtos fica indisponível.');
  }
  if (base.productContribution == null) {
    warnings.push('Sem margem de contribuição de produtos disponível para simular.');
  }
  if (base.occupancyAvailable && base.occupancyPct === 0) {
    warnings.push('Não há ocupação regular no período, apenas reservas extraordinárias; o cenário de aluguel regular não foi calculado.');
  }
  if (base.extraRevenue > 0) {
    warnings.push(`Existem R$ ${base.extraRevenue.toFixed(2)} em reservas extraordinárias; elas permanecem fora da simulação de ocupação regular.`);
  }
  warnings.push('Não existe custo operacional das quadras no sistema; o cenário de aluguel não calcula margem/lucro de aluguel.');
  warnings.push('Simulação hipotética com volume/estrutura de custos constante; não é previsão nem resultado garantido.');

  const rentalDelta = rentalRevenue != null ? round2(rentalRevenue - base.rentalRevenue) : null;
  const productDelta = productRevenue != null ? round2(productRevenue - base.productRevenue) : null;
  const productCmvDelta = productCmv != null ? round2(productCmv - base.productCmv) : null;
  const productContributionDelta = productContribution != null && base.productContribution != null
    ? round2(productContribution - base.productContribution)
    : null;

  return {
    period: base.period,
    label: base.label,
    input: { rentalPriceChangePct: rentalPrice, occupancyChangePp: occupancyChange, productPriceChangePct: productPrice, productCostChangePct: productCost },
    base,
    scenario: {
      rentalRevenue,
      productRevenue,
      productCmv,
      productContribution,
      productMarginPct,
      totalRevenue: round2(totalRevenue),
      totalCost,
    },
    deltas: {
      rentalRevenue: rentalDelta,
      productRevenue: productDelta,
      productCmv: productCmvDelta,
      productContribution: productContributionDelta,
      totalRevenue: round2(totalRevenue - ((base.rentalRevenue || 0) + (base.extraRevenue || 0) + (base.productRevenue || 0))),
      productMarginPts: productMarginPct != null && base.productMarginPct != null ? round1(productMarginPct - base.productMarginPct) : null,
    },
    rentalCostKnown: false,
    rentalMarginAvailable: false,
    assumptions: [
      base.occupancyAvailable && base.occupancyPct > 0
        ? `Ocupação regular simulada: ${base.occupancyPct.toFixed(1)}% -> ${newOccupancy.toFixed(1)}% (${occupancyChange >= 0 ? '+' : ''}${occupancyChange.toFixed(1)} p.p.).`
        : 'Ocupação regular sem horas efetivas no período; cenário de aluguel regular não calculado.',
      `Preço do aluguel: ${rentalPrice >= 0 ? '+' : ''}${rentalPrice.toFixed(1)}% com demanda/estrutura constante.`,
      `Preço dos produtos: ${productPrice >= 0 ? '+' : ''}${productPrice.toFixed(1)}%; custo: ${productCost >= 0 ? '+' : ''}${productCost.toFixed(1)}%; volume constante.`,
      base.occupancyConfigNote,
    ],
    warnings,
    sources: base.source,
    isEstimate: true,
    note: 'Cenário consultivo e hipotético. Receita de aluguel usa reservas pagas; não há custo de quadra para calcular margem. Produtos usam receita líquida e CMV snapshot do período.',
  };
}

export interface ForecastPoint {
  month: number;
  period: string;
  label: string;
  revenue: number;
  revenueLow: number;
  revenueHigh: number;
  cmv: number;
  expenses: number;
  netResult: number;
  netLow: number;
  netHigh: number;
}

export interface ForecastReport {
  available: boolean;
  reason?: string;
  regime: FinancialRegime;
  generatedAt: string;
  historyMonths: number;
  history: { period: string; label: string; revenue: number; cmv: number; expenses: number; netResult: number; source: string; version: number | null; status: string }[];
  horizons: { 3: ForecastPoint[]; 6: ForecastPoint[]; 12: ForecastPoint[] };
  seasonalityApplied: boolean;
  interval: '80%';
  confidence: Confidence;
  limitations: string[];
  assumptions: string[];
  sources: string[];
}

interface Fit {
  intercept: number;
  slope: number;
  se: number;
  sxx: number;
  xbar: number;
  n: number;
}

function fitLinear(values: number[]): Fit | null {
  const n = values.length;
  if (n < 3) return null;
  const xbar = (n - 1) / 2;
  const ybar = values.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  values.forEach((y, x) => { sxx += (x - xbar) ** 2; sxy += (x - xbar) * (y - ybar); });
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = ybar - slope * xbar;
  let sse = 0;
  values.forEach((y, x) => { const predicted = intercept + slope * x; sse += (y - predicted) ** 2; });
  const se = Math.sqrt(sse / Math.max(1, n - 2));
  return { intercept, slope, se, sxx, xbar, n };
}

function predict(fit: Fit, x: number): { value: number; low: number; high: number } {
  const value = fit.intercept + fit.slope * x;
  const margin = 1.28 * fit.se * Math.sqrt(1 + 1 / fit.n + ((x - fit.xbar) ** 2) / fit.sxx);
  return { value, low: value - margin, high: value + margin };
}

function seasonalFactors(history: { period: string; value: number }[]): Record<number, number> | null {
  if (history.length < 24) return null;
  const byMonth = new Map<number, number[]>();
  history.forEach(h => {
    const month = Number(h.period.slice(5, 7));
    const list = byMonth.get(month) || [];
    list.push(h.value);
    byMonth.set(month, list);
  });
  const overall = history.reduce((a, h) => a + h.value, 0) / history.length;
  if (!overall) return null;
  const factors: Record<number, number> = {};
  for (let month = 1; month <= 12; month++) {
    const list = byMonth.get(month);
    if (!list || list.length === 0) continue;
    const average = list.reduce((a, b) => a + b, 0) / list.length;
    factors[month] = clamp(average / overall, 0.5, 1.5);
  }
  return factors;
}

export function buildForecast(
  history: { period: string; label: string; revenue: number; cmv: number; expenses: number; netResult: number; source: string; version: number | null; status: string }[],
  regime: FinancialRegime
): ForecastReport {
  const sorted = [...history].sort((a, b) => a.period.localeCompare(b.period));
  if (sorted.length < 3) {
    return {
      available: false,
      reason: 'São necessários pelo menos 3 meses concluídos com DRE disponível para projetar.',
      regime,
      generatedAt: new Date().toISOString(),
      historyMonths: sorted.length,
      history: sorted,
      horizons: { 3: [], 6: [], 12: [] },
      seasonalityApplied: false,
      interval: '80%',
      confidence: 'BAIXA',
      limitations: ['Histórico insuficiente.'],
      assumptions: [],
      sources: ['FinancialPeriodClose', 'FinancialPeriodAudit', 'Payment', 'Order', 'StockMovement', 'FinancialEntry'],
    };
  }

  const revenues = sorted.map(h => h.revenue);
  const cmvs = sorted.map(h => h.cmv);
  const expenses = sorted.map(h => h.expenses);
  const seasonRevenue = seasonalFactors(sorted.map((h, i) => ({ period: h.period, value: revenues[i] })));
  const seasonCmv = seasonalFactors(sorted.map((h, i) => ({ period: h.period, value: cmvs[i] })));
  const seasonExpenses = seasonalFactors(sorted.map((h, i) => ({ period: h.period, value: expenses[i] })));
  const seasonalityApplied = !!(seasonRevenue || seasonCmv || seasonExpenses);

  const fitRevenue = fitLinear(revenues);
  const fitCmv = fitLinear(cmvs);
  const fitExpenses = fitLinear(expenses);
  if (!fitRevenue || !fitCmv || !fitExpenses) throw new Error('Não foi possível ajustar a tendência histórica.');

  const lastPeriod = sorted[sorted.length - 1].period;
  const makeHorizon = (count: number): ForecastPoint[] => {
    const out: ForecastPoint[] = [];
    for (let h = 1; h <= count; h++) {
      const period = nextMonth(addMonths(lastPeriod, h - 1));
      const x = sorted.length - 1 + h;
      const revenue = predict(fitRevenue, x);
      const cmv = predict(fitCmv, x);
      const expense = predict(fitExpenses, x);
      const month = Number(period.slice(5, 7));
      const r = seasonRevenue?.[month] || 1;
      const c = seasonCmv?.[month] || 1;
      const e = seasonExpenses?.[month] || 1;
      const revenueBase = Math.max(0, revenue.value * r);
      const cmvBase = Math.max(0, cmv.value * c);
      const expensesBase = Math.max(0, expense.value * e);
      const net = revenueBase - cmvBase - expensesBase;
      const netLow = revenue.low * r - cmv.high * c - expense.high * e;
      const netHigh = revenue.high * r - cmv.low * c - expense.low * e;
      out.push({
        month: h,
        period,
        label: formatMonthLabel(period),
        revenue: round2(revenueBase),
        revenueLow: round2(Math.max(0, revenue.low * r)),
        revenueHigh: round2(Math.max(0, revenue.high * r)),
        cmv: round2(cmvBase),
        expenses: round2(expensesBase),
        netResult: round2(net),
        netLow: round2(netLow),
        netHigh: round2(netHigh),
      });
    }
    return out;
  };

  const confidence: Confidence = sorted.length >= 12 ? 'ALTA' : sorted.length >= 6 ? 'MEDIA' : 'BAIXA';
  return {
    available: true,
    regime,
    generatedAt: new Date().toISOString(),
    historyMonths: sorted.length,
    history: sorted,
    horizons: { 3: makeHorizon(3), 6: makeHorizon(6), 12: makeHorizon(12) },
    seasonalityApplied,
    interval: '80%',
    confidence,
    limitations: [
      'Projeção linear com intervalo aproximado de 80%; não é garantia de resultado.',
      seasonalityApplied ? 'Sazonalidade aplicada como fator multiplicativo simples por mês do calendário.' : 'Sazonalidade não aplicada: histórico inferior a 24 meses.',
      'Meses abertos anteriores são usados como histórico ao vivo; meses fechados usam snapshot.',
      'Mudanças de preço, demanda, custos, mix e capacidade não são previstas automaticamente.',
    ],
    assumptions: [
      'Tendência estimada por regressão linear sobre meses concluídos.',
      `Histórico utilizado: ${sorted.length} meses.`,
      'Intervalo de incerteza calculado por erro padrão da regressão.',
      'Receita, CMV e despesas são projetados separadamente; resultado líquido é derivado.',
    ],
    sources: ['FinancialPeriodClose', 'FinancialPeriodAudit', 'Payment', 'Order', 'StockMovement', 'FinancialEntry'],
  };
}

function addMonths(period: string, months: number): string {
  let cursor = period;
  for (let i = 0; i < months; i++) cursor = nextMonth(cursor);
  return cursor;
}

export interface StrategicRecommendation {
  id: string;
  type: 'OCUPACAO' | 'PRECO_ALUGUEL' | 'PRODUTO' | 'DESPESA' | 'MARGEM';
  title: string;
  description: string;
  action: string;
  impactEstimated: number | null;
  impactLabel: string;
  confidence: Confidence;
  effort: Effort;
  priorityScore: number;
  evidence: string;
  period: string;
  source: string[];
  premissa: string;
}

export interface RecommendationsReport {
  available: boolean;
  reason?: string;
  period: string;
  label: string;
  regime: FinancialRegime;
  recommendations: StrategicRecommendation[];
  criteria: {
    note: string;
    confidenceWeights: Record<Confidence, number>;
    effortWeights: Record<Effort, number>;
  };
  sources: string[];
  note: string;
}

function confidenceWeight(c: Confidence): number { return c === 'ALTA' ? 1 : c === 'MEDIA' ? 0.65 : 0.35; }
function effortWeight(e: Effort): number { return e === 'BAIXO' ? 1 : e === 'MEDIO' ? 0.7 : 0.4; }
function priority(impact: number | null, confidence: Confidence, effort: Effort): number {
  if (impact == null || impact <= 0) return 0;
  return round2(impact * confidenceWeight(confidence) * effortWeight(effort));
}

function addRecommendation(list: StrategicRecommendation[], item: Omit<StrategicRecommendation, 'priorityScore'>) {
  list.push({ ...item, priorityScore: priority(item.impactEstimated, item.confidence, item.effort) });
}

async function strategyCommercialBase(period: string) {
  const range = monthRange(period, { capToToday: true });
  return cacheWrap(`strategy-commercial:${period}`, managementTtlMs(period, currentCuiabaMonth()), async () => {
    const [occupancy, product] = await Promise.all([
      getOccupancyReport(range.from, range.to),
      getProductContributionReport(range.from, range.to),
    ]);
    return { range, occupancy, product };
  });
}

async function scenarioBase(period: string): Promise<ScenarioBase> {
  const { occupancy, product } = await strategyCommercialBase(period);
  return {
    period,
    label: formatMonthLabel(period),
    occupancyAvailable: occupancy.available,
    occupancyPct: occupancy.available ? occupancy.overall.ocupacaoEfetivaPct : 0,
    effectiveHours: occupancy.available ? occupancy.overall.efetivoHoras : 0,
    rentalRevenue: occupancy.available ? occupancy.overall.receitaRealizada : 0,
    rentalAgendaRevenue: occupancy.available ? occupancy.overall.receitaAgenda : 0,
    extraRevenue: occupancy.available ? occupancy.overall.extraReceita || 0 : 0,
    extraHours: occupancy.available ? occupancy.overall.extraHoras || 0 : 0,
    extraReservations: occupancy.available ? occupancy.overall.extraReservas || 0 : 0,
    productRevenue: product.available ? product.produtoReceitaLiquida : 0,
    productCmv: product.available ? product.cmvTotal : 0,
    productContribution: product.available ? product.margemContribuicaoTotal : null,
    productMarginPct: product.available ? product.margemPct : null,
    productDataComplete: product.available && !product.custoIncompleto,
    occupancyConfigNote: occupancy.config.note,
    source: product.available ? ['Rental', 'OrderItem', 'StockMovement'] : ['Rental'],
  };
}

export async function getScenario(period: string, input: ScenarioInput): Promise<ScenarioResult> {
  return simulateScenario(await scenarioBase(period), input);
}

export async function getForecastReport(regime: FinancialRegime = 'competence'): Promise<ForecastReport> {
  const current = currentCuiabaMonth();
  const series = await getFinancialSeries(current, 18, regime);
  const history = series
    .filter(month => month.period < current && month.dre)
    .map(month => ({
      period: month.period,
      label: month.label,
      revenue: month.dre!.totalReceitas,
      cmv: month.dre!.cmv,
      expenses: round2(month.dre!.totalDespesasOp + month.dre!.impostos + month.dre!.despesasFinanceiras),
      netResult: month.dre!.resultadoLiquido,
      source: month.source,
      version: month.version,
      status: month.status,
    }));
  return buildForecast(history, regime);
}

export async function getForecastReportCached(regime: FinancialRegime, forceRefresh = false): Promise<ForecastReport> {
  const key = `strategy-forecast:${regime}:${currentCuiabaMonth()}`;
  if (forceRefresh) {
    const { invalidateCache } = await import('./intelligence-cache');
    invalidateCache(key);
  }
  return cacheWrap(key, managementTtlMs(currentCuiabaMonth(), currentCuiabaMonth()), () => getForecastReport(regime));
}

export async function getStrategicRecommendations(period: string, regime: FinancialRegime): Promise<RecommendationsReport> {
  const [{ occupancy, product }, financialSeries] = await Promise.all([
    strategyCommercialBase(period),
    getFinancialSeries(period, 2, regime),
  ]);
  const currentOfficial = financialSeries[1];
  const previousOfficial = financialSeries[0];
  if (!currentOfficial.dre) {
    return {
      available: false,
      reason: currentOfficial.unavailableReason || 'Sem DRE disponível para recomendações.',
      period,
      label: formatMonthLabel(period),
      regime,
      recommendations: [],
      criteria: { note: 'Recomendações exigem dados realizados.', confidenceWeights: { ALTA: 1, MEDIA: 0.65, BAIXA: 0.35 }, effortWeights: { BAIXO: 1, MEDIO: 0.7, ALTO: 0.4 } },
      sources: [],
      note: 'Nenhuma recomendação gerada.',
    };
  }

  const recommendations: StrategicRecommendation[] = [];
  const sources = new Set<string>(['FinancialPeriodClose', 'FinancialPeriodAudit', 'OrderItem', 'StockMovement', 'Rental']);

  occupancy.opportunities.slice(0, 3).forEach(op => {
    addRecommendation(recommendations, {
      id: `occ-${op.campo}-${op.hora}`,
      type: 'OCUPACAO',
      title: `Promoção em ${op.campo} às ${String(op.hora).padStart(2, '0')}h`,
      description: `${op.horasOciosas}h ociosas no período, com potencial estimado de ${op.potencialEstimado == null ? 'receita indisponível' : `R$ ${op.potencialEstimado.toFixed(2)}`}.`,
      action: 'Testar promoção controlada nesse horário e comparar ocupação/receita antes e depois.',
      impactEstimated: op.potencialEstimado,
      impactLabel: 'potencial estimado, não realizado',
      confidence: 'BAIXA',
      effort: 'BAIXO',
      evidence: op.premissa,
      period,
      source: ['Rental'],
      premissa: 'Estimativa baseada na receita média por hora efetiva; depende da janela operacional configurada.',
    });
  });

  if (occupancy.available && occupancy.overall.ocupacaoEfetivaPct < 20) {
    recommendations.push({
      id: 'occ-low',
      type: 'OCUPACAO',
      title: 'Ocupação abaixo de 20%',
      description: `Ocupação efetiva de ${occupancy.overall.ocupacaoEfetivaPct.toFixed(1)}% no período.`,
      action: 'Revisar preços e pacotes dos dias/horários com menor procura; validar a janela operacional real.',
      impactEstimated: null,
      impactLabel: 'impacto não estimado sem custo/elasticidade',
      confidence: 'MEDIA',
      effort: 'MEDIO',
      priorityScore: 0,
      evidence: occupancy.config.note,
      period,
      source: ['Rental'],
      premissa: 'Não há modelo de elasticidade preço-demanda; a recomendação é consultiva.',
    });
  }

  product.menoresMargens.slice(0, 5).forEach(p => {
    const negative = (p.margemContribuicao || 0) < 0;
    addRecommendation(recommendations, {
      id: `product-${p.productId}`,
      type: 'PRODUTO',
      title: `${negative ? 'Margem negativa' : 'Revisar margem'}: ${p.produto}`,
      description: `Margem realizada de ${p.margemPct == null ? 'indisponível' : `${p.margemPct.toFixed(1)}%`} e contribuição de ${p.margemContribuicao == null ? 'indisponível' : `R$ ${p.margemContribuicao.toFixed(2)}`}.`,
      action: 'Revisar preço e custo de aquisição; validar a margem após completar o custo histórico.',
      impactEstimated: negative ? round2(Math.abs(p.margemContribuicao || 0)) : null,
      impactLabel: negative ? 'perda realizada no período' : 'impacto depende de novo preço/custo',
      confidence: p.custoIncompleto ? 'BAIXA' : 'ALTA',
      effort: 'MEDIO',
      evidence: `Receita líquida R$ ${p.receitaLiquida.toFixed(2)}, CMV R$ ${p.cmv.toFixed(2)}.`,
      period,
      source: ['OrderItem', 'StockMovement'],
      premissa: 'Margem realizada com CMV snapshot; não desconta outras despesas variáveis.',
    });
  });

  const currentExpenses = currentOfficial.dre.despesas || {};
  const previousExpenses = previousOfficial.dre?.despesas || {};
  Object.entries(currentExpenses).forEach(([category, value]) => {
    const old = Number(previousExpenses[category] || 0);
    if (!old || old <= 0) return;
    const change = ((value - old) / old) * 100;
    if (change < 10) return;
    addRecommendation(recommendations, {
      id: `expense-${category}`,
      type: 'DESPESA',
      title: `Despesa em alta: ${category}`,
      description: `Subiu ${change.toFixed(1)}% (${old.toFixed(2)} -> ${value.toFixed(2)}) contra o mês anterior.`,
      action: 'Revisar contratos/consumo e negociar; validar se o aumento é pontual ou recorrente.',
      impactEstimated: round2(value - old),
      impactLabel: 'aumento realizado vs mês anterior',
      confidence: 'ALTA',
      effort: 'MEDIO',
      evidence: `Categoria ${category}; fonte DRE oficial.`,
      period,
      source: ['FinancialEntry', 'FinancialPeriodClose'],
      premissa: 'Comparação simples entre categorias; não considera sazonalidade ou mudança de escopo.',
    });
  });

  recommendations.sort((a, b) => b.priorityScore - a.priorityScore);
  return {
    available: recommendations.length > 0,
    reason: recommendations.length ? undefined : 'Nenhuma recomendação pelos critérios e dados atuais.',
    period,
    label: formatMonthLabel(period),
    regime,
    recommendations,
    criteria: {
      note: 'Prioridade = impacto estimado x peso de confiança x peso de facilidade. Impactos nulos ou não realizados ficam com prioridade 0. Recomendações são consultivas. Potenciais de horários diferentes não são aditivos.',
      confidenceWeights: { ALTA: 1, MEDIA: 0.65, BAIXA: 0.35 },
      effortWeights: { BAIXO: 1, MEDIO: 0.7, ALTO: 0.4 },
    },
    sources: Array.from(sources),
    note: 'Nenhuma recomendação altera preços, estoque, agenda ou financeiro automaticamente.',
  };
}

export async function getStrategicRecommendationsCached(period: string, regime: FinancialRegime, forceRefresh = false): Promise<RecommendationsReport> {
  const key = `strategy-recommendations:${period}:${regime}`;
  if (forceRefresh) {
    const { invalidateCache } = await import('./intelligence-cache');
    invalidateCache(key);
  }
  return cacheWrap(key, managementTtlMs(period, currentCuiabaMonth()), () => getStrategicRecommendations(period, regime));
}


