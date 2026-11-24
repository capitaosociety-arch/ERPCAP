import { operationalRentalWindow, type RentalTimeConvention } from './time-zone';

export type RentalIntervalCandidate = {
  id: string;
  resource: string;
  startTime: Date | string;
  endTime: Date | string;
  status?: string | null;
  timeConvention?: string | null;
};

export type TargetRentalInterval = {
  resource: string;
  startTime: Date | string;
  endTime: Date | string;
  timeConvention: RentalTimeConvention;
};

function normalizedResource(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function operationalInterval(candidate: RentalIntervalCandidate): { startTime: Date; endTime: Date } {
  return operationalRentalWindow(candidate.startTime, candidate.endTime, candidate.timeConvention);
}

export function intervalsOverlap(
  aStart: Date | string,
  aEnd: Date | string,
  bStart: Date | string,
  bEnd: Date | string
): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

export function findOperationalConflict<T extends RentalIntervalCandidate>(
  candidates: T[],
  target: TargetRentalInterval,
  excludeIds: string[] = []
): T | null {
  const excluded = new Set(excludeIds.filter(Boolean));
  const targetInterval = operationalRentalWindow(target.startTime, target.endTime, target.timeConvention);
  const targetResource = normalizedResource(target.resource);

  for (const candidate of candidates) {
    if (excluded.has(candidate.id)) continue;
    if (String(candidate.status || '').toUpperCase() === 'CANCELED') continue;
    if (normalizedResource(candidate.resource) !== targetResource) continue;
    const interval = operationalInterval(candidate);
    if (intervalsOverlap(interval.startTime, interval.endTime, targetInterval.startTime, targetInterval.endTime)) {
      return candidate;
    }
  }
  return null;
}

export function findReusableOperationalRental<T extends RentalIntervalCandidate>(
  candidates: T[],
  target: TargetRentalInterval & { customerId: string }
): T | null {
  const targetInterval = operationalRentalWindow(target.startTime, target.endTime, target.timeConvention);
  const targetResource = normalizedResource(target.resource);

  for (const candidate of candidates) {
    if (normalizedResource(candidate.resource) !== targetResource) continue;
    const status = String(candidate.status || '').toUpperCase();
    if (status !== 'PENDING' && status !== 'CONFIRMED') continue;
    const interval = operationalInterval(candidate);
    if (
      interval.startTime.getTime() === targetInterval.startTime.getTime()
      && interval.endTime.getTime() === targetInterval.endTime.getTime()
    ) {
      return candidate;
    }
  }
  return null;
}
