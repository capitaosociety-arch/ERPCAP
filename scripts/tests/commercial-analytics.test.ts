import assert from 'node:assert';
import {
  buildInventoryReconciliation,
  buildOccupancy,
  buildProductContribution,
  buildRegularOccupancy,
  buildRevenueMix,
  getOccupancyConfig,
} from '../../lib/commercial-analytics';
import type { MovementInput, OrderInput, RentalInput } from '../../lib/commercial-analytics';
import { DEFAULT_RENTAL_SCHEDULE, DEFAULT_SCHEDULE_NOTE } from '../../lib/rental-schedule';
import { isRentalItem } from '../../lib/analytics';

assert.equal(isRentalItem({ serviceId: 's1', service: { name: 'Locacao de Espaco' } }), true);
assert.equal(isRentalItem({ serviceId: 's2', service: { name: 'Manutencao Padrao' } }), false);

const from = new Date('2026-10-01T00:00:00-04:00');
const to = new Date('2026-10-02T23:59:59-04:00');
const config = { openHour: 8, closeHour: 10, source: 'env' as const, note: 'teste' };

const rentals: RentalInput[] = [
  { resource: 'FUT5', startTime: new Date('2026-10-01T08:00:00-04:00'), endTime: new Date('2026-10-01T09:00:00-04:00'), totalAmount: 100, status: 'PAID' },
  { resource: 'FUT5', startTime: new Date('2026-10-02T09:00:00-04:00'), endTime: new Date('2026-10-02T10:00:00-04:00'), totalAmount: 80, status: 'CONFIRMED' },
  { resource: 'FUT7', startTime: new Date('2026-10-01T08:00:00-04:00'), endTime: new Date('2026-10-01T10:00:00-04:00'), totalAmount: 200, status: 'PAID' },
  { resource: 'FUT7', startTime: new Date('2026-10-02T08:00:00-04:00'), endTime: new Date('2026-10-02T09:00:00-04:00'), totalAmount: 90, status: 'NO_SHOW' },
];

const occupancy = buildOccupancy(rentals, from, to, config);
assert.equal(occupancy.available, true);
assert.equal(occupancy.overall.capacidadeHoras, 8);
assert.equal(occupancy.overall.efetivoHoras, 4);
assert.equal(occupancy.overall.ocupacaoEfetivaPct, 50);
assert.equal(occupancy.overall.receitaRealizada, 300);
assert.equal(occupancy.overall.noShowHoras, 1);
assert.equal(occupancy.fields.find(f => f.campo === 'FUT5')?.reservas, 2);
assert.equal(occupancy.fields.find(f => f.campo === 'FUT7')?.reservas, 2);
assert.ok(Array.isArray(occupancy.opportunities));

const orders: OrderInput[] = [{
  id: 'o1', total: 350, discount: 15, closedAt: new Date('2026-11-01T20:00:00-04:00'),
  items: [
    { id: 'i1', productId: 'a', serviceId: null, quantity: 1, unitPrice: 100, subtotal: 100, status: 'ACTIVE', product: { name: 'Cerveja A', price: 100, cost: 999, category: { name: 'Bebidas' } }, service: null },
    { id: 'i2', productId: 'b', serviceId: null, quantity: 1, unitPrice: 50, subtotal: 50, status: 'ACTIVE', product: { name: 'Cerveja B', price: 50, cost: 999, category: { name: 'Bebidas' } }, service: null },
    { id: 'i3', productId: 'r', serviceId: null, quantity: 1, unitPrice: 200, subtotal: 200, status: 'ACTIVE', product: { name: 'FUT5 - hora avulsa', price: 200, cost: 0, isService: true, stockControlled: false, category: { name: 'Geral' } }, service: null },
  ],
}];

