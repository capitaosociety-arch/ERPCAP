import assert from 'node:assert';
import {
  buildOperationDetail,
  buildOperationMarker,
  isValidOperationKey,
  readOperationResourceId,
} from '../../lib/operation-idempotency';
import { publicActionErrorMessage } from '../../lib/action-errors';
import { COMANDA_PERMISSION_DENIED_MESSAGE } from '../../lib/comanda-creation';

// Chaves de idempotência aceitas pelo frontend e pelo backend.
assert.equal(isValidOperationKey('3f9d6c2a-1b7e-4a6f-9c1d-8e2f4a6b8c0d'), true);
assert.equal(isValidOperationKey('1770000000000-abc123xyz-abc123xyz'), true);
assert.equal(isValidOperationKey('curta'), false);
assert.equal(isValidOperationKey('chave com espacos 123456'), false);
assert.equal(isValidOperationKey('x'.repeat(101)), false);
assert.equal(isValidOperationKey(null), false);

// Marcador e recurso associado à operação persistida no AuditLog.
const marker = buildOperationMarker('payment', '3f9d6c2a-1b7e-4a6f-9c1d-8e2f4a6b8c0d');
const paymentDetail = buildOperationDetail(marker, 'payment', 'cmpayment123');
const orderDetail = buildOperationDetail(marker, 'order', 'cmorder123');
assert.equal(marker.startsWith('payment:'), true);
assert.equal(readOperationResourceId(paymentDetail, 'payment'), 'cmpayment123');
assert.equal(readOperationResourceId(orderDetail, 'order'), 'cmorder123');
assert.equal(readOperationResourceId(orderDetail, 'payment'), null);
assert.equal(readOperationResourceId(null, 'payment'), null);

// Erros de permissão são claros; erros internos não expõem detalhes técnicos.
assert.equal(
  publicActionErrorMessage({ name: 'AuthError', status: 403 }, 'Falha segura.'),
  COMANDA_PERMISSION_DENIED_MESSAGE,
);
assert.equal(
  publicActionErrorMessage({ code: 'P2028', message: 'Transaction not found' }, 'Falha segura.'),
  'Falha segura.',
);
assert.equal(
  publicActionErrorMessage(new Error('Estoque insuficiente!'), 'Falha segura.'),
  'Estoque insuficiente!',
);
assert.equal(publicActionErrorMessage(null, 'Falha segura.'), 'Falha segura.');

console.log('operation-idempotency tests: OK');
