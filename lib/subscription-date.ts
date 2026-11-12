const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDateOnlyInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function parseDateOnlyInput(value: string): Date {
  const match = DATE_ONLY.exec(String(value || ''));
  if (!match) throw new Error('Data de vencimento invalida.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error('Data de vencimento invalida.');
  }
  return parsed;
}

export function formatDateDisplay(value: Date | string | null | undefined): string {
  const input = formatDateOnlyInput(value);
  if (!input) return '-';
  const [year, month, day] = input.split('-');
  return `${day}/${month}/${year}`;
}

export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addMonthClamped(value: Date | string): Date {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const clampedDay = Math.min(day, lastDayOfMonth(nextYear, nextMonth));
  return new Date(Date.UTC(nextYear, nextMonth, clampedDay));
}

export function nextDueDateForDay(day: number, now = new Date()): Date {
  const currentDay = now.getUTCDate();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const clamped = Math.max(1, Math.min(31, Math.floor(day)));
  if (clamped >= currentDay) {
    return new Date(Date.UTC(year, month, Math.min(clamped, lastDayOfMonth(year, month))));
  }
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  return new Date(Date.UTC(nextYear, nextMonth, Math.min(clamped, lastDayOfMonth(nextYear, nextMonth))));
}
export function addMonthForDay(value: Date | string, day: number): Date {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const fixedDay = Math.max(1, Math.min(31, Math.floor(day)));
  const clampedDay = Math.min(fixedDay, lastDayOfMonth(nextYear, nextMonth));
  return new Date(Date.UTC(nextYear, nextMonth, clampedDay));
}
