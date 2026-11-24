import { RENTAL_TIME_ZONE, buildRentalWindow, formatRentalDateInput, formatRentalTimeInput } from './rental-time';

export type AgendaView = 'day' | 'week' | 'month';
export type AgendaField = 'FUT5' | 'FUT7';
export type AgendaFieldFilter = 'ALL' | AgendaField;
export type AgendaCustomerTypeFilter = 'ALL' | 'MENSALISTA' | 'AVULSO';
export type AgendaFinancialFilter = 'ALL' | 'PAID' | 'PARTIAL' | 'PENDING' | 'CANCELED' | 'UNPROVEN';
export type AgendaOperationalFilter = 'ALL' | 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW' | 'CANCELED';
export type AgendaSourceFilter = 'ALL' | 'SUBSCRIPTION' | 'WALK_IN' | 'MANUAL' | 'LEGACY';

export type AgendaFilters = {
  field: AgendaFieldFilter;
  customerId: string;
  customerType: AgendaCustomerTypeFilter;
  financial: AgendaFinancialFilter;
  operational: AgendaOperationalFilter;
  source: AgendaSourceFilter;
};

export const DEFAULT_AGENDA_FILTERS: AgendaFilters = {
  field: 'ALL',
  customerId: '',
  customerType: 'ALL',
  financial: 'ALL',
  operational: 'ALL',
  source: 'ALL',
};

export type AgendaFinancialStatus =
  | 'PAID'
  | 'PARTIAL'
  | 'PARTIAL_UNALLOCATED'
  | 'PENDING'
  | 'CANCELED'
  | 'PAID_UNPROVEN'
  | 'SUBSCRIPTION_UNLINKED';

export type AgendaOperationalStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELED';

export type AgendaTone = 'green' | 'yellow' | 'orange' | 'red' | 'slate' | 'purple';

export type AgendaInconsistencySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type AgendaInconsistency = {
  type: string;
  label: string;
  severity: AgendaInconsistencySeverity;
  historical: boolean;
  entityId: string;
  detail: string;
  countsAsInconsistency: boolean;
};

export type AgendaPaymentMethod = {
  method: string;
  label: string;
  amount: number;
};

export type AgendaCashSession = {
  id: string;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
};

export type AgendaOrderItemInput = {
  id: string;
  subtotal: number;
  rentalId?: string | null;
  productName?: string | null;
  serviceName?: string | null;
};

export type AgendaPaymentInput = {
  id: string;
  amount: number;
  method: string;
  date: string;
  cashRegister?: {
    id: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
  } | null;
};

export type AgendaOrderInput = {
  id: string;
  status: string;
  total: number;
  discount: number;
  notes?: string | null;
  openedAt: string;
  closedAt?: string | null;
  customerId?: string | null;
  payments: AgendaPaymentInput[];
  items: AgendaOrderItemInput[];
};

export type AgendaRentalItemInput = {
  id: string;
  status: string;
  subtotal: number;
  quantity: number;
  unitPrice: number;
  productName?: string | null;
  serviceName?: string | null;
  order: AgendaOrderInput;
};

export type AgendaRentalInput = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  isSubscriber: boolean;
  resource: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  status: string;
  source: string;
  cancelledAt?: string | null;
  createdAt: string;
  orderItems: AgendaRentalItemInput[];
};

export type AgendaUnlinkedItemInput = {
  id: string;
  orderId: string;
  orderStatus: string;
  orderNotes?: string | null;
  orderDate: string;
  customerId?: string | null;
  name: string;
  subtotal: number;
  field: AgendaField | null;
};

export type AgendaScheduleEntry = {
  weekday: number;
  field: string;
  startMinute: number;
  endMinute: number;
  demandWeight?: number;
  isActive: boolean;
};

export type AgendaSchedule = {
  entries: AgendaScheduleEntry[];
  source?: string;
  note?: string;
};

export type AgendaRange = {
  view: AgendaView;
  anchor: string;
  from: string;
  to: string;
  fromKey: string;
  toKey: string;
  days: string[];
  label: string;
};

export type AgendaCustomerOption = {
  id: string;
  name: string;
};

export type AgendaReservation = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  isSubscriber: boolean;
  resource: string;
  field: AgendaField | null;
  startTime: string;
  endTime: string;
  startDateKey: string;
  endDateKey: string;
  startTimeLabel: string;
  endTimeLabel: string;
  durationMinutes: number;
  status: string;
  source: string;
  sourceLabel: string;
  operationalStatus: AgendaOperationalStatus;
  operationalLabel: string;
  financialStatus: AgendaFinancialStatus;
  financialLabel: string;
  financialTone: AgendaTone;
  contractedAmount: number;
  itemSubtotal: number | null;
  allocatedDiscount: number | null;
  finalItemNet: number | null;
  receivedAmount: number | null;
  balanceAmount: number | null;
  orderId: string | null;
  orderStatus: string | null;
  orderNotes: string | null;
  orderOpenedAt: string | null;
  orderClosedAt: string | null;
  orderTotal: number | null;
  orderReceived: number | null;
  orderBalance: number | null;
  paymentMethods: AgendaPaymentMethod[];
  cashSessions: AgendaCashSession[];
  canAttributePayment: boolean;
  financialNote: string;
  isHistorical: boolean;
  inconsistencies: AgendaInconsistency[];
  hasInconsistency: boolean;
  original: {
    startTime: string | null;
    endTime: string | null;
    durationMinutes: number | null;
    amount: number | null;
    additions: number | null;
    historyAvailable: false;
  };
  played: {
    startTime: string | null;
    endTime: string | null;
  };
};

export type AgendaMetrics = {
  totalReservations: number;
  paid: number;
  partial: number;
  pending: number;
  canceled: number;
  unproven: number;
  noShow: number;
  hoursReserved: Record<AgendaField, number> & { total: number };
  hoursAvailable: Record<AgendaField, number> & { total: number };
  hoursRegularCapacity: Record<AgendaField, number> & { total: number };
  contractedValue: number;
  receivedValue: number;
  balanceValue: number;
  inconsistencyCountCurrent: number;
  inconsistencyCountHistorical: number;
};

export type AgendaAuditType = {
  type: string;
  label: string;
  severity: AgendaInconsistencySeverity;
  current: number;
  historical: number;
};

