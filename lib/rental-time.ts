import {
  APP_TIME_ZONE,
  LEGACY_RENTAL_TIME_ZONE,
  NEW_RENTAL_TIME_CONVENTION,
  formatDateKeyInZone,
  formatTimeInZone,
  normalizeRentalTimeConvention,
  rentalTimeZoneFor,
  wallTimeToUtcInZone,
  type RentalTimeConvention,
} from './time-zone';

export const RENTAL_TIME_ZONE = APP_TIME_ZONE;
export { LEGACY_RENTAL_TIME_ZONE };
export type { RentalTimeConvention };

const pad = (value: number) => String(value).padStart(2, '0');

export function parseRentalDate(dateValue: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
  if (!match) throw new Error('Data invalida. Use AAAA-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error('Data invalida.');
  }
  return { year, month, day };
}

export function parseRentalTime(timeValue: string): { hour: number; minute: number; minutesOfDay: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(timeValue || ''));
  if (!match) throw new Error('Horario invalido. Use HH:mm entre 00:00 e 23:59.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return { hour, minute, minutesOfDay: hour * 60 + minute };
}

export function buildRentalWindow(
  dateValue: string,
  startValue: string,
  endValue: string,
  convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION
): { startTime: Date; endTime: Date } {
  const start = parseRentalTime(startValue);
  const end = parseRentalTime(endValue);
  const crossesMidnight = end.minutesOfDay <= start.minutesOfDay;
  const zone = rentalTimeZoneFor(convention);
  const startTime = wallTimeToUtcInZone(dateValue, startValue, zone);
  const endTime = wallTimeToUtcInZone(dateValue, endValue, zone, crossesMidnight ? 1 : 0);
  return { startTime, endTime };
}

export function formatRentalDateInput(
  value: Date | string,
  convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION
): string {
  return formatDateKeyInZone(value, rentalTimeZoneFor(convention));
}

export function formatRentalTimeInput(
  value: Date | string,
  convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION
): string {
  return formatTimeInZone(value, rentalTimeZoneFor(convention));
}

export function formatRentalEndDateInput(
  startValue: Date | string,
  endValue: Date | string,
  convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION
): string {
  return formatRentalDateInput(endValue, convention);
}

export function formatRentalDisplayDate(
  value: Date | string,
  convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION
): string {
  const [year, month, day] = formatRentalDateInput(value, convention).split('-');
  return `${day}/${month}/${year}`;
}

export function formatRentalDisplayTime(
  value: Date | string,
  convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION
): string {
  return formatRentalTimeInput(value, convention);
}

export function formatRentalPeriod(
  startValue: Date | string,
  endValue: Date | string,
  convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION
): string {
  const startDate = formatRentalDisplayDate(startValue, convention);
  const endDate = formatRentalDisplayDate(endValue, convention);
  const startTime = formatRentalDisplayTime(startValue, convention);
  const endTime = formatRentalDisplayTime(endValue, convention);
  return startDate === endDate
    ? `${startDate} das ${startTime} as ${endTime}`
    : `${startDate} ${startTime} ate ${endDate} ${endTime}`;
}

export function formatRentalDraftTimes(
  dateValue: string,
  startValue: string,
  endValue: string,
  convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION
): { startDate: string; endDate: string; start: string; end: string } {
  const { startTime, endTime } = buildRentalWindow(dateValue, startValue, endValue, convention);
  return {
    startDate: formatRentalDateInput(startTime, convention),
    endDate: formatRentalDateInput(endTime, convention),
    start: formatRentalTimeInput(startTime, convention),
    end: formatRentalTimeInput(endTime, convention),
  };
}

export function isEndTimeAfterStart(startValue: string, endValue: string): boolean {
  const start = parseRentalTime(startValue);
  const end = parseRentalTime(endValue);
  return end.minutesOfDay > start.minutesOfDay;
}

export function defaultRentalDateInput(convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION): string {
  return formatRentalDateInput(new Date(), convention);
}

export function normalizeTimeInput(value: string): string {
  const { hour, minute } = parseRentalTime(value);
  return `${pad(hour)}:${pad(minute)}`;
}

export { normalizeRentalTimeConvention };
