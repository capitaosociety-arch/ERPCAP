export const RENTAL_TIME_ZONE = 'America/Fortaleza';

const wallTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RENTAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: RENTAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: RENTAL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

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

function zonedParts(instant: Date) {
  const parts = wallTimeFormatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function wallTimeToUtc(
  dateValue: string,
  timeValue: string,
  dayOffset = 0
): Date {
  const { year, month, day } = parseRentalDate(dateValue);
  const { hour, minute } = parseRentalTime(timeValue);
  const wallUtcGuess = Date.UTC(year, month - 1, day + dayOffset, hour, minute);
  const guessParts = zonedParts(new Date(wallUtcGuess));
  const guessAsUtc = Date.UTC(guessParts.year, guessParts.month - 1, guessParts.day, guessParts.hour, guessParts.minute);
  const firstOffset = guessAsUtc - wallUtcGuess;
  let result = new Date(wallUtcGuess - firstOffset);

  const resultParts = zonedParts(result);
  const resultAsUtc = Date.UTC(resultParts.year, resultParts.month - 1, resultParts.day, resultParts.hour, resultParts.minute);
  const secondOffset = resultAsUtc - result.getTime();
  if (secondOffset !== firstOffset) {
    result = new Date(wallUtcGuess - secondOffset);
  }
  return result;
}

export function buildRentalWindow(dateValue: string, startValue: string, endValue: string): { startTime: Date; endTime: Date } {
  const start = parseRentalTime(startValue);
  const end = parseRentalTime(endValue);
  const crossesMidnight = end.minutesOfDay <= start.minutesOfDay;
  const startTime = wallTimeToUtc(dateValue, startValue);
  const endTime = wallTimeToUtc(dateValue, endValue, crossesMidnight ? 1 : 0);
  return { startTime, endTime };
}

export function formatRentalDateInput(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

export function formatRentalTimeInput(value: Date | string): string {
  return timeFormatter.format(new Date(value));
}

export function formatRentalEndDateInput(startValue: Date | string, endValue: Date | string): string {
  return formatRentalDateInput(endValue);
}

export function formatRentalDisplayDate(value: Date | string): string {
  const [year, month, day] = formatRentalDateInput(value).split('-');
  return `${day}/${month}/${year}`;
}

export function formatRentalDisplayTime(value: Date | string): string {
  return formatRentalTimeInput(value);
}

export function formatRentalPeriod(startValue: Date | string, endValue: Date | string): string {
  const startDate = formatRentalDisplayDate(startValue);
  const endDate = formatRentalDisplayDate(endValue);
  const startTime = formatRentalDisplayTime(startValue);
  const endTime = formatRentalDisplayTime(endValue);
  return startDate === endDate
    ? `${startDate} das ${startTime} as ${endTime}`
    : `${startDate} ${startTime} ate ${endDate} ${endTime}`;
}

export function formatRentalDraftTimes(dateValue: string, startValue: string, endValue: string): { startDate: string; endDate: string; start: string; end: string } {
  const { startTime, endTime } = buildRentalWindow(dateValue, startValue, endValue);
  return {
    startDate: formatRentalDateInput(startTime),
    endDate: formatRentalDateInput(endTime),
    start: formatRentalTimeInput(startTime),
    end: formatRentalTimeInput(endTime),
  };
}

export function isEndTimeAfterStart(startValue: string, endValue: string): boolean {
  const start = parseRentalTime(startValue);
  const end = parseRentalTime(endValue);
  return end.minutesOfDay > start.minutesOfDay;
}

export function defaultRentalDateInput(): string {
  return formatRentalDateInput(new Date());
}

export function normalizeTimeInput(value: string): string {
  const { hour, minute } = parseRentalTime(value);
  return `${pad(hour)}:${pad(minute)}`;
}
