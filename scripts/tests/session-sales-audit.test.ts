import assert from 'node:assert';
import {
  buildAuditOrdersFromSessionPayments,
  computeSessionSalesAudit,
  salesAuditStatusLabel,
  type SessionAuditOrderInput,
} from '../../lib/session-sales-audit';

const SESSION = 'session-25';

const order = (
  id: string,
  status: string,
  items: number,
  payments: number[],
  overrides: Partial<SessionAuditOrderInput> = {},
): SessionAuditOrderInput => ({
  id,
  label: id,
  status,
  discount: 0,
  items: [{ subtotal: items, status: 'ACTIVE' }],
  payments: payments.map((amount) => ({ amount, cashRegisterId: SESSION })),
  ...overrides,
});

// Fixture exata da sessão auditada de 25/11/2026 (8 ordens).
{
  const orders: SessionAuditOrderInput[] = [
    order('98bg21', 'CANCELED', 260.5, [260.5, -260.5]),
    order('3e3w57', 'CANCELED', 183.5, [183.5, -183.5]),
    order('r56ay1', 'CANCELED', 165, [192.5, -192.5]),
    order('ufai69', 'CANCELED', 110, [110, -110]),
    order('qgxhw2', 'CANCELED', 0, [335, -335]),
    order('ups5hg', 'CLOSED', 165, [180]),
    order('232290', 'CLOSED', 110, [110]),
    order('3qve60', 'CLOSED', 260.5, [260.5]),
  ];
  const audit = computeSessionSalesAudit(orders, SESSION);
  assert.equal(audit.excess, 15);
  assert.equal(audit.shortage, 0);
  assert.equal(audit.netSalesValid, 535.5);
  assert.equal(audit.paymentsValid, 550.5);
  assert.equal(audit.canceledGross, 719);
  assert.equal(audit.canceledNetSales, 719);
  assert.equal(audit.canceledPaymentsNet, 0);
  assert.equal(audit.validOrders, 3);
  assert.equal(audit.canceledOrders, 5);
  assert.equal(audit.openOrders, 0);
  assert.equal(audit.pendingOpen, 0);
  assert.equal(audit.netDifference, 15);
  assert.equal(salesAuditStatusLabel(audit), 'Recebimento excedente');
  assert.equal(audit.orders.find((item) => item.id === 'ups5hg')?.excess, 15);
}

// Excedente de uma venda não compensa falta de outra.
{
  const audit = computeSessionSalesAudit(
    [
      order('excess', 'CLOSED', 100, [110]),
      order('shortage', 'CLOSED', 100, [90]),
    ],
    SESSION,
  );
  assert.equal(audit.excess, 10);
  assert.equal(audit.shortage, 10);
  assert.equal(audit.netDifference, 0);
  assert.equal(salesAuditStatusLabel(audit), 'Excedente e falta');
}

// Desconto correto não gera divergência.
{
  const audit = computeSessionSalesAudit(
    [order('discount', 'CLOSED', 100, [80], { discount: 20 })],
    SESSION,
  );
  assert.equal(audit.excess, 0);
  assert.equal(audit.shortage, 0);
  assert.equal(salesAuditStatusLabel(audit), 'ÍNTEGRO');
}

// Item inativo não entra no valor vendido.
{
  const audit = computeSessionSalesAudit(
    [
      {
        id: 'inactive',
        status: 'CLOSED',
        discount: 0,
        items: [
          { subtotal: 100, status: 'ACTIVE' },
          { subtotal: 50, status: 'CANCELED' },
        ],
        payments: [{ amount: 100, cashRegisterId: SESSION }],
      },
    ],
    SESSION,
  );
  assert.equal(audit.netSalesValid, 100);
  assert.equal(audit.excess, 0);
  assert.equal(audit.shortage, 0);
}

