import assert from 'node:assert';
import {
  APP_TIME_ZONE,
  LEGACY_RENTAL_TIME_ZONE,
  currentCuiabaDateKey,
  formatCuiabaDate,
  formatCuiabaDateTime,
  formatDateKeyInZone,
  isCivilDateBeforeTodayCuiaba,
  operationalRentalTime,
  rawQueryRangeForOperational,
  wallTimeToUtcInZone,
} from '../../lib/time-zone';
import { findOperationalConflict } from '../../lib/rental-conflicts';

assert.equal(APP_TIME_ZONE, 'America/Cuiaba');
assert.equal(LEGACY_RENTAL_TIME_ZONE, 'America/Fortaleza');

const cuiaba = wallTimeToUtcInZone('2026-10-05', '20:00', APP_TIME_ZONE);
const fortaleza = wallTimeToUtcInZone('2026-10-05', '20:00', LEGACY_RENTAL_TIME_ZONE);
assert.equal(cuiaba.toISOString(), '2026-10-06T00:00:00.000Z');
assert.equal(fortaleza.toISOString(), '2026-10-05T23:00:00.000Z');
assert.equal(operationalRentalTime(fortaleza, 'LEGACY_FORTALEZA').toISOString(), cuiaba.toISOString());
assert.equal(operationalRentalTime(cuiaba, 'CUIABA').toISOString(), cuiaba.toISOString());

assert.equal(formatDateKeyInZone(cuiaba, APP_TIME_ZONE), '2026-10-05');
assert.equal(formatCuiabaDate(cuiaba), '05/10/2026');
assert.equal(formatCuiabaDateTime(cuiaba), '05/10/2026 20:00');
assert.equal(formatCuiabaDate('2026-12-31T04:00:00.000Z'), '31/12/2026');
assert.equal(formatCuiabaDate('2027-01-01T03:59:00.000Z'), '31/12/2026');
assert.equal(formatCuiabaDate('2027-01-01T04:00:00.000Z'), '01/01/2027');
assert.equal(currentCuiabaDateKey(new Date('2026-11-25T03:59:00.000Z')), '2026-11-24');
assert.equal(currentCuiabaDateKey(new Date('2026-11-25T04:00:00.000Z')), '2026-11-25');
assert.equal(isCivilDateBeforeTodayCuiaba('2026-11-24T00:00:00.000Z', new Date('2026-11-25T03:59:00.000Z')), false);
assert.equal(isCivilDateBeforeTodayCuiaba('2026-11-24T00:00:00.000Z', new Date('2026-11-25T04:00:00.000Z')), true);

const range = rawQueryRangeForOperational(new Date('2026-10-05T04:00:00.000Z'), new Date('2026-10-06T04:00:00.000Z'));
assert.equal(range.from.toISOString(), '2026-10-05T02:00:00.000Z');
assert.equal(range.to.toISOString(), '2026-10-06T06:00:00.000Z');

const legacyCandidate = {
  id: 'legacy',
  resource: 'FUT5',
  startTime: fortaleza,
  endTime: new Date(fortaleza.getTime() + 60 * 60 * 1000),
  status: 'PENDING',
  timeConvention: 'LEGACY_FORTALEZA',
};
const newTarget = {
  resource: 'FUT5',
  startTime: cuiaba,
  endTime: new Date(cuiaba.getTime() + 60 * 60 * 1000),
  timeConvention: 'CUIABA' as const,
};
assert.equal(findOperationalConflict([legacyCandidate], newTarget)?.id, 'legacy');

const nonConflictTarget = {
  ...newTarget,
  startTime: new Date(cuiaba.getTime() + 60 * 60 * 1000),
  endTime: new Date(cuiaba.getTime() + 2 * 60 * 60 * 1000),
};
assert.equal(findOperationalConflict([legacyCandidate], nonConflictTarget), null);

console.log('time-zone tests: OK');