const movements: MovementInput[] = [
  { productId: 'a', quantity: 1, unitCost: 40, type: 'OUT_SALE', movementKind: null, date: new Date('2026-11-01T20:00:00-04:00'), product: { name: 'Cerveja A', price: 100, cost: 999, category: { name: 'Bebidas' } } },
  { productId: 'b', quantity: 1, unitCost: 30, type: 'OUT_SALE', movementKind: null, date: new Date('2026-11-01T20:00:00-04:00'), product: { name: 'Cerveja B', price: 25, cost: 999, category: { name: 'Bebidas' } } },
  { productId: 'r', quantity: 1, unitCost: 0, type: 'OUT_SALE', movementKind: null, date: new Date('2026-11-01T20:00:00-04:00'), product: { name: 'FUT5 - hora avulsa', price: 200, cost: 0, isService: true, stockControlled: false, category: { name: 'Geral' } } },
];

const products = buildProductContribution(orders, movements);
assert.equal(products.available, true);
assert.equal(products.produtoReceitaLiquida, 143.57);
assert.equal(products.cmvTotal, 70);
assert.equal(products.margemContribuicaoTotal, 73.57);
assert.equal(products.custoIncompleto, false);
assert.equal(products.produtos.find(p => p.produto === 'FUT5 - hora avulsa'), undefined);
assert.equal(products.produtos.length, 2);

const mix = buildRevenueMix(orders, rentals);
assert.equal(mix.aluguelComandas, 191.43);
assert.equal(mix.produtosComandas, 143.57);
assert.equal(mix.totalComandas, 335);
assert.equal(mix.agendaAluguel.pago, 300);
assert.equal(mix.agendaAluguel.noShow, 90);
assert.equal(mix.agendaAluguel.total, 470);

const reconOrders: OrderInput[] = [{
  ...orders[0],
  items: [
    orders[0].items[0],
    { ...orders[0].items[1], quantity: 2, subtotal: 50 },
    orders[0].items[2],
  ],
}];
const reconMovements: MovementInput[] = [
  movements[0],
  movements[1],
  movements[2],
];
const recon = buildInventoryReconciliation(reconOrders, reconMovements);
assert.equal(recon.available, true);
assert.equal(recon.linhas.find(r => r.produto === 'FUT5 - hora avulsa'), undefined);
const b = recon.linhas.find(r => r.produto === 'Cerveja B');
assert.equal(b?.quantidadeComandas, 2);
assert.equal(b?.quantidadeSaidas, 1);
assert.equal(b?.diferenca, 1);
assert.equal(b?.status, 'DIVERGENTE');

const defaultConfig = getOccupancyConfig({} as NodeJS.ProcessEnv);
assert.equal(defaultConfig.source, 'default');
assert.ok(defaultConfig.closeHour > defaultConfig.openHour);

const regularOccupancy = buildRegularOccupancy([
  { resource: 'FUT5', startTime: new Date('2026-10-05T18:00:00-04:00'), endTime: new Date('2026-10-05T19:00:00-04:00'), totalAmount: 100, status: 'PAID' },
  { resource: 'FUT5', startTime: new Date('2026-10-05T17:00:00-04:00'), endTime: new Date('2026-10-05T18:00:00-04:00'), totalAmount: 80, status: 'PAID' },
  { resource: 'FUT7', startTime: new Date('2026-10-05T22:00:00-04:00'), endTime: new Date('2026-10-06T00:00:00-04:00'), totalAmount: 150, status: 'PAID' },
], new Date('2026-10-05T00:00:00-04:00'), new Date('2026-10-06T23:59:59-04:00'), {
  entries: DEFAULT_RENTAL_SCHEDULE,
  source: 'default',
  configured: false,
  note: DEFAULT_SCHEDULE_NOTE,
});
assert.equal(regularOccupancy.available, true);
assert.equal(regularOccupancy.overall.capacidadeHoras, 20);
assert.equal(regularOccupancy.overall.efetivoHoras, 2);
assert.equal(regularOccupancy.overall.extraHoras, 2);
assert.equal(regularOccupancy.overall.extraReceita, 155);
assert.equal(regularOccupancy.overall.extraReservas, 2);
assert.equal(regularOccupancy.overall.ocupacaoEfetivaPct, 10);
assert.equal(regularOccupancy.fields.find(f => f.campo === 'FUT7')?.porDia.length, 2);
assert.equal(regularOccupancy.fields.find(f => f.campo === 'FUT5')?.extraHoras, 1);

console.log('commercial-analytics tests: OK');
