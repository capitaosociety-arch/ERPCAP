export type DreMonthLike = {
  key: string;
  periodStatus?: string;
  [key: string]: unknown;
};

export type ClosedPeriodLike = {
  period: string;
  status: string;
  snapshot: unknown;
  version: number;
  closedAt?: string | Date | null;
};

export function parsePeriodKey(key: string): { year: number; month: number } | null {
  const match = /^(\d{2})\/(\d{4})$/.exec(String(key));
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12 || !Number.isFinite(year)) return null;
  return { year, month };
}

export function formatPeriodKey(year: number, month: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

export function listYears(months: DreMonthLike[]): number[] {
  const years = new Set<number>();
  for (const month of months) {
    const parsed = parsePeriodKey(month.key);
    if (parsed) years.add(parsed.year);
  }
  return Array.from(years).sort((a, b) => a - b);
}

export function monthsForYear<T extends DreMonthLike>(months: T[], year: number): T[] {
  return months
    .filter((month) => parsePeriodKey(month.key)?.year === year)
    .sort((a, b) => (parsePeriodKey(a.key)?.month || 0) - (parsePeriodKey(b.key)?.month || 0));
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
  minYear: number,
  maxYear: number
): { year: number; month: number } | null {
  let nextYear = year;
  let nextMonth = month + delta;
  if (nextMonth < 1) { nextMonth = 12; nextYear -= 1; }
  if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
  if (nextYear < minYear || nextYear > maxYear) return null;
  return { year: nextYear, month: nextMonth };
}

export function periodStatus(month: DreMonthLike | null | undefined): 'CLOSED' | 'OPEN' | 'NO_DATA' {
  if (!month) return 'NO_DATA';
  return month.periodStatus === 'CLOSED' ? 'CLOSED' : 'OPEN';
}

export function applyClosedSnapshot<T extends DreMonthLike>(month: T, close?: ClosedPeriodLike | null): T {
  if (!close || close.status !== 'CLOSED') return { ...month, periodStatus: 'OPEN' };
  return {
    ...month,
    ...(close.snapshot as Record<string, unknown>),
    key: close.period,
    periodStatus: 'CLOSED',
    closeVersion: close.version,
    closedAt: close.closedAt,
  } as T;
}

export function nextCloseVersion(currentVersion?: number | null): number {
  return (Number(currentVersion) || 0) + 1;
}
