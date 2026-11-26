import assert from 'node:assert';
import {
  buildComandaCreationDetails,
  buildComandaCreationMarker,
  COMANDA_CASH_REGISTER_CLOSED_MESSAGE,
  COMANDA_CREATE_FALLBACK_MESSAGE,
  COMANDA_CUSTOMER_NOT_FOUND_MESSAGE,
  COMANDA_IDENTIFIER_REQUIRED_MESSAGE,
  COMANDA_PERMISSION_DENIED_MESSAGE,
  comandaCreationErrorMessage,
  isValidComandaCreationKey,
  orderIdFromCreationDetails,
  validateComandaCreation,
} from '../../lib/comanda-creation';

// Identificador vazio ou apenas espaços é rejeitado.
assert.deepEqual(validateComandaCreation({ name: '' }), {
  valid: false,
  error: COMANDA_IDENTIFIER_REQUIRED_MESSAGE,
});
assert.deepEqual(validateComandaCreation({ name: '   ' }), {
  valid: false,
  error: COMANDA_IDENTIFIER_REQUIRED_MESSAGE,
});

// Identificador é normalizado para caixa alta, tanto no frontend quanto no backend.
assert.deepEqual(validateComandaCreation({ name: '  mesa externa 04  ' }), {
  valid: true,
  name: 'MESA EXTERNA 04',
});

// Comanda sem cliente continua permitida.
assert.deepEqual(validateComandaCreation({ name: 'MESA 01', customerExists: null }), {
  valid: true,
  name: 'MESA 01',
});

// Cliente inexistente é bloqueado com mensagem clara.
assert.deepEqual(validateComandaCreation({ name: 'MESA 01', customerExists: false }), {
  valid: false,
  error: COMANDA_CUSTOMER_NOT_FOUND_MESSAGE,
});

// Chave de idempotência compatível com UUID e chaves geradas no navegador.
assert.equal(isValidComandaCreationKey('3f9d6c2a-1b7e-4a6f-9c1d-8e2f4a6b8c0d'), true);
assert.equal(isValidComandaCreationKey('1770000000000-abc123xyz-abc123xyz'), true);
assert.equal(isValidComandaCreationKey('curta'), false);
assert.equal(isValidComandaCreationKey('chave com espacos 123456'), false);
assert.equal(isValidComandaCreationKey('x'.repeat(101)), false);
assert.equal(isValidComandaCreationKey(null), false);

// Marcador de idempotência armazenado no AuditLog e recuperação do pedido.
const key = '3f9d6c2a-1b7e-4a6f-9c1d-8e2f4a6b8c0d';
const marker = buildComandaCreationMarker(key);
const details = buildComandaCreationDetails(marker, 'cmorder123');
assert.equal(marker.startsWith('comanda-create:'), true);
assert.equal(orderIdFromCreationDetails(details), 'cmorder123');
assert.equal(orderIdFromCreationDetails(`${marker}#order:`), null);
assert.equal(orderIdFromCreationDetails(null), null);

// Erros de permissão recebem mensagem clara; erros internos usam fallback seguro.
assert.equal(
  comandaCreationErrorMessage({ name: 'AuthError', status: 403 }),
  COMANDA_PERMISSION_DENIED_MESSAGE,
);
assert.equal(comandaCreationErrorMessage(new Error('detalhe interno do banco')), COMANDA_CREATE_FALLBACK_MESSAGE);
assert.equal(COMANDA_CASH_REGISTER_CLOSED_MESSAGE.includes('caixa'), true);

console.log('comanda-creation tests: OK');
