import type { DreResultado } from './dre';
import {
  currentCuiabaMonth,
  formatMonthLabel,
  getFinancialMonth,
  getFinancialSeries,
  isMonthKey,
  monthRange,
  previousMonth,
  type FinancialRegime,
  type OfficialFinancialMonth,
} from './official-financials';
import {
  getInventoryReconciliationReport,
  getOccupancyReport,
  getProductContributionReport,
  getRevenueMixReport,
  type InventoryReconciliationReport,
  type OccupancyReport,
  type ProductContributionReport,
  type RevenueMixReport,
} from './commercial-analytics';
import { cacheWrap, managementTtlMs } from './intelligence-cache';
import { NEW_RULES_EFFECTIVE_LABEL, methodologyNoteForPeriod, rulesVersionForPeriod, type RulesVersion } from './effective-rules';

export interface ManagementRow {
  period: string;
  label: string;
  status: 'OPEN' | 'CLOSED';
  version: number | null;
  source: 'snapshot' | 'live' | 'unavailable';
  available: boolean;
  reason?: string;
  revenue: number | null;
  cmv: number | null;
  expenses: number | null;
  grossProfit: number | null;
  operatingResult: number | null;
  netResult: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  occupancyPct: number | null;
  occupancyAvailable: boolean;
  rentalRevenue: number | null;
  extraHours: number | null;
  extraRevenue: number | null;
  extraReservations: number | null;
  productRevenue: number | null;
  totalCommercialRevenue: number | null;
  productContribution: number | null;
  productMarginPct: number | null;
  negativeProductMargins: number;
  reconDivergentProducts: number | null;
  reconUncostedQty: number | null;
  commercialSource: 'live' | 'unavailable';
  rulesVersion: RulesVersion;
  methodologyNote: string;
  sources: string[];
}

export interface ManagementAlert {
  id: string;
  kind: 'REVENUE_DROP' | 'EXPENSE_RISE' | 'MARGIN_DROP' | 'LOW_OCCUPANCY' | 'NEGATIVE_PRODUCT_MARGIN' | 'INVENTORY_INCONSISTENCY' | 'OPEN_PERIOD' | 'NO_DATA';
  severity: 'ALTA' | 'MEDIA' | 'BAIXA';
  title: string;
  description: string;
  evidence: string;
  period: string;
  source: string[];
  threshold: string;
}

export interface ManagementCriteria {
  revenueDropPct: number;
  expenseIncreasePct: number;
  marginDropPts: number;
  minOccupancyPct: number;
  negativeProductMargins: number;
  reconDivergentProducts: number;
  reconUncostedQty: number;
  note: string;
}

export const DEFAULT_MANAGEMENT_CRITERIA: ManagementCriteria = {
  revenueDropPct: 10,
  expenseIncreasePct: 10,
  marginDropPts: 2,
  minOccupancyPct: 20,
  negativeProductMargins: 1,
  reconDivergentProducts: 1,
  reconUncostedQty: 1,
  note: 'Limiares gerenciais padrão: queda de receita >=10%, aumento de despesas >=10%, queda de margem >=2 pontos, ocupação <20%, margem negativa de produto, divergência de conciliação. Ajuste conforme a política da empresa.',
};

export interface ManagementHistory {
  regime: FinancialRegime;
  months: number;
  endPeriod: string;
  generatedAt: string;
  rows: ManagementRow[];
  alerts: ManagementAlert[];
  criteria: ManagementCriteria;
  sources: string[];
  note: string;
}

