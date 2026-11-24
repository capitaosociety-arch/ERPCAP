import assert from 'node:assert';
import {
  buildRentalCorrectionWindow,
  buildRentalSnapshot,
  diffRentalSnapshots,
  normalizeRentalCorrectionField,
  normalizeRentalCorrectionReason,
} from '../../lib/rental-corrections';

assert.equal(normalizeRentalCorrectionField('FUT5'), 'FUT5');
assert.equal(normalizeRentalCorrectionField('fut7'), 'FUT7');
assert.equal(normalizeRentalCorrectionField('FUT 5'), 'FUT5');
assert.equal(normalizeRentalCorrectionField('CAMPO 1'), null);

assert.equal(normalizeRentalCorrectionReason('Erro de lançamento'), 'Erro de lançamento');
assert.throws(() => normalizeRentalCorrectionReason('abc'), /pelo menos/);
assert.throws(() => normalizeRentalCorrectionReason(''), /pelo menos/);

const sameDay = buildRentalCorrectionWindow({ date: '2026-11-24', start: '20:00', end: '21:30', field: 'FUT7' });
assert.equal(sameDay.field, 'FUT7');
assert.equal(sameDay.durationMinutes, 90);

const overnight = buildRentalCorrectionWindow({ date: '2026-11-24', start: '23:00', end: '01:00', field: 'FUT5' });
assert.equal(overnight.durationMinutes, 120);

assert.throws(
  () => buildRentalCorrectionWindow({ date: '2026-11-24', start: '20:00', end: '20:00', field: 'FUT7' }),
  /diferente/
);
assert.throws(
  () => buildRentalCorrectionWindow({ date: '2026-11-24', start: '20:00', end: '21:00', field: 'CAMPO 1' }),
  /Campo inválido/
);

const before = buildRentalSnapshot({
  id: 'r1',
  customerId: 'c1',
  orderId: 'o1',
  resource: 'FUT7',
  startTime: '2026-11-24T23:00:00.000Z',
  endTime: '2026-11-25T00:00:00.000Z',
  totalAmount: 150,
  status: 'PAID',
  source: 'WALK_IN',
});
assert.equal(before.durationMinutes, 60);
assert.equal(before.totalAmount, 150);
assert.equal(before.status, 'PAID');
assert.equal(before.orderId, 'o1');

const after = buildRentalSnapshot({
  id: 'r1',
  customerId: 'c1',
  orderId: 'o1',
  resource: 'FUT5',
  startTime: '2026-11-24T23:00:00.000Z',
  endTime: '2026-11-25T00:30:00.000Z',
  totalAmount: 150,
  status: 'PAID',
  source: 'WALK_IN',
});
const diff = diffRentalSnapshots(before, after);
assert.deepEqual(diff.changedFields.sort(), ['duration', 'endTime', 'field'].sort());
assert.equal(diff.requiresFinancialReview, true);
assert.equal(after.totalAmount, before.totalAmount);
assert.equal(after.status, before.status);
assert.equal(after.orderId, before.orderId);
assert.equal(after.customerId, before.customerId);

const unchanged = diffRentalSnapshots(before, before);
assert.deepEqual(unchanged.changedFields, []);
assert.equal(unchanged.requiresFinancialReview, false);

console.log('rental-corrections tests: OK');
