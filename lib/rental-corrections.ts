import { buildRentalWindow, formatRentalDateInput, formatRentalTimeInput } from './rental-time';
import { NEW_RENTAL_TIME_CONVENTION, normalizeRentalTimeConvention, operationalRentalWindow, type RentalTimeConvention } from './time-zone';

export type RentalCorrectionField = 'FUT5' | 'FUT7';

export type RentalSnapshot = {
  id: string;
  customerId: string;
  orderId: string | null;
  resource: string;
  timeConvention?: string;
  date: string;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalAmount: number;
  status: string;
  source: string;
};

export type RentalChangeLogView = {
  id: string;
  rentalId: string;
  orderId: string | null;
  changedByName: string;
  reason: string;
  beforeData: RentalSnapshot;
  afterData: RentalSnapshot;
  changedFields: string[];
  requiresFinancialReview: boolean;
  financialDifference: number | null;
  createdAt: string;
};

export const RENTAL_CORRECTION_MIN_REASON = 5;
export const RENTAL_CORRECTION_MAX_REASON = 1000;

export function normalizeRentalCorrectionField(value: unknown): RentalCorrectionField | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (/^FUT\s*5$/.test(normalized)) return 'FUT5';
  if (/^FUT\s*7$/.test(normalized)) return 'FUT7';
  return null;
}

export function normalizeRentalCorrectionReason(value: unknown): string {
  const reason = String(value || '').trim();
  if (reason.length < RENTAL_CORRECTION_MIN_REASON) {
    throw new Error(`Informe uma justificativa com pelo menos ${RENTAL_CORRECTION_MIN_REASON} caracteres.`);
  }
  if (reason.length > RENTAL_CORRECTION_MAX_REASON) {
    throw new Error(`A justificativa deve ter no máximo ${RENTAL_CORRECTION_MAX_REASON} caracteres.`);
  }
  return reason;
}

export function buildRentalCorrectionWindow(input: {
  date: string;
  start: string;
  end: string;
  field: unknown;
}, convention: RentalTimeConvention = NEW_RENTAL_TIME_CONVENTION): {
  field: RentalCorrectionField;
  timeConvention: RentalTimeConvention;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
} {
  const field = normalizeRentalCorrectionField(input.field);
  if (!field) throw new Error('Campo inválido. Use FUT5 ou FUT7.');
  if (String(input.start || '').trim() === String(input.end || '').trim()) {
    throw new Error('O horário final deve ser diferente do horário inicial.');
  }
  const normalizedConvention = normalizeRentalTimeConvention(convention);
  const { startTime, endTime } = buildRentalWindow(input.date, input.start, input.end, normalizedConvention);
  if (endTime <= startTime) throw new Error('Horário final inválido.');
  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  if (durationMinutes <= 0 || durationMinutes > 24 * 60) {
    throw new Error('Duração inválida. Informe entre 1 minuto e 24 horas.');
  }
  return { field, timeConvention: normalizedConvention, startTime, endTime, durationMinutes };
}

export function buildRentalSnapshot(input: {
  id: string;
  customerId: string;
  orderId?: string | null;
  resource: string;
  startTime: Date | string;
  endTime: Date | string;
  totalAmount: number;
  status: string;
  source: string;
  timeConvention?: string;
}): RentalSnapshot {
  const convention = normalizeRentalTimeConvention(input.timeConvention);
  const storedStart = new Date(input.startTime);
  const storedEnd = new Date(input.endTime);
  const { startTime: start, endTime: end } = operationalRentalWindow(storedStart, storedEnd, convention);
  return {
    id: input.id,
    customerId: input.customerId,
    orderId: input.orderId || null,
    resource: String(input.resource || '').trim().toUpperCase(),
    timeConvention: convention,
    date: formatRentalDateInput(start),
    start: formatRentalTimeInput(start),
    end: formatRentalTimeInput(end),
    startTime: storedStart.toISOString(),
    endTime: storedEnd.toISOString(),
    durationMinutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)),
    totalAmount: Number(input.totalAmount) || 0,
    status: String(input.status || '').toUpperCase(),
    source: String(input.source || '').toUpperCase(),
  };
}

export function diffRentalSnapshots(before: RentalSnapshot, after: RentalSnapshot): {
  changedFields: string[];
  requiresFinancialReview: boolean;
} {
  const changedFields: string[] = [];
  if (before.resource !== after.resource) changedFields.push('field');
  if (normalizeRentalTimeConvention(before.timeConvention) !== normalizeRentalTimeConvention(after.timeConvention)) changedFields.push('timeConvention');
  if (before.date !== after.date) changedFields.push('date');
  if (before.startTime !== after.startTime) changedFields.push('startTime');
  if (before.endTime !== after.endTime) changedFields.push('endTime');
  if (before.durationMinutes !== after.durationMinutes) changedFields.push('duration');
  return {
    changedFields,
    requiresFinancialReview: changedFields.length > 0,
  };
}