export interface ManagementComparison {
  regime: FinancialRegime;
  current: ManagementRow;
  previous: ManagementRow;
  currentPeriod: string;
  previousPeriod: string;
  comparisonAvailable: boolean;
  comparisonNote: string;
  deltas: {
    revenue: number | null;
    cmv: number | null;
    expenses: number | null;
    grossProfit: number | null;
    operatingResult: number | null;
    netResult: number | null;
    grossMarginPts: number | null;
    netMarginPts: number | null;
    occupancyPts: number | null;
    productMarginPts: number | null;
    rentalRevenue: number | null;
    productRevenue: number | null;
  };
  drivers: string[];
  alerts: ManagementAlert[];
  currentReconciliation: InventoryReconciliationReport | null;
  criteria: ManagementCriteria;
  sources: string[];
  generatedAt: string;
  note: string;
}

function num(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) * 100) / 100;
}

function sourceFor(official: OfficialFinancialMonth): 'snapshot' | 'live' | 'unavailable' {
  if (official.source === 'snapshot') return 'snapshot';
  if (official.source === 'live') return 'live';
  return 'unavailable';
}

function rowFrom(
  official: OfficialFinancialMonth,
  occupancy: OccupancyReport | null,
  mix: RevenueMixReport | null,
  product: ProductContributionReport | null
): ManagementRow {
  if (!official.dre) {
    return {
      period: official.period,
      label: official.label,
      status: official.status,
      version: official.version,
      source: 'unavailable',
      available: false,
      reason: official.unavailableReason,
      revenue: null,
      cmv: null,
      expenses: null,
      grossProfit: null,
      operatingResult: null,
      netResult: null,
      grossMargin: null,
      netMargin: null,
      occupancyPct: null,
      occupancyAvailable: false,
      rentalRevenue: null,
      extraHours: null,
      extraRevenue: null,
      extraReservations: null,
      productRevenue: null,
      totalCommercialRevenue: null,
      productContribution: null,
      productMarginPct: null,
      negativeProductMargins: 0,
      reconDivergentProducts: null,
      reconUncostedQty: null,
      commercialSource: 'unavailable',
      rulesVersion: rulesVersionForPeriod(official.period),
      methodologyNote: methodologyNoteForPeriod(official.period),
      sources: [],
    };
  }

  const dre = official.dre as DreResultado;
  return {
    period: official.period,
    label: official.label,
    status: official.status,
    version: official.version,
    source: sourceFor(official),
    available: true,
    revenue: num(dre.totalReceitas),
    cmv: num(dre.cmv),
    expenses: num(dre.totalDespesasOp + dre.impostos + dre.despesasFinanceiras),
    grossProfit: num(dre.lucroBruto),
    operatingResult: num(dre.ebitda),
    netResult: num(dre.resultadoLiquido),
    grossMargin: num(dre.margemBruta),
    netMargin: num(dre.margemLiquida),
    occupancyPct: occupancy?.available ? num(occupancy.overall.ocupacaoEfetivaPct) : null,
    occupancyAvailable: !!occupancy?.available,
    rentalRevenue: mix?.available ? num(mix.aluguelComandas) : null,
    extraHours: occupancy?.available ? num(occupancy.overall.extraHoras) : null,
    extraRevenue: occupancy?.available ? num(occupancy.overall.extraReceita) : null,
    extraReservations: occupancy?.available ? occupancy.overall.extraReservas ?? 0 : null,
    productRevenue: mix?.available ? num(mix.produtosComandas) : null,
    totalCommercialRevenue: mix?.available ? num(mix.totalComandas) : null,
    productContribution: product?.available ? num(product.margemContribuicaoTotal) : null,
    productMarginPct: product?.available ? num(product.margemPct) : null,
    negativeProductMargins: product?.available ? product.produtos.filter(p => (p.margemPct ?? 0) < 0).length : 0,
    reconDivergentProducts: null,
    reconUncostedQty: null,
    commercialSource: occupancy || mix || product ? 'live' : 'unavailable',
    rulesVersion: rulesVersionForPeriod(official.period),
    methodologyNote: methodologyNoteForPeriod(official.period),
    sources: [
      ...(official.source === 'snapshot' ? ['FinancialPeriodClose', 'FinancialPeriodAudit'] : ['Payment', 'Order', 'StockMovement', 'FinancialEntry']),
      ...(occupancy?.available ? ['Rental'] : []),
      ...(mix?.available ? ['OrderItem', 'Rental'] : []),
      ...(product?.available ? ['OrderItem', 'StockMovement'] : []),
    ],
  };
}