// Comanda cancelada e neutralizada não gera divergência; resíduo gera.
{
  const neutral = computeSessionSalesAudit(
    [order('canceled-neutral', 'CANCELED', 100, [100, -100])],
    SESSION,
  );
  assert.equal(neutral.excess, 0);
  assert.equal(neutral.shortage, 0);
  assert.equal(neutral.canceledGross, 100);

  const residual = computeSessionSalesAudit(
    [order('canceled-residual', 'CANCELED', 100, [100])],
    SESSION,
  );
  assert.equal(residual.excess, 100);
  assert.equal(residual.shortage, 0);
}

// Comanda aberta com pagamento parcial é "em aberto", não falta.
{
  const audit = computeSessionSalesAudit(
    [order('open-partial', 'OPEN', 100, [40])],
    SESSION,
  );
  assert.equal(audit.shortage, 0);
  assert.equal(audit.excess, 0);
  assert.equal(audit.pendingOpen, 60);
  assert.equal(audit.openOrders, 1);
  assert.equal(salesAuditStatusLabel(audit), 'ÍNTEGRO');
}

// Comanda aberta com excesso é sinalizada.
{
  const audit = computeSessionSalesAudit(
    [order('open-excess', 'OPEN', 100, [120])],
    SESSION,
  );
  assert.equal(audit.excess, 20);
  assert.equal(audit.shortage, 0);
  assert.equal(audit.pendingOpen, 0);
}

// Venda fechada com valor faltante.
{
  const audit = computeSessionSalesAudit(
    [order('closed-shortage', 'CLOSED', 100, [70])],
    SESSION,
  );
  assert.equal(audit.shortage, 30);
  assert.equal(audit.excess, 0);
  assert.equal(salesAuditStatusLabel(audit), 'Pagamento faltante');
}

// Pagamento em outra sessão: atribui à sessão do último pagamento, sem duplicar.
{
  const payments = [
    { amount: 60, cashRegisterId: 'session-a', date: '2026-11-25T20:00:00Z' },
    { amount: 30, cashRegisterId: 'session-b', date: '2026-11-25T21:00:00Z' },
  ];
  const orders: SessionAuditOrderInput[] = [
    { id: 'cross', status: 'CLOSED', discount: 0, items: [{ subtotal: 100 }], payments },
  ];

  const first = computeSessionSalesAudit(orders, 'session-a');
  assert.equal(first.crossSessionOrders, 1);
  assert.equal(first.orders[0].attributedElsewhere, true);
  assert.equal(first.excess, 0);
  assert.equal(first.shortage, 0);

  const last = computeSessionSalesAudit(orders, 'session-b');
  assert.equal(last.crossSessionOrders, 1);
  assert.equal(last.orders[0].attributedElsewhere, false);
  assert.equal(last.paymentsValid, 90);
  assert.equal(last.shortage, 10);
  assert.equal(last.excess, 0);
}

// Adaptador da sessão: agrupa por ordem e prioriza todos os pagamentos da ordem.
{
  const built = buildAuditOrdersFromSessionPayments(
    [
      {
        amount: 60,
        orderId: 'order-1',
        order: {
          id: 'order-1',
          status: 'CLOSED',
          discount: 0,
          notes: 'Cliente 1',
          items: [{ subtotal: 100, status: 'ACTIVE' }],
          payments: [
            { amount: 60, cashRegisterId: 'session-a', date: '2026-11-25T20:00:00Z' },
            { amount: 40, cashRegisterId: 'session-a', date: '2026-11-25T20:05:00Z' },
          ],
        },
      },
      {
        amount: 40,
        orderId: 'order-1',
        order: {
          id: 'order-1',
          status: 'CLOSED',
          discount: 0,
          notes: 'Cliente 1',
          items: [{ subtotal: 100, status: 'ACTIVE' }],
          payments: [
            { amount: 60, cashRegisterId: 'session-a', date: '2026-11-25T20:00:00Z' },
            { amount: 40, cashRegisterId: 'session-a', date: '2026-11-25T20:05:00Z' },
          ],
        },
      },
    ],
    'session-a',
  );
  assert.equal(built.length, 1);
  assert.equal(built[0].payments.length, 2);
  const audit = computeSessionSalesAudit(built, 'session-a');
  assert.equal(audit.excess, 0);
  assert.equal(audit.shortage, 0);
}

console.log('session-sales-audit tests: OK');
