import assert from 'node:assert/strict';
import {
  applyClosedSnapshot,
  dbPeriodToKey,
  formatPeriodKey,
  keyToDbPeriod,
  listYears,
  monthsForYear,
  nextCloseVersion,
  parsePeriodKey,
  periodStatus,
  shiftMonth,
} from '../../lib/dre-navigation';
import { classifyDreExpense, isInventoryPurchaseEntry } from '../../lib/financial-classification';
import { buildDreExportRows } from '../../lib/dre-export';

const months = [
  { key: '12/2025', periodStatus: 'OPEN', totalReceitas: 100 },
  { key: '01/2026', periodStatus: 'CLOSED', totalReceitas: 200 },
  { key: '10/2026', periodStatus: 'CLOSED', totalReceitas: 300 },
  { key: '11/2026', periodStatus: 'OPEN', totalReceitas: 400 },
];

assert.deepEqual(parsePeriodKey('10/2026'), { year: 2026, month: 10 });
assert.equal(parsePeriodKey('13/2026'), null);
assert.equal(formatPeriodKey(2026, 1), '01/2026');
assert.equal(dbPeriodToKey('2026-10'), '10/2026');
assert.equal(keyToDbPeriod('10/2026'), '2026-10');
assert.equal(dbPeriodToKey('10/2026'), '10/2026');
assert.equal(keyToDbPeriod('2026-10'), '2026-10');
assert.deepEqual(listYears(months), [2025, 2026]);
assert.deepEqual(monthsForYear(months, 2026).map((m) => m.key), ['01/2026', '10/2026', '11/2026']);
assert.equal(monthsForYear(months, 2027).length, 0);

assert.deepEqual(shiftMonth(2026, 12, 1, 2025, 2027), { year: 2027, month: 1 });
assert.deepEqual(shiftMonth(2027, 1, -1, 2025, 2027), { year: 2026, month: 12 });
assert.equal(shiftMonth(2026, 12, 1, 2025, 2026), null);
assert.equal(shiftMonth(2025, 1, -1, 2025, 2026), null);
assert.deepEqual(shiftMonth(2025, 12, 1, 2025, 2026), { year: 2026, month: 1 });
assert.deepEqual(shiftMonth(2026, 1, -1, 2025, 2026), { year: 2025, month: 12 });

assert.equal(periodStatus(null), 'NO_DATA');
assert.equal(periodStatus({ key: '10/2026', periodStatus: 'OPEN' }), 'OPEN');
assert.equal(periodStatus({ key: '10/2026', periodStatus: 'CLOSED' }), 'CLOSED');

const live = { key: '10/2026', totalReceitas: 999, resultadoLiquido: 999, periodStatus: 'OPEN' };
const closed = applyClosedSnapshot(live, {
  period: '10/2026',
  status: 'CLOSED',
  version: 3,
  snapshot: { totalReceitas: 300, resultadoLiquido: 200, cmv: 100 },
  closedAt: '2026-11-11T12:00:00.000Z',
});
assert.equal(closed.totalReceitas, 300);
assert.equal(closed.resultadoLiquido, 200);
assert.equal(closed.periodStatus, 'CLOSED');
assert.equal((closed as any).closeVersion, 3);

const reopened = applyClosedSnapshot(live, {
  period: '10/2026',
  status: 'OPEN',
  version: 3,
  snapshot: { totalReceitas: 300 },
});
assert.equal(reopened.periodStatus, 'OPEN');
assert.equal(reopened.totalReceitas, 999);

assert.equal(nextCloseVersion(undefined), 1);
assert.equal(nextCloseVersion(0), 1);
assert.equal(nextCloseVersion(3), 4);

const juneSalary = {
  type: 'PAYABLE',
  category: 'Salário',
  description: 'SALÁRIO FELIPE MASSAI',
  notes: 'diferença de produtos',
  entryKind: 'INVENTORY_PURCHASE',
};
assert.equal(isInventoryPurchaseEntry(juneSalary), false);
assert.equal(classifyDreExpense(juneSalary), 'operating');

const supplierPurchase = {
  type: 'PAYABLE',
  category: 'Fornecedor',
  description: 'NF 155162 - ELDORADO',
  notes: 'Entrada NF Matriz (IA)',
  entryKind: 'INVENTORY_PURCHASE',
};
assert.equal(isInventoryPurchaseEntry(supplierPurchase), true);
assert.equal(classifyDreExpense(supplierPurchase), 'inventory');

const exportMonth = {
  closeVersion: 1,
  receitasVendas: 25838,
  receitasOutras: 0,
  totalReceitas: 25838,
  cmv: 5299.98,
  lucroBruto: 20538.02,
  margemBruta: 79.5,
  despesas: { Energia: 332.42, Internet: 169.89 },
  totalDespesasOp: 502.31,
  despesasFinanceiras: 0,
  impostos: 0,
  ebitda: 20035.71,
  margemEbitda: 77.5,
  resultadoLiquido: 20035.71,
  margemLiquida: 77.5,
};
const exportRows = buildDreExportRows(exportMonth, 'cash');
assert.equal(exportRows[0]['Valor'], 'Caixa');
assert.equal(exportRows.find((row) => row['Conta'] === 'Receita Bruta Total')?.['Valor'], 25838);
assert.equal(exportRows.find((row) => row['Conta'] === '(-) CMV (Custo das Mercadorias Vendidas)')?.['Valor'], -5299.98);
assert.equal(exportRows.find((row) => row['Conta'] === 'Resultado Líquido')?.['Valor'], 20035.71);

console.log('finance-dre tests: OK');
