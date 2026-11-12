import assert from 'node:assert';
import { buildForecast, simulateScenario, type ScenarioBase } from '../../lib/strategic-analytics';

const base: ScenarioBase = {
  period: '2026-10',
  label: 'Outubro de 2026',
  occupancyAvailable: true,
  occupancyPct: 10,
  effectiveHours: 10,
  rentalRevenue: 1000,
  rentalAgendaRevenue: 1100,
  extraRevenue: 0,
  extraHours: 0,
  extraReservations: 0,
  productRevenue: 1000,
  productCmv: 400,
  productContribution: 600,
  productMarginPct: 60,
  productDataComplete: true,
  occupancyConfigNote: 'premissa teste',
  source: ['Rental', 'OrderItem', 'StockMovement'],
};

const scenario = simulateScenario(base, {
  rentalPriceChangePct: 10,
  occupancyChangePp: 2,
  productPriceChangePct: 5,
  productCostChangePct: 0,
});
assert.equal(scenario.scenario.rentalRevenue, 1320);
assert.equal(scenario.scenario.productRevenue, 1050);
assert.equal(scenario.scenario.productCmv, 400);
assert.equal(scenario.scenario.productContribution, 650);
assert.equal(scenario.scenario.totalRevenue, 2370);
assert.equal(scenario.deltas.rentalRevenue, 320);
assert.equal(scenario.deltas.productContribution, 50);
assert.equal(scenario.rentalMarginAvailable, false);
assert.equal(scenario.isEstimate, true);

const history = Array.from({ length: 6 }, (_, i) => ({
  period: `2026-${String(i + 1).padStart(2, '0')}`,
  label: `Mês ${i + 1}`,
  revenue: 1000 + i * 100,
  cmv: 300,
  expenses: 100,
  netResult: 600 + i * 100,
  source: 'live',
  version: null,
  status: 'OPEN',
}));
const forecast = buildForecast(history, 'competence');
assert.equal(forecast.available, true);
assert.equal(forecast.historyMonths, 6);
assert.equal(forecast.horizons[3].length, 3);
assert.equal(forecast.horizons[6].length, 6);
assert.equal(forecast.horizons[12].length, 12);
assert.equal(forecast.horizons[3][0].revenue, 1600);
assert.equal(forecast.horizons[3][0].expenses, 100);
assert.equal(forecast.seasonalityApplied, false);
assert.ok(forecast.horizons[3][0].revenueLow <= forecast.horizons[3][0].revenue);
assert.ok(forecast.horizons[3][0].revenueHigh >= forecast.horizons[3][0].revenue);

console.log('strategic-analytics tests: OK');
