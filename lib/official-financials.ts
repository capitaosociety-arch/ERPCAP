import { prisma } from './prisma';
import { buildDreAccrualFromData, buildDreCashFromData, computeDre, computeDreAccrual, type DreResultado } from './dre';
import { getCuiabaDateStr } from './analytics';

export type FinancialRegime = 'cash' | 'competence';
export type FinancialMonthStatus = 'OPEN' | 'CLOSED';
export type FinancialSource = 'snapshot' | 'live' | 'unavailable';

export interface FinancialRange {
  period: string;
  from: Date;
  to: Date;
  prevPeriod: string;
  prevFrom: Date;
  prevTo: Date;
  label: string;
}

export interface OfficialFinancialMonth {
  period: string;
  label: string;
  status: FinancialMonthStatus;
  version: number | null;
  primaryRegime: FinancialRegime | null;
  requestedRegime: FinancialRegime;
  dre: DreResultado | null;
  availableRegimes: FinancialRegime[];
  isSnapshot: boolean;
  source: FinancialSource;
  closedAt: string | null;
  unavailableReason?: string;
}

export function isMonthKey(value: unknown): value is string {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

export function currentCuiabaMonth(): string {
  return getCuiabaDateStr().slice(0, 7);
}

export function previousMonth(period: string): string {
  if (!isMonthKey(period)) throw new Error('Período inválido. Use YYYY-MM.');
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function nextMonth(period: string): string {
  if (!isMonthKey(period)) throw new Error('Período inválido. Use YYYY-MM.');
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(period: string): string {
  if (!isMonthKey(period)) return period;
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  const raw = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Cuiaba',
  }).format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function monthRange(period: string, options: { capToToday?: boolean } = {}): FinancialRange {
  if (!isMonthKey(period)) throw new Error('Período inválido. Use YYYY-MM.');
  const now = new Date();
  const today = getCuiabaDateStr(now);
  const isCurrent = period === today.slice(0, 7);
  const from = new Date(`${period}-01T00:00:00-04:00`);
  const nextPeriod = nextMonth(period);
  const fullTo = new Date(new Date(`${nextPeriod}-01T00:00:00-04:00`).getTime() - 1000);
  const to = options.capToToday && isCurrent
    ? new Date(`${today}T23:59:59-04:00`)
    : fullTo;
  const prevPeriod = previousMonth(period);
  const prevFrom = new Date(`${prevPeriod}-01T00:00:00-04:00`);
  const prevTo = new Date(from.getTime() - 1000);

  return {
    period,
    from,
    to,
    prevPeriod,
    prevFrom,
    prevTo,
    label: formatMonthLabel(period),
  };
}

function availableFromSnapshot(snapshot: any): FinancialRegime[] {
  if (!snapshot?.regimes) return ['cash'];
  const result: FinancialRegime[] = [];
  if (snapshot.regimes.cash) result.push('cash');
  if (snapshot.regimes.competence) result.push('competence');
  return result;
}

/**
 * Fonte oficial de um mês financeiro.
 * - Mês fechado: usa exclusivamente o snapshot da versão vigente.
 * - Mês aberto: usa os mesmos cálculos ao vivo do módulo Financeiro.
 * - Regime indisponível: retorna dre=null, sem recalcular ou inventar.
 */
export async function getFinancialMonth(
  period: string,
  regime: FinancialRegime = 'competence'
): Promise<OfficialFinancialMonth> {
  if (!isMonthKey(period)) throw new Error('Período inválido. Use YYYY-MM.');
  if (regime !== 'cash' && regime !== 'competence') {
    throw new Error('Regime inválido. Use cash ou competence.');
  }

  const close = await prisma.financialPeriodClose.findUnique({ where: { period } });
  const snapshot = close?.snapshot as any;
  const label = formatMonthLabel(period);

  if (close?.status === 'CLOSED' && snapshot) {
    const availableRegimes = availableFromSnapshot(snapshot);
    const primaryRegime = (snapshot.primaryRegime || 'cash') as FinancialRegime;
    const data = snapshot.regimes?.[regime] || (!snapshot.regimes && regime === 'cash' ? snapshot : null);

    if (!data) {
      return {
        period,
        label,
        status: 'CLOSED',
        version: close.version,
        primaryRegime,
        requestedRegime: regime,
        dre: null,
        availableRegimes,
        isSnapshot: true,
        source: 'unavailable',
        closedAt: close.closedAt?.toISOString() || null,
        unavailableReason: `A versão ${close.version} não possui o regime de ${regime === 'cash' ? 'caixa' : 'competência'}. Consulte outro regime ou uma versão retificada.`,
      };
    }

    return {
      period,
      label,
      status: 'CLOSED',
      version: close.version,
      primaryRegime,
      requestedRegime: regime,
      dre: data as DreResultado,
      availableRegimes,
      isSnapshot: true,
      source: 'snapshot',
      closedAt: close.closedAt?.toISOString() || null,
    };
  }

  // O DRE oficial do mês aberto usa o mês completo, igual ao módulo Financeiro.
  // O corte "até hoje" fica reservado para indicadores operacionais, não para o DRE.
  const range = monthRange(period);
  const dre = regime === 'cash'
    ? await computeDre(range.from, range.to)
    : await computeDreAccrual(range.from, range.to);
  const hasData = [
    dre.totalReceitas,
    dre.cmv,
    dre.totalDespesasOp,
    dre.despesasFinanceiras,
    dre.impostos,
  ].some((value) => Math.abs(value) > 0.005);

  if (!hasData) {
    return {
      period,
      label,
      status: 'OPEN',
      version: close?.version ?? null,
      primaryRegime: 'competence',
      requestedRegime: regime,
      dre: null,
      availableRegimes: ['cash', 'competence'],
      isSnapshot: false,
      source: 'unavailable',
      closedAt: null,
      unavailableReason: `Não há dados financeiros suficientes para ${label}.`,
    };
  }

  return {
    period,
    label,
    status: 'OPEN',
    version: close?.version ?? null,
    primaryRegime: 'competence',
    requestedRegime: regime,
    dre,
    availableRegimes: ['cash', 'competence'],
    isSnapshot: false,
    source: 'live',
    closedAt: null,
  };
}

function snapshotMonth(
  period: string,
  close: { status: string; version: number; snapshot: any; closedAt: Date | null },
  regime: FinancialRegime
): OfficialFinancialMonth {
  const label = formatMonthLabel(period);
  const availableRegimes = availableFromSnapshot(close.snapshot);
  const primaryRegime = (close.snapshot?.primaryRegime || 'cash') as FinancialRegime;
  const data = close.snapshot?.regimes?.[regime] || (!close.snapshot?.regimes && regime === 'cash' ? close.snapshot : null);

  if (!data) {
    return {
      period,
      label,
      status: 'CLOSED',
      version: close.version,
      primaryRegime,
      requestedRegime: regime,
      dre: null,
      availableRegimes,
      isSnapshot: true,
      source: 'unavailable',
      closedAt: close.closedAt?.toISOString() || null,
      unavailableReason: `A versão ${close.version} não possui o regime de ${regime === 'cash' ? 'caixa' : 'competência'}. Consulte outro regime ou uma versão retificada.`,
    };
  }

  return {
    period,
    label,
    status: 'CLOSED',
    version: close.version,
    primaryRegime,
    requestedRegime: regime,
    dre: data as DreResultado,
    availableRegimes,
    isSnapshot: true,
    source: 'snapshot',
    closedAt: close.closedAt?.toISOString() || null,
  };
}

type MonthlyTotal = { month: string; total: number };

function monthlyMap(rows: MonthlyTotal[]): Map<string, number> {
  return new Map(rows.map((row) => [row.month, Number(row.total) || 0]));
}

function syntheticStockMovement(value: number, date: Date): any[] {
  if (Math.abs(value) < 0.0000001) return [];
  if (value > 0) {
    return [{
      quantity: value,
      unitCost: 1,
      date,
      type: 'OUT_SALE',
      movementKind: null,
      product: { price: 0, isService: false },
    }];
  }
  return [{
    quantity: Math.abs(value),
    unitCost: 1,
    date,
    type: 'OUT_SALE',
    movementKind: 'RETURN',
    product: { price: 0, isService: false },
  }];
}

export async function getFinancialSeries(
  endPeriod: string,
  months: number,
  regime: FinancialRegime = 'competence'
): Promise<OfficialFinancialMonth[]> {
  const count = Math.max(1, Math.min(24, Math.floor(months) || 6));
  const periods: string[] = [];
  let cursor = endPeriod;
  for (let i = 0; i < count; i++) {
    periods.push(cursor);
    cursor = previousMonth(cursor);
  }
  periods.reverse();

  const ranges = periods.map((period) => monthRange(period));
  const minFrom = ranges[0].from;
  const maxTo = ranges[ranges.length - 1].to;

  const [closes, payments, orders, stockTotals, financialEntries] = await Promise.all([
    prisma.financialPeriodClose.findMany({ where: { period: { in: periods } } }),
    regime === 'cash'
      ? prisma.$queryRaw<MonthlyTotal[]>`
          SELECT to_char("date" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Cuiaba', 'YYYY-MM') AS month,
                 COALESCE(SUM("amount"), 0)::double precision AS total
          FROM "Payment"
          WHERE "date" >= ${minFrom} AND "date" <= ${maxTo}
          GROUP BY 1
        `
      : Promise.resolve([] as MonthlyTotal[]),
    regime === 'competence'
      ? prisma.$queryRaw<MonthlyTotal[]>`
          SELECT to_char("openedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Cuiaba', 'YYYY-MM') AS month,
                 COALESCE(SUM("total" - "discount"), 0)::double precision AS total
          FROM "Order"
          WHERE "status" <> 'CANCELED'
            AND "openedAt" >= ${minFrom} AND "openedAt" <= ${maxTo}
          GROUP BY 1
        `
      : Promise.resolve([] as MonthlyTotal[]),
    prisma.$queryRaw<MonthlyTotal[]>`
      SELECT to_char(m."date" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Cuiaba', 'YYYY-MM') AS month,
             COALESCE(SUM(
               CASE WHEN m."movementKind" = 'RETURN' THEN -1 ELSE 1 END
               * COALESCE(m."unitCost", 0) * m."quantity"
             ), 0)::double precision AS total
      FROM "StockMovement" m
      JOIN "Product" p ON p."id" = m."productId"
      WHERE m."date" >= ${minFrom} AND m."date" <= ${maxTo}
        AND (m."type" = 'OUT_SALE' OR m."movementKind" = 'RETURN')
        AND NOT (p."isService" = true AND m."date" >= '2026-11-01 04:00:00')
      GROUP BY 1
    `,
    prisma.financialEntry.findMany({
      select: {
        type: true,
        amount: true,
        status: true,
        paymentDate: true,
        dueDate: true,
        competenceDate: true,
        category: true,
        entryKind: true,
        description: true,
        notes: true,
      },
    }),
  ]);

  const closeByPeriod = new Map(closes.map((close) => [close.period, close]));
  const paymentByMonth = monthlyMap(payments);
  const orderByMonth = monthlyMap(orders);
  const stockByMonth = monthlyMap(stockTotals);

  return periods.map((period, index) => {
    const range = ranges[index];
    const close = closeByPeriod.get(period);
    if (close?.status === 'CLOSED' && close.snapshot) {
      return snapshotMonth(period, close, regime);
    }

    const syntheticPayments = regime === 'cash'
      ? [{ amount: paymentByMonth.get(period) || 0, date: range.from }]
      : [];
    const syntheticOrders = regime === 'competence'
      ? [{
          total: orderByMonth.get(period) || 0,
          discount: 0,
          openedAt: range.from,
          status: 'CLOSED',
        }]
      : [];
    const syntheticStock = syntheticStockMovement(stockByMonth.get(period) || 0, range.from);

    const dre = regime === 'cash'
      ? buildDreCashFromData(syntheticPayments, syntheticStock, financialEntries, range.from, range.to)
      : buildDreAccrualFromData(syntheticOrders, syntheticStock, financialEntries, range.from, range.to);
    const hasData = [
      dre.totalReceitas,
      dre.cmv,
      dre.totalDespesasOp,
      dre.despesasFinanceiras,
      dre.impostos,
    ].some((value) => Math.abs(value) > 0.005);

    if (!hasData) {
      return {
        period,
        label: range.label,
        status: 'OPEN',
        version: close?.version ?? null,
        primaryRegime: 'competence',
        requestedRegime: regime,
        dre: null,
        availableRegimes: ['cash', 'competence'],
        isSnapshot: false,
        source: 'unavailable',
        closedAt: null,
        unavailableReason: `Não há dados financeiros suficientes para ${range.label}.`,
      };
    }

    return {
      period,
      label: range.label,
      status: 'OPEN',
      version: close?.version ?? null,
      primaryRegime: 'competence',
      requestedRegime: regime,
      dre,
      availableRegimes: ['cash', 'competence'],
      isSnapshot: false,
      source: 'live',
      closedAt: null,
    };
  });
}

export function financialSourceLabel(source: FinancialSource): string {
  if (source === 'snapshot') return 'snapshot oficial';
  if (source === 'live') return 'cálculo ao vivo';
  return 'indisponível';
}

