// v154 — malzeme makineleri: 1,5 kat üretim, işçisiz 1/3, aynı türden her makine +1.000
import test from 'node:test';
import assert from 'node:assert/strict';
import { tieredMachinePrice, tieredFleetValue, MACHINE_PROD_RANGE, WORKERLESS_RANGE, prodRangeLabel } from '../factoryMachineRules.js';

test('v154 makine fiyatı kendi türüyle artar', () => {
  assert.equal(tieredMachinePrice('tamirMalzemesi', 0), 50000);
  assert.equal(tieredMachinePrice('tamirMalzemesi', 10), 60000, '10 tamir makinesi varken 11.');
  assert.equal(tieredMachinePrice('arabaGelistirme', 1), 51000, '1 araba gel. varken 2.');
  assert.equal(tieredMachinePrice('mining', 3), null, 'mining kendi kademesinde');
  assert.equal(tieredMachinePrice('silahUpgrade', -4), 50000);
});

test('v154 fabrika değeri = ödenen fiyatların toplamı', () => {
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += tieredMachinePrice('tamirMalzemesi', i);
  assert.equal(tieredFleetValue('tamirMalzemesi', 11), sum);
  assert.equal(tieredFleetValue('tamirMalzemesi', 0), 0);
});

test('v154 üretim 1,5 kat, işçisiz 1/3', () => {
  assert.deepEqual(MACHINE_PROD_RANGE, { tamirMalzemesi: [1, 3000], silahUpgrade: [1, 300], arabaGelistirme: [1, 60] });
  for (const t of Object.keys(MACHINE_PROD_RANGE)) assert.equal(WORKERLESS_RANGE[t][1], Math.round(MACHINE_PROD_RANGE[t][1] / 3));
  assert.equal(prodRangeLabel('tamirMalzemesi'), '1-3.000');
});