function compareChange(current: ManagementRow, previous: ManagementRow) {
  const delta = (a: number | null, b: number | null) => a == null || b == null ? null : num(a - b);
  return {
    revenue: delta(current.revenue, previous.revenue),
    cmv: delta(current.cmv, previous.cmv),
    expenses: delta(current.expenses, previous.expenses),
    grossProfit: delta(current.grossProfit, previous.grossProfit),
    operatingResult: delta(current.operatingResult, previous.operatingResult),
    netResult: delta(current.netResult, previous.netResult),
    grossMarginPts: delta(current.grossMargin, previous.grossMargin),
    netMarginPts: delta(current.netMargin, previous.netMargin),
    occupancyPts: delta(current.occupancyPct, previous.occupancyPct),
    productMarginPts: delta(current.productMarginPct, previous.productMarginPct),
    rentalRevenue: delta(current.rentalRevenue, previous.rentalRevenue),
    productRevenue: delta(current.productRevenue, previous.productRevenue),
  };
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return num(((current - previous) / Math.abs(previous)) * 100);
}

export function buildManagementAlerts(
  rows: ManagementRow[],
  criteria: ManagementCriteria = DEFAULT_MANAGEMENT_CRITERIA,
  reconciliation?: InventoryReconciliationReport | null
): ManagementAlert[] {
  const alerts: ManagementAlert[] = [];
  const availableRows = rows.filter(r => r.available);
  const latestOpen = [...availableRows].reverse().find(r => r.status === 'OPEN');
  if (latestOpen) {
    alerts.push({
      id: `open-${latestOpen.period}`,
      kind: 'OPEN_PERIOD',
      severity: 'BAIXA',
      title: 'Mês em aberto',
      description: `${latestOpen.label} está em aberto; os valores são dinâmicos e podem mudar com novos lançamentos.`,
      evidence: `Fonte: ${latestOpen.source}; regime do relatório.`,
      period: latestOpen.period,
      source: latestOpen.sources,
      threshold: 'status do fechamento',
    });
  }

  const closed = availableRows.filter(r => r.status === 'CLOSED').sort((a, b) => a.period.localeCompare(b.period));
  for (let i = 1; i < closed.length; i++) {
    const previous = closed[i - 1];
    const current = closed[i];
    const revenueChange = pctChange(current.revenue, previous.revenue);
    if (revenueChange != null && revenueChange <= -criteria.revenueDropPct) {
      alerts.push({ id: `revenue-${current.period}`, kind: 'REVENUE_DROP', severity: 'ALTA', title: 'Queda de faturamento', description: `Receita caiu ${Math.abs(revenueChange).toFixed(1)}% em ${current.label} vs ${previous.label}.`, evidence: `Receita: ${previous.revenue} -> ${current.revenue}. Fonte: ${current.source}.`, period: current.period, source: current.sources, threshold: `queda >= ${criteria.revenueDropPct}%` });
    }
    const expenseChange = pctChange(current.expenses, previous.expenses);
    if (expenseChange != null && expenseChange >= criteria.expenseIncreasePct) {
      alerts.push({ id: `expense-${current.period}`, kind: 'EXPENSE_RISE', severity: 'MEDIA', title: 'Aumento de despesas', description: `Despesas subiram ${expenseChange.toFixed(1)}% em ${current.label} vs ${previous.label}.`, evidence: `Despesas: ${previous.expenses} -> ${current.expenses}.`, period: current.period, source: current.sources, threshold: `aumento >= ${criteria.expenseIncreasePct}%` });
    }
    const marginChange = current.netMargin != null && previous.netMargin != null ? current.netMargin - previous.netMargin : null;
    if (marginChange != null && marginChange <= -criteria.marginDropPts) {
      alerts.push({ id: `margin-${current.period}`, kind: 'MARGIN_DROP', severity: 'ALTA', title: 'Queda de margem líquida', description: `Margem líquida caiu ${Math.abs(marginChange).toFixed(1)} pontos em ${current.label} vs ${previous.label}.`, evidence: `Margem: ${previous.netMargin}% -> ${current.netMargin}%.`, period: current.period, source: current.sources, threshold: `queda >= ${criteria.marginDropPts} pontos` });
    }
  }

  const latest = availableRows[availableRows.length - 1];
  if (latest?.occupancyAvailable && latest.occupancyPct != null && latest.occupancyPct < criteria.minOccupancyPct) {
    alerts.push({ id: `occupancy-${latest.period}`, kind: 'LOW_OCCUPANCY', severity: 'MEDIA', title: 'Baixa ocupação das quadras', description: `Ocupação efetiva de ${latest.occupancyPct.toFixed(1)}% em ${latest.label}, abaixo do limite de ${criteria.minOccupancyPct}%.`, evidence: 'Calculada por campo/dia/hora sobre a janela operacional configurada.', period: latest.period, source: ['Rental'], threshold: `ocupação < ${criteria.minOccupancyPct}%` });
  }
  if (latest && latest.negativeProductMargins >= criteria.negativeProductMargins) {
    alerts.push({ id: `negative-product-${latest.period}`, kind: 'NEGATIVE_PRODUCT_MARGIN', severity: 'MEDIA', title: 'Produtos com margem negativa', description: `${latest.negativeProductMargins} produto(s) com margem de contribuição negativa em ${latest.label}.`, evidence: 'Margem realizada = receita líquida - CMV snapshot.', period: latest.period, source: ['OrderItem', 'StockMovement'], threshold: `>= ${criteria.negativeProductMargins} produto(s)` });
  }
  if (reconciliation?.available && reconciliation.produtosComDivergencia >= criteria.reconDivergentProducts) {
    alerts.push({ id: `recon-${latest?.period || 'current'}`, kind: 'INVENTORY_INCONSISTENCY', severity: 'MEDIA', title: 'Possível inconsistência de estoque', description: `${reconciliation.produtosComDivergencia} produto(s) com diferença entre comandas e saídas; ${reconciliation.quantidadeDivergente} unidade(s).`, evidence: 'Diferença não é perda automaticamente; pode ser venda sem baixa, transferência ou recorte temporal.', period: latest?.period || 'current', source: ['OrderItem', 'StockMovement'], threshold: `>= ${criteria.reconDivergentProducts} produto(s)` });
  }
  if (reconciliation?.available && reconciliation.quantidadeSemCusto >= criteria.reconUncostedQty) {
    alerts.push({ id: `uncosted-${latest?.period || 'current'}`, kind: 'INVENTORY_INCONSISTENCY', severity: 'ALTA', title: 'Saídas sem custo histórico', description: `${reconciliation.quantidadeSemCusto} unidade(s) de saída sem custo snapshot; margem pode estar incompleta.`, evidence: 'CMV não usa custo atual como substituto.', period: latest?.period || 'current', source: ['StockMovement'], threshold: `>= ${criteria.reconUncostedQty} unidade(s)` });
  }

  return alerts;
}

