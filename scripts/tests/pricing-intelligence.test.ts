import assert from 'node:assert';
import { buildRegularOccupancy } from '../../lib/commercial-analytics';
import { buildPricingReport, simulatePricingScenario, type RentalPricingInput } from '../../lib/pricing-intelligence';
import { DEFAULT_RENTAL_SCHEDULE, DEFAULT_SCHEDULE_NOTE } from '../../lib/rental-schedule';

const from = new Date('2026-10-05T00:00:00-04:00');
const to = new Date('2026-10-05T23:59:59-04:00');
const schedule = {
  entries: DEFAULT_RENTAL_SCHEDULE,
  source: 'default' as const,
  configured: false,
  note: DEFAULT_SCHEDULE_NOTE,
};
const rentals: RentalPricingInput[] = [
  { id: 'r1', customerId: 'c1', customerName: 'Cliente A', resource: 'FUT5', startTime: new Date('2026-10-05T18:00:00-04:00'), endTime: new Date('2026-10-05T19:00:00-04:00'), totalAmount: 100, status: 'PAID' },
  { id: 'r2', customerId: 'c1', customerName: 'Cliente A', resource: 'FUT5', startTime: new Date('2026-10-05T15:00:00-04:00'), endTime: new Date('2026-10-05T16:00:00-04:00'), totalAmount: 80, status: 'PAID' },
  { id: 'r3', customerId: 'c2', customerName: 'Cliente B', resource: 'FUT7', startTime: new Date('2026-10-05T16:00:00-04:00'), endTime: new Date('2026-10-05T17:00:00-04:00'), totalAmount: 150, status: 'PAID' },
  { id: 'r4', customerId: 'c2', customerName: 'Cliente B', resource: 'FUT7', startTime: new Date('2026-10-05T17:00:00-04:00'), endTime: new Date('2026-10-05T18:00:00-04:00'), totalAmount: 150, status: 'CANCELED' },
];
const occupancy = buildRegularOccupancy(rentals, from, to, schedule);
const report = buildPricingReport(rentals, occupancy, schedule, '2026-10');
assert.equal(report.available, true);
assert.equal(report.regularHistory.bookings, 1);
assert.equal(report.regularHistory.revenue, 100);
assert.equal(report.extraHistory.bookings, 2);
assert.equal(report.candidates.length, 1);
assert.equal(report.candidates[0].name, 'Cliente A');
assert.equal(report.customers.find(c => c.customerId === 'c2')?.cancellations, 1);
assert.equal(report.opportunities.length > 0, true);

const grouped = simulatePricingScenario(report, {
  scenario: 'new_group_package',
  discountPct: 10,
  priceChangePct: 0,
  additionalBookings: 2,
  targetSegment: 'new_or_inactive',
  migrationRiskPct: 0,
});
assert.equal(grouped.available, true);
assert.equal(grouped.isProjection, true);
assert.equal(grouped.projection.additionalBookings, 2);
assert.ok((grouped.projection.additionalRevenue || 0) > 0);
assert.equal(grouped.projection.cannibalizationRisk, 'BAIXO');
assert.equal(grouped.projection.costsKnown, false);

const regularDiscount = simulatePricingScenario(report, {
  scenario: 'regular_idle_discount',
  discountPct: 10,
  priceChangePct: 0,
  additionalBookings: 1,
  targetSegment: 'regular_customers',
  migrationRiskPct: 20,
});
assert.equal(regularDiscount.available, true);
assert.ok((regularDiscount.projection.revenueAtRisk || 0) > 0);
assert.equal(regularDiscount.projection.cannibalizationRisk, 'ALTO');

console.log('pricing-intelligence tests: OK');
