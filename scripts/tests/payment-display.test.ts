import assert from 'node:assert';
import {
  buildDisplayedPayments,
  buildPaymentReversalLinks,
  paymentMethodLabel,
  parsePaymentVoidMarker,
  sumDisplayedPayments,
  type PaymentDisplayRow,
  type PaymentVoidMarker,
} from '../../lib/payment-display';

const BASE = new Date('2026-11-25T23:37:46.000Z').getTime();
const at = (offsetMs: number) => new Date(BASE + offsetMs);
const payment = (
  id: string,
  method: string,
  amount: number,
  offsetMs: number,
  overrides: Partial<PaymentDisplayRow> = {},
): PaymentDisplayRow => ({
  id,
  orderId: 'order-1',
  cashRegisterId: 'session-a',
  method,
  amount,
  date: at(offsetMs),
  userId: 'user-1',
  ...overrides,
});
const marker = (originalPaymentId: string, offsetMs: number, overrides: Partial<PaymentVoidMarker> = {}): PaymentVoidMarker => ({
  originalPaymentId,
  actorUserId: 'user-1',
  timestamp: at(offsetMs),
  ...overrides,
});

// Pagamento sem estorno permanece válido e estornável.
{
  const payments = [payment('p1', 'PIX', 155, 0)];
  const links = buildPaymentReversalLinks(payments, []);
  const displayed = buildDisplayedPayments(payments, links);
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].amount, 155);
  assert.equal(displayed[0].status, 'VALID');
  assert.equal(displayed[0].canVoid, true);
}

// Exemplo RICARDO: PIX 155 integralmente estornado não aparece; Débito/Crédito permanecem.
{
  const payments = [
    payment('pix', 'PIX', 155, 0),
    payment('pix-void', 'PIX', -155, 500),
    payment('debit', 'DEBIT', 12.5, 1000),
    payment('credit', 'CREDIT', 12.5, 2000),
  ];
  const links = buildPaymentReversalLinks(payments, [marker('pix', 1000)]);
  const displayed = buildDisplayedPayments(payments, links);
  assert.deepEqual(displayed.map((item) => [item.method, item.amount, item.status]), [
    ['DEBIT', 12.5, 'VALID'],
    ['CREDIT', 12.5, 'VALID'],
  ]);
  assert.equal(sumDisplayedPayments(displayed), 25);
}

// Estorno parcial exibe apenas o valor líquido remanescente.
{
  const payments = [payment('p1', 'PIX', 100, 0), payment('n1', 'PIX', -40, 500)];
  const links = buildPaymentReversalLinks(payments, [marker('p1', 1000)]);
  const displayed = buildDisplayedPayments(payments, links);
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].amount, 60);
  assert.equal(displayed[0].status, 'PARTIALLY_REVERSED');
  assert.equal(displayed[0].canVoid, false);
}

// Múltiplos estornos parciais no mesmo pagamento.
{
  const payments = [
    payment('p1', 'PIX', 100, 0),
    payment('n1', 'PIX', -20, 900),
    payment('n2', 'PIX', -30, 1900),
  ];
  const links = buildPaymentReversalLinks(payments, [marker('p1', 1000), marker('p1', 2000)]);
  const displayed = buildDisplayedPayments(payments, links);
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].amount, 50);
  assert.equal(displayed[0].status, 'PARTIALLY_REVERSED');
}

// Pagamentos de valores iguais com marcadores distintos são tratados individualmente.
{
  const payments = [
    payment('p1', 'PIX', 50, 0),
    payment('p2', 'PIX', 50, 10_000),
    payment('n1', 'PIX', -50, 500),
    payment('n2', 'PIX', -50, 10_500),
  ];
  const links = buildPaymentReversalLinks(payments, [marker('p1', 1000), marker('p2', 11_000)]);
  const displayed = buildDisplayedPayments(payments, links);
  assert.equal(links.length, 2);
  assert.equal(displayed.length, 0);
}

// Ambiguidade real preserva os registros em vez de ocultar.
{
  const payments = [
    payment('p1', 'PIX', 50, 0),
    payment('n1', 'PIX', -50, 500),
    payment('n2', 'PIX', -50, 500),
  ];
  const links = buildPaymentReversalLinks(payments, [marker('p1', 1000)]);
  const displayed = buildDisplayedPayments(payments, links);
  assert.equal(links.length, 0);
  assert.equal(displayed.length, 3);
  assert.equal(displayed.filter((item) => item.status === 'UNLINKED_REVERSAL').length, 2);
}

// Estorno em sessão diferente continua vinculado e é ocultado no par integral.
{
  const payments = [
    payment('p1', 'PIX', 70, 0, { cashRegisterId: 'session-a' }),
    payment('n1', 'PIX', -70, 500, { cashRegisterId: 'session-b' }),
  ];
  const links = buildPaymentReversalLinks(payments, [marker('p1', 1000)]);
  const displayed = buildDisplayedPayments(payments, links);
  assert.equal(links.length, 1);
  assert.equal(links[0].hasCrossSession, true);
  assert.equal(displayed.length, 0);
}

// Estorno legado sem marcador não é ocultado.
{
  const payments = [payment('p1', 'PIX', 50, 0), payment('n1', 'PIX', -50, 500)];
  const links = buildPaymentReversalLinks(payments, []);
  const displayed = buildDisplayedPayments(payments, links);
  assert.equal(displayed.length, 2);
  assert.equal(displayed[1].status, 'UNLINKED_REVERSAL');
  assert.equal(displayed[1].amount, -50);
}

// Métodos traduzidos.
assert.equal(paymentMethodLabel('DEBIT'), 'Débito');
assert.equal(paymentMethodLabel('CREDIT'), 'Crédito');
assert.equal(paymentMethodLabel('CASH'), 'Dinheiro');
assert.equal(paymentMethodLabel('PIX'), 'PIX');
assert.equal(parsePaymentVoidMarker('payment-void:abc123'), 'abc123');
assert.equal(parsePaymentVoidMarker('outro:abc123'), null);

console.log('payment-display tests: OK');
