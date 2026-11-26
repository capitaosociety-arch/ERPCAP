import assert from 'node:assert';
import {
  canOperateComandas,
  comandaActionErrorMessage,
  COMANDA_DELETE_FALLBACK_MESSAGE,
  COMANDA_HAS_PAYMENTS_MESSAGE,
  COMANDA_ITEM_HAS_PAYMENTS_MESSAGE,
  COMANDA_ITEM_NOT_OPEN_MESSAGE,
  COMANDA_NOT_FOUND_MESSAGE,
  COMANDA_NOT_OPEN_MESSAGE,
  COMANDA_PERMISSION_DENIED_MESSAGE,
  evaluateComandaDeletion,
  evaluateComandaItemDeletion,
  isPermissionError,
} from '../../lib/comanda-deletion';

const base = {
  isActive: true,
  permPDV: false,
  permComandas: false,
  permFinance: false,
};

// ADMIN opera Comandas por perfil, mesmo com flags individuais desligadas.
assert.equal(canOperateComandas({ ...base, role: 'ADMIN' }), true);

// Usuário ativo com permissão de Comandas opera sem perfil administrativo.
assert.equal(canOperateComandas({ ...base, role: 'CASHIER', permComandas: true }), true);

// Usuário ativo com permissão de PDV também opera, como nas demais ações do módulo.
assert.equal(canOperateComandas({ ...base, role: 'WAITER', permPDV: true }), true);

// Usuário ativo sem permissão de Comandas/PDV não opera.
assert.equal(canOperateComandas({ ...base, role: 'WAITER' }), false);

// Usuário inativo não opera mesmo com a permissão marcada.
assert.equal(canOperateComandas({ ...base, role: 'CASHIER', permComandas: true, isActive: false }), false);

// Exclusão de comanda: vazia, vinculada a cliente ou com produtos continuam sendo comandas abertas sem pagamento.
assert.deepEqual(evaluateComandaDeletion({ found: true, status: 'OPEN', receivedAmount: 0 }), { allowed: true });

// Comanda inexistente.
assert.deepEqual(evaluateComandaDeletion({ found: false }), {
  allowed: false,
  message: COMANDA_NOT_FOUND_MESSAGE,
});

// Comanda fechada/cancelada não pode ser excluída.
assert.deepEqual(evaluateComandaDeletion({ found: true, status: 'CLOSED', receivedAmount: 0 }), {
  allowed: false,
  message: COMANDA_NOT_OPEN_MESSAGE,
});

// Comanda com pagamento integral ou parcial é bloqueada.
assert.deepEqual(evaluateComandaDeletion({ found: true, status: 'OPEN', receivedAmount: 10 }), {
  allowed: false,
  message: COMANDA_HAS_PAYMENTS_MESSAGE,
});

// Comanda sem pagamento efetivo continua permitida.
assert.deepEqual(evaluateComandaDeletion({ found: true, status: 'OPEN', receivedAmount: 0.01 }), { allowed: true });

// Exclusão de item/lançamento individual segue as mesmas proteções.
assert.deepEqual(evaluateComandaItemDeletion({ found: true, orderStatus: 'OPEN', receivedAmount: 0 }), {
  allowed: true,
});
assert.deepEqual(evaluateComandaItemDeletion({ found: true, orderStatus: 'OPEN', receivedAmount: 5 }), {
  allowed: false,
  message: COMANDA_ITEM_HAS_PAYMENTS_MESSAGE,
});
assert.deepEqual(evaluateComandaItemDeletion({ found: true, orderStatus: 'CLOSED', receivedAmount: 0 }), {
  allowed: false,
  message: COMANDA_ITEM_NOT_OPEN_MESSAGE,
});

// Erros de autorização recebem mensagem clara; erros internos usam fallback seguro.
assert.equal(isPermissionError({ name: 'AuthError', status: 403 }), true);
assert.equal(isPermissionError({ status: 401 }), true);
assert.equal(isPermissionError(new Error('Acesso negado')), true);
assert.equal(isPermissionError(new Error('falha interna do banco')), false);
assert.equal(
  comandaActionErrorMessage({ name: 'AuthError', status: 403 }, COMANDA_DELETE_FALLBACK_MESSAGE),
  COMANDA_PERMISSION_DENIED_MESSAGE,
);
assert.equal(
  comandaActionErrorMessage(new Error('detalhe interno sensível'), COMANDA_DELETE_FALLBACK_MESSAGE),
  COMANDA_DELETE_FALLBACK_MESSAGE,
);

console.log('comanda-deletion tests: OK');
