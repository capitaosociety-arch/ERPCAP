import assert from 'node:assert';
import { calculateRenewalTotal, generateRenewalDrafts, generateRenewalDraftsFromPattern, inferRentalPattern, renewalPatternDescription, resolveRenewalTotal, sortRentalDraftsDesc } from '../../lib/rental-renewal';

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

const recentChange = inferRentalPattern([
  { resource: 'FUT7', startTime: '2026-10-16T20:00:00.000Z', endTime: '2026-10-16T21:00:00.000Z', totalAmount: 140, status: 'PAID' },
  { resource: 'FUT7', startTime: '2026-10-23T20:00:00.000Z', endTime: '2026-10-23T21:00:00.000Z', totalAmount: 140, status: 'PAID' },
  { resource: 'FUT7', startTime: '2026-10-30T20:00:00.000Z', endTime: '2026-10-30T21:00:00.000Z', totalAmount: 140, status: 'PAID' },
  { resource: 'FUT7', startTime: '2026-11-06T23:00:00.000Z', endTime: '2026-11-07T00:00:00.000Z', totalAmount: 140, status: 'PAID' },
]);
assert.equal(recentChange?.start, '20:00');
assert.equal(recentChange?.end, '21:00');
assert.equal(recentChange?.resource, 'FUT7');
assert.equal(recentChange?.occurrences, 1);
assert.equal(recentChange?.confident, false);

const changedGeneration = generateRenewalDrafts([
  { resource: 'FUT7', startTime: '2026-10-16T20:00:00.000Z', endTime: '2026-10-16T21:00:00.000Z', totalAmount: 140, status: 'PAID' },
  { resource: 'FUT7', startTime: '2026-10-23T20:00:00.000Z', endTime: '2026-10-23T21:00:00.000Z', totalAmount: 140, status: 'PAID' },
  { resource: 'FUT7', startTime: '2026-10-30T20:00:00.000Z', endTime: '2026-10-30T21:00:00.000Z', totalAmount: 140, status: 'PAID' },
  { resource: 'FUT7', startTime: '2026-11-06T23:00:00.000Z', endTime: '2026-11-07T00:00:00.000Z', totalAmount: 140, status: 'PAID' },
], [], '2026-11-13');
assert.deepEqual(changedGeneration.map(item => [item.startDate, item.start, item.end, item.resource]), [
  ['2026-11-20', '20:00', '21:00', 'FUT7'],
  ['2026-11-27', '20:00', '21:00', 'FUT7'],
  ['2026-12-04', '20:00', '21:00', 'FUT7'],
  ['2026-12-11', '20:00', '21:00', 'FUT7'],
]);

for (const games of [4, 5, 8, 10, 12, 15]) {
  const drafts = generateRenewalDraftsFromPattern(pattern!, history, [], '2026-10-05', games);
  assert.equal(drafts.length, games);
  assert.equal(drafts.every(item => item.status === 'PENDING'), true);
  assert.equal(drafts.every(item => item.start === '20:00' && item.end === '21:00'), true);
}

assert.equal(calculateRenewalTotal(140, 4), 560);
assert.equal(calculateRenewalTotal(140, 5), 700);
assert.equal(calculateRenewalTotal(140, 8), 1120);
assert.equal(calculateRenewalTotal(140, 10), 1400);
assert.equal(calculateRenewalTotal(140, 15), 2100);
assert.equal(calculateRenewalTotal(19.99, 3), 59.97);
assert.equal(calculateRenewalTotal(0.1, 3), 0.3);
assert.equal(resolveRenewalTotal(140, 5, 650), 650);
assert.equal(resolveRenewalTotal(140, 5, null), 700);

const sorted = sortRentalDraftsDesc([
  { startDate: '2026-10-10', start: '20:00' },
  { startDate: '2026-11-20', start: '20:00' },
  { startDate: '2026-10-10', start: '22:00' },
]);
assert.deepEqual(sorted.map(item => `${item.startDate} ${item.start}`), [
  '2026-11-20 20:00',
  '2026-10-10 22:00',
  '2026-10-10 20:00',
]);

console.log('rental-renewal tests: OK');
