// v154 — motokurye noktaları şehir planıyla aynı yerde mi?
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOTS } from '../../src/components/City/cityLayout.js';
import { KURYE_LOTS, KURYE_DROPS, KURYE_PICKUPS } from '../../functions/cityJobsData.js';

test('kurye lotları cityLayout LOTS ile aynı', () => {
  // v219: aynı türden birden çok lot olabilir (müstakil evler) — kurye lotu onlardan biriyle aynı olmalı
  for (const [type, k] of Object.entries(KURYE_LOTS)) {
    const same = LOTS.filter((l) => l[0] === type).map(([, i0, j0, i1 = i0, j1 = j0, face = 's']) => [i0, j0, i1, j1, typeof face === 'string' ? face : 's']);
    assert.ok(same.length, type);
    assert.ok(same.some((l) => JSON.stringify(l) === JSON.stringify(k.slice(0, 5))), type);
  }
});

test('teslim noktaları yolda (lotların dışında), alma noktaları şehir içinde', () => {
  const inLot = (p) =>
    LOTS.some(([, i0, j0, i1 = i0, j1 = j0]) => p.x > -100 + 40 * i0 - 16 && p.x < -100 + 40 * i1 + 16 && p.z > -80 + 40 * j0 - 16 && p.z < -80 + 40 * j1 + 16);
  KURYE_DROPS.forEach((d) => assert.ok(!inLot(d), `${d.key} yolda olmalı (${d.x}, ${d.z})`));
  KURYE_PICKUPS.forEach((p) => assert.ok(Math.abs(p.x) < 200 && p.z > -150 && p.z < 104, p.key)); // v219: köfteci otogarın önünde (x ≈ 194)
});
