import {
  AGENDA_LINK_FEATURE_START,
  computeFinancial,
  isAgendaFieldRentalName,
  normalizeAgendaField,
  type AgendaOrderInput,
  type AgendaOrderItemInput,
  type AgendaPaymentInput,
  type AgendaRentalInput,
  type FinancialComputation,
} from './agenda';
import {
  APP_TIME_ZONE,
  LEGACY_RENTAL_TIME_ZONE,
  formatCuiabaDateTime,
  formatDateKeyInZone,
  isLegacyRentalConvention,
  operationalRentalWindow,
} from './time-zone';

export type AuditSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type AuditAdminStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'IGNORED';
export type AuditTechnicalStatus = 'ACTIVE' | 'CLEARED';

export type AuditOccurrenceCandidate = {
  fingerprint: string;
  type: string;
  severity: AuditSeverity;
  entityType: string;
  entityId: string;
  orderId?: string | null;
  rentalId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  resource?: string | null;
  rentalStartTime?: Date | null;
  rentalEndTime?: Date | null;
  title: string;
  details: string;
  evidence?: Record<string, unknown> | null;
};

export type AuditOrderItemLite = {
  id: string;
  subtotal: number;
  rentalId?: string | null;
  productName?: string | null;
  serviceName?: string | null;
};

export type AuditPayment = {
  id: string;
  amount: number;
  method: string;
  date: string;
  cashRegisterId?: string | null;
  cashRegister?: {
    id: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
  } | null;
};

export type AuditOrder = {
  id: string;
  status: string;
  total: number;
  discount: number;
  notes?: string | null;
  openedAt: string;
  closedAt?: string | null;
  customerId?: string | null;
  payments: AuditPayment[];
  items: AuditOrderItemLite[];
};

export type AuditLinkedItem = {
  id: string;
  orderId: string;
  status: string;
  subtotal: number;
  quantity: number;
  unitPrice: number;
  rentalId: string;
  productName?: string | null;
  serviceName?: string | null;
  order: AuditOrder;
};

export type AuditRental = {
  id: string;
  customerId: string;
  customerName: string;
  isSubscriber: boolean;
  resource: string;
  startTime: Date | string;
  endTime: Date | string;
  totalAmount: number;
  status: string;
  source: string;
  timeConvention?: string | null;
  cancelledAt?: Date | string | null;
  createdAt: Date | string;
  orderItems: AuditLinkedItem[];
};

export type AuditUnlinkedRentalItem = {
  id: string;
  orderId: string;
  quantity: number;
  subtotal: number;
  productName?: string | null;
  serviceName?: string | null;
  order: {
    id: string;
    status: string;
    openedAt: string;
    customerId?: string | null;
    customerName?: string | null;
  };
};

export type AuditChangeLog = {
  id: string;
  rentalId: string;
  orderId?: string | null;
  changedByName: string;
  reason: string;
  beforeData: unknown;
  afterData: unknown;
  changedFields: string[];
  requiresFinancialReview: boolean;
  financialDifference?: number | null;
  createdAt: Date | string;
  rental?: {
    id: string;
    customerId: string;
    customerName?: string | null;
    resource: string;
    startTime: Date | string;
    endTime: Date | string;
    status: string;
    timeConvention?: string | null;
  } | null;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  details?: string | null;
  timestamp: Date | string;
  userId?: string | null;
};

export type AuditOrphanLink = {
  id: string;
  orderId: string;
  rentalId: string;
  status: string;
};

export type AuditPreviousRun = {
  id: string;
  totalRentals: number;
  startedAt: Date | string;
};

export type AuditDetectionInput = {
  rentals: AuditRental[];
  unlinkedRentalItems: AuditUnlinkedRentalItem[];
  changeLogs: AuditChangeLog[];
  auditLogs: AuditLogEntry[];
  orphanLinks: AuditOrphanLink[];
  previousRun?: AuditPreviousRun | null;
  now?: Date;
};

export type AuditDetectionResult = {
  occurrences: AuditOccurrenceCandidate[];
  checksRun: number;
  totalRentals: number;
  totalLinkedItems: number;
};

export const RENTAL_AUDIT_MAX_OCCURRENCES = 5000;
export const RENTAL_AUDIT_MAX_RENTALS = 5000;
export const RENTAL_AUDIT_MAX_ORDER_ITEMS = 20000;

const VALID_SOURCES = new Set(['SUBSCRIPTION', 'WALK_IN', 'MANUAL', 'LEGACY']);
const VALID_CONVENTIONS = new Set(['CUIABA', 'LEGACY_FORTALEZA']);

