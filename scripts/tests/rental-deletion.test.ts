import assert from 'node:assert';
import {
  evaluateRentalDeletion,
  evaluateRentalEditing,
  type RentalDeletionSnapshot,
  type RentalEditingSnapshot,
  type RentalLinkedOrderSnapshot,
} from '../../lib/rental-deletion';
import { buildRentalWindow, formatRentalDateInput, formatRentalTimeInput } from '../../lib/rental-time';
import { normalizeRentalTimeConvention, operationalRentalWindow } from '../../lib/time-zone';

const canceledOrder: RentalLinkedOrderSnapshot = {
  id: 'cm_canceled_order',
  status: 'CANCELED',
  openedAt: '2026-11-26T23:00:00.000Z',
  closedAt: null,
};
const openOrder: RentalLinkedOrderSnapshot = {
  id: 'cm_open_order',
  status: 'OPEN',
  openedAt: '2026-11-26T23:00:00.000Z',
  closedAt: null,
};
const closedOrder: RentalLinkedOrderSnapshot = {
  id: 'cm_closed_order',
  status: 'CLOSED',
  openedAt: '2026-11-19T04:51:16.294Z',
  closedAt: '2026-11-19T06:23:29.572Z',
};

const deletionSnapshot = (patch: Partial<RentalDeletionSnapshot> = {}): RentalDeletionSnapshot => ({
  found: true,
  status: 'CANCELED',
  linkedOrders: [],
  hasValidRemainingPayment: false,
  hasChangeLog: false,
  periodClosed: false,
  ...patch,
});

const editingSnapshot = (patch: Partial<RentalEditingSnapshot> = {}): RentalEditingSnapshot => ({
  found: true,
  linkedOrders: [],
  hasValidRemainingPayment: false,
  ...patch,
});

// A — pendente sem vínculo.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ status: 'PENDING' })),
  { allowed: true },
);

// B — cancelada sem vínculo.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ status: 'CANCELED' })),
  { allowed: true },
);

// C — cancelada vinculada exclusivamente a comanda cancelada, sem pagamento válido.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ linkedOrders: [canceledOrder] })),
  { allowed: true },
);

// D — duas reservas canceladas independentes passam individualmente.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ linkedOrders: [canceledOrder] })),
  { allowed: true },
);
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ linkedOrders: [] })),
  { allowed: true },
);

// E — reserva efetivamente paga.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ status: 'PAID', linkedOrders: [] })),
  { allowed: false, code: 'PAID' },
);

// F — comanda aberta bloqueia.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ status: 'CANCELED', linkedOrders: [openOrder] })),
  {
    allowed: false,
    code: 'ACTIVE_ORDER',
    blockingOrderId: openOrder.id,
    blockingOrderStatus: 'OPEN',
  },
);

// G — pagamento parcial/válido remanescente bloqueia.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ linkedOrders: [canceledOrder], hasValidRemainingPayment: true })),
  {
    allowed: false,
    code: 'VALID_PAYMENT',
    blockingOrderId: canceledOrder.id,
    blockingOrderStatus: 'CANCELED',
  },
);

// H — comanda fechada/paga bloqueia.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ status: 'PAID', linkedOrders: [closedOrder] })),
  { allowed: false, code: 'PAID' },
);

// I — outro vínculo ativo bloqueia.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ linkedOrders: [canceledOrder, openOrder] })),
  {
    allowed: false,
    code: 'ACTIVE_ORDER',
    blockingOrderId: openOrder.id,
    blockingOrderStatus: 'OPEN',
  },
);

// M — período consolidado bloqueia.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ periodClosed: true })),
  { allowed: false, code: 'CLOSED_PERIOD' },
);

// RentalChangeLog bloqueia exclusão para preservar histórico.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ hasChangeLog: true })),
  { allowed: false, code: 'CHANGE_LOG' },
);

// Reserva inexistente.
assert.deepEqual(
  evaluateRentalDeletion(deletionSnapshot({ found: false })),
  { allowed: false, code: 'NOT_FOUND' },
);

// Edição: comanda cancelada regularizada permite; comanda ativa bloqueia.
assert.deepEqual(
  evaluateRentalEditing(editingSnapshot({ linkedOrders: [canceledOrder] })),
  { allowed: true },
);
assert.deepEqual(
  evaluateRentalEditing(editingSnapshot({ linkedOrders: [openOrder] })),
  {
    allowed: false,
    code: 'ACTIVE_ORDER',
    blockingOrderId: openOrder.id,
    blockingOrderStatus: 'OPEN',
  },
);
assert.deepEqual(
  evaluateRentalEditing(editingSnapshot({ linkedOrders: [canceledOrder], hasValidRemainingPayment: true })),
  {
    allowed: false,
    code: 'VALID_PAYMENT',
    blockingOrderId: canceledOrder.id,
    blockingOrderStatus: 'CANCELED',
  },
);
assert.deepEqual(
  evaluateRentalEditing(editingSnapshot({ found: false })),
  { allowed: false, code: 'NOT_FOUND' },
);

// O round-trip do dossiê precisa manter intacta a reserva paga de 19/11 (LEGACY)
// e as reservas canceladas de 26/11 (CUIABA), sem marcá-las como alteradas.
const assertRoundTrip = (startIso: string, endIso: string, conventionRaw: string) => {
  const convention = normalizeRentalTimeConvention(conventionRaw);
  const operational = operationalRentalWindow(startIso, endIso, convention);
  const date = formatRentalDateInput(operational.startTime);
  const start = formatRentalTimeInput(operational.startTime);
  const end = formatRentalTimeInput(operational.endTime);
  const rebuilt = buildRentalWindow(date, start, end, convention);
  assert.equal(rebuilt.startTime.getTime(), new Date(startIso).getTime());
  assert.equal(rebuilt.endTime.getTime(), new Date(endIso).getTime());
};
assertRoundTrip('2026-11-19T03:30:00.000Z', '2026-11-19T04:30:00.000Z', 'LEGACY_FORTALEZA');
assertRoundTrip('2026-11-26T04:30:00.000Z', '2026-11-26T05:30:00.000Z', 'CUIABA');

console.log('rental-deletion tests: OK');
