import assert from 'node:assert';
import {
  buildRentalWindow,
  formatRentalDisplayTime,
  formatRentalPeriod,
  formatRentalTimeInput,
  parseRentalTime,
  RENTAL_TIME_ZONE,
} from '../../lib/rental-time';

assert.equal(RENTAL_TIME_ZONE, 'America/Fortaleza');
assert.deepEqual(parseRentalTime('00:00'), { hour: 0, minute: 0, minutesOfDay: 0 });
assert.deepEqual(parseRentalTime('23:59'), { hour: 23, minute: 59, minutesOfDay: 1439 });
assert.throws(() => parseRentalTime('24:00'));
assert.throws(() => parseRentalTime('9:00'));

const cases: Array<[string, string, string, string]> = [
  ['2026-10-05', '08:00', '09:00', '08:00 as 09:00'],
  ['2026-10-05', '16:00', '17:00', '16:00 as 17:00'],
  ['2026-10-05', '18:00', '19:00', '18:00 as 19:00'],
  ['2026-10-05', '20:00', '21:00', '20:00 as 21:00'],
  ['2026-10-05', '22:00', '23:00', '22:00 as 23:00'],
  ['2026-10-05', '23:00', '00:00', '05/10/2026 23:00 ate 06/10/2026 00:00'],
  ['2026-10-05', '23:00', '01:00', '05/10/2026 23:00 ate 06/10/2026 01:00'],
  ['2026-10-05', '23:30', '01:00', '05/10/2026 23:30 ate 06/10/2026 01:00'],
  ['2026-10-05', '00:00', '01:00', '00:00 as 01:00'],
];

for (const [date, start, end, expected] of cases) {
  const { startTime, endTime } = buildRentalWindow(date, start, end);
  const display = formatRentalPeriod(startTime, endTime);
  const expectedDisplay = expected.includes('/') ? expected : `${expected.split(' as ')[0]} as ${expected.split(' as ')[1]}`;
  if (!expected.includes('/')) {
    assert.equal(formatRentalTimeInput(startTime), start);
    assert.equal(formatRentalDisplayTime(endTime), end);
    assert.equal(display, `05/10/2026 das ${formatRentalTimeInput(startTime)} as ${formatRentalTimeInput(endTime)}`);
  } else {
    assert.equal(display, expectedDisplay);
  }
}

const late = buildRentalWindow('2026-10-05', '20:00', '21:00');
assert.equal(late.startTime.toISOString(), '2026-10-05T23:00:00.000Z');
assert.equal(late.endTime.toISOString(), '2026-10-06T00:00:00.000Z');
assert.equal(formatRentalTimeInput(new Date('2026-10-05T23:00:00.000Z')), '20:00');

const crossing = buildRentalWindow('2026-10-05', '23:00', '01:00');
assert.equal(crossing.startTime.toISOString(), '2026-10-06T02:00:00.000Z');
assert.equal(crossing.endTime.toISOString(), '2026-10-06T04:00:00.000Z');

const crossingLate = buildRentalWindow('2026-10-05', '23:30', '01:00');
assert.equal(crossingLate.startTime.toISOString(), '2026-10-06T02:30:00.000Z');
assert.equal(crossingLate.endTime.toISOString(), '2026-10-06T04:00:00.000Z');

console.log('rental-time tests: OK');
