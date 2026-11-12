import { prisma } from './prisma';
import { computeDre, computeDreAccrual, type DreResultado } from './dre';
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
  return Promise.all(periods.map((period) => getFinancialMonth(period, regime)));
}

export function financialSourceLabel(source: FinancialSource): string {
  if (source === 'snapshot') return 'snapshot oficial';
  if (source === 'live') return 'cálculo ao vivo';
  return 'indisponível';
}
