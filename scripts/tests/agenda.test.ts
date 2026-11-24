import assert from 'node:assert';
import {
  DEFAULT_AGENDA_FILTERS,
  buildAgendaData,
  getAgendaRange,
  reservationSegmentsForDay,
  type AgendaOrderInput,
  type AgendaRentalInput,
  type AgendaSchedule,
  type AgendaUnlinkedItemInput,
} from '../../lib/agenda';
import { operationalRentalWindow } from '../../lib/time-zone';
import { formatRentalDateInput } from '../../lib/rental-time';

const NOW = new Date('2026-11-24T15:00:00-04:00');
const SCHEDULE: AgendaSchedule = {
  source: 'database',
  entries: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, field: 'FUT5', startMinute: 18 * 60, endMinute: 23 * 60, demandWeight: 1, isActive: true },
    { weekday, field: 'FUT7', startMinute: 18 * 60, endMinute: 23 * 60, demandWeight: 1, isActive: true },
  ]),
};
const CUSTOMERS = [
  { id: 'c1', name: 'Cliente Um' },
  { id: 'c2', name: 'Cliente Dois' },
];

function payment(amount: number, method = 'PIX', date = '2026-11-24T21:00:00-04:00') {
  return {
    id: `pay-${method}-${amount}-${date}`,
    amount,
    method,
    date,
    cashRegister: {
      id: 'cash-1',
      status: 'CLOSED',
      openedAt: '2026-11-24T10:00:00-04:00',
      closedAt: '2026-11-24T23:59:00-04:00',
    },
  };
}

function order(input: {
  id?: string;
  status?: string;
  total: number;
  discount?: number;
  payments?: ReturnType<typeof payment>[];
  items: Array<{ id: string; subtotal: number; rentalId?: string | null }>;
  notes?: string;
}): AgendaOrderInput {
  return {
    id: input.id || 'o1',
    status: input.status || 'CLOSED',
    total: input.total,
    discount: input.discount || 0,
    notes: input.notes || 'Comanda teste',
    openedAt: '2026-11-24T19:00:00-04:00',
    closedAt: input.status === 'OPEN' ? null : '2026-11-24T23:00:00-04:00',
    customerId: 'c1',
    payments: input.payments || [],
    items: input.items,
  };
}

function rental(input: {
  id?: string;
  customerId?: string;
  customerName?: string;
  isSubscriber?: boolean;
  resource?: string;
  startTime?: string;
  endTime?: string;
  totalAmount?: number;
  status?: string;
  source?: string;
  createdAt?: string;
  order?: AgendaOrderInput;
  itemId?: string;
  itemSubtotal?: number;
  itemStatus?: string;
  timeConvention?: string;
}): AgendaRentalInput {
  const id = input.id || 'r1';
  const itemId = input.itemId || `item-${id}`;
  const totalAmount = input.totalAmount ?? 150;
  return {
    id,
    customerId: input.customerId || 'c1',
    customerName: input.customerName || 'Cliente Um',
    customerPhone: '65999999999',
    isSubscriber: input.isSubscriber === true,
    resource: input.resource || 'FUT7',
    startTime: input.startTime || '2026-11-24T20:00:00-04:00',
    endTime: input.endTime || '2026-11-24T21:00:00-04:00',
    totalAmount,
    status: input.status || 'PAID',
    source: input.source || 'WALK_IN',
    timeConvention: input.timeConvention || 'CUIABA',
    cancelledAt: input.status === 'CANCELED' ? '2026-11-24T19:00:00-04:00' : null,
    createdAt: input.createdAt || '2026-11-20T12:00:00-04:00',
    orderItems: input.order ? [{
      id: itemId,
      status: input.itemStatus || 'ACTIVE',
      subtotal: input.itemSubtotal ?? totalAmount,
      quantity: 1,
      unitPrice: input.itemSubtotal ?? totalAmount,
      productName: 'Aluguel de Campo FUT7',
      serviceName: null,
      order: input.order,
    }] : [],
  };
}

