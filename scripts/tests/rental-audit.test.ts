import assert from 'node:assert';
import {
  detectRentalAuditOccurrences,
  type AuditChangeLog,
  type AuditDetectionInput,
  type AuditLinkedItem,
  type AuditOrder,
  type AuditRental,
  type AuditUnlinkedRentalItem,
} from '../../lib/rental-audit-rules';

function makeOrder(overrides: Partial<AuditOrder> = {}): AuditOrder {
  return {
    id: 'o1',
    status: 'CLOSED',
    total: 110,
    discount: 0,
    notes: null,
    openedAt: '2026-11-24T22:00:00.000Z',
    closedAt: '2026-11-25T01:00:00.000Z',
    customerId: 'c1',
    payments: [{
      id: 'p1',
      amount: 110,
      method: 'CASH',
      date: '2026-11-24T23:30:00.000Z',
      cashRegisterId: 'cr1',
      cashRegister: {
        id: 'cr1',
        status: 'CLOSED',
        openedAt: '2026-11-24T20:00:00.000Z',
        closedAt: '2026-11-25T01:00:00.000Z',
      },
    }],
    items: [{
      id: 'oi1',
      subtotal: 110,
      rentalId: 'r1',
      productName: 'Aluguel de Campo FUT5 (Futebol)',
      serviceName: null,
    }],
    ...overrides,
  };
}

function makeLink(order: AuditOrder, overrides: Partial<AuditLinkedItem> = {}): AuditLinkedItem {
  return {
    id: 'oi1',
    orderId: order.id,
    status: 'ACTIVE',
    subtotal: 110,
    quantity: 1,
    unitPrice: 110,
    rentalId: 'r1',
    productName: 'Aluguel de Campo FUT5 (Futebol)',
    serviceName: null,
    order,
    ...overrides,
  };
}

function makeRental(overrides: Partial<AuditRental> = {}): AuditRental {
  const order = makeOrder();
  return {
    id: 'r1',
    customerId: 'c1',
    customerName: 'Cliente Um',
    isSubscriber: false,
    resource: 'FUT5',
    startTime: '2026-11-24T22:00:00.000Z',
    endTime: '2026-11-24T23:00:00.000Z',
    totalAmount: 110,
    status: 'PAID',
    source: 'WALK_IN',
    timeConvention: 'LEGACY_FORTALEZA',
    cancelledAt: null,
    createdAt: '2026-11-20T00:00:00.000Z',
    orderItems: [makeLink(order)],
    ...overrides,
  };
}

function detect(rentals: AuditRental[], overrides: Partial<AuditDetectionInput> = {}) {
  return detectRentalAuditOccurrences({
    rentals,
    unlinkedRentalItems: [],
    changeLogs: [],
    auditLogs: [],
    orphanLinks: [],
    ...overrides,
  });
}

function has(result: ReturnType<typeof detect>, type: string) {
  return result.occurrences.some(item => item.type === type);
}

function get(result: ReturnType<typeof detect>, type: string) {
  return result.occurrences.find(item => item.type === type);
}

const fullyPaidMultiItemOrder = makeOrder({
  total: 135,
  items: [
    { id: 'oi1', subtotal: 110, rentalId: 'r1', productName: 'Aluguel de Campo FUT5 (Futebol)', serviceName: null },
    { id: 'oi2', subtotal: 25, rentalId: null, productName: 'Refrigerante', serviceName: null },
  ],
  payments: [{
    id: 'p1',
    amount: 135,
    method: 'PIX',
    date: '2026-11-24T23:30:00.000Z',
    cashRegisterId: 'cr1',
    cashRegister: { id: 'cr1', status: 'CLOSED', openedAt: '2026-11-24T20:00:00.000Z', closedAt: '2026-11-25T01:00:00.000Z' },
  }],
});
const fullyPaid = makeRental({ orderItems: [makeLink(fullyPaidMultiItemOrder)] });
const fullyPaidResult = detect([fullyPaid]);
assert.equal(has(fullyPaidResult, 'PAID_STATUS_MISMATCH'), false);
assert.equal(has(fullyPaidResult, 'POSSIBLE_OVERPAYMENT'), false);
assert.equal(has(fullyPaidResult, 'PARTIAL_PAYMENT_NOT_INDIVIDUALIZED'), false);

