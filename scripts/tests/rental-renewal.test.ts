import assert from 'node:assert';
import { generateRenewalDrafts, inferRentalPattern, renewalPatternDescription } from '../../lib/rental-renewal';

const history = [
  { id: 'r1', resource: 'FUT5', startTime: '2026-09-07T23:00:00.000Z', endTime: '2026-09-08T00:00:00.000Z', totalAmount: 110, status: 'PAID' },
  { id: 'r2', resource: 'FUT5', startTime: '2026-09-14T23:00:00.000Z', endTime: '2026-09-15T00:00:00.000Z', totalAmount: 110, status: 'PAID' },
  { id: 'r3', resource: 'FUT5', startTime: '2026-09-21T23:00:00.000Z', endTime: '2026-09-22T00:00:00.000Z', totalAmount: 110, status: 'CONFIRMED' },
];

const pattern = inferRentalPattern(history);
assert.ok(pattern);
assert.equal(pattern?.resource, 'FUT5');
assert.equal(pattern?.start, '20:00');
assert.equal(pattern?.end, '21:00');
assert.equal(pattern?.occurrences, 3);
assert.equal(pattern?.confident, true);
assert.equal(renewalPatternDescription(pattern!), 'segunda-feira, 20:00 as 21:00, FUT5');

const generated = generateRenewalDrafts(history, [], '2026-10-05');
assert.deepEqual(generated.map(item => item.startDate), ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
assert.equal(generated.every(item => item.status === 'PENDING'), true);

const deduplicated = generateRenewalDrafts(history, [{ resource: 'FUT5', startDate: '2026-10-12', start: '20:00', end: '21:00', status: 'PENDING' }], '2026-10-05');
assert.deepEqual(deduplicated.map(item => item.startDate), ['2026-10-19', '2026-10-26', '2026-11-02']);

const ambiguous = inferRentalPattern([
  { resource: 'FUT5', startTime: '2026-09-07T23:00:00.000Z', endTime: '2026-09-08T00:00:00.000Z', status: 'PAID' },
  { resource: 'FUT7', startTime: '2026-09-14T23:00:00.000Z', endTime: '2026-09-15T00:00:00.000Z', status: 'PAID' },
]);
assert.equal(ambiguous?.confident, false);
assert.equal(inferRentalPattern([]), null);

console.log('rental-renewal tests: OK');