export function buildComparacaoRows(
  current: OfficialFinancialMonth,
  previous: OfficialFinancialMonth,
  currentOccupancy: OccupancyReport,
  previousOccupancy: OccupancyReport,
  currentMix: RevenueMixReport,
  previousMix: RevenueMixReport,
  currentProduct: ProductContributionReport,
  previousProduct: ProductContributionReport
): ManagementComparison {
  const currentRow = rowFrom(current, currentOccupancy, currentMix, currentProduct);
  const previousRow = rowFrom(previous, previousOccupancy, previousMix, previousProduct);
  const deltas = compareChange(currentRow, previousRow);
  const comparisonAvailable = currentRow.available && previousRow.available;
  const drivers: string[] = [];
  if (comparisonAvailable) {
    if (deltas.revenue != null && deltas.revenue !== 0) drivers.push(`Receita ${deltas.revenue > 0 ? 'subiu' : 'caiu'} ${Math.abs(deltas.revenue).toFixed(2)}.`);
    if (deltas.cmv != null && deltas.cmv !== 0) drivers.push(`CMV ${deltas.cmv > 0 ? 'subiu' : 'caiu'} ${Math.abs(deltas.cmv).toFixed(2)}.`);
    if (deltas.expenses != null && deltas.expenses !== 0) drivers.push(`Despesas ${deltas.expenses > 0 ? 'subiram' : 'caíram'} ${Math.abs(deltas.expenses).toFixed(2)}.`);
    if (deltas.occupancyPts != null && deltas.occupancyPts !== 0) drivers.push(`Ocupação ${deltas.occupancyPts > 0 ? 'subiu' : 'caiu'} ${Math.abs(deltas.occupancyPts).toFixed(1)} pontos.`);
    if (deltas.productMarginPts != null && deltas.productMarginPts !== 0) drivers.push(`Margem de produtos ${deltas.productMarginPts > 0 ? 'subiu' : 'caiu'} ${Math.abs(deltas.productMarginPts).toFixed(1)} pontos.`);
    if (deltas.rentalRevenue != null && deltas.rentalRevenue !== 0) drivers.push(`Receita de aluguel ${deltas.rentalRevenue > 0 ? 'subiu' : 'caiu'} ${Math.abs(deltas.rentalRevenue).toFixed(2)} nas comandas.`);
  }
  const methodologyChange = currentRow.rulesVersion !== previousRow.rulesVersion
    ? ` Atenção: a comparação cruza ${NEW_RULES_EFFECTIVE_LABEL}; ${currentRow.methodologyNote}`
    : '';
  const comparisonNote = !comparisonAvailable
    ? 'Comparação indisponível: um dos meses não possui dados suficientes.'
    : current.status === 'CLOSED' && previous.status === 'CLOSED'
      ? 'Comparação entre dois meses fechados, com DRE oficial e comercial ao vivo.'
      : current.status === 'OPEN'
        ? 'Mês atual em aberto: os valores são dinâmicos, não um fechamento oficial; a comparação é gerencial.'
        : 'Mês anterior em aberto: usa cálculo ao vivo, não snapshot fechado.';
  return {
    regime: current.requestedRegime,
    current: currentRow,
    previous: previousRow,
    currentPeriod: current.period,
    previousPeriod: previous.period,
    comparisonAvailable,
    comparisonNote: `${comparisonNote}${methodologyChange}`,
    deltas,
    drivers,
    alerts: buildManagementAlerts([previousRow, currentRow]),
    currentReconciliation: null,
    criteria: DEFAULT_MANAGEMENT_CRITERIA,
    sources: ['FinancialPeriodClose', 'FinancialPeriodAudit', 'Rental', 'OrderItem', 'StockMovement'],
    generatedAt: new Date().toISOString(),
    note: 'DRE oficial: snapshot para fechados e cálculo ao vivo para abertos. Comercial: comandas fechadas e agenda operacional; agenda não soma ao DRE.',
  };
}

