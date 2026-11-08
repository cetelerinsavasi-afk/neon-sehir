// v146 — futbolcu transfer vergisi (Kültür ve Spor Bakanlığı): alıcı öder, %1–%10, başlangıç %5
import test from 'node:test';
import assert from 'node:assert/strict';
import { RATE_BY_ID, DEFAULT_RATES, ministryOfCat, resolveRates, rateFrac, ratesOfMinistry } from '../belediyeRates.js';
import { STATE_IN } from '../stateTreasury.js';
import { TAX_SOURCES, transferTax } from '../tax.js';

test('v146: transfer vergisi oranı — Kültür ve Spor, %5 başlangıç, %1–%10, 1’er adım', () => {
  const r = RATE_BY_ID.transfer;
  assert.ok(r);
  assert.equal(r.m, 'kultur');
  assert.equal(r.unit, '%');
  assert.equal(r.def, 5);
  assert.equal(DEFAULT_RATES.transfer, 5);
  assert.equal(r.step, 1);
  assert.equal(r.min({}), 1);
  assert.equal(r.max({}), 10);
  assert.ok(ratesOfMinistry('kultur').includes('transfer'));
});

test('v146: eski oran belgesinde transfer yoksa varsayılan %5 gelir', () => {
  const rates = resolveRates({ current: { futbolcu: 12 } }, '2026-11-08');
  assert.equal(rates.transfer, 5);
  assert.equal(rateFrac(rates, 'transfer'), 0.05);
});

test('v146: alıcı fiyatın üstüne öder (100.000 · %10 → 10.000 vergi)', () => {
  assert.equal(transferTax(100000, { ...DEFAULT_RATES, transfer: 10 }), 10000);
  assert.equal(transferTax(100000, { ...DEFAULT_RATES, transfer: 1 }), 1000);
  assert.equal(transferTax(0, DEFAULT_RATES), 0);
  assert.equal(transferTax(12345, DEFAULT_RATES), Math.round(12345 * 0.05));
});

test('v146: defter kalemi vergi_transfer → Kültür ve Spor; etiketler var', () => {
  assert.equal(ministryOfCat('in', 'vergi_transfer'), 'kultur');
  assert.ok(STATE_IN.vergi_transfer);
  assert.ok(TAX_SOURCES.transfer);
});
