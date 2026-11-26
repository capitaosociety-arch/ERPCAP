import assert from 'node:assert';
import {
  CASH_SESSION_CANCEL_REASON_REQUIRED,
  CASH_SESSION_HAS_DEPOSITS,
  CASH_SESSION_HAS_PAYMENTS,
  CASH_SESSION_OPEN_CANNOT_CANCEL,
  evaluateCashSessionCancellation,
} from '../../lib/cash-session';

// Motivo é obrigatório para cancelar uma sessão ativa/fechada.
assert.deepEqual(evaluateCashSessionCancellation({ status: 'CLOSED', reason: '' }), {
  allowed: false,
  error: CASH_SESSION_CANCEL_REASON_REQUIRED,
});

// Sessão aberta deve ser fechada antes do cancelamento.
assert.deepEqual(
  evaluateCashSessionCancellation({ status: 'OPEN', reason: 'Abertura indevida' }),
  { allowed: false, error: CASH_SESSION_OPEN_CANNOT_CANCEL },
);

// Sessão consolidada com pagamentos não pode ser cancelada.
assert.deepEqual(
  evaluateCashSessionCancellation({ status: 'CLOSED', reason: 'Sessão indevida', paymentsCount: 1 }),
  { allowed: false, error: CASH_SESSION_HAS_PAYMENTS },
);

// Sessão com depósitos registrados não pode ser cancelada.
assert.deepEqual(
  evaluateCashSessionCancellation({ status: 'CLOSED', reason: 'Sessão indevida', depositsCount: 1 }),
  { allowed: false, error: CASH_SESSION_HAS_DEPOSITS },
);

// Sessão fechada, sem pagamentos/depósitos, pode ser cancelada logicamente.
assert.deepEqual(
  evaluateCashSessionCancellation({ status: 'CLOSED', reason: 'Abertura indevida', paymentsCount: 0, depositsCount: 0 }),
  { allowed: true, alreadyCanceled: false },
);

// Repetição do cancelamento é idempotente e não altera novamente.
assert.deepEqual(
  evaluateCashSessionCancellation({ status: 'CANCELED', paymentsCount: 0, depositsCount: 0 }),
  { allowed: true, alreadyCanceled: true },
);

console.log('cash-session tests: OK');