const AGENDA_TYPE_MAP: Record<string, { type: string; severity?: AuditSeverity; titlePrefix?: string }> = {
  NO_CUSTOMER: { type: 'RENTAL_WITHOUT_CUSTOMER' },
  CANCELED_RENTAL_WITH_ACTIVE_ITEM: { type: 'ACTIVE_LINK_ON_CANCELED_RENTAL' },
  PAID_WITHOUT_PROOF: { type: 'PAID_RENTAL_WITHOUT_ORDER', severity: 'CRITICAL' },
  SUBSCRIPTION_UNLINKED: { type: 'SUBSCRIPTION_COVERAGE_UNLINKED', severity: 'INFO' },
  UNLINKED_AVULSO: { type: 'RENTAL_WITHOUT_OPERATION' },
  MULTIPLE_LINKS: { type: 'DUPLICATE_ACTIVE_LINK' },
  ACTIVE_ITEM_ON_CANCELED_ORDER: { type: 'ACTIVE_ITEM_ON_CANCELED_ORDER' },
  CUSTOMER_MISMATCH: { type: 'CUSTOMER_MISMATCH' },
  AMOUNT_MISMATCH: { type: 'AMOUNT_MISMATCH' },
  OVERPAID_ORDER: { type: 'POSSIBLE_OVERPAYMENT', severity: 'HIGH', titlePrefix: 'Possível: ' },
  PAID_STATUS_MISMATCH: { type: 'PAID_STATUS_MISMATCH' },
  PAYMENT_NOT_INDIVIDUALIZED: { type: 'PARTIAL_PAYMENT_NOT_INDIVIDUALIZED', severity: 'INFO' },
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function money(value: number | null | undefined): string {
  return `R$ ${(Number(value) || 0).toFixed(2)}`;
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeResource(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function fieldFromProductName(value: unknown): 'FUT5' | 'FUT7' | null {
  const text = String(value || '');
  if (/fut\s*5/i.test(text)) return 'FUT5';
  if (/fut\s*7/i.test(text)) return 'FUT7';
  return null;
}

function operationalWindow(rental: AuditRental) {
  return operationalRentalWindow(rental.startTime, rental.endTime, rental.timeConvention);
}

function periodLabel(rental: AuditRental): string {
  const window = operationalWindow(rental);
  return `${formatCuiabaDateTime(window.startTime)} até ${formatCuiabaDateTime(window.endTime)}`;
}

function durationMinutes(rental: AuditRental): number {
  const window = operationalWindow(rental);
  return Math.max(0, Math.round((window.endTime.getTime() - window.startTime.getTime()) / 60000));
}

function toAgendaOrder(order: AuditOrder): AgendaOrderInput {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    discount: order.discount,
    notes: order.notes ?? null,
    openedAt: order.openedAt,
    closedAt: order.closedAt ?? null,
    customerId: order.customerId ?? null,
    payments: order.payments.map((payment): AgendaPaymentInput => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      date: payment.date,
      cashRegister: payment.cashRegister
        ? {
            id: payment.cashRegister.id,
            status: payment.cashRegister.status,
            openedAt: payment.cashRegister.openedAt,
            closedAt: payment.cashRegister.closedAt,
          }
        : null,
    })),
    items: order.items.map((item): AgendaOrderItemInput => ({
      id: item.id,
      subtotal: item.subtotal,
      rentalId: item.rentalId ?? null,
      productName: item.productName ?? null,
      serviceName: item.serviceName ?? null,
    })),
  };
}

function toAgendaRental(rental: AuditRental): AgendaRentalInput {
  const window = operationalWindow(rental);
  return {
    id: rental.id,
    customerId: rental.customerId,
    customerName: rental.customerName,
    isSubscriber: rental.isSubscriber,
    resource: rental.resource,
    startTime: window.startTime.toISOString(),
    endTime: window.endTime.toISOString(),
    totalAmount: rental.totalAmount,
    status: rental.status,
    source: rental.source,
    timeConvention: rental.timeConvention ?? undefined,
    cancelledAt: iso(rental.cancelledAt),
    createdAt: iso(rental.createdAt) || new Date(0).toISOString(),
    orderItems: rental.orderItems.map(item => ({
      id: item.id,
      status: item.status,
      subtotal: item.subtotal,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      productName: item.productName ?? null,
      serviceName: item.serviceName ?? null,
      order: toAgendaOrder(item.order),
    })),
  };
}

function baseEvidence(rental: AuditRental, financial?: FinancialComputation): Record<string, unknown> {
  const window = operationalWindow(rental);
  return {
    rental: {
      id: rental.id,
      customerId: rental.customerId,
      customerName: rental.customerName,
      resource: rental.resource,
      status: rental.status,
      source: rental.source,
      timeConvention: rental.timeConvention,
      startTime: iso(rental.startTime),
      endTime: iso(rental.endTime),
      operationalStartTime: window.startTime.toISOString(),
      operationalEndTime: window.endTime.toISOString(),
      totalAmount: rental.totalAmount,
      cancelledAt: iso(rental.cancelledAt),
      createdAt: iso(rental.createdAt),
    },
    financial: financial
      ? {
          status: financial.financialStatus,
          orderId: financial.orderId,
          orderStatus: financial.orderStatus,
          orderTotal: financial.orderTotal,
          orderReceived: financial.orderReceived,
          orderBalance: financial.orderBalance,
          itemSubtotal: financial.itemSubtotal,
          allocatedDiscount: financial.allocatedDiscount,
          finalItemNet: financial.finalItemNet,
          canAttributePayment: financial.canAttributePayment,
          financialNote: financial.financialNote,
          paymentMethods: financial.paymentMethods,
          cashSessions: financial.cashSessions,
        }
      : null,
  };
}

