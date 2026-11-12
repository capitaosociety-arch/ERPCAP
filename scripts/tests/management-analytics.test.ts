import assert from 'node:assert';
import {
  buildManagementAlerts,
  DEFAULT_MANAGEMENT_CRITERIA,
  type ManagementRow,
} from '../../lib/management-analytics';

const base: ManagementRow = {
  period: '2026-09',
  label: 'Setembro de 2026',
  status: 'CLOSED',
  version: 1,
  source: 'snapshot',
  available: true,
  revenue: 1000,
  cmv: 300,
  expenses: 100,
  grossProfit: 700,
  operatingResult: 600,
  netResult: 600,
  grossMargin: 70,
  netMargin: 60,
  occupancyPct: 10,
  occupancyAvailable: true,
  rentalRevenue: 400,
  extraHours: 0,
  extraRevenue: 0,
  extraReservations: 0,
  productRevenue: 300,
  totalCommercialRevenue: 700,
  productContribution: 150,
  productMarginPct: 50,
  negativeProductMargins: 0,
  reconDivergentProducts: null,
  reconUncostedQty: null,
  commercialSource: 'live',
  rulesVersion: 'LEGACY',
  methodologyNote: 'Metodologia histórica.',
  sources: ['FinancialPeriodClose', 'Rental'],
};

const rows: ManagementRow[] = [
  base,
  {
    ...base,
    period: '2026-10',
    label: 'Outubro de 2026',
    revenue: 850,
    expenses: 125,
    netResult: 500,
    netMargin: 55,
    occupancyPct: 15,
    negativeProductMargins: 2,
  },
];

const alerts = buildManagementAlerts(rows, DEFAULT_MANAGEMENT_CRITERIA);
const kinds = new Set(alerts.map(a => a.kind));
assert.equal(kinds.has('REVENUE_DROP'), true);
assert.equal(kinds.has('EXPENSE_RISE'), true);
assert.equal(kinds.has('MARGIN_DROP'), true);
assert.equal(kinds.has('LOW_OCCUPANCY'), true);
assert.equal(kinds.has('NEGATIVE_PRODUCT_MARGIN'), true);

const recon = {
  available: true,
  produtosComDivergencia: 2,
  quantidadeDivergente: 4,
  quantidadeSemCusto: 1,
  linhas: [],
  source: ['OrderItem', 'StockMovement'] as ['OrderItem', 'StockMovement'],
  note: 'teste',
};
const withRecon = buildManagementAlerts(rows, DEFAULT_MANAGEMENT_CRITERIA, recon);
assert.equal(withRecon.some(a => a.kind === 'INVENTORY_INCONSISTENCY'), true);

console.log('management-analytics tests: OK');