function build(rentals: AgendaRentalInput[], options: {
  view?: 'day' | 'week' | 'month';
  anchor?: string;
  filters?: Partial<typeof DEFAULT_AGENDA_FILTERS>;
  unlinkedItems?: AgendaUnlinkedItemInput[];
} = {}) {
  return buildAgendaData({
    view: options.view || 'day',
    anchor: options.anchor || '2026-11-24',
    filters: { ...DEFAULT_AGENDA_FILTERS, ...(options.filters || {}) },
    rentals,
    unlinkedItems: options.unlinkedItems || [],
    customers: CUSTOMERS,
    schedule: SCHEDULE,
    now: NOW,
  });
}

// 1. Aluguel individual integralmente pago.
{
  const paidOrder = order({ total: 150, payments: [payment(150)], items: [{ id: 'item-r1', subtotal: 150, rentalId: 'r1' }] });
  const data = build([rental({ id: 'r1', order: paidOrder })]);
  const reservation = data.reservations[0];
  assert.equal(reservation.financialStatus, 'PAID');
  assert.equal(reservation.receivedAmount, 150);
  assert.equal(reservation.balanceAmount, 0);
  assert.equal(data.metrics.paid, 1);
  assert.equal(data.metrics.receivedValue, 150);
  assert.equal(data.metrics.balanceValue, 0);
}

// 2. Comanda com aluguel e produtos do bar integralmente paga: receita do aluguel não é o total da comanda.
{
  const mixedOrder = order({
    total: 250,
    payments: [payment(250)],
    items: [
      { id: 'item-r1', subtotal: 150, rentalId: 'r1' },
      { id: 'bar-1', subtotal: 100, rentalId: null },
    ],
  });
  const data = build([rental({ id: 'r1', order: mixedOrder })]);
  const reservation = data.reservations[0];
  assert.equal(reservation.financialStatus, 'PAID');
  assert.equal(reservation.receivedAmount, 150);
  assert.equal(data.metrics.receivedValue, 150);
  assert.equal(data.metrics.contractedValue, 150);
  assert.notEqual(data.metrics.receivedValue, 250);
}

// 3. Comanda com múltiplos aluguéis integralmente paga.
{
  const sharedOrder = order({
    id: 'o-multi',
    total: 400,
    payments: [payment(400)],
    items: [
      { id: 'item-r1', subtotal: 150, rentalId: 'r1' },
      { id: 'item-r2', subtotal: 250, rentalId: 'r2' },
    ],
  });
  const data = build([
    rental({ id: 'r1', startTime: '2026-11-24T20:00:00-04:00', endTime: '2026-11-24T21:00:00-04:00', totalAmount: 150, order: sharedOrder, itemSubtotal: 150 }),
    rental({ id: 'r2', resource: 'FUT5', startTime: '2026-11-24T21:00:00-04:00', endTime: '2026-11-24T22:00:00-04:00', totalAmount: 250, order: sharedOrder, itemSubtotal: 250 }),
  ]);
  assert.equal(data.metrics.paid, 2);
  assert.equal(data.metrics.receivedValue, 400);
  assert.equal(data.reservations.find((item) => item.id === 'r1')?.receivedAmount, 150);
  assert.equal(data.reservations.find((item) => item.id === 'r2')?.receivedAmount, 250);
}

// 4. Pagamento parcial atribuível quando a operação tem um único item.
{
  const singleItemOrder = order({ total: 150, payments: [payment(50)], items: [{ id: 'item-r1', subtotal: 150, rentalId: 'r1' }] });
  const data = build([rental({ id: 'r1', status: 'PENDING', order: singleItemOrder })]);
  const reservation = data.reservations[0];
  assert.equal(reservation.financialStatus, 'PARTIAL');
  assert.equal(reservation.canAttributePayment, true);
  assert.equal(reservation.receivedAmount, 50);
  assert.equal(reservation.balanceAmount, 100);
}

