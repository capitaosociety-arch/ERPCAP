export const APP_TIME_ZONE = 'America/Cuiaba';
export const LEGACY_RENTAL_TIME_ZONE = 'America/Fortaleza';

export type RentalTimeConvention = 'LEGACY_FORTALEZA' | 'CUIABA';

export const NEW_RENTAL_TIME_CONVENTION: RentalTimeConvention = 'CUIABA';
export const LEGACY_RENTAL_TIME_CONVENTION: RentalTimeConvention = 'LEGACY_FORTALEZA';

const LEGACY_OFFSET_MS = 60 * 60 * 1000;
const QUERY_BUFFER_MS = 2 * 60 * 60 * 1000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${zone}|${JSON.stringify(options)}`;
  let value = formatterCache.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', { timeZone: zone, ...options });
    formatterCache.set(key, value);
  }
  return value;
}

export function normalizeRentalTimeConvention(value: unknown): RentalTimeConvention {
  return String(value || '').toUpperCase() === 'CUIABA'
    ? NEW_RENTAL_TIME_CONVENTION
    : LEGACY_RENTAL_TIME_CONVENTION;
}

export function isLegacyRentalConvention(value: unknown): boolean {
  return normalizeRentalTimeConvention(value) === LEGACY_RENTAL_TIME_CONVENTION;
}

export function rentalTimeZoneFor(convention: unknown): string {
  return isLegacyRentalConvention(convention) ? LEGACY_RENTAL_TIME_ZONE : APP_TIME_ZONE;
}

export function rentalTimeConventionLabel(value: unknown): string {
  return isLegacyRentalConvention(value) ? 'Convenção histórica (Fortaleza preservada)' : 'America/Cuiaba';
}

export function wallPartsInZone(value: Date | string, zone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = formatter(zone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

export function wallTimeToUtcInZone(
  dateValue: string,
  timeValue: string,
  zone: string,
  dayOffset = 0
): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(timeValue || ''));
  if (!dateMatch) throw new Error('Data invalida. Use AAAA-MM-DD.');
  if (!timeMatch) throw new Error('Horario invalido. Use HH:mm entre 00:00 e 23:59.');

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const wallUtcGuess = Date.UTC(year, month - 1, day + dayOffset, hour, minute);
  const guessParts = wallPartsInZone(new Date(wallUtcGuess), zone);
  const guessAsUtc = Date.UTC(guessParts.year, guessParts.month - 1, guessParts.day, guessParts.hour, guessParts.minute);
  const firstOffset = guessAsUtc - wallUtcGuess;
  let result = new Date(wallUtcGuess - firstOffset);

  const resultParts = wallPartsInZone(result, zone);
  const resultAsUtc = Date.UTC(resultParts.year, resultParts.month - 1, resultParts.day, resultParts.hour, resultParts.minute);
  const secondOffset = resultAsUtc - result.getTime();
  if (secondOffset !== firstOffset) result = new Date(wallUtcGuess - secondOffset);
  return result;
}

export function formatDateKeyInZone(value: Date | string, zone: string): string {
  const parts = wallPartsInZone(value, zone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function formatTimeInZone(value: Date | string, zone: string): string {
  const parts = wallPartsInZone(value, zone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function formatDisplayDateInZone(value: Date | string, zone: string): string {
  const parts = wallPartsInZone(value, zone);
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

export function formatDisplayDateTimeInZone(value: Date | string, zone: string): string {
  return `${formatDisplayDateInZone(value, zone)} ${formatTimeInZone(value, zone)}`;
}

export function formatMonthYearInZone(value: Date | string, zone: string): string {
  const parts = wallPartsInZone(value, zone);
  return `${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

export function formatCuiabaDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return formatDisplayDateInZone(value, APP_TIME_ZONE);
}

export function formatCuiabaTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return formatTimeInZone(value, APP_TIME_ZONE);
}

export function formatCuiabaDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return formatDisplayDateTimeInZone(value, APP_TIME_ZONE);
}

export function formatCuiabaLongDate(value: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(value));
}

export function formatCuiabaMonthYear(value: Date | string): string {
  return formatMonthYearInZone(value, APP_TIME_ZONE);
}

export function weekdayInZone(value: Date | string, zone: string): number {
  const raw = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(new Date(value));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(raw);
}

export function minuteOfDayInZone(value: Date | string, zone: string): number {
  const parts = wallPartsInZone(value, zone);
  return parts.hour * 60 + parts.minute;
}

export function operationalRentalTime(value: Date | string, convention: unknown): Date {
  const date = new Date(value);
  return isLegacyRentalConvention(convention)
    ? new Date(date.getTime() + LEGACY_OFFSET_MS)
    : date;
}

export function operationalRentalWindow(
  startTime: Date | string,
  endTime: Date | string,
  convention: unknown
): { startTime: Date; endTime: Date } {
  return {
    startTime: operationalRentalTime(startTime, convention),
    endTime: operationalRentalTime(endTime, convention),
  };
}

export function rawQueryRangeForOperational(from: Date, to: Date): { from: Date; to: Date } {
  return {
    from: new Date(from.getTime() - QUERY_BUFFER_MS),
    to: new Date(to.getTime() + QUERY_BUFFER_MS),
  };
}

export function currentDateKeyInZone(zone: string, value = new Date()): string {
  return formatDateKeyInZone(value, zone);
}

export function currentCuiabaDateKey(value = new Date()): string {
  return currentDateKeyInZone(APP_TIME_ZONE, value);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
}

export function civilDateKey(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function isCivilDateBeforeTodayCuiaba(value: Date | string | null | undefined, now = new Date()): boolean {
  const key = civilDateKey(value);
  if (!key) return false;
  return key < currentCuiabaDateKey(now);
}

export function dateKeyDisplay(dateKey: string): string {
  const [year, month, day] = String(dateKey).split('-');
  return `${day}/${month}/${year}`;
}
