import assert from 'node:assert';
import {
  evaluatePaymentDeletion,
  isPaymentDeletionReasonValid,
  normalizePaymentDeletionReason,
} from '../../lib/payment-deletion';
import {
  buildDeletedPaymentAudit,
  buildDisplayedPayments,
  buildPaymentReversalLinks,
  sumDisplayedPayments,
  type PaymentDisplayRow,
  type PaymentVoidMarker,
} from '../../lib/payment-display';

const BASE = new Date('2026-11-26T22:37:46.000Z').getTime();
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
  cashRegisterId: 'session-open',
  method,
  amount,
  date: at(offsetMs),
  userId: 'user-1',
  ...overrides,
});

const marker = (
  originalPaymentId: string,
  offsetMs: number,
  overrides: Partial<PaymentVoidMarker> = {},
): PaymentVoidMarker => ({
  originalPaymentId,
  actorUserId: 'user-1',
  timestamp: at(offsetMs),
  ...overrides,
});

const baseInput = {
  found: true,
  amount: 100,
  deletedAt: null,
  orderStatus: 'OPEN',
  sessionStatus: 'OPEN',
  hasReversal: false,
  periodClosed: false,
  reason: 'lançamento incorreto',
};

// Pagamento válido em comanda e sessão abertas pode ser excluído.
assert.equal(evaluatePaymentDeletion(baseInput).allowed, true);

// Registro inexistente.
assert.equal(evaluatePaymentDeletion({ ...baseInput, found: false }).allowed, false);

// Já excluído não é excluído novamente.
assert.equal(evaluatePaymentDeletion({ ...baseInput, deletedAt: new Date() }).allowed, false);

// Uma reversão/estorno nunca é excluída por este fluxo.
assert.equal(evaluatePaymentDeletion({ ...baseInput, amount: -100 }).allowed, false);

// Pagamento com estorno vinculado exige o fluxo formal de estorno.
assert.equal(evaluatePaymentDeletion({ ...baseInput, hasReversal: true }).allowed, false);

// Comanda cancelada preserva o histórico.
assert.equal(evaluatePaymentDeletion({ ...baseInput, orderStatus: 'CANCELED' }).allowed, false);

// Sessão encerrada é consolidada e exige estorno formal.
assert.equal(evaluatePaymentDeletion({ ...baseInput, sessionStatus: 'CLOSED' }).allowed, false);
assert.equal(evaluatePaymentDeletion({ ...baseInput, sessionStatus: 'CANCELED' }).allowed, false);
assert.equal(evaluatePaymentDeletion({ ...baseInput, sessionStatus: null }).allowed, false);

// Período financeiro fechado bloqueia.
assert.equal(evaluatePaymentDeletion({ ...baseInput, periodClosed: true }).allowed, false);

// Motivo obrigatório e com tamanho mínimo.
assert.equal(evaluatePaymentDeletion({ ...baseInput, reason: '   ' }).allowed, false);
assert.equal(evaluatePaymentDeletion({ ...baseInput, reason: 'abc' }).allowed, false);
assert.equal(evaluatePaymentDeletion({ ...baseInput, reason: 'ajuste' }).allowed, true);
assert.equal(isPaymentDeletionReasonValid('  falha  '), true);
assert.equal(normalizePaymentDeletionReason('  falha  '), 'falha');

// Pagamento excluído some da visão operacional e não compõe totais.
{
  const payments = [
    payment('p1', 'PIX', 100, 0),
    payment('p2', 'PIX', 40, 1000),
    payment('p3', 'PIX', 40, 2000, {
      deletedAt: at(3000),
      deletedByUserId: 'admin-1',
      deletedByName: 'Administrador',
      deletionReason: 'forma de pagamento incorreta',
    }),
  ];
  const links = buildPaymentReversalLinks(payments, []);
  const displayed = buildDisplayedPayments(payments, links);
  assert.deepEqual(displayed.map((item) => item.id).sort(), ['p1', 'p2']);
  assert.equal(sumDisplayedPayments(displayed), 140);
  assert.equal(displayed.some((item) => item.id === 'p3'), false);
}

// Auditoria administrativa mantém o registro excluído com trilha completa.
{
  const deletedAt = at(5000);
  const payments = [
    payment('p1', 'CASH', 75, 0, {
      deletedAt,
      deletedByUserId: 'admin-9',
      deletedByName: 'Maria Admin',
      deletionReason: 'lançamento duplicado',
    }),
  ];
  const audit = buildDeletedPaymentAudit(payments);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].id, 'p1');
  assert.equal(audit[0].amount, 75);
  assert.equal(audit[0].method, 'CASH');
  assert.equal(audit[0].deletedByName, 'Maria Admin');
  assert.equal(audit[0].deletionReason, 'lançamento duplicado');
}

// Exclusão não é estorno: não entra no vínculo de reversão nem some como par.
{
  const payments = [
    payment('p1', 'PIX', 100, 0),
    payment('p2', 'PIX', 100, 1000, { deletedAt: at(2000) }),
    payment('n1', 'PIX', -40, 3000),
  ];
  const links = buildPaymentReversalLinks(payments, [marker('p1', 3500)]);
  const displayed = buildDisplayedPayments(payments, links);
  const deletedLink = links.find((link) => link.originalPaymentId === 'p2');
  assert.equal(deletedLink, undefined);
  assert.deepEqual(displayed.map((item) => [item.id, item.amount]), [['p1', 60]]);
  assert.equal(sumDisplayedPayments(displayed), 60);
}

// Estornos legados sem marcador continuam visíveis (não são ocultados como exclusão).
{
  const payments = [payment('p1', 'PIX', 50, 0), payment('n1', 'PIX', -50, 500)];
  const links = buildPaymentReversalLinks(payments, []);
  const displayed = buildDisplayedPayments(payments, links);
  assert.equal(displayed.length, 2);
  assert.equal(displayed.filter((item) => item.status === 'UNLINKED_REVERSAL').length, 1);
}

console.log('payment-deletion tests: OK');