const partialOrder = makeOrder({
  status: 'OPEN',
  total: 135,
  closedAt: null,
  items: [
    { id: 'oi1', subtotal: 110, rentalId: 'r1', productName: 'Aluguel de Campo FUT5 (Futebol)', serviceName: null },
    { id: 'oi2', subtotal: 25, rentalId: null, productName: 'Refrigerante', serviceName: null },
  ],
  payments: [{
    id: 'p1',
    amount: 70,
    method: 'CASH',
    date: '2026-11-24T23:30:00.000Z',
    cashRegisterId: 'cr1',
    cashRegister: { id: 'cr1', status: 'OPEN', openedAt: '2026-11-24T20:00:00.000Z', closedAt: null },
  }],
});
const partial = makeRental({ status: 'PENDING', orderItems: [makeLink(partialOrder)] });
const partialResult = detect([partial]);
const partialOccurrence = get(partialResult, 'PARTIAL_PAYMENT_NOT_INDIVIDUALIZED');
assert.ok(partialOccurrence);
assert.equal(partialOccurrence?.severity, 'INFO');
assert.equal(has(partialResult, 'POSSIBLE_OVERPAYMENT'), false);

const overpaidOrder = makeOrder({
  total: 135,
  items: [
    { id: 'oi1', subtotal: 110, rentalId: 'r1', productName: 'Aluguel de Campo FUT5 (Futebol)', serviceName: null },
    { id: 'oi2', subtotal: 25, rentalId: null, productName: 'Refrigerante', serviceName: null },
  ],
  payments: [{
    id: 'p1',
    amount: 145,
    method: 'CASH',
    date: '2026-11-24T23:30:00.000Z',
    cashRegisterId: 'cr1',
    cashRegister: { id: 'cr1', status: 'CLOSED', openedAt: '2026-11-24T20:00:00.000Z', closedAt: '2026-11-25T01:00:00.000Z' },
  }],
});
const overpaidResult = detect([makeRental({ orderItems: [makeLink(overpaidOrder)] })]);
assert.equal(has(overpaidResult, 'POSSIBLE_OVERPAYMENT'), true);

const withoutOrder = detect([makeRental({ orderItems: [] })]);
assert.equal(has(withoutOrder, 'PAID_RENTAL_WITHOUT_ORDER'), true);

const pendingWithoutOrder = detect([makeRental({ status: 'PENDING', orderItems: [] })]);
assert.equal(has(pendingWithoutOrder, 'RENTAL_WITHOUT_OPERATION'), false);

const historicalPaidWithoutOrder = detect([makeRental({
  status: 'PAID',
  createdAt: '2026-10-01T00:00:00.000Z',
  orderItems: [],
})]);
assert.equal(has(historicalPaidWithoutOrder, 'HISTORICAL_PAID_RENTALS_WITHOUT_ORDER'), true);
assert.equal(has(historicalPaidWithoutOrder, 'PAID_RENTAL_WITHOUT_ORDER'), false);

const duplicatedLinkOrder = makeOrder({
  items: [
    { id: 'oi1', subtotal: 110, rentalId: 'r1', productName: 'Aluguel de Campo FUT5 (Futebol)', serviceName: null },
    { id: 'oi2', subtotal: 110, rentalId: 'r1', productName: 'Aluguel de Campo FUT5 (Futebol)', serviceName: null },
  ],
  total: 220,
  payments: [{
    id: 'p1',
    amount: 220,
    method: 'CASH',
    date: '2026-11-24T23:30:00.000Z',
    cashRegisterId: 'cr1',
    cashRegister: { id: 'cr1', status: 'CLOSED', openedAt: '2026-11-24T20:00:00.000Z', closedAt: '2026-11-25T01:00:00.000Z' },
  }],
});
const duplicatedLinkRental = makeRental({
  orderItems: [
    makeLink(duplicatedLinkOrder, { id: 'oi1' }),
    makeLink(duplicatedLinkOrder, { id: 'oi2' }),
  ],
});
const duplicatedLinkResult = detect([duplicatedLinkRental]);
assert.equal(has(duplicatedLinkResult, 'DUPLICATE_ACTIVE_LINK'), true);