// 5. Comanda parcialmente paga sem individualização.
{
  const mixedPartial = order({
    total: 250,
    payments: [payment(100)],
    items: [
      { id: 'item-r1', subtotal: 150, rentalId: 'r1' },
      { id: 'bar-1', subtotal: 100, rentalId: null },
    ],
  });
  const data = build([rental({ id: 'r1', status: 'PENDING', order: mixedPartial })]);
  const reservation = data.reservations[0];
  assert.equal(reservation.financialStatus, 'PARTIAL_UNALLOCATED');
  assert.equal(reservation.receivedAmount, null);
  assert.equal(reservation.balanceAmount, null);
  assert.equal(data.metrics.partial, 1);
  assert.equal(data.metrics.receivedValue, 0);
}

// 6. Aluguel parcialmente pago.
{
  const partialOrder = order({ total: 150, payments: [payment(50)], items: [{ id: 'item-r1', subtotal: 150, rentalId: 'r1' }] });
  const data = build([rental({ id: 'r1', status: 'PENDING', order: partialOrder })]);
  assert.equal(data.metrics.partial, 1);
  assert.equal(data.metrics.receivedValue, 50);
  assert.equal(data.metrics.balanceValue, 100);
}

// 7. Pagamento estornado: saldo efetivo recomposto sem considerar o valor estornado.
{
  const refundedOrder = order({ status: 'OPEN', total: 150, payments: [payment(150), payment(-150)], items: [{ id: 'item-r1', subtotal: 150, rentalId: 'r1' }] });
  const data = build([rental({ id: 'r1', status: 'PENDING', order: refundedOrder })]);
  const reservation = data.reservations[0];
  assert.equal(reservation.financialStatus, 'PENDING');
  assert.equal(reservation.orderReceived, 0);
  assert.equal(reservation.balanceAmount, 150);
}

// 8. Reserva cancelada não bloqueia horário nem entra em receita.
{
  const data = build([rental({ id: 'r1', status: 'CANCELED', source: 'MANUAL', order: undefined })]);
  assert.equal(data.reservations[0].financialStatus, 'CANCELED');
  assert.equal(data.metrics.canceled, 1);
  assert.equal(data.metrics.hoursReserved.total, 0);
  assert.equal(data.metrics.receivedValue, 0);
}

// 9. Comanda reaberta permanece pendente até nova quitação.
{
  const reopened = order({ status: 'OPEN', total: 150, payments: [], items: [{ id: 'item-r1', subtotal: 150, rentalId: 'r1' }] });
  const data = build([rental({ id: 'r1', status: 'PENDING', order: reopened })]);
  assert.equal(data.reservations[0].financialStatus, 'PENDING');
  assert.equal(data.metrics.pending, 1);
}

// 10. Alteração de duração: atual é exibida, original não é inventado.
{
  const data = build([rental({ id: 'r1', startTime: '2026-11-24T20:00:00-04:00', endTime: '2026-11-24T21:30:00-04:00' })]);
  const reservation = data.reservations[0];
  assert.equal(reservation.durationMinutes, 90);
  assert.equal(reservation.original.durationMinutes, null);
  assert.equal(reservation.original.startTime, null);
  assert.ok(data.limitations.some((item) => item.includes('duração original')));
}

// 11. Reservas simultâneas em FUT5 e FUT7 não geram conflito.
{
  const data = build([
    rental({ id: 'r1', resource: 'FUT5', startTime: '2026-11-24T20:00:00-04:00', endTime: '2026-11-24T21:00:00-04:00' }),
    rental({ id: 'r2', resource: 'FUT7', startTime: '2026-11-24T20:00:00-04:00', endTime: '2026-11-24T21:00:00-04:00' }),
  ]);
  assert.equal(data.metrics.hoursReserved.FUT5, 1);
  assert.equal(data.metrics.hoursReserved.FUT7, 1);
  assert.equal(data.metrics.hoursReserved.total, 2);
  assert.equal(data.metrics.hoursAvailable.total, 8);
  assert.equal(data.audit.types.some((type) => type.type === 'OVERLAP_CONFLICT'), false);
}