export function buildManagementHistoryRows(
  financial: OfficialFinancialMonth[],
  commercial: { occupancy: OccupancyReport; mix: RevenueMixReport; product: ProductContributionReport }[]
): ManagementRow[] {
  return financial.map((month, index) => {
    const c = commercial[index];
    return rowFrom(month, c?.occupancy || null, c?.mix || null, c?.product || null);
  });
}

async function commercialFor(period: string): Promise<{ occupancy: OccupancyReport; mix: RevenueMixReport; product: ProductContributionReport }> {
  const range = monthRange(period, { capToToday: true });
  const [occupancy, mix, product] = await Promise.all([
    getOccupancyReport(range.from, range.to),
    getRevenueMixReport(range.from, range.to),
    getProductContributionReport(range.from, range.to),
  ]);
  return { occupancy, mix, product };
}

export async function getManagementHistory(
  endPeriod: string,
  months = 6,
  regime: FinancialRegime = 'competence'
): Promise<ManagementHistory> {
  if (!isMonthKey(endPeriod)) throw new Error('Período inválido. Use AAAA-MM.');
  const count = Math.max(1, Math.min(24, Math.floor(months) || 6));
  const financial = await getFinancialSeries(endPeriod, count, regime);
  const commercial = await Promise.all(financial.map(m => commercialFor(m.period)));
  const rows = buildManagementHistoryRows(financial, commercial);
  const alerts = buildManagementAlerts(rows);
  return {
    regime,
    months: count,
    endPeriod,
    generatedAt: new Date().toISOString(),
    rows,
    alerts,
    criteria: DEFAULT_MANAGEMENT_CRITERIA,
    sources: ['FinancialPeriodClose', 'FinancialPeriodAudit', 'Payment', 'Order', 'StockMovement', 'FinancialEntry', 'Rental', 'OrderItem'],
    note: 'Histórico financeiro oficial (snapshot em meses fechados, ao vivo em abertos) + comercial ao vivo. Ocupação usa a janela operacional configurada.',
  };
}

