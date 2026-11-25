import assert from 'node:assert';
import {
  adjustComandaProductQuantity,
  comandaCustomerLink,
  comandaProductQuantity,
  normalizeComandaIdentifier,
  resetComandaProductQuantity,
  setComandaProductQuantity,
  uppercaseComandaIdentifier,
} from '../../lib/comanda-input';

let quantities = {};
assert.equal(comandaProductQuantity(quantities, 'fut5'), 1);
assert.equal(comandaProductQuantity(quantities, 'fut7'), 1);

quantities = adjustComandaProductQuantity(quantities, 'fut7', 1, 0.5, 0.5);
assert.equal(comandaProductQuantity(quantities, 'fut7'), 1.5);
assert.equal(comandaProductQuantity(quantities, 'fut5'), 1);

quantities = adjustComandaProductQuantity(quantities, 'fut5', 2, 0.5, 0.5);
assert.equal(comandaProductQuantity(quantities, 'fut7'), 1.5);
assert.equal(comandaProductQuantity(quantities, 'fut5'), 2);

quantities = adjustComandaProductQuantity(quantities, 'fut7', -1, 0.5, 0.5);
assert.equal(comandaProductQuantity(quantities, 'fut7'), 1);
assert.equal(comandaProductQuantity(quantities, 'fut5'), 2);

quantities = setComandaProductQuantity(quantities, 'fut5', 0.5);
assert.equal(comandaProductQuantity(quantities, 'fut5'), 0.5);

quantities = adjustComandaProductQuantity(quantities, 'fut5', -1, 0.5, 0.5);
assert.equal(comandaProductQuantity(quantities, 'fut5'), 0.5);

quantities = resetComandaProductQuantity(quantities, 'fut7');
assert.equal(comandaProductQuantity(quantities, 'fut7'), 1);
assert.equal(comandaProductQuantity(quantities, 'fut5'), 0.5);

assert.equal(uppercaseComandaIdentifier('Henrique Maldonado'), 'HENRIQUE MALDONADO');
assert.equal(normalizeComandaIdentifier('  Mesa externa 04  '), 'MESA EXTERNA 04');
assert.equal(normalizeComandaIdentifier('João da Silva'), 'JOÃO DA SILVA');
assert.equal(normalizeComandaIdentifier(''), '');
assert.equal(normalizeComandaIdentifier('   '), '');

const linked = comandaCustomerLink('customer-id', 'João da Silva');
assert.equal(linked.linked, true);
assert.equal(linked.label, 'Cliente vinculado: João da Silva');

const unlinked = comandaCustomerLink(null, 'João da Silva');
assert.equal(unlinked.linked, false);
assert.equal(unlinked.label, 'Sem cliente vinculado');

const unlinkedWithoutName = comandaCustomerLink('customer-id', '');
assert.equal(unlinkedWithoutName.linked, false);
assert.equal(unlinkedWithoutName.label, 'Sem cliente vinculado');

console.log('comanda-input tests: OK');
