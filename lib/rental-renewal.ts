import {
  buildRentalWindow,
  formatRentalDateInput,
  formatRentalTimeInput,
  RENTAL_TIME_ZONE,
} from './rental-time';

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RENTAL_TIME_ZONE,
  weekday: 'short',
});

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type RentalHistoryItem = {
  id?: string;
  resource: string;
  startTime: Date | string;
  endTime: Date | string;
  totalAmount?: number;
  status?: string;
};

export type RentalPattern = {
  resource: string;
  weekday: number;
  start: string;
  end: string;
  amount: number;
  occurrences: number;
  confident: boolean;
};

export type RenewalRentalDraft = {
  resource: string;
  startDate: string;
  endDate: string;
  start: string;
  end: string;
  amount: number;
  status: 'PENDING';
};

function weekdayOf(value: Date | string): number {
  const name = weekdayFormatter.format(new Date(value));
  return weekdayIndex[name] ?? 0;
}

function shiftDate(dateValue: string, days: number): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function rentalDraftKey(resource: string, startDate: string, start: string, end: string): string {
  return `${resource.trim().toLowerCase()}|${startDate}|${start}|${end}`;
}

export function inferRentalPattern(rentals: RentalHistoryItem[]): RentalPattern | null {
  const groups = new Map<string, {
    resource: string;
    weekday: number;
    start: string;
    end: string;
    amount: number;
    occurrences: number;
    latest: number;
  }>();
  let latestKey: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const rental of rentals) {
    if (!rental?.resource || !rental.startTime || !rental.endTime) continue;
    if (rental.status === 'CANCELED' || rental.status === 'NO_SHOW') continue;
    const start = formatRentalTimeInput(rental.startTime);
    const end = formatRentalTimeInput(rental.endTime);
    const resource = rental.resource.trim();
    const weekday = weekdayOf(rental.startTime);
    const key = `${resource.trim().toLowerCase()}|${weekday}|${start}|${end}`;
    const existing = groups.get(key);
    const timestamp = new Date(rental.startTime).getTime();
    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestKey = key;
    }
    if (existing) {
      existing.occurrences++;
      if (timestamp > existing.latest) {
        existing.latest = timestamp;
        existing.amount = Number(rental.totalAmount) || existing.amount;
      }
    } else {
      groups.set(key, {
        resource,
        weekday,
        start,
        end,
        amount: Number(rental.totalAmount) || 0,
        occurrences: 1,
        latest: timestamp,
      });
    }
  }

  const sorted = Array.from(groups.values()).sort((a, b) => b.occurrences - a.occurrences || b.latest - a.latest);
  const top = sorted[0];
  if (!top) return null;
  const second = sorted[1];
  const latest = latestKey ? groups.get(latestKey) : null;
  const selected = latest || top;
  const confident = selected.occurrences >= 2
    && selected === top
    && (!second || selected.occurrences > second.occurrences);
  return {
    resource: selected.resource,
    weekday: selected.weekday,
    start: selected.start,
    end: selected.end,
    amount: selected.amount,
    occurrences: selected.occurrences,
    confident,
  };
}

export function generateRenewalDraftsFromPattern(
  pattern: RentalPattern,
  history: RentalHistoryItem[],
  existingDrafts: Array<Partial<RenewalRentalDraft>>,
  todayDate: string,
  count = 4
): RenewalRentalDraft[] {
  const existingKeys = new Set<string>();
  for (const rental of history) {
    if (rental.status === 'CANCELED') continue;
    existingKeys.add(rentalDraftKey(
      rental.resource,
      formatRentalDateInput(rental.startTime),
      formatRentalTimeInput(rental.startTime),
      formatRentalTimeInput(rental.endTime)
    ));
  }
  for (const rental of existingDrafts) {
    if (!rental.resource || !rental.startDate || !rental.start || !rental.end) continue;
    existingKeys.add(rentalDraftKey(rental.resource, rental.startDate, rental.start, rental.end));
  }

  const [year, month, day] = todayDate.split('-').map(Number);
  const todayWeekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  const offset = (pattern.weekday - todayWeekday + 7) % 7;
  const firstOffset = offset === 0 ? 7 : offset;
  const firstDate = shiftDate(todayDate, firstOffset);

  const generated: RenewalRentalDraft[] = [];
  for (let index = 0; index < count; index++) {
    const startDate = shiftDate(firstDate, index * 7);
    const { endTime } = buildRentalWindow(startDate, pattern.start, pattern.end);
    const endDate = formatRentalDateInput(endTime);
    const key = rentalDraftKey(pattern.resource, startDate, pattern.start, pattern.end);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    generated.push({
      resource: pattern.resource,
      startDate,
      endDate,
      start: pattern.start,
      end: pattern.end,
      amount: pattern.amount,
      status: 'PENDING',
    });
  }
  return generated;
}

export function generateRenewalDrafts(
  history: RentalHistoryItem[],
  existingDrafts: Array<Partial<RenewalRentalDraft>>,
  todayDate: string,
  count = 4
): RenewalRentalDraft[] {
  const pattern = inferRentalPattern(history);
  return pattern ? generateRenewalDraftsFromPattern(pattern, history, existingDrafts, todayDate, count) : [];
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateRenewalTotal(unitAmount: number, games: number): number {
  const unit = Number(unitAmount);
  const quantity = Math.max(0, Math.floor(Number(games) || 0));
  return roundMoney(Math.max(0, unit) * quantity);
}

export function resolveRenewalTotal(unitAmount: number, games: number, negotiatedTotal?: number | null): number {
  const calculated = calculateRenewalTotal(unitAmount, games);
  const negotiated = Number(negotiatedTotal);
  if (negotiatedTotal != null && Number.isFinite(negotiated) && negotiated > 0) {
    return roundMoney(negotiated);
  }
  return calculated;
}

export function renewalPatternDescription(pattern: RentalPattern): string {
  const weekdays = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];
  return `${weekdays[pattern.weekday]}, ${pattern.start} as ${pattern.end}, ${pattern.resource}`;
}
export function sortRentalDraftsDesc<T extends { startDate?: string; start?: string }>(drafts: T[]): T[] {
  return [...drafts].sort((a, b) => {
    const aKey = `${a.startDate || ''}T${a.start || ''}`;
    const bKey = `${b.startDate || ''}T${b.start || ''}`;
    return bKey.localeCompare(aKey);
  });
}