export type AgendaAudit = {
  types: AgendaAuditType[];
  unlinkedItems: Array<AgendaUnlinkedItemInput & { historical: boolean }>;
  current: number;
  historical: number;
  unlinkedCurrentValue: number;
  unlinkedHistoricalValue: number;
};

export type AgendaData = {
  range: AgendaRange;
  reservations: AgendaReservation[];
  metrics: AgendaMetrics;
  audit: AgendaAudit;
  customers: AgendaCustomerOption[];
  schedule: AgendaSchedule;
  filters: AgendaFilters;
  generatedAt: string;
  limitations: string[];
};

type BuildAgendaInput = {
  view: AgendaView;
  anchor: string;
  filters?: AgendaFilters;
  rentals: AgendaRentalInput[];
  unlinkedItems?: AgendaUnlinkedItemInput[];
  customers?: AgendaCustomerOption[];
  schedule?: AgendaSchedule;
  now?: Date;
};

export const AGENDA_LINK_FEATURE_START = new Date('2026-11-14T00:00:00-03:00');
export const AGENDA_FIELDS: AgendaField[] = ['FUT5', 'FUT7'];
export const AGENDA_BUSINESS_START_MINUTE = 18 * 60;
export const AGENDA_BUSINESS_END_MINUTE = 23 * 60;

export const AGENDA_SOURCE_LABELS: Record<string, string> = {
  SUBSCRIPTION: 'Mensalidade',
  WALK_IN: 'Avulso',
  MANUAL: 'Manual',
  LEGACY: 'Legado',
};

export const AGENDA_FINANCIAL_LABELS: Record<AgendaFinancialStatus, string> = {
  PAID: 'Pago',
  PARTIAL: 'Parcial',
  PARTIAL_UNALLOCATED: 'Parcial não individualizado',
  PENDING: 'Pendente',
  CANCELED: 'Cancelado',
  PAID_UNPROVEN: 'Pago sem comprovação',
  SUBSCRIPTION_UNLINKED: 'Cobertura de mensalidade não vinculada',
};

export const AGENDA_OPERATIONAL_LABELS: Record<AgendaOperationalStatus, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  NO_SHOW: 'No-show',
  CANCELED: 'Cancelada',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
};

const dayMs = 24 * 60 * 60 * 1000;
const minuteMs = 60 * 1000;

const dateKeyFormatter = new Intl.DateTimeFormat('sv-SE', {
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

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RENTAL_TIME_ZONE,
  weekday: 'short',
});

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: RENTAL_TIME_ZONE,
  month: 'long',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: RENTAL_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
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

export function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatAgendaMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatAgendaHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${(Number(value) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;
}

export function formatAgendaDateDisplay(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return shortDateFormatter.format(new Date(value));
}

export function formatAgendaTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return timeFormatter.format(new Date(value));
}

export function formatAgendaWeekdayShort(value: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: RENTAL_TIME_ZONE })
    .format(new Date(value))
    .replace('.', '');
}

export function agendaDateKey(value: string | Date): string {
  return dateKeyFormatter.format(new Date(value));
}

