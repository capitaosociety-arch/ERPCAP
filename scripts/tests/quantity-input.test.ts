import assert from 'node:assert';
import {
  formatQuantityInput,
  maxQuantityForExistingItem,
  parseQuantityInput,
  sanitizeQuantityDraft,
} from '../../lib/quantity-input';

assert.equal(parseQuantityInput('1'), 1);
assert.equal(parseQuantityInput('10'), 10);
assert.equal(parseQuantityInput('20'), 20);
assert.equal(parseQuantityInput('0'), null);
assert.equal(parseQuantityInput(''), null);
assert.equal(parseQuantityInput('-3'), null);
assert.equal(parseQuantityInput('1.5'), null);
assert.equal(parseQuantityInput('1,5', true), 1.5);
assert.equal(parseQuantityInput('2.25', true), 2.25);
assert.equal(parseQuantityInput('2.255', true), null);

assert.equal(formatQuantityInput(1), '1');
assert.equal(formatQuantityInput(2.5, true), '2,5');
assert.equal(sanitizeQuantityDraft('12a3', false), '123');
assert.equal(sanitizeQuantityDraft('2,50', true), '2.50');
assert.equal(sanitizeQuantityDraft('abc', false), '');

assert.equal(maxQuantityForExistingItem(1, 9), 10);
assert.equal(maxQuantityForExistingItem(10, 0), 10);
assert.equal(maxQuantityForExistingItem(0, 5), 5);

console.log('quantity-input tests: OK');
