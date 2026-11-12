import { isFut5, isFut7, round2 } from './analytics';
import { isMonthKey, monthRange } from './official-financials';
import { NEW_RULES_EFFECTIVE_LABEL, NEW_RULES_EFFECTIVE_PERIOD, isNewRulesPeriod, rulesVersionForPeriod, type RulesVersion } from './effective-rules';
import { prisma } from './prisma';

export interface CostCenterRow {
  code: string;
  name: string;
  receita: number;
  horas: number;
  custoAlocado: number;
  custoPlanejado: number | null;
  margemContribuicao: number | null;
  margemPct: number | null;
  temCusto: boolean;
}

export interface CostCenterReport {
  available: boolean;
  period: string;
  reason?: string;
  rows: CostCenterRow[];
  totalReceitaQuadras: number;
  totalCustoAlocado: number;
  totalResultadoQuadras: number | null;
  totalHorasQuadras: number;
  hasAllocation: boolean;
  hasRule: boolean;
  rulesVersion: RulesVersion;
  rulesEffectiveFrom: string;
  note: string;
  source: ['CostCenter', 'CostAllocation', 'OperatingCostRule', 'Rental'];
}

const QUADRA_CODES = new Set(['FUT5', 'FUT7']);

function plannedCost(rule: { type: string; amount: number; ratePerHour: number | null }, hours: number): number {
  if (rule.type === 'FIXED_MONTHLY' || rule.type === 'SHARED') return Number(rule.amount) || 0;
  if (rule.type === 'VARIABLE_PER_HOUR') return hours * (Number(rule.ratePerHour) || 0);
  return 0;
}

function ruleAppliesToPeriod(
  rule: { effectiveFrom: Date | null; effectiveTo: Date | null },
  from: Date,
  to: Date
): boolean {
  if (rule.effectiveFrom && rule.effectiveFrom > to) return false;
  if (rule.effectiveTo && rule.effectiveTo < from) return false;
  return true;
}

export async function getCostCenterReport(period: string): Promise<CostCenterReport> {
  if (!isMonthKey(period)) throw new Error('Periodo invalido. Use YYYY-MM.');
  const range = monthRange(period);

  if (!isNewRulesPeriod(period)) {
    return {
      available: false,
      period,
      reason: `As regras de custos, rateio e rentabilidade vigoram a partir de ${NEW_RULES_EFFECTIVE_LABEL}. Este período permanece na metodologia histórica e não recebe alocações novas.`,
      rows: [],
      totalReceitaQuadras: 0,
      totalCustoAlocado: 0,
      totalResultadoQuadras: null,
      totalHorasQuadras: 0,
      hasAllocation: false,
      hasRule: false,
      rulesVersion: 'LEGACY',
      rulesEffectiveFrom: NEW_RULES_EFFECTIVE_PERIOD,
      note: 'Sem alocação: as novas regras de custo não são aplicadas a períodos anteriores a novembro/2026.',
      source: ['CostCenter', 'CostAllocation', 'OperatingCostRule', 'Rental'],
    };
  }

  const [centers, rentals] = await Promise.all([
    prisma.costCenter.findMany({
      where: { isActive: true },
      include: {
        allocations: { where: { period } },
        rules: { where: { isActive: true } },
      },
      orderBy: { code: 'asc' },
    }),
    prisma.rental.findMany({
      where: {
        status: 'PAID',
        startTime: { lt: range.to },
        endTime: { gt: range.from },
      },
      select: { resource: true, startTime: true, endTime: true, totalAmount: true, status: true },
    }),
  ]);

  const byField = new Map<string, { receita: number; minutes: number }>();
  rentals.forEach((rental) => {
    const field = isFut5(rental.resource) ? 'FUT5' : isFut7(rental.resource) ? 'FUT7' : null;
    if (!field) return;
    const current = byField.get(field) || { receita: 0, minutes: 0 };
    current.receita += Number(rental.totalAmount) || 0;
    current.minutes += Math.max(0, (new Date(rental.endTime).getTime() - new Date(rental.startTime).getTime()) / 60000);
    byField.set(field, current);
  });

  let hasAllocation = false;
  let hasRule = false;
  const rows = centers.map((center) => {
    const allocation = center.allocations.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const allocationCount = center.allocations.length;
    const field = byField.get(center.code);
    const receita = QUADRA_CODES.has(center.code) ? (field?.receita || 0) : 0;
    const horas = QUADRA_CODES.has(center.code) ? round2((field?.minutes || 0) / 60) : 0;
    const periodRules = center.rules.filter((rule) => ruleAppliesToPeriod(rule, range.from, range.to));
    const ruleCost = periodRules.length > 0
      ? periodRules.reduce((sum, rule) => sum + plannedCost(rule, horas), 0)
      : null;
    const temCusto = allocationCount > 0;
    const margem = temCusto ? receita - allocation : null;

    if (allocationCount > 0) hasAllocation = true;
    if (center.rules.length > 0) hasRule = true;

    return {
      code: center.code,
      name: center.name,
      receita: round2(receita),
      horas,
      custoAlocado: round2(allocation),
      custoPlanejado: ruleCost == null ? null : round2(ruleCost),
      margemContribuicao: margem == null ? null : round2(margem),
      margemPct: margem != null && receita > 0 ? round2((margem / receita) * 100) : null,
      temCusto,
    };
  });

  const quadras = rows.filter(row => QUADRA_CODES.has(row.code));
  const totalReceitaQuadras = quadras.reduce((sum, row) => sum + row.receita, 0);
  const totalCustoAlocado = rows.reduce((sum, row) => sum + row.custoAlocado, 0);
  const quadrasComCusto = quadras.every(row => row.temCusto);
  const totalResultadoQuadras = quadrasComCusto
    ? quadras.reduce((sum, row) => sum + (row.margemContribuicao || 0), 0)
    : null;

  return {
    available: hasAllocation,
    period,
    reason: hasAllocation
      ? undefined
      : 'Nenhuma alocacao de custo realizada para o periodo. Regras planejadas, quando existirem, nao substituem custo realizado.',
    rows,
    totalReceitaQuadras: round2(totalReceitaQuadras),
    totalCustoAlocado: round2(totalCustoAlocado),
    totalResultadoQuadras: totalResultadoQuadras == null ? null : round2(totalResultadoQuadras),
    totalHorasQuadras: round2(quadras.reduce((sum, row) => sum + row.horas, 0)),
    hasAllocation,
    hasRule,
    rulesVersion: rulesVersionForPeriod(period),
    rulesEffectiveFrom: NEW_RULES_EFFECTIVE_PERIOD,
    note: 'Custo alocado vem de CostAllocation; custo planejado vem de OperatingCostRule e nao e resultado realizado. Receita e horas de quadras usam somente reservas PAID; BAR/ADMIN nao possuem receita atribuida.',
    source: ['CostCenter', 'CostAllocation', 'OperatingCostRule', 'Rental'],
  };
}

