import assert from 'node:assert';
import { addMonthClamped, addMonthForDay, formatDateDisplay, formatDateOnlyInput, nextDueDateForDay, parseDateOnlyInput } from '../../lib/subscription-date';

assert.equal(formatDateOnlyInput('2026-12-11T00:00:00.000Z'), '2026-12-11');
assert.equal(formatDateDisplay('2026-12-11T00:00:00.000Z'), '11/12/2026');
assert.equal(formatDateOnlyInput(parseDateOnlyInput('2026-01-31')), '2026-01-31');

assert.equal(formatDateOnlyInput(addMonthClamped('2026-01-31T00:00:00.000Z')), '2026-02-28');
assert.equal(formatDateOnlyInput(addMonthClamped('2028-01-31T00:00:00.000Z')), '2028-02-29');
assert.equal(formatDateOnlyInput(addMonthClamped('2026-01-30T00:00:00.000Z')), '2026-02-28');
assert.equal(formatDateOnlyInput(addMonthClamped('2026-12-31T00:00:00.000Z')), '2027-01-31');
assert.equal(formatDateOnlyInput(addMonthClamped('2026-03-31T00:00:00.000Z')), '2026-04-30');
assert.equal(formatDateOnlyInput(nextDueDateForDay(31, new Date('2026-02-10T12:00:00.000Z'))), '2026-02-28');
assert.equal(formatDateOnlyInput(addMonthForDay('2026-02-28T00:00:00.000Z', 31)), '2026-03-31');
assert.equal(formatDateOnlyInput(addMonthForDay('2026-01-31T00:00:00.000Z', 31)), '2026-02-28');

console.log('subscription-date tests: OK');