// 12. Conflito de horário no mesmo campo.
{
  const data = build([
    rental({ id: 'r1', resource: 'FUT5', startTime: '2026-11-24T20:00:00-04:00', endTime: '2026-11-24T21:00:00-04:00' }),
    rental({ id: 'r2', resource: 'FUT5', startTime: '2026-11-24T20:30:00-04:00', endTime: '2026-11-24T21:30:00-04:00' }),
  ]);
  assert.equal(data.metrics.hoursReserved.FUT5, 1.5);
  assert.ok(data.audit.types.some((type) => type.type === 'OVERLAP_CONFLICT' && type.current >= 1));
}

// 13. Reserva futura paga aparece como paga, mas operacionalmente agendada.
{
  const futureOrder = order({ total: 150, payments: [payment(150)], items: [{ id: 'item-r1', subtotal: 150, rentalId: 'r1' }] });
  const data = build([rental({ id: 'r1', startTime: '2026-11-24T20:00:00-04:00', endTime: '2026-11-24T21:00:00-04:00', order: futureOrder })]);
  const reservation = data.reservations[0];
  assert.equal(reservation.financialStatus, 'PAID');
  assert.equal(reservation.operationalStatus, 'SCHEDULED');
}

// 14. Reserva que ultrapassa a meia-noite é segmentada por dia.
{
  const data = build([rental({ id: 'r1', startTime: '2026-11-24T23:00:00-04:00', endTime: '2026-11-25T00:30:00-04:00' })]);
  const reservation = data.reservations[0];
  const segments = reservationSegmentsForDay(reservation, '2026-11-24');
  assert.equal(reservation.durationMinutes, 90);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].startMinute, 23 * 60);
  assert.equal(segments[0].endMinute, 24 * 60);
}

// 15. Mensalista sem vínculo individual não é tratado como inadimplente.
{
  const data = build([rental({ id: 'r1', status: 'PENDING', source: 'SUBSCRIPTION', isSubscriber: true })]);
  const reservation = data.reservations[0];
  assert.equal(reservation.isSubscriber, true);
  assert.equal(reservation.financialStatus, 'SUBSCRIPTION_UNLINKED');
  assert.equal(data.metrics.pending, 0);
  assert.equal(data.metrics.unproven, 1);
}

// 16. Reserva histórica sem vínculo comprovado é sinalizada como histórica.
{
  const data = build([rental({ id: 'r1', status: 'PAID', source: 'LEGACY', createdAt: '2026-11-10T12:00:00-04:00' })]);
  const reservation = data.reservations[0];
  assert.equal(reservation.financialStatus, 'PAID_UNPROVEN');
  assert.equal(data.metrics.unproven, 1);
  assert.equal(data.metrics.inconsistencyCountHistorical, 1);
  assert.equal(data.metrics.inconsistencyCountCurrent, 0);
}

// 17. Ausência de duplicidade de receita entre aluguel, bar e comanda.
{
  const mixedOrder = order({
    total: 250,
    payments: [payment(250)],
    items: [
      { id: 'item-r1', subtotal: 150, rentalId: 'r1' },
      { id: 'bar-1', subtotal: 100, rentalId: null },
    ],
  });
  const data = build([rental({ id: 'r1', order: mixedOrder })]);
  assert.equal(data.metrics.receivedValue, 150);
  assert.equal(data.metrics.contractedValue, 150);
  assert.equal(data.reservations[0].receivedAmount, 150);
}

// 18. O motor é puro e não altera os objetos de entrada.
{
  const inputRental = rental({ id: 'r1' });
  const before = JSON.stringify(inputRental);
  build([inputRental]);
  assert.equal(JSON.stringify(inputRental), before);
}

