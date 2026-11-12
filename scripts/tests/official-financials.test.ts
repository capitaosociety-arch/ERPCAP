import assert from 'node:assert';
import {
  formatMonthLabel,
  isMonthKey,
  monthRange,
  nextMonth,
  previousMonth,
} from '../../lib/official-financials';

assert.equal(isMonthKey('2026-10'), true);
assert.equal(isMonthKey('2026-13'), false);
assert.equal(isMonthKey('10/2026'), false);
assert.equal(previousMonth('2026-10'), '2026-09');
assert.equal(previousMonth('2026-01'), '2025-12');
assert.equal(nextMonth('2026-12'), '2027-01');
assert.equal(formatMonthLabel('2026-10'), 'Outubro de 2026');

const october = monthRange('2026-10');
assert.equal(october.period, '2026-10');
assert.equal(october.prevPeriod, '2026-09');
assert.equal(october.from.toISOString(), '2026-10-01T04:00:00.000Z');
assert.equal(october.to.toISOString(), '2026-11-01T03:59:59.000Z');
assert.throws(() => monthRange('2026-13'), /Período inválido/);

console.log('official-financials tests: OK');
