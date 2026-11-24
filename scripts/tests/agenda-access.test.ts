import assert from 'node:assert';
import { permissionGranted } from '../../lib/permissions';

const base = {
  isActive: true,
  permDashboard: false,
  permPDV: false,
  permComandas: false,
  permProducts: false,
  permStock: false,
  permCustomers: false,
  permFinance: false,
  permUsers: false,
  permDepot: false,
  permInteligencia: false,
  permAgenda: false,
  permCopilot: false,
};

// Usuário autorizado somente à Agenda.
assert.equal(permissionGranted({ ...base, role: 'CASHIER', permAgenda: true }, 'permAgenda'), true);
assert.equal(permissionGranted({ ...base, role: 'CASHIER', permAgenda: true }, 'permInteligencia'), false);
assert.equal(permissionGranted({ ...base, role: 'CASHIER', permAgenda: true }, 'permFinance'), false);

// Usuário autorizado à Central de Inteligência, mas sem Agenda.
assert.equal(permissionGranted({ ...base, role: 'MANAGER', permInteligencia: true }, 'permInteligencia'), true);
assert.equal(permissionGranted({ ...base, role: 'MANAGER', permInteligencia: true }, 'permAgenda'), false);

// Usuário autorizado aos dois módulos.
const both = { ...base, role: 'MANAGER', permInteligencia: true, permAgenda: true };
assert.equal(permissionGranted(both, 'permInteligencia'), true);
assert.equal(permissionGranted(both, 'permAgenda'), true);

// Usuário sem autorização aos dois módulos.
assert.equal(permissionGranted({ ...base, role: 'WAITER' }, 'permInteligencia'), false);
assert.equal(permissionGranted({ ...base, role: 'WAITER' }, 'permAgenda'), false);

// Administrador acessa por padrão, mesmo com flags falsas.
assert.equal(permissionGranted({ ...base, role: 'ADMIN' }, 'permAgenda'), true);
assert.equal(permissionGranted({ ...base, role: 'ADMIN' }, 'permInteligencia'), true);
assert.equal(permissionGranted({ ...base, role: 'ADMIN' }, 'permFinance'), true);

// Usuário bloqueado não acessa, mesmo com permissões marcadas.
assert.equal(permissionGranted({ ...base, role: 'ADMIN', isActive: false }, 'permAgenda'), false);
assert.equal(permissionGranted({ ...base, role: 'MANAGER', isActive: false, permAgenda: true, permInteligencia: true }, 'permAgenda'), false);

// Permissão da Agenda não concede outros módulos.
assert.equal(permissionGranted({ ...base, role: 'CASHIER', permAgenda: true }, 'permCustomers'), false);
assert.equal(permissionGranted({ ...base, role: 'CASHIER', permAgenda: true }, 'permCopilot'), false);

console.log('agenda-access tests: OK');