// 19. Atualização simulada: novo pagamento altera a classificação no recálculo.
{
  const pendingOrder = order({ status: 'OPEN', total: 150, payments: [], items: [{ id: 'item-r1', subtotal: 150, rentalId: 'r1' }] });
  const before = build([rental({ id: 'r1', status: 'PENDING', order: pendingOrder })]);
  assert.equal(before.reservations[0].financialStatus, 'PENDING');
  const paidOrder = order({ status: 'CLOSED', total: 150, payments: [payment(150)], items: [{ id: 'item-r1', subtotal: 150, rentalId: 'r1' }] });
  const after = build([rental({ id: 'r1', status: 'PAID', order: paidOrder })]);
  assert.equal(after.reservations[0].financialStatus, 'PAID');
}

// Extras: status divergente, filtros, itens sem reserva e período mensal.
{
  const settledButPending = order({ total: 150, payments: [payment(150)], items: [{ id: 'item-r1', subtotal: 150, rentalId: 'r1' }] });
  const data = build([rental({ id: 'r1', status: 'PENDING', order: settledButPending })]);
  assert.equal(data.reservations[0].financialStatus, 'PAID');
  assert.ok(data.audit.types.some((type) => type.type === 'PAID_STATUS_MISMATCH'));
}

{
  const data = build([
    rental({ id: 'r1', resource: 'FUT5', customerId: 'c1' }),
    rental({ id: 'r2', resource: 'FUT7', customerId: 'c2', isSubscriber: true, source: 'SUBSCRIPTION' }),
  ], { filters: { field: 'FUT5', customerId: 'c1' } });
  assert.equal(data.reservations.length, 1);
  assert.equal(data.reservations[0].id, 'r1');
}

{
  const historicalDate = '2026-11-10T12:00:00-04:00';
  const currentDate = '2026-11-20T12:00:00-04:00';
  const unlinked: AgendaUnlinkedItemInput[] = [
    { id: 'u1', orderId: 'o1', orderStatus: 'CLOSED', orderDate: historicalDate, customerId: 'c1', name: 'Aluguel de Campo FUT5', subtotal: 100, field: 'FUT5' },
    { id: 'u2', orderId: 'o2', orderStatus: 'CLOSED', orderDate: currentDate, customerId: 'c2', name: 'Aluguel de Campo FUT7', subtotal: 150, field: 'FUT7' },
  ];
  const data = build([], { view: 'month', anchor: '2026-11-24', unlinkedItems: unlinked });
  assert.equal(data.audit.unlinkedItems.length, 2);
  assert.equal(data.audit.unlinkedItems.filter((item) => item.historical).length, 1);
  assert.ok(data.audit.types.some((type) => type.type === 'UNLINKED_FIELD_ITEM' && type.current === 1 && type.historical === 1));
}

{
  const range = getAgendaRange('month', '2026-11-24');
  assert.equal(range.days.length, 30);
  assert.equal(range.fromKey, '2026-11-01');
  assert.equal(range.toKey, '2026-12-01');
}


// T1: reserva legada exibida na convenção preservada, em Cuiaba, sem deslocamento duplo.
{
  const rawStart = new Date('2026-11-25T02:00:00.000Z');
  const rawEnd = new Date('2026-11-25T03:00:00.000Z');
  const effective = operationalRentalWindow(rawStart, rawEnd, 'LEGACY_FORTALEZA');
  const data = buildAgendaData({
    view: 'day',
    anchor: formatRentalDateInput(effective.startTime),
    rentals: [rental({
      id: 'legacy-r1',
      startTime: effective.startTime.toISOString(),
      endTime: effective.endTime.toISOString(),
      timeConvention: 'LEGACY_FORTALEZA',
    })],
    customers: CUSTOMERS,
    schedule: SCHEDULE,
    now: new Date('2026-11-24T15:00:00-04:00'),
  });
  assert.equal(data.reservations[0].startTimeLabel, '23:00');
  assert.equal(data.reservations[0].startDateKey, '2026-11-24');
  assert.equal(data.reservations[0].endDateKey, '2026-11-25');
  assert.equal(data.reservations[0].isLegacyTime, true);
  assert.equal(data.reservations[0].durationMinutes, 60);
}

console.log('agenda tests: OK');
