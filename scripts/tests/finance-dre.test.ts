import assert from 'node:assert/strict';
import {
  applyClosedSnapshot,
  formatPeriodKey,
  listYears,
  monthsForYear,
  nextCloseVersion,
  parsePeriodKey,
  periodStatus,
  shiftMonth,
} from '../../lib/dre-navigation';

const months = [
  { key: '12/2025', periodStatus: 'OPEN', totalReceitas: 100 },
  { key: '01/2026', periodStatus: 'CLOSED', totalReceitas: 200 },
  { key: '10/2026', periodStatus: 'CLOSED', totalReceitas: 300 },
  { key: '11/2026', periodStatus: 'OPEN', totalReceitas: 400 },
];

assert.deepEqual(parsePeriodKey('10/2026'), { year: 2026, month: 10 });
assert.equal(parsePeriodKey('13/2026'), null);
assert.equal(formatPeriodKey(2026, 1), '01/2026');
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

console.log('finance-dre tests: OK');
