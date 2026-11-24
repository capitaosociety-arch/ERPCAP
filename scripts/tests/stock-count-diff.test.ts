import assert from 'node:assert';
import {
  calculateStockCountDifference,
  formatStockQuantity,
  stockCountDifferenceTone,
} from '../../lib/stock-count-diff';

assert.equal(calculateStockCountDifference(10, 10), 0);
assert.equal(stockCountDifferenceTone(0), 'equal');

assert.equal(calculateStockCountDifference(8, 10), -2);
assert.equal(stockCountDifferenceTone(-2), 'below');

assert.equal(calculateStockCountDifference(12, 10), 2);
assert.equal(stockCountDifferenceTone(2), 'above');

assert.equal(calculateStockCountDifference(0, 0), 0);
assert.equal(calculateStockCountDifference(2.5, 2), 0.5);
assert.equal(stockCountDifferenceTone(0.5), 'above');
assert.equal(formatStockQuantity(2.5), '2,5');
assert.equal(formatStockQuantity(1.25), '1,25');
assert.equal(formatStockQuantity(1000), '1.000');
assert.equal(formatStockQuantity(0), '0');

assert.equal(calculateStockCountDifference(null, 10), null);
assert.equal(calculateStockCountDifference(10, null), null);
assert.equal(calculateStockCountDifference(undefined, undefined), null);
assert.equal(stockCountDifferenceTone(null), 'unknown');
assert.equal(formatStockQuantity(null), '—');

console.log('stock-count-diff tests: OK');
