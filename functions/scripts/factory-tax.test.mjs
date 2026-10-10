// v87 — kademeli fabrika vergisi
import test from 'node:test';
import assert from 'node:assert/strict';
import { factoryTax, factoryTaxRate } from '../tax.js';

test('dilimler: %1 / %10 / %20 / %40 (oran o günün brüt gelirinin tamamına)', () => {
  assert.equal(factoryTaxRate(0), 0.01);
  assert.equal(factoryTax(50_000), 500);
  assert.equal(factoryTax(99_999), 1_000);
  assert.equal(factoryTaxRate(100_000), 0.1);
  assert.equal(factoryTax(500_000), 50_000);
  assert.equal(factoryTaxRate(1_000_000), 0.2);
  assert.equal(factoryTax(5_000_000), 1_000_000);
  assert.equal(factoryTaxRate(10_000_000), 0.4);
  assert.equal(factoryTax(20_000_000), 8_000_000);
  assert.equal(factoryTax(-5), 0);
});