const legacyOverlap = makeRental({
  id: 'legacy',
  customerId: 'c1',
  startTime: '2026-11-24T22:00:00.000Z',
  endTime: '2026-11-24T23:00:00.000Z',
  timeConvention: 'LEGACY_FORTALEZA',
  status: 'PENDING',
  orderItems: [],
});
const cuiabaOverlap = makeRental({
  id: 'cuiaba',
  customerId: 'c2',
  customerName: 'Cliente Dois',
  startTime: '2026-11-24T23:00:00.000Z',
  endTime: '2026-11-25T00:00:00.000Z',
  timeConvention: 'CUIABA',
  status: 'PENDING',
  orderItems: [],
});
const overlapResult = detect([legacyOverlap, cuiabaOverlap]);
assert.equal(has(overlapResult, 'OVERLAPPING_RESERVATION'), true);

const duplicateA = makeRental({ id: 'dup-a', customerId: 'c1', status: 'PENDING', orderItems: [] });
const duplicateB = makeRental({ id: 'dup-b', customerId: 'c1', status: 'PENDING', orderItems: [] });
const duplicateResult = detect([duplicateA, duplicateB]);
assert.equal(has(duplicateResult, 'DUPLICATE_RESERVATION'), true);
assert.equal(has(duplicateResult, 'OVERLAPPING_RESERVATION'), false);

const boundaryResult = detect([makeRental({
  id: 'boundary',
  startTime: '2026-11-14T03:30:00.000Z',
  endTime: '2026-11-14T04:30:00.000Z',
  status: 'PENDING',
  orderItems: [],
})]);
assert.equal(has(boundaryResult, 'DATE_BOUNDARY_DIVERGENCE'), true);
const boundaryCuiabaResult = detect([makeRental({
  id: 'boundary-cuiaba',
  startTime: '2026-11-14T03:30:00.000Z',
  endTime: '2026-11-14T04:30:00.000Z',
  timeConvention: 'CUIABA',
  status: 'PENDING',
  orderItems: [],
})]);
assert.equal(has(boundaryCuiabaResult, 'DATE_BOUNDARY_DIVERGENCE'), false);

const mismatchOrder = makeOrder({
  items: [{ id: 'oi1', subtotal: 165, rentalId: 'r1', productName: 'Aluguel de Campo FUT7 (Futebol)', serviceName: null }],
  total: 165,
  payments: [{
    id: 'p1',
    amount: 165,
    method: 'CASH',
    date: '2026-11-24T23:30:00.000Z',
    cashRegisterId: 'cr1',
    cashRegister: { id: 'cr1', status: 'CLOSED', openedAt: '2026-11-24T20:00:00.000Z', closedAt: '2026-11-25T01:00:00.000Z' },
  }],
});
const mismatchResult = detect([makeRental({
  resource: 'FUT5',
  orderItems: [makeLink(mismatchOrder, { quantity: 1.5, subtotal: 165, unitPrice: 110, productName: 'Aluguel de Campo FUT7 (Futebol)' })],
})]);
assert.equal(has(mismatchResult, 'FIELD_PRODUCT_MISMATCH'), true);
assert.equal(has(mismatchResult, 'DURATION_MISMATCH'), true);