export interface CostCenterAdminEntry {
  id: string;
  description: string;
  category: string;
  amount: number;
  allocated: number;
  available: number;
  status: string;
  dueDate: Date | null;
  competenceDate: Date | null;
}

export interface CostCenterAdminAllocation {
  id: string;
  financialEntryId: string;
  financialEntryDescription: string;
  costCenterId: string;
  costCenterCode: string;
  costCenterName: string;
  period: string;
  amount: number;
  driver: string;
  note: string | null;
}

export interface CostCenterAdminRule {
  id: string;
  costCenterId: string;
  costCenterCode: string;
  costCenterName: string;
  type: string;
  amount: number;
  ratePerHour: number | null;
  driver: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  isActive: boolean;
}

export interface CostCenterAdminData {
  period: string;
  centers: { id: string; code: string; name: string }[];
  entries: CostCenterAdminEntry[];
  allocations: CostCenterAdminAllocation[];
  rules: CostCenterAdminRule[];
}

export async function getCostCenterAdminData(period: string): Promise<CostCenterAdminData> {
  if (!isMonthKey(period)) throw new Error('Periodo invalido. Use YYYY-MM.');
  if (!isNewRulesPeriod(period)) {
    throw new Error(`As regras de custos vigoram a partir de ${NEW_RULES_EFFECTIVE_LABEL}.`);
  }
  const range = monthRange(period);

  const [centers, entries, allocations, rules] = await Promise.all([
    prisma.costCenter.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
    prisma.financialEntry.findMany({
      where: {
        type: 'PAYABLE',
        status: { not: 'CANCELED' },
        OR: [
          { competenceDate: { gte: range.from, lte: range.to } },
          { competenceDate: null, dueDate: { gte: range.from, lte: range.to } },
          { costAllocations: { some: { period } } },
        ],
      },
      select: {
        id: true,
        description: true,
        category: true,
        amount: true,
        status: true,
        dueDate: true,
        competenceDate: true,
        costAllocations: { select: { amount: true } },
      },
      orderBy: [{ competenceDate: 'desc' }, { dueDate: 'desc' }],
      take: 500,
    }),
    prisma.costAllocation.findMany({
      where: { period },
      include: {
        financialEntry: { select: { description: true } },
        costCenter: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.operatingCostRule.findMany({
      include: { costCenter: { select: { code: true, name: true } } },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  return {
    period,
    centers,
    entries: entries.map((entry) => {
      const allocated = entry.costAllocations.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      return {
        id: entry.id,
        description: entry.description,
        category: entry.category,
        amount: round2(entry.amount),
        allocated: round2(allocated),
        available: round2(entry.amount - allocated),
        status: entry.status,
        dueDate: entry.dueDate,
        competenceDate: entry.competenceDate,
      };
    }),
    allocations: allocations.map((allocation) => ({
      id: allocation.id,
      financialEntryId: allocation.financialEntryId,
      financialEntryDescription: allocation.financialEntry.description,
      costCenterId: allocation.costCenterId,
      costCenterCode: allocation.costCenter.code,
      costCenterName: allocation.costCenter.name,
      period: allocation.period,
      amount: round2(allocation.amount),
      driver: allocation.driver,
      note: allocation.note,
    })),
    rules: rules.map((rule) => ({
      id: rule.id,
      costCenterId: rule.costCenterId,
      costCenterCode: rule.costCenter.code,
      costCenterName: rule.costCenter.name,
      type: rule.type,
      amount: round2(rule.amount),
      ratePerHour: rule.ratePerHour == null ? null : round2(rule.ratePerHour),
      driver: rule.driver,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      isActive: rule.isActive,
    })),
  };
}