export function agendaMinuteOfDay(value: string | Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: RENTAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

export function agendaWeekday(value: string | Date): number {
  const raw = weekdayFormatter.format(new Date(value));
  return weekdayIndex[raw] ?? 0;
}

export function isAgendaDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function addAgendaDays(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + delta, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function addAgendaMonths(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function addAgendaYears(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const targetYear = year + delta;
  const lastDay = new Date(Date.UTC(targetYear, month, 0, 12)).getUTCDate();
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function startOfAgendaDay(dateKey: string): Date {
  return buildRentalWindow(dateKey, '00:00', '00:00').startTime;
}

export function getAgendaRange(view: AgendaView, anchorInput: string): AgendaRange {
  const anchor = isAgendaDateKey(anchorInput) ? anchorInput : formatRentalDateInput(new Date());
  if (view === 'day') {
    const fromKey = anchor;
    const toKey = addAgendaDays(anchor, 1);
    return {
      view,
      anchor,
      from: startOfAgendaDay(fromKey).toISOString(),
      to: startOfAgendaDay(toKey).toISOString(),
      fromKey,
      toKey,
      days: [fromKey],
      label: shortDateFormatter.format(startOfAgendaDay(fromKey)),
    };
  }
  if (view === 'week') {
    const weekday = agendaWeekday(startOfAgendaDay(anchor));
    const mondayOffset = (weekday + 6) % 7;
    const fromKey = addAgendaDays(anchor, -mondayOffset);
    const toKey = addAgendaDays(fromKey, 7);
    const days = Array.from({ length: 7 }, (_, index) => addAgendaDays(fromKey, index));
    const endDisplay = shortDateFormatter.format(startOfAgendaDay(addAgendaDays(toKey, -1)));
    return {
      view,
      anchor,
      from: startOfAgendaDay(fromKey).toISOString(),
      to: startOfAgendaDay(toKey).toISOString(),
      fromKey,
      toKey,
      days,
      label: `${shortDateFormatter.format(startOfAgendaDay(fromKey))} a ${endDisplay}`,
    };
  }
  const fromKey = `${anchor.slice(0, 7)}-01`;
  const nextMonthKey = addAgendaMonths(fromKey, 1);
  const first = startOfAgendaDay(fromKey);
  const [year, month] = fromKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return {
    view,
    anchor,
    from: first.toISOString(),
    to: startOfAgendaDay(nextMonthKey).toISOString(),
    fromKey,
    toKey: nextMonthKey,
    days: Array.from({ length: lastDay }, (_, index) => addAgendaDays(fromKey, index)),
    label: monthFormatter.format(first).replace(/^./, char => char.toUpperCase()),
  };
}

export function agendaMonthGridDays(anchor: string): string[] {
  const firstKey = `${anchor.slice(0, 7)}-01`;
  const weekday = agendaWeekday(startOfAgendaDay(firstKey));
  const mondayOffset = (weekday + 6) % 7;
  const gridStart = addAgendaDays(firstKey, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addAgendaDays(gridStart, index));
}

export function shiftAgendaAnchor(view: AgendaView, anchor: string, delta: number): string {
  if (view === 'day') return addAgendaDays(anchor, delta);
  if (view === 'week') return addAgendaDays(anchor, delta * 7);
  return addAgendaMonths(anchor, delta);
}

export function normalizeAgendaField(resource: string): AgendaField | null {
  const normalized = String(resource || '').trim().toUpperCase();
  if (/^FUT\s*5$/.test(normalized)) return 'FUT5';
  if (/^FUT\s*7$/.test(normalized)) return 'FUT7';
  return null;
}

export function isAgendaFieldRentalName(name: string | null | undefined): boolean {
  return /fut\s*5|fut5|fut\s*7|fut7|aluguel.*campo|campo.*aluguel/i.test(String(name || ''));
}

export function overlapsAgendaRange(startTime: string | Date, endTime: string | Date, range: Pick<AgendaRange, 'from' | 'to'>): boolean {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return start < new Date(range.to).getTime() && end > new Date(range.from).getTime();
}

function isWithinRange(value: string | Date, range: Pick<AgendaRange, 'from' | 'to'>): boolean {
  const time = new Date(value).getTime();
  return time >= new Date(range.from).getTime() && time < new Date(range.to).getTime();
}

function paymentMethodsFor(payments: AgendaPaymentInput[]): AgendaPaymentMethod[] {
  const byMethod = new Map<string, number>();
  for (const payment of payments) {
    const method = payment.method || 'OUTRO';
    byMethod.set(method, round2((byMethod.get(method) || 0) + Number(payment.amount || 0)));
  }
  return Array.from(byMethod.entries())
    .filter(([, amount]) => amount !== 0)
    .map(([method, amount]) => ({
      method,
      amount,
      label: PAYMENT_METHOD_LABELS[method] || method,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function cashSessionsFor(payments: AgendaPaymentInput[]): AgendaCashSession[] {
  const sessions = new Map<string, AgendaCashSession>();
  for (const payment of payments) {
    const session = payment.cashRegister;
    if (!session?.id) continue;
    sessions.set(session.id, {
      id: session.id,
      status: session.status,
      openedAt: session.openedAt || null,
      closedAt: session.closedAt || null,
    });
  }
  return Array.from(sessions.values()).sort((a, b) => String(a.openedAt || '').localeCompare(String(b.openedAt || '')));
}

function inScheduleBlock(schedule: AgendaSchedule, weekday: number, field: AgendaField, minute: number): boolean {
  return schedule.entries.some(entry =>
    entry.isActive
    && entry.weekday === weekday
    && normalizeAgendaField(entry.field) === field
    && minute >= entry.startMinute
    && minute < entry.endMinute
  );
}

function regularMinutesForAgendaDay(schedule: AgendaSchedule, weekday: number, field: AgendaField): number {
  const blocks = schedule.entries
    .filter(entry => entry.isActive && entry.weekday === weekday && normalizeAgendaField(entry.field) === field)
    .sort((a, b) => a.startMinute - b.startMinute);
  let total = 0;
  let start = -1;
  let end = -1;
  for (const block of blocks) {
    if (start < 0) {
      start = block.startMinute;
      end = block.endMinute;
      continue;
    }
    if (block.startMinute <= end) {
      end = Math.max(end, block.endMinute);
      continue;
    }
    total += end - start;
    start = block.startMinute;
    end = block.endMinute;
  }
  if (start >= 0) total += end - start;
  return total;
}

function operationalStatusFor(rental: AgendaRentalInput, now: Date): AgendaOperationalStatus {
  if (String(rental.status).toUpperCase() === 'CANCELED') return 'CANCELED';
  if (String(rental.status).toUpperCase() === 'NO_SHOW') return 'NO_SHOW';
  const start = new Date(rental.startTime);
  const end = new Date(rental.endTime);
  if (now >= start && now < end) return 'IN_PROGRESS';
  if (now >= end) return 'COMPLETED';
  return String(rental.status).toUpperCase() === 'CONFIRMED' ? 'CONFIRMED' : 'SCHEDULED';
}

export function agendaFinancialTone(status: AgendaFinancialStatus): AgendaTone {
  if (status === 'PAID') return 'green';
  if (status === 'CANCELED') return 'red';
  if (status === 'PARTIAL' || status === 'PARTIAL_UNALLOCATED') return 'orange';
  return 'yellow';
}

function addInconsistency(
  list: AgendaInconsistency[],
  input: Omit<AgendaInconsistency, 'label' | 'countsAsInconsistency' | 'historical'> & {
    label: string;
    countsAsInconsistency?: boolean;
    historical?: boolean;
  }
) {
  if (list.some(item => item.type === input.type && item.entityId === input.entityId && item.historical === Boolean(input.historical))) return;
  list.push({
    type: input.type,
    label: input.label,
    severity: input.severity,
    entityId: input.entityId,
    detail: input.detail,
    historical: Boolean(input.historical),
    countsAsInconsistency: input.countsAsInconsistency !== false,
  });
}

type FinancialComputation = {
  financialStatus: AgendaFinancialStatus;
  receivedAmount: number | null;
  balanceAmount: number | null;
  itemSubtotal: number | null;
  allocatedDiscount: number | null;
  finalItemNet: number | null;
  orderId: string | null;
  orderStatus: string | null;
  orderNotes: string | null;
  orderOpenedAt: string | null;
  orderClosedAt: string | null;
  orderTotal: number | null;
  orderReceived: number | null;
  orderBalance: number | null;
  paymentMethods: AgendaPaymentMethod[];
  cashSessions: AgendaCashSession[];
  canAttributePayment: boolean;
  financialNote: string;
  inconsistencies: AgendaInconsistency[];
};

function computeFinancial(rental: AgendaRentalInput): FinancialComputation {
  const historical = new Date(rental.createdAt) < AGENDA_LINK_FEATURE_START;
  const inconsistencies: AgendaInconsistency[] = [];
  const activeLinks = (rental.orderItems || []).filter(item => item.status === 'ACTIVE');

  if (!String(rental.customerName || '').trim()) {
    addInconsistency(inconsistencies, {
      type: 'NO_CUSTOMER',
      label: 'Reserva sem cliente identificado',
      severity: 'high',
      entityId: rental.id,
      detail: 'A reserva não possui nome de cliente registrado.',
      historical,
    });
  }

  if (String(rental.status).toUpperCase() === 'CANCELED') {
    if (activeLinks.length > 0) {
      addInconsistency(inconsistencies, {
        type: 'CANCELED_RENTAL_WITH_ACTIVE_ITEM',
        label: 'Reserva cancelada com item ativo',
        severity: 'high',
        entityId: rental.id,
        detail: `Existe item ativo vinculado à reserva cancelada (${activeLinks[0].order.id}).`,
        historical,
      });
    }
    return {
      financialStatus: 'CANCELED',
      receivedAmount: null,
      balanceAmount: null,
      itemSubtotal: activeLinks[0]?.subtotal ?? null,
      allocatedDiscount: null,
      finalItemNet: null,
      orderId: activeLinks[0]?.order.id || null,
      orderStatus: activeLinks[0]?.order.status || null,
      orderNotes: activeLinks[0]?.order.notes || null,
      orderOpenedAt: activeLinks[0]?.order.openedAt || null,
      orderClosedAt: activeLinks[0]?.order.closedAt || null,
      orderTotal: activeLinks[0]?.order.total ?? null,
      orderReceived: activeLinks[0] ? round2(activeLinks[0].order.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)) : null,
      orderBalance: activeLinks[0] ? round2(activeLinks[0].order.total - activeLinks[0].order.discount - activeLinks[0].order.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)) : null,
      paymentMethods: activeLinks[0] ? paymentMethodsFor(activeLinks[0].order.payments) : [],
      cashSessions: activeLinks[0] ? cashSessionsFor(activeLinks[0].order.payments) : [],
      canAttributePayment: false,
      financialNote: 'Reserva cancelada não entra no contas a receber da Agenda.',
      inconsistencies,
    };
  }

  if (activeLinks.length === 0) {
    const status = String(rental.status).toUpperCase();
    const isPaid = status === 'PAID';
    const isSubscriptionSource = String(rental.source || '').toUpperCase() === 'SUBSCRIPTION';
    const isSubscriptionUnlinked = isSubscriptionSource && rental.isSubscriber;

    if (isPaid) {
      addInconsistency(inconsistencies, {
        type: 'PAID_WITHOUT_PROOF',
        label: 'Reserva paga sem comprovação financeira',
        severity: 'critical',
        entityId: rental.id,
        detail: `A reserva está PAID, mas não possui item ativo de comanda/PDV vinculado. Valor: ${formatAgendaMoney(rental.totalAmount)}.`,
        historical,
      });
    } else if (isSubscriptionUnlinked) {
      addInconsistency(inconsistencies, {
        type: 'SUBSCRIPTION_UNLINKED',
        label: 'Cobertura de mensalidade não vinculada',
        severity: 'info',
        entityId: rental.id,
        detail: 'O cliente possui mensalidade ativa, mas não há vínculo comprovado entre o pagamento da assinatura e esta reserva.',
        historical,
        countsAsInconsistency: false,
      });
    } else if (isSubscriptionSource) {
      addInconsistency(inconsistencies, {
        type: 'SUBSCRIPTION_UNLINKED',
        label: 'Cobertura de mensalidade não vinculada',
        severity: 'info',
        entityId: rental.id,
        detail: 'Reserva de origem mensalidade sem vínculo financeiro individual comprovado.',
        historical,
        countsAsInconsistency: false,
      });
    } else if (status === 'PENDING' || status === 'CONFIRMED' || status === 'NO_SHOW') {
      addInconsistency(inconsistencies, {
        type: 'UNLINKED_AVULSO',
        label: 'Jogo sem operação comercial vinculada',
        severity: historical ? 'info' : 'medium',
        entityId: rental.id,
        detail: 'Não há item ativo de comanda/PDV vinculado para comprovar a cobrança.',
        historical,
        countsAsInconsistency: !historical,
      });
    }

    return {
      financialStatus: isPaid ? 'PAID_UNPROVEN' : (isSubscriptionUnlinked ? 'SUBSCRIPTION_UNLINKED' : 'PENDING'),
      receivedAmount: null,
      balanceAmount: null,
      itemSubtotal: null,
      allocatedDiscount: null,
      finalItemNet: null,
      orderId: null,
      orderStatus: null,
      orderNotes: null,
      orderOpenedAt: null,
      orderClosedAt: null,
      orderTotal: null,
      orderReceived: null,
      orderBalance: null,
      paymentMethods: [],
      cashSessions: [],
      canAttributePayment: false,
      financialNote: isPaid
        ? 'Valor não considerado como recebido por falta de comprovação financeira.'
        : (isSubscriptionUnlinked
          ? 'Mensalista: não classificado como inadimplente. A cobertura individual não está vinculada.'
          : 'Sem operação financeira vinculada; saldo não comprovado.'),
      inconsistencies,
    };
  }

  if (activeLinks.length > 1) {
    addInconsistency(inconsistencies, {
      type: 'MULTIPLE_LINKS',
      label: 'Mais de um item ativo para a mesma reserva',
      severity: 'critical',
      entityId: rental.id,
      detail: `${activeLinks.length} itens ativos apontam para esta reserva.`,
      historical,
    });
  }

  const activeLink = activeLinks[0];
  const order = activeLink.order;
  const orderItems = (order.items || []).filter(item => item.subtotal != null);
  const gross = orderItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const allocatedDiscount = gross > 0 ? round2(Number(order.discount || 0) * (Number(activeLink.subtotal || 0) / gross)) : 0;
  const itemNet = round2(Number(activeLink.subtotal || 0) - allocatedDiscount);
  const orderReceived = round2((order.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const orderBalance = round2(Number(order.total || 0) - Number(order.discount || 0) - orderReceived);
  const settled = orderBalance <= 0.01;
  const partial = orderReceived > 0.01 && !settled;
  const singleItemOrder = orderItems.length === 1;
  const methods = paymentMethodsFor(order.payments || []);
  const sessions = cashSessionsFor(order.payments || []);

  if (order.status === 'CANCELED') {
    addInconsistency(inconsistencies, {
      type: 'ACTIVE_ITEM_ON_CANCELED_ORDER',
      label: 'Item ativo em operação cancelada',
      severity: 'high',
      entityId: rental.id,
      detail: `A operação ${order.id} está cancelada e ainda possui item ativo vinculado.`,
      historical,
    });
    return {
      financialStatus: 'CANCELED',
      receivedAmount: null,
      balanceAmount: null,
      itemSubtotal: round2(Number(activeLink.subtotal || 0)),
      allocatedDiscount: null,
      finalItemNet: null,
      orderId: order.id,
      orderStatus: order.status,
      orderNotes: order.notes || null,
      orderOpenedAt: order.openedAt || null,
      orderClosedAt: order.closedAt || null,
      orderTotal: round2(Number(order.total || 0)),
      orderReceived: orderReceived,
      orderBalance: orderBalance,
      paymentMethods: methods,
      cashSessions: sessions,
      canAttributePayment: false,
      financialNote: 'Operação cancelada; valores não compõem receita ou saldo a receber.',
      inconsistencies,
    };
  }
  if (order.customerId && order.customerId !== rental.customerId) {
    addInconsistency(inconsistencies, {
      type: 'CUSTOMER_MISMATCH',
      label: 'Cliente da reserva difere do cliente da operação',
      severity: 'high',
      entityId: rental.id,
      detail: 'Os vínculos apontam para clientes diferentes.',
      historical,
    });
  }
  if (Math.abs(Number(activeLink.subtotal || 0) - Number(rental.totalAmount || 0)) > 0.01) {
    addInconsistency(inconsistencies, {
      type: 'AMOUNT_MISMATCH',
      label: 'Valor da reserva difere do item faturado',
      severity: 'medium',
      entityId: rental.id,
      detail: `Reserva ${formatAgendaMoney(rental.totalAmount)}; item faturado ${formatAgendaMoney(activeLink.subtotal)}.`,
      historical,
    });
  }
  if (orderBalance < -0.01) {
    addInconsistency(inconsistencies, {
      type: 'OVERPAID_ORDER',
      label: 'Pagamento acima do total da operação',
      severity: 'high',
      entityId: order.id,
      detail: `Recebido ${formatAgendaMoney(orderReceived)} para total líquido ${formatAgendaMoney(Number(order.total || 0) - Number(order.discount || 0))}.`,
      historical,
    });
  }

  const rentalStatus = String(rental.status).toUpperCase();
  if (settled) {
    const statusMismatch = rentalStatus !== 'PAID';
    const openMismatch = order.status !== 'CLOSED';
    if (statusMismatch) {
      addInconsistency(inconsistencies, {
        type: 'PAID_STATUS_MISMATCH',
        label: 'Operação quitada com reserva divergente',
        severity: 'high',
        entityId: rental.id,
        detail: `A operação está quitada (${order.status}), mas a reserva está ${rentalStatus}.`,
        historical,
      });
    }
    if (openMismatch) {
      addInconsistency(inconsistencies, {
        type: 'PAID_STATUS_MISMATCH',
        label: 'Operação quitada sem fechamento',
        severity: 'medium',
        entityId: rental.id,
        detail: `Saldo zero, mas a operação está ${order.status}.`,
        historical,
      });
    }
    return {
      financialStatus: 'PAID',
      receivedAmount: itemNet,
      balanceAmount: 0,
      itemSubtotal: round2(Number(activeLink.subtotal || 0)),
      allocatedDiscount,
      finalItemNet: itemNet,
      orderId: order.id,
      orderStatus: order.status,
      orderNotes: order.notes || null,
      orderOpenedAt: order.openedAt || null,
      orderClosedAt: order.closedAt || null,
      orderTotal: round2(Number(order.total || 0)),
      orderReceived,
      orderBalance,
      paymentMethods: methods,
      cashSessions: sessions,
      canAttributePayment: true,
      financialNote: 'Operação integralmente paga; aluguel reconhecido como pago.',
      inconsistencies,
    };
  }

  if (rentalStatus === 'PAID') {
    addInconsistency(inconsistencies, {
      type: 'PAID_STATUS_MISMATCH',
      label: 'Reserva marcada como paga sem quitação',
      severity: 'critical',
      entityId: rental.id,
      detail: `A reserva está PAID, mas a operação ${order.id} possui saldo ${formatAgendaMoney(orderBalance)}.`,
      historical,
    });
  }

  if (partial) {
    if (singleItemOrder) {
      const received = round2(Math.min(orderReceived, itemNet));
      const balance = round2(Math.max(0, itemNet - received));
      return {
        financialStatus: 'PARTIAL',
        receivedAmount: received,
        balanceAmount: balance,
        itemSubtotal: round2(Number(activeLink.subtotal || 0)),
        allocatedDiscount,
        finalItemNet: itemNet,
        orderId: order.id,
        orderStatus: order.status,
        orderNotes: order.notes || null,
        orderOpenedAt: order.openedAt || null,
        orderClosedAt: order.closedAt || null,
        orderTotal: round2(Number(order.total || 0)),
        orderReceived,
        orderBalance,
        paymentMethods: methods,
        cashSessions: sessions,
        canAttributePayment: true,
        financialNote: 'Pagamento parcial atribuível: a operação contém apenas este item.',
        inconsistencies,
      };
    }
    addInconsistency(inconsistencies, {
      type: 'PAYMENT_NOT_INDIVIDUALIZED',
      label: 'Pagamento parcial não individualizado',
      severity: 'info',
      entityId: order.id,
      detail: `A operação ${order.id} possui pagamento parcial, mas também possui outros itens. Não é possível atribuir o valor ao aluguel sem rateio presumido.`,
      historical,
      countsAsInconsistency: false,
    });
    return {
      financialStatus: 'PARTIAL_UNALLOCATED',
      receivedAmount: null,
      balanceAmount: null,
      itemSubtotal: round2(Number(activeLink.subtotal || 0)),
      allocatedDiscount,
      finalItemNet: itemNet,
      orderId: order.id,
      orderStatus: order.status,
      orderNotes: order.notes || null,
      orderOpenedAt: order.openedAt || null,
      orderClosedAt: order.closedAt || null,
      orderTotal: round2(Number(order.total || 0)),
      orderReceived,
      orderBalance,
      paymentMethods: methods,
      cashSessions: sessions,
      canAttributePayment: false,
      financialNote: 'Pagamento não individualizado. O valor pago não foi atribuído ao aluguel.',
      inconsistencies,
    };
  }

  const received = 0;
  const balance = round2(itemNet);
  return {
    financialStatus: 'PENDING',
    receivedAmount: received,
    balanceAmount: balance,
    itemSubtotal: round2(Number(activeLink.subtotal || 0)),
    allocatedDiscount,
    finalItemNet: itemNet,
    orderId: order.id,
    orderStatus: order.status,
    orderNotes: order.notes || null,
    orderOpenedAt: order.openedAt || null,
    orderClosedAt: order.closedAt || null,
    orderTotal: round2(Number(order.total || 0)),
    orderReceived,
    orderBalance,
    paymentMethods: methods,
    cashSessions: sessions,
    canAttributePayment: true,
    financialNote: 'Sem pagamento confirmado para a operação vinculada.',
    inconsistencies,
  };
}

function normalizeRental(rental: AgendaRentalInput, now: Date): AgendaReservation {
  const financial = computeFinancial(rental);
  const field = normalizeAgendaField(rental.resource);
  const operationalStatus = operationalStatusFor(rental, now);
  const durationMinutes = Math.max(0, Math.round((new Date(rental.endTime).getTime() - new Date(rental.startTime).getTime()) / minuteMs));
  const isHistorical = new Date(rental.createdAt) < AGENDA_LINK_FEATURE_START;
  const source = String(rental.source || 'LEGACY').toUpperCase();

  return {
    id: rental.id,
    customerId: rental.customerId,
    customerName: rental.customerName || 'Cliente não identificado',
    customerPhone: rental.customerPhone || null,
    isSubscriber: rental.isSubscriber,
    resource: field || String(rental.resource || ''),
    field,
    startTime: rental.startTime,
    endTime: rental.endTime,
    startDateKey: agendaDateKey(rental.startTime),
    endDateKey: agendaDateKey(rental.endTime),
    startTimeLabel: formatRentalTimeInput(rental.startTime),
    endTimeLabel: formatRentalTimeInput(rental.endTime),
    durationMinutes,
    status: String(rental.status || '').toUpperCase(),
    source,
    sourceLabel: AGENDA_SOURCE_LABELS[source] || source,
    operationalStatus,
    operationalLabel: AGENDA_OPERATIONAL_LABELS[operationalStatus],
    financialStatus: financial.financialStatus,
    financialLabel: AGENDA_FINANCIAL_LABELS[financial.financialStatus],
    financialTone: agendaFinancialTone(financial.financialStatus),
    contractedAmount: round2(rental.totalAmount),
    itemSubtotal: financial.itemSubtotal,
    allocatedDiscount: financial.allocatedDiscount,
    finalItemNet: financial.finalItemNet,
    receivedAmount: financial.receivedAmount,
    balanceAmount: financial.balanceAmount,
    orderId: financial.orderId,
    orderStatus: financial.orderStatus,
    orderNotes: financial.orderNotes,
    orderOpenedAt: financial.orderOpenedAt,
    orderClosedAt: financial.orderClosedAt,
    orderTotal: financial.orderTotal,
    orderReceived: financial.orderReceived,
    orderBalance: financial.orderBalance,
    paymentMethods: financial.paymentMethods,
    cashSessions: financial.cashSessions,
    canAttributePayment: financial.canAttributePayment,
    financialNote: financial.financialNote,
    isHistorical,
    inconsistencies: financial.inconsistencies,
    hasInconsistency: financial.inconsistencies.some(item => item.countsAsInconsistency),
    original: {
      startTime: null,
      endTime: null,
      durationMinutes: null,
      amount: null,
      additions: null,
      historyAvailable: false,
    },
    played: {
      startTime: null,
      endTime: null,
    },
  };
}

function matchesFilters(reservation: AgendaReservation, filters: AgendaFilters): boolean {
  if (filters.field !== 'ALL' && reservation.field !== filters.field) return false;
  if (filters.customerId && reservation.customerId !== filters.customerId) return false;
  if (filters.customerType === 'MENSALISTA' && !reservation.isSubscriber) return false;
  if (filters.customerType === 'AVULSO' && reservation.isSubscriber) return false;
  if (filters.source !== 'ALL' && reservation.source !== filters.source) return false;
  if (filters.operational !== 'ALL' && reservation.operationalStatus !== filters.operational) return false;
  if (filters.financial === 'PAID' && reservation.financialStatus !== 'PAID') return false;
  if (filters.financial === 'PARTIAL' && reservation.financialStatus !== 'PARTIAL' && reservation.financialStatus !== 'PARTIAL_UNALLOCATED') return false;
  if (filters.financial === 'PENDING' && reservation.financialStatus !== 'PENDING') return false;
  if (filters.financial === 'CANCELED' && reservation.financialStatus !== 'CANCELED') return false;
  if (filters.financial === 'UNPROVEN' && reservation.financialStatus !== 'PAID_UNPROVEN' && reservation.financialStatus !== 'SUBSCRIPTION_UNLINKED') return false;
  return true;
}

function applyGlobalInconsistencies(reservations: AgendaReservation[]) {
  const active = reservations.filter(rental => rental.status !== 'CANCELED' && rental.durationMinutes > 0);

  const duplicateGroups = new Map<string, AgendaReservation[]>();
  for (const rental of active) {
    const key = [rental.customerId, rental.resource, rental.startTime, rental.endTime].join('|');
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key)!.push(rental);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    const entityId = group.map(rental => rental.id).sort().join('|');
    for (const rental of group) {
      addInconsistency(rental.inconsistencies, {
        type: 'DUPLICATE_RENTAL',
        label: 'Reserva duplicada',
        severity: 'high',
        entityId,
        detail: `${group.length} reservas idênticas no mesmo cliente, campo e horário.`,
        historical: rental.isHistorical,
      });
    }
  }

  const byField = new Map<string, AgendaReservation[]>();
  for (const rental of active) {
    if (!rental.field) {
      addInconsistency(rental.inconsistencies, {
        type: 'INVALID_FIELD',
        label: 'Campo inválido',
        severity: 'medium',
        entityId: rental.id,
        detail: `Campo "${rental.resource}" fora de FUT5/FUT7.`,
        historical: rental.isHistorical,
      });
      continue;
    }
    if (!byField.has(rental.field)) byField.set(rental.field, []);
    byField.get(rental.field)!.push(rental);
  }

  for (const [field, list] of byField.entries()) {
    const sorted = [...list].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    let maxEnd: AgendaReservation | null = null;
    for (const rental of sorted) {
      if (maxEnd && new Date(rental.startTime) < new Date(maxEnd.endTime)) {
        const entityId = [maxEnd.id, rental.id].sort().join('|');
        const detail = `${field}: ${maxEnd.startTimeLabel}-${maxEnd.endTimeLabel} conflita com ${rental.startTimeLabel}-${rental.endTimeLabel}.`;
        for (const current of [maxEnd, rental]) {
          addInconsistency(current.inconsistencies, {
            type: 'OVERLAP_CONFLICT',
            label: 'Conflito de horário no mesmo campo',
            severity: 'critical',
            entityId,
            detail,
            historical: current.isHistorical,
          });
        }
      }
      if (!maxEnd || new Date(rental.endTime) > new Date(maxEnd.endTime)) maxEnd = rental;
    }
  }

  for (const rental of reservations) {
    if (rental.durationMinutes <= 0) {
      addInconsistency(rental.inconsistencies, {
        type: 'INVALID_PERIOD',
        label: 'Período inválido',
        severity: 'high',
        entityId: rental.id,
        detail: 'Horário final menor ou igual ao inicial.',
        historical: rental.isHistorical,
      });
    }
    rental.hasInconsistency = rental.inconsistencies.some(item => item.countsAsInconsistency);
  }
}

function buildHoursMetrics(
  reservations: AgendaReservation[],
  range: AgendaRange,
  schedule: AgendaSchedule,
  selectedFields: AgendaField[]
): Pick<AgendaMetrics, 'hoursReserved' | 'hoursAvailable' | 'hoursRegularCapacity'> {
  const minuteSets: Record<AgendaField, Set<number>> = {
    FUT5: new Set<number>(),
    FUT7: new Set<number>(),
  };
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  for (const rental of reservations) {
    if (rental.status === 'CANCELED' || !rental.field || rental.durationMinutes <= 0) continue;
    const startMs = Math.max(new Date(rental.startTime).getTime(), fromMs);
    const endMs = Math.min(new Date(rental.endTime).getTime(), toMs);
    if (endMs <= startMs) continue;
    for (let time = Math.floor(startMs / minuteMs) * minuteMs; time < endMs; time += minuteMs) {
      minuteSets[rental.field].add(time);
    }
  }

  const hoursReserved = { FUT5: 0, FUT7: 0, total: 0 };
  const hoursAvailable = { FUT5: 0, FUT7: 0, total: 0 };
  const hoursRegularCapacity = { FUT5: 0, FUT7: 0, total: 0 };

  for (const field of selectedFields) {
    let capacityMinutes = 0;
    for (const dayKey of range.days) {
      const noon = new Date(startOfAgendaDay(dayKey).getTime() + 12 * 60 * minuteMs);
      capacityMinutes += regularMinutesForAgendaDay(schedule, agendaWeekday(noon), field);
    }
    let regularReservedMinutes = 0;
    for (const timeMs of minuteSets[field]) {
      const date = new Date(timeMs);
      if (inScheduleBlock(schedule, agendaWeekday(date), field, agendaMinuteOfDay(date))) {
        regularReservedMinutes += 1;
      }
    }
    const reservedHours = round2(minuteSets[field].size / 60);
    const capacityHours = round2(capacityMinutes / 60);
    const availableHours = round2(Math.max(0, capacityMinutes - regularReservedMinutes) / 60);
    hoursReserved[field] = reservedHours;
    hoursAvailable[field] = availableHours;
    hoursRegularCapacity[field] = capacityHours;
    hoursReserved.total = round2(hoursReserved.total + reservedHours);
    hoursAvailable.total = round2(hoursAvailable.total + availableHours);
    hoursRegularCapacity.total = round2(hoursRegularCapacity.total + capacityHours);
  }

  return { hoursReserved, hoursAvailable, hoursRegularCapacity };
}

function normalizeUnlinkedItems(
  items: AgendaUnlinkedItemInput[],
  filters: AgendaFilters,
  range: AgendaRange
): Array<AgendaUnlinkedItemInput & { historical: boolean }> {
  return items
    .filter(item => {
      const time = new Date(item.orderDate).getTime();
      if (time < new Date(range.from).getTime() || time >= new Date(range.to).getTime()) return false;
      if (filters.field !== 'ALL' && item.field !== filters.field) return false;
      if (filters.customerId && item.customerId !== filters.customerId) return false;
      if (filters.source !== 'ALL') return false;
      return true;
    })
    .map(item => ({
      ...item,
      historical: new Date(item.orderDate) < AGENDA_LINK_FEATURE_START,
    }))
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
}

export function buildAgendaData(input: BuildAgendaInput): AgendaData {
  const now = input.now || new Date();
  const filters = { ...DEFAULT_AGENDA_FILTERS, ...(input.filters || {}) };
  const range = getAgendaRange(input.view, input.anchor);
  const schedule: AgendaSchedule = input.schedule || { entries: [] };

  const overlapping = input.rentals
    .filter(rental => overlapsAgendaRange(rental.startTime, rental.endTime, range))
    .map(rental => normalizeRental(rental, now))
    .filter(rental => matchesFilters(rental, filters));

  applyGlobalInconsistencies(overlapping);

  const periodReservations = overlapping.filter(rental => isWithinRange(rental.startTime, range));
  const unlinkedItems = normalizeUnlinkedItems(input.unlinkedItems || [], filters, range);

  const selectedFields: AgendaField[] = filters.field === 'ALL' ? AGENDA_FIELDS : [filters.field];
  const hours = buildHoursMetrics(overlapping, range, schedule, selectedFields);

  const metrics: AgendaMetrics = {
    totalReservations: periodReservations.length,
    paid: periodReservations.filter(rental => rental.financialStatus === 'PAID').length,
    partial: periodReservations.filter(rental => rental.financialStatus === 'PARTIAL' || rental.financialStatus === 'PARTIAL_UNALLOCATED').length,
    pending: periodReservations.filter(rental => rental.financialStatus === 'PENDING').length,
    canceled: periodReservations.filter(rental => rental.financialStatus === 'CANCELED').length,
    unproven: periodReservations.filter(rental => rental.financialStatus === 'PAID_UNPROVEN' || rental.financialStatus === 'SUBSCRIPTION_UNLINKED').length,
    noShow: periodReservations.filter(rental => rental.operationalStatus === 'NO_SHOW').length,
    hoursReserved: hours.hoursReserved,
    hoursAvailable: hours.hoursAvailable,
    hoursRegularCapacity: hours.hoursRegularCapacity,
    contractedValue: round2(periodReservations.filter(rental => rental.financialStatus !== 'CANCELED').reduce((sum, rental) => sum + rental.contractedAmount, 0)),
    receivedValue: round2(periodReservations.filter(rental => rental.financialStatus !== 'CANCELED').reduce((sum, rental) => sum + (rental.receivedAmount || 0), 0)),
    balanceValue: round2(periodReservations.filter(rental => rental.financialStatus === 'PENDING' || rental.financialStatus === 'PARTIAL').reduce((sum, rental) => sum + (rental.balanceAmount || 0), 0)),
    inconsistencyCountCurrent: 0,
    inconsistencyCountHistorical: 0,
  };

  const typeMap = new Map<string, AgendaAuditType>();
  const currentKeys = new Set<string>();
  const historicalKeys = new Set<string>();

  for (const rental of overlapping) {
    for (const inconsistency of rental.inconsistencies) {
      if (!inconsistency.countsAsInconsistency) continue;
      const key = `${inconsistency.type}|${inconsistency.entityId}|${inconsistency.historical ? 'H' : 'C'}`;
      if (!typeMap.has(inconsistency.type)) {
        typeMap.set(inconsistency.type, {
          type: inconsistency.type,
          label: inconsistency.label,
          severity: inconsistency.severity,
          current: 0,
          historical: 0,
        });
      }
      const type = typeMap.get(inconsistency.type)!;
      if (inconsistency.historical) {
        if (!historicalKeys.has(key)) {
          historicalKeys.add(key);
          type.historical += 1;
        }
      } else if (!currentKeys.has(key)) {
        currentKeys.add(key);
        type.current += 1;
      }
    }
  }

  for (const item of unlinkedItems) {
    const key = `UNLINKED_FIELD_ITEM|${item.id}|${item.historical ? 'H' : 'C'}`;
    if (!typeMap.has('UNLINKED_FIELD_ITEM')) {
      typeMap.set('UNLINKED_FIELD_ITEM', {
        type: 'UNLINKED_FIELD_ITEM',
        label: 'Item de aluguel sem reserva vinculada',
        severity: item.historical ? 'info' : 'high',
        current: 0,
        historical: 0,
      });
    }
    const type = typeMap.get('UNLINKED_FIELD_ITEM')!;
    if (item.historical) {
      if (!historicalKeys.has(key)) {
        historicalKeys.add(key);
        type.historical += 1;
      }
    } else if (!currentKeys.has(key)) {
      currentKeys.add(key);
      type.current += 1;
    }
  }

  const auditTypes = Array.from(typeMap.values()).sort((a, b) => {
    if (a.severity !== b.severity) {
      const order: Record<AgendaInconsistencySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return order[a.severity] - order[b.severity];
    }
    return a.label.localeCompare(b.label);
  });

  const currentInconsistencyKeys = new Set<string>();
  for (const rental of overlapping) {
    for (const inconsistency of rental.inconsistencies) {
      if (!inconsistency.countsAsInconsistency || inconsistency.historical) continue;
      currentInconsistencyKeys.add(`${inconsistency.type}|${inconsistency.entityId}`);
    }
  }
  for (const item of unlinkedItems) {
    if (item.historical) continue;
    currentInconsistencyKeys.add(`UNLINKED_FIELD_ITEM|${item.id}`);
  }

  const historicalInconsistencyKeys = new Set<string>();
  for (const rental of overlapping) {
    for (const inconsistency of rental.inconsistencies) {
      if (!inconsistency.countsAsInconsistency || !inconsistency.historical) continue;
      historicalInconsistencyKeys.add(`${inconsistency.type}|${inconsistency.entityId}`);
    }
  }
  for (const item of unlinkedItems) {
    if (!item.historical) continue;
    historicalInconsistencyKeys.add(`UNLINKED_FIELD_ITEM|${item.id}`);
  }

  metrics.inconsistencyCountCurrent = currentInconsistencyKeys.size;
  metrics.inconsistencyCountHistorical = historicalInconsistencyKeys.size;

  const unlinkedCurrentValue = round2(unlinkedItems.filter(item => !item.historical).reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const unlinkedHistoricalValue = round2(unlinkedItems.filter(item => item.historical).reduce((sum, item) => sum + Number(item.subtotal || 0), 0));

  return {
    range,
    reservations: overlapping.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    metrics,
    audit: {
      types: auditTypes,
      unlinkedItems,
      current: metrics.inconsistencyCountCurrent,
      historical: metrics.inconsistencyCountHistorical,
      unlinkedCurrentValue,
      unlinkedHistoricalValue,
    },
    customers: input.customers || [],
    schedule,
    filters,
    generatedAt: now.toISOString(),
    limitations: [
      'Horário original, duração original e valor original não são preservados pela estrutura atual.',
      'Pagamentos são registrados no nível da operação. Sem item único, o rateio por reserva não é presumido.',
      'Pagamentos de mensalidade não possuem vínculo individual com cada jogo.',
      'Canal Comanda/PDV não é gravado explicitamente; a Agenda exibe a operação vinculada.',
      'O horário efetivamente jogado não é registrado.',
      'As reservas usam o fuso America/Fortaleza em lib/rental-time; a Agenda segue esse fuso para exibir os horários como foram cadastrados.',
    ],
  };
}

export function reservationSegmentsForDay(reservation: AgendaReservation, dayKey: string): Array<{ startMinute: number; endMinute: number }> {
  const dayStart = startOfAgendaDay(dayKey).getTime();
  const dayEnd = dayStart + dayMs;
  const start = Math.max(new Date(reservation.startTime).getTime(), dayStart);
  const end = Math.min(new Date(reservation.endTime).getTime(), dayEnd);
  if (end <= start) return [];
  return [{
    startMinute: Math.floor((start - dayStart) / minuteMs),
    endMinute: Math.ceil((end - dayStart) / minuteMs),
  }];
}

export function minutesToLabel(minutes: number): string {
  const safe = Math.max(0, Math.min(1440, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