export async function getManagementComparison(
  currentPeriod: string,
  previousPeriod: string,
  regime: FinancialRegime = 'competence'
): Promise<ManagementComparison> {
  if (!isMonthKey(currentPeriod) || !isMonthKey(previousPeriod)) throw new Error('Período inválido. Use AAAA-MM.');
  const [current, previous, currentCommercial, previousCommercial] = await Promise.all([
    getFinancialMonth(currentPeriod, regime),
    getFinancialMonth(previousPeriod, regime),
    commercialFor(currentPeriod),
    commercialFor(previousPeriod),
  ]);
  const range = monthRange(currentPeriod, { capToToday: true });
  const reconciliation = await getInventoryReconciliationReport(range.from, range.to);
  const comparison = buildComparacaoRows(current, previous, currentCommercial.occupancy, previousCommercial.occupancy, currentCommercial.mix, previousCommercial.mix, currentCommercial.product, previousCommercial.product);
  comparison.currentReconciliation = reconciliation;
  comparison.alerts = buildManagementAlerts([comparison.previous, comparison.current], DEFAULT_MANAGEMENT_CRITERIA, reconciliation);
  return comparison;
}

export async function getManagementHistoryCached(
  endPeriod: string,
  months: number,
  regime: FinancialRegime,
  forceRefresh = false
): Promise<ManagementHistory> {
  const key = `management-history:${endPeriod}:${months}:${regime}`;
  if (forceRefresh) {
    const { invalidateCache } = await import('./intelligence-cache');
    invalidateCache(key);
  }
  return cacheWrap(key, managementTtlMs(endPeriod, currentCuiabaMonth()), () => getManagementHistory(endPeriod, months, regime));
}

export async function getManagementComparisonCached(
  currentPeriod: string,
  previousPeriod: string,
  regime: FinancialRegime,
  forceRefresh = false
): Promise<ManagementComparison> {
  const key = `management-comparison:${currentPeriod}:${previousPeriod}:${regime}`;
  if (forceRefresh) {
    const { invalidateCache } = await import('./intelligence-cache');
    invalidateCache(key);
  }
  const ttl = managementTtlMs(currentPeriod, currentCuiabaMonth());
  return cacheWrap(key, ttl, () => getManagementComparison(currentPeriod, previousPeriod, regime));
}

export function formatManagementPeriod(period: string): string {
  return formatMonthLabel(period);
}

export function previousManagementPeriod(period: string): string {
  return previousMonth(period);
}
