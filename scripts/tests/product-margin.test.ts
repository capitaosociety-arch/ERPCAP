import assert from 'node:assert';
import { calculateMarginPercent, formatMarginPercent } from '../../lib/product-margin';

assert.equal(calculateMarginPercent(100, 60), 40);
assert.equal(calculateMarginPercent(100, 30), 70);
assert.equal(calculateMarginPercent(80, 100), -25);
assert.equal(formatMarginPercent(calculateMarginPercent(100, 60)), '40,00%');
assert.equal(formatMarginPercent(calculateMarginPercent(80, 100)), '-25,00%');
assert.equal(Math.round(calculateMarginPercent(3, 1)! * 100) / 100, 66.67);
assert.equal(formatMarginPercent(calculateMarginPercent(3, 1)), '66,67%');
assert.equal(calculateMarginPercent(0, 10), null);
assert.equal(calculateMarginPercent(10, 0), null);
assert.equal(calculateMarginPercent(null, 10), null);
assert.equal(calculateMarginPercent(10, null), null);
assert.equal(calculateMarginPercent(undefined, undefined), null);
assert.equal(calculateMarginPercent(Number.NaN, 10), null);
assert.equal(calculateMarginPercent(-10, 5), null);
assert.equal(formatMarginPercent(null), '—');

console.log('product-margin tests: OK');