export function detectRentalAuditOccurrences(input: AuditDetectionInput): AuditDetectionResult {
  const rentals = input.rentals;
  const occurrences: AuditOccurrenceCandidate[] = [];
  const seen = new Set<string>();
  let checksRun = 0;

  const add = (candidate: AuditOccurrenceCandidate) => {
    if (seen.has(candidate.fingerprint)) return;
    seen.add(candidate.fingerprint);
    occurrences.push(candidate);
  };

  const linkedItems = new Set<string>();
  const ordersById = new Map<string, AuditOrder>();
  let historicalPaidWithoutOrder = 0;
  let historicalWithoutOperation = 0;

  for (const rental of rentals) {
    const window = operationalWindow(rental);
    const resource = normalizeResource(rental.resource);
    const field = normalizeAgendaField(rental.resource);
    const convention = normalizeResource(rental.timeConvention);
    const activeLinks = rental.orderItems.filter(item => item.status === 'ACTIVE');
    const linkedRentalId = rental.id;

    for (const item of rental.orderItems) {
      if (item.rentalId && item.rentalId === linkedRentalId) linkedItems.add(item.id);
      if (!ordersById.has(item.order.id)) {
        ordersById.set(item.order.id, item.order);
      }
    }

    checksRun += 3;

    if (!rental.customerId) {
      add({
        fingerprint: `RENTAL_WITHOUT_CUSTOMER|${rental.id}`,
        type: 'RENTAL_WITHOUT_CUSTOMER',
        severity: 'HIGH',
        entityType: 'Rental',
        entityId: rental.id,
        rentalId: rental.id,
        customerId: rental.customerId || null,
        customerName: rental.customerName || null,
        resource,
        rentalStartTime: window.startTime,
        rentalEndTime: window.endTime,
        title: 'Reserva sem vínculo com cliente',
        details: 'A reserva não possui cliente vinculado.',
        evidence: baseEvidence(rental),
      });
    }

    if (!field) {
      add({
        fingerprint: `INVALID_FIELD|${rental.id}`,
        type: 'INVALID_FIELD',
        severity: 'HIGH',
        entityType: 'Rental',
        entityId: rental.id,
        rentalId: rental.id,
        customerId: rental.customerId,
        customerName: rental.customerName || null,
        resource,
        rentalStartTime: window.startTime,
        rentalEndTime: window.endTime,
        title: 'Reserva vinculada a campo inválido',
        details: `A reserva está no recurso "${rental.resource}", fora de FUT5/FUT7.`,
        evidence: baseEvidence(rental),
      });
    }

    if (window.endTime.getTime() <= window.startTime.getTime()) {
      add({
        fingerprint: `INVALID_PERIOD|${rental.id}`,
        type: 'INVALID_PERIOD',
        severity: 'HIGH',
        entityType: 'Rental',
        entityId: rental.id,
        rentalId: rental.id,
        customerId: rental.customerId,
        customerName: rental.customerName || null,
        resource,
        rentalStartTime: window.startTime,
        rentalEndTime: window.endTime,
        title: 'Reserva com período inválido',
        details: `Início ${formatCuiabaDateTime(window.startTime)} e fim ${formatCuiabaDateTime(window.endTime)}.`,
        evidence: baseEvidence(rental),
      });
    }

    if (!VALID_SOURCES.has(String(rental.source || '').toUpperCase())) {
      add({
        fingerprint: `INVALID_SOURCE|${rental.id}`,
        type: 'INVALID_SOURCE',
        severity: 'MEDIUM',
        entityType: 'Rental',
        entityId: rental.id,
        rentalId: rental.id,
        customerId: rental.customerId,
        customerName: rental.customerName || null,
        resource,
        rentalStartTime: window.startTime,
        rentalEndTime: window.endTime,
        title: 'Reserva com origem inválida',
        details: `A reserva possui origem "${rental.source || 'vazia'}".`,
        evidence: baseEvidence(rental),
      });
    }

    if (convention && !VALID_CONVENTIONS.has(convention)) {
      add({
        fingerprint: `INVALID_TIME_CONVENTION|${rental.id}`,
        type: 'INVALID_TIME_CONVENTION',
        severity: 'HIGH',
        entityType: 'Rental',
        entityId: rental.id,
        rentalId: rental.id,
        customerId: rental.customerId,
        customerName: rental.customerName || null,
        resource,
        rentalStartTime: window.startTime,
        rentalEndTime: window.endTime,
        title: 'Reserva com convenção de horário inválida',
        details: `A reserva possui convenção "${rental.timeConvention}".`,
        evidence: baseEvidence(rental),
      });
    }

    const isCancelled = String(rental.status || '').toUpperCase() === 'CANCELED';
    if (isCancelled && !rental.cancelledAt) {
      add({
        fingerprint: `CANCELED_WITHOUT_TIMESTAMP|${rental.id}`,
        type: 'CANCELED_WITHOUT_TIMESTAMP',
        severity: 'LOW',
        entityType: 'Rental',
        entityId: rental.id,
        rentalId: rental.id,
        customerId: rental.customerId,
        customerName: rental.customerName || null,
        resource,
        rentalStartTime: window.startTime,
        rentalEndTime: window.endTime,
        title: 'Reserva cancelada sem data de cancelamento',
        details: 'A reserva está cancelada, mas não possui cancelledAt registrado.',
        evidence: baseEvidence(rental),
      });
    }
    if (!isCancelled && rental.cancelledAt) {
      add({
        fingerprint: `CANCELLED_AT_WITHOUT_STATUS|${rental.id}`,
        type: 'CANCELLED_AT_WITHOUT_STATUS',
        severity: 'LOW',
        entityType: 'Rental',
        entityId: rental.id,
        rentalId: rental.id,
        customerId: rental.customerId,
        customerName: rental.customerName || null,
        resource,
        rentalStartTime: window.startTime,
        rentalEndTime: window.endTime,
        title: 'Data de cancelamento sem status cancelado',
        details: `A reserva possui cancelledAt, mas o status é ${rental.status}.`,
        evidence: baseEvidence(rental),
      });
    }

    if (isLegacyRentalConvention(rental.timeConvention)) {
      const startRaw = toDate(rental.startTime);
      const endRaw = toDate(rental.endTime);
      const startCuiaba = formatDateKeyInZone(startRaw, APP_TIME_ZONE);
      const startFortaleza = formatDateKeyInZone(startRaw, LEGACY_RENTAL_TIME_ZONE);
      const endCuiaba = formatDateKeyInZone(endRaw, APP_TIME_ZONE);
      const endFortaleza = formatDateKeyInZone(endRaw, LEGACY_RENTAL_TIME_ZONE);
      if (startCuiaba !== startFortaleza || endCuiaba !== endFortaleza) {
        add({
          fingerprint: `DATE_BOUNDARY|${rental.id}|${startCuiaba}|${startFortaleza}|${endCuiaba}|${endFortaleza}`,
          type: 'DATE_BOUNDARY_DIVERGENCE',
          severity: 'INFO',
          entityType: 'Rental',
          entityId: rental.id,
          rentalId: rental.id,
          customerId: rental.customerId,
          customerName: rental.customerName || null,
          resource,
          rentalStartTime: window.startTime,
          rentalEndTime: window.endTime,
          title: 'Divergência de fronteira de data em reserva histórica',
          details: `Data civil difere entre Cuiabá e Fortaleza. Início bruto ${startCuiaba}/${startFortaleza}; fim bruto ${endCuiaba}/${endFortaleza}. Exibição T1: ${periodLabel(rental)}. Sinalização apenas; requer análise individual da Fase 2A.`,
          evidence: {
            ...baseEvidence(rental),
            boundary: {
              startRaw: startRaw.toISOString(),
              endRaw: endRaw.toISOString(),
              startCuiaba,
              startFortaleza,
              endCuiaba,
              endFortaleza,
            },
          },
        });
      }
    }

    for (const item of rental.orderItems) {
      const productName = item.productName || item.serviceName || '';
      const fieldFromProduct = fieldFromProductName(productName);
      const productIsRental = isAgendaFieldRentalName(productName);
      checksRun += 1;

      if (field && fieldFromProduct && field !== fieldFromProduct) {
        add({
          fingerprint: `FIELD_PRODUCT_MISMATCH|${item.id}`,
          type: 'FIELD_PRODUCT_MISMATCH',
          severity: 'HIGH',
          entityType: 'OrderItem',
          entityId: item.id,
          orderId: item.orderId,
          rentalId: rental.id,
          customerId: rental.customerId,
          customerName: rental.customerName || null,
          resource,
          rentalStartTime: window.startTime,
          rentalEndTime: window.endTime,
          title: 'Campo reservado difere do produto de aluguel lançado',
          details: `Reserva em ${field}, mas o item ${item.id} é "${productName}".`,
          evidence: { ...baseEvidence(rental), item: { id: item.id, productName, quantity: item.quantity, subtotal: item.subtotal } },
        });
      }

      if (!productIsRental) {
        add({
          fingerprint: `LINKED_ITEM_NOT_RENTAL|${item.id}`,
          type: 'LINKED_ITEM_NOT_RENTAL',
          severity: 'MEDIUM',
          entityType: 'OrderItem',
          entityId: item.id,
          orderId: item.orderId,
          rentalId: rental.id,
          customerId: rental.customerId,
          customerName: rental.customerName || null,
          resource,
          rentalStartTime: window.startTime,
          rentalEndTime: window.endTime,
          title: 'Item vinculado não é de aluguel de campo',
          details: `O item ${item.id} está vinculado à reserva, mas o produto/serviço é "${productName || 'não informado'}".`,
          evidence: { ...baseEvidence(rental), item: { id: item.id, productName, quantity: item.quantity, subtotal: item.subtotal } },
        });
      }

      if (item.status === 'ACTIVE' && productIsRental) {
        const expectedHours = durationMinutes(rental) / 60;
        if (expectedHours > 0 && item.quantity > 0 && Math.abs(item.quantity - expectedHours) > 0.01) {
          add({
            fingerprint: `DURATION_MISMATCH|${item.id}`,
            type: 'DURATION_MISMATCH',
            severity: 'MEDIUM',
            entityType: 'OrderItem',
            entityId: item.id,
            orderId: item.orderId,
            rentalId: rental.id,
            customerId: rental.customerId,
            customerName: rental.customerName || null,
            resource,
            rentalStartTime: window.startTime,
            rentalEndTime: window.endTime,
            title: 'Divergência de duração entre reserva e lançamento',
            details: `Reserva com ${expectedHours.toFixed(2)}h e item ${item.id} com quantidade ${item.quantity}. Verificar se a quantidade representa horas ou se há cobrança adicional.`,
            evidence: {
              ...baseEvidence(rental),
              item: {
                id: item.id,
                productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
                expectedHours,
                durationMinutes: durationMinutes(rental),
              },
            },
          });
        }
      }
    }

    const financial = computeFinancial(toAgendaRental(rental));
    for (const inconsistency of financial.inconsistencies) {
      if (inconsistency.historical && inconsistency.type === 'PAID_WITHOUT_PROOF') {
        historicalPaidWithoutOrder += 1;
        continue;
      }
      if (inconsistency.type === 'UNLINKED_AVULSO') {
        if (inconsistency.historical) historicalWithoutOperation += 1;
        continue;
      }
      const mapped = AGENDA_TYPE_MAP[inconsistency.type] || { type: inconsistency.type };
      const severity = mapped.severity || (String(inconsistency.severity).toUpperCase() as AuditSeverity);
      const entityType = inconsistency.type === 'OVERPAID_ORDER' ? 'Order' : 'Rental';
      const entityId = inconsistency.type === 'OVERPAID_ORDER' ? financial.orderId || inconsistency.entityId : inconsistency.entityId;
      const orderId = financial.orderId || activeLinks[0]?.orderId || null;
      const title = mapped.titlePrefix ? `${mapped.titlePrefix}${inconsistency.label}` : inconsistency.label;
      const details = inconsistency.type === 'OVERPAID_ORDER'
        ? `${inconsistency.detail} Registrada como possível divergência financeira, pendente de revisão administrativa.`
        : inconsistency.detail;
      add({
        fingerprint: `AGENDA|${inconsistency.type}|${entityId}|${inconsistency.label}`,
        type: mapped.type,
        severity,
        entityType,
        entityId,
        orderId,
        rentalId: rental.id,
        customerId: rental.customerId,
        customerName: rental.customerName || null,
        resource,
        rentalStartTime: window.startTime,
        rentalEndTime: window.endTime,
        title,
        details,
        evidence: {
          ...baseEvidence(rental, financial),
          agendaInconsistency: inconsistency,
        },
      });
    }
  }

  if (historicalPaidWithoutOrder > 0) {
    add({
      fingerprint: 'HISTORICAL_PAID_RENTALS_WITHOUT_ORDER',
      type: 'HISTORICAL_PAID_RENTALS_WITHOUT_ORDER',
      severity: 'INFO',
      entityType: 'Rental',
      entityId: 'HISTORICAL',
      title: 'Reservas históricas pagas sem comprovação de comanda',
      details: `${historicalPaidWithoutOrder} reservas pagas anteriores a ${formatCuiabaDateTime(AGENDA_LINK_FEATURE_START)} não possuem item ativo de comanda/PDV vinculado. Limitação histórica anterior ao vínculo estruturado; sem ação automática.`,
      evidence: { count: historicalPaidWithoutOrder, referenceDate: AGENDA_LINK_FEATURE_START.toISOString() },
    });
  }

  if (historicalWithoutOperation > 0) {
    add({
      fingerprint: 'HISTORICAL_RENTALS_WITHOUT_OPERATION',
      type: 'HISTORICAL_RENTALS_WITHOUT_OPERATION',
      severity: 'INFO',
      entityType: 'Rental',
      entityId: 'HISTORICAL',
      title: 'Reservas históricas sem operação comercial vinculada',
      details: `${historicalWithoutOperation} reservas anteriores a ${formatCuiabaDateTime(AGENDA_LINK_FEATURE_START)} não possuem operação vinculada. Limitação histórica anterior ao vínculo estruturado; sem ação automática.`,
      evidence: { count: historicalWithoutOperation, referenceDate: AGENDA_LINK_FEATURE_START.toISOString() },
    });
  }

  checksRun += 1;
  const duplicateGroups = new Map<string, AuditRental[]>();
  for (const rental of rentals) {
    if (String(rental.status || '').toUpperCase() === 'CANCELED') continue;
    const window = operationalWindow(rental);
    if (window.endTime.getTime() <= window.startTime.getTime()) continue;
    const key = `${rental.customerId}|${normalizeResource(rental.resource)}|${window.startTime.toISOString()}|${window.endTime.toISOString()}`;
    const group = duplicateGroups.get(key) || [];
    group.push(rental);
    duplicateGroups.set(key, group);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    const ids = group.map(rental => rental.id).sort();
    const first = group[0];
    const window = operationalWindow(first);
    add({
      fingerprint: `DUPLICATE_RESERVATION|${ids.join('|')}`,
      type: 'DUPLICATE_RESERVATION',
      severity: 'HIGH',
      entityType: 'Rental',
      entityId: first.id,
      rentalId: first.id,
      customerId: first.customerId,
      customerName: first.customerName || null,
      resource: normalizeResource(first.resource),
      rentalStartTime: window.startTime,
      rentalEndTime: window.endTime,
      title: 'Reservas duplicadas para o mesmo cliente, campo e horário',
      details: `${group.length} reservas com o mesmo cliente, campo e janela operacional: ${ids.join(', ')}.`,
      evidence: { rentalIds: ids, period: `${formatCuiabaDateTime(window.startTime)} até ${formatCuiabaDateTime(window.endTime)}`, resource: normalizeResource(first.resource) },
    });
  }

  checksRun += 1;
  const byField = new Map<string, AuditRental[]>();
  for (const rental of rentals) {
    if (String(rental.status || '').toUpperCase() === 'CANCELED') continue;
    const window = operationalWindow(rental);
    if (window.endTime.getTime() <= window.startTime.getTime()) continue;
    const field = normalizeResource(rental.resource);
    const group = byField.get(field) || [];
    group.push(rental);
    byField.set(field, group);
  }
  for (const [field, group] of byField) {
    const sorted = [...group].sort((a, b) => {
      const aw = operationalWindow(a);
      const bw = operationalWindow(b);
      return aw.startTime.getTime() - bw.startTime.getTime();
    });
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const aWindow = operationalWindow(a);
        const bWindow = operationalWindow(b);
        if (bWindow.startTime.getTime() >= aWindow.endTime.getTime()) break;
        const identical = a.customerId === b.customerId
          && aWindow.startTime.getTime() === bWindow.startTime.getTime()
          && aWindow.endTime.getTime() === bWindow.endTime.getTime();
        if (identical) continue;
        if (aWindow.startTime < bWindow.endTime && aWindow.endTime > bWindow.startTime) {
          const ids = [a.id, b.id].sort();
          add({
            fingerprint: `OVERLAP|${field}|${ids.join('|')}`,
            type: 'OVERLAPPING_RESERVATION',
            severity: 'HIGH',
            entityType: 'Rental',
            entityId: a.id,
            rentalId: a.id,
            customerId: a.customerId,
            customerName: a.customerName || null,
            resource: field,
            rentalStartTime: aWindow.startTime,
            rentalEndTime: aWindow.endTime,
            title: 'Sobreposição de reservas no mesmo campo',
            details: `${field}: ${formatCuiabaDateTime(aWindow.startTime)}–${formatCuiabaDateTime(aWindow.endTime)} sobrepõe ${formatCuiabaDateTime(bWindow.startTime)}–${formatCuiabaDateTime(bWindow.endTime)}.`,
            evidence: {
              field,
              rentals: [
                { id: a.id, customerId: a.customerId, startTime: aWindow.startTime.toISOString(), endTime: aWindow.endTime.toISOString(), convention: a.timeConvention },
                { id: b.id, customerId: b.customerId, startTime: bWindow.startTime.toISOString(), endTime: bWindow.endTime.toISOString(), convention: b.timeConvention },
              ],
            },
          });
        }
      }
    }
  }

  checksRun += 1;
  const recentUnlinked: AuditUnlinkedRentalItem[] = [];
  let historicalUnlinkedCount = 0;
  for (const item of input.unlinkedRentalItems) {
    const name = item.productName || item.serviceName || '';
    if (!isAgendaFieldRentalName(name)) continue;
    const openedAt = toDate(item.order.openedAt);
    if (openedAt < AGENDA_LINK_FEATURE_START) {
      historicalUnlinkedCount += 1;
      continue;
    }
    recentUnlinked.push(item);
  }
  for (const item of recentUnlinked) {
    add({
      fingerprint: `RENTAL_ITEM_WITHOUT_RENTAL|${item.id}`,
      type: 'RENTAL_ITEM_WITHOUT_RENTAL',
      severity: 'HIGH',
      entityType: 'OrderItem',
      entityId: item.id,
      orderId: item.orderId,
      customerId: item.order.customerId ?? null,
      customerName: item.order.customerName ?? null,
      title: 'Comanda com aluguel de campo sem reserva correspondente',
      details: `Item ${item.id} do pedido ${item.orderId} é "${item.productName || item.serviceName}" e não possui reserva vinculada.`,
      evidence: {
        item: { id: item.id, quantity: item.quantity, subtotal: item.subtotal, productName: item.productName, serviceName: item.serviceName },
        order: { id: item.order.id, status: item.order.status, openedAt: item.order.openedAt, customerId: item.order.customerId, customerName: item.order.customerName },
      },
    });
  }
  if (historicalUnlinkedCount > 0) {
    add({
      fingerprint: 'HISTORICAL_UNLINKED_RENTAL_ITEMS',
      type: 'HISTORICAL_UNLINKED_RENTAL_ITEMS',
      severity: 'INFO',
      entityType: 'OrderItem',
      entityId: 'HISTORICAL',
      title: 'Itens históricos de aluguel sem vínculo com reserva',
      details: `${historicalUnlinkedCount} itens de aluguel anteriores a ${formatCuiabaDateTime(AGENDA_LINK_FEATURE_START)} não possuem reserva vinculada. Limitação histórica anterior ao vínculo estruturado; sem ação automática.`,
      evidence: { count: historicalUnlinkedCount, referenceDate: AGENDA_LINK_FEATURE_START.toISOString() },
    });
  }

  checksRun += 1;
  const paymentKeys = new Map<string, AuditPayment[]>();
  const orders = Array.from(ordersById.values());
  for (const order of orders) {
    for (const payment of order.payments) {
      const key = `${order.id}|${payment.method}|${safeNumber(payment.amount).toFixed(2)}|${payment.date}`;
      const group = paymentKeys.get(key) || [];
      group.push(payment);
      paymentKeys.set(key, group);
    }
  }
  for (const [key, group] of paymentKeys) {
    if (group.length < 2) continue;
    const orderId = key.split('|')[0];
    const order = ordersById.get(orderId);
    const rental = rentals.find(item => item.orderItems.some(link => link.orderId === orderId)) || null;
    add({
      fingerprint: `DUPLICATE_PAYMENT|${key}`,
      type: 'DUPLICATE_PAYMENT',
      severity: 'HIGH',
      entityType: 'Order',
      entityId: orderId,
      orderId,
      rentalId: rental?.id || null,
      customerId: rental?.customerId || null,
      customerName: rental?.customerName || null,
      resource: rental ? normalizeResource(rental.resource) : null,
      title: 'Pagamentos potencialmente duplicados',
      details: `${group.length} pagamentos com o mesmo pedido, método, valor e data. Pedido ${orderId}.`,
      evidence: { orderId, paymentIds: group.map(payment => payment.id), orderTotal: order?.total, orderDiscount: order?.discount },
    });
  }

  checksRun += 1;
  for (const order of orders) {
    for (const payment of order.payments) {
      const rental = rentals.find(item => item.orderItems.some(link => link.orderId === order.id)) || null;
      const base = {
        orderId: order.id,
        rentalId: rental?.id || null,
        customerId: rental?.customerId || null,
        customerName: rental?.customerName || null,
        resource: rental ? normalizeResource(rental.resource) : null,
      };
      if (!payment.cashRegister) {
        add({
          fingerprint: `PAYMENT_WITHOUT_CASH_SESSION|${payment.id}`,
          type: 'PAYMENT_WITHOUT_CASH_SESSION',
          severity: 'HIGH',
          entityType: 'Payment',
          entityId: payment.id,
          ...base,
          title: 'Pagamento sem sessão de caixa vinculada',
          details: `O pagamento ${payment.id} não possui sessão de caixa.`,
          evidence: { payment },
        });
        continue;
      }
      const paymentDate = toDate(payment.date);
      const openedAt = toDate(payment.cashRegister.openedAt);
      const closedAt = payment.cashRegister.closedAt ? toDate(payment.cashRegister.closedAt) : null;
      if (paymentDate < openedAt) {
        add({
          fingerprint: `PAYMENT_BEFORE_CASH_OPEN|${payment.id}`,
          type: 'PAYMENT_BEFORE_CASH_OPEN',
          severity: 'MEDIUM',
          entityType: 'Payment',
          entityId: payment.id,
          ...base,
          title: 'Pagamento anterior à abertura do caixa',
          details: `Pagamento ${payment.id} em ${formatCuiabaDateTime(paymentDate)} anterior à abertura ${formatCuiabaDateTime(openedAt)}.`,
          evidence: { payment, cashRegister: payment.cashRegister },
        });
      }
      if (closedAt && paymentDate > closedAt) {
        add({
          fingerprint: `PAYMENT_AFTER_CASH_CLOSE|${payment.id}`,
          type: 'PAYMENT_AFTER_CASH_CLOSE',
          severity: 'HIGH',
          entityType: 'Payment',
          entityId: payment.id,
          ...base,
          title: 'Pagamento posterior ao fechamento do caixa',
          details: `Pagamento ${payment.id} em ${formatCuiabaDateTime(paymentDate)} posterior ao fechamento ${formatCuiabaDateTime(closedAt)}.`,
          evidence: { payment, cashRegister: payment.cashRegister },
        });
      }
    }
  }

  checksRun += 1;
  for (const log of input.changeLogs) {
    if (!log.requiresFinancialReview) continue;
    const rental = log.rental;
    const reason = log.reason.trim().replace(/[.!?]+$/, '');
    const window = rental ? operationalRentalWindow(rental.startTime, rental.endTime, rental.timeConvention) : null;
    add({
      fingerprint: `RENTAL_CHANGE_LOG|${log.id}|FINANCIAL_REVIEW`,
      type: 'RENTAL_CORRECTION_FINANCIAL_REVIEW',
      severity: 'MEDIUM',
      entityType: 'Rental',
      entityId: log.rentalId,
      orderId: log.orderId ?? null,
      rentalId: log.rentalId,
      customerId: rental?.customerId ?? null,
      customerName: rental?.customerName ?? null,
      resource: rental ? normalizeResource(rental.resource) : null,
      rentalStartTime: window?.startTime ?? null,
      rentalEndTime: window?.endTime ?? null,
      title: 'Correção administrativa com revisão financeira pendente',
      details: `Correção registrada por ${log.changedByName}: ${reason}. Campos: ${log.changedFields.join(', ') || 'não informados'}. Diferença financeira: ${log.financialDifference == null ? 'não calculada' : money(log.financialDifference)}.`,
      evidence: {
        changeLogId: log.id,
        changedByName: log.changedByName,
        changedFields: log.changedFields,
        requiresFinancialReview: log.requiresFinancialReview,
        financialDifference: log.financialDifference,
        beforeData: log.beforeData,
        afterData: log.afterData,
        createdAt: iso(log.createdAt),
      },
    });
  }

  checksRun += 1;
  for (const log of input.auditLogs) {
    const text = `${log.action} ${log.details || ''}`.toLowerCase();
    if (!/(reserva|aluguel|rental)/.test(text)) continue;
    const isDelete = /(exclu|delet|remov)/.test(text);
    const isCancel = /cancel/.test(text);
    if (!isDelete && !isCancel) continue;
    add({
      fingerprint: `AUDIT_LOG_RENTAL_EVENT|${log.id}|${isDelete ? 'DELETE' : 'CANCEL'}`,
      type: isDelete ? 'AUDIT_LOG_RENTAL_DELETION' : 'AUDIT_LOG_RENTAL_CANCELLATION',
      severity: isDelete ? 'MEDIUM' : 'INFO',
      entityType: 'AuditLog',
      entityId: log.id,
      title: isDelete ? 'Exclusão de reserva identificada em log de auditoria' : 'Cancelamento de reserva identificado em log de auditoria',
      details: `${log.action}: ${log.details || 'sem detalhes'}.`,
      evidence: { auditLogId: log.id, action: log.action, details: log.details, timestamp: iso(log.timestamp), userId: log.userId },
    });
  }

  checksRun += 1;
  for (const link of input.orphanLinks) {
    add({
      fingerprint: `ORPHAN_LINK|${link.id}`,
      type: 'ORPHAN_LINK',
      severity: 'CRITICAL',
      entityType: 'OrderItem',
      entityId: link.id,
      orderId: link.orderId,
      rentalId: link.rentalId,
      title: 'Item financeiro aponta para reserva inexistente',
      details: `O item ${link.id} mantém rentalId ${link.rentalId}, mas a reserva não foi encontrada.`,
      evidence: { itemId: link.id, orderId: link.orderId, rentalId: link.rentalId, status: link.status },
    });
  }

  checksRun += 1;
  if (input.previousRun && input.previousRun.totalRentals > 0 && rentals.length < input.previousRun.totalRentals) {
    const delta = input.previousRun.totalRentals - rentals.length;
    add({
      fingerprint: 'RENTAL_COUNT_DROP',
      type: 'RENTAL_COUNT_DROP',
      severity: 'HIGH',
      entityType: 'Rental',
      entityId: 'RENTAL_COUNT_DROP',
      title: 'Redução na quantidade de reservas entre auditorias',
      details: `A auditoria anterior possuía ${input.previousRun.totalRentals} reservas e a atual possui ${rentals.length} (redução de ${delta}). Verificar exclusões não registradas.`,
      evidence: {
        previousRunId: input.previousRun.id,
        previousStartedAt: iso(input.previousRun.startedAt),
        previousTotal: input.previousRun.totalRentals,
        currentTotal: rentals.length,
        delta,
      },
    });
  }

  if (occurrences.length > RENTAL_AUDIT_MAX_OCCURRENCES) {
    throw new Error(`Auditoria excedeu o limite de ${RENTAL_AUDIT_MAX_OCCURRENCES} ocorrências.`);
  }

  return {
    occurrences,
    checksRun,
    totalRentals: rentals.length,
    totalLinkedItems: linkedItems.size,
  };
}

export function sortOccurrencesBySeverity(list: AuditOccurrenceCandidate[]): AuditOccurrenceCandidate[] {
  const rank: Record<AuditSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  return [...list].sort((a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title));
}

export function severityRank(severity: string): number {
  const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  return rank[severity] ?? 9;
}

export function isAuditAdminStatus(value: unknown): value is AuditAdminStatus {
  return value === 'OPEN' || value === 'ACKNOWLEDGED' || value === 'RESOLVED' || value === 'IGNORED';
}

export function isAuditTechnicalStatus(value: unknown): value is AuditTechnicalStatus {
  return value === 'ACTIVE' || value === 'CLEARED';
}