const recentUnlinked: AuditUnlinkedRentalItem = {
  id: 'unlinked-recent',
  orderId: 'o-recent',
  quantity: 1,
  subtotal: 110,
  productName: 'Aluguel de Campo FUT5 (Futebol)',
  serviceName: null,
  order: { id: 'o-recent', status: 'CLOSED', openedAt: '2026-11-20T22:00:00.000Z', customerId: 'c9', customerName: 'Cliente Nove' },
};
const historicalUnlinked: AuditUnlinkedRentalItem = {
  ...recentUnlinked,
  id: 'unlinked-historical',
  orderId: 'o-historical',
  order: { id: 'o-historical', status: 'CLOSED', openedAt: '2026-10-01T22:00:00.000Z', customerId: 'c9', customerName: 'Cliente Nove' },
};
const unlinkedResult = detect([], { unlinkedRentalItems: [recentUnlinked, historicalUnlinked] });
assert.equal(has(unlinkedResult, 'RENTAL_ITEM_WITHOUT_RENTAL'), true);
assert.equal(has(unlinkedResult, 'HISTORICAL_UNLINKED_RENTAL_ITEMS'), true);
assert.equal(unlinkedResult.occurrences.filter(item => item.type === 'RENTAL_ITEM_WITHOUT_RENTAL').length, 1);

const changeLog: AuditChangeLog = {
  id: 'cl1',
  rentalId: 'r1',
  orderId: 'o1',
  changedByName: 'Admin',
  reason: 'Jogo lançado no dia errado.',
  beforeData: { startTime: '2026-11-24T22:00:00.000Z' },
  afterData: { startTime: '2026-11-23T23:00:00.000Z' },
  changedFields: ['date', 'startTime', 'endTime'],
  requiresFinancialReview: true,
  financialDifference: null,
  createdAt: '2026-11-24T19:26:18.000Z',
  rental: {
    id: 'r1',
    customerId: 'c1',
    customerName: 'Cliente Um',
    resource: 'FUT5',
    startTime: '2026-11-23T23:00:00.000Z',
    endTime: '2026-11-24T00:00:00.000Z',
    status: 'PAID',
    timeConvention: 'CUIABA',
  },
};
const changeLogResult = detect([], { changeLogs: [changeLog] });
assert.equal(has(changeLogResult, 'RENTAL_CORRECTION_FINANCIAL_REVIEW'), true);
const noReviewResult = detect([], { changeLogs: [{ ...changeLog, requiresFinancialReview: false }] });
assert.equal(has(noReviewResult, 'RENTAL_CORRECTION_FINANCIAL_REVIEW'), false);

const countDropResult = detect([makeRental({ status: 'PENDING', orderItems: [] })], {
  previousRun: { id: 'run-previous', totalRentals: 2, startedAt: '2026-11-23T12:00:00.000Z' },
});
assert.equal(has(countDropResult, 'RENTAL_COUNT_DROP'), true);

const auditLogResult = detect([], {
  auditLogs: [
    { id: 'log-delete', action: 'Exclusão de Reserva', details: 'Reserva X excluída.', timestamp: '2026-11-24T19:00:00.000Z', userId: 'u1' },
    { id: 'log-cancel', action: 'Cancelamento de Reserva', details: 'Reserva Y cancelada.', timestamp: '2026-11-24T19:05:00.000Z', userId: 'u1' },
  ],
});
assert.equal(has(auditLogResult, 'AUDIT_LOG_RENTAL_DELETION'), true);
assert.equal(has(auditLogResult, 'AUDIT_LOG_RENTAL_CANCELLATION'), true);

const cashOrder = makeOrder({
  payments: [{
    id: 'p-cash',
    amount: 110,
    method: 'CASH',
    date: '2026-11-25T02:00:00.000Z',
    cashRegisterId: 'cr1',
    cashRegister: { id: 'cr1', status: 'CLOSED', openedAt: '2026-11-24T20:00:00.000Z', closedAt: '2026-11-25T01:00:00.000Z' },
  }],
});
const cashResult = detect([makeRental({ orderItems: [makeLink(cashOrder)] })]);
assert.equal(has(cashResult, 'PAYMENT_AFTER_CASH_CLOSE'), true);

const firstRun = detect([makeRental({ status: 'PENDING', orderItems: [] })]);
const secondRun = detect([makeRental({ status: 'PENDING', orderItems: [] })]);
assert.deepEqual(
  firstRun.occurrences.map(item => item.fingerprint).sort(),
  secondRun.occurrences.map(item => item.fingerprint).sort()
);

console.log('rental-audit tests: OK');
