// v154 — motokurye noktaları şehir planıyla aynı yerde mi?
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOTS } from '../../src/components/City/cityLayout.js';
import { KURYE_LOTS, KURYE_DROPS, KURYE_PICKUPS } from '../../functions/cityJobsData.js';

test('kurye lotları cityLayout LOTS ile aynı', () => {
  for (const [type, i0, j0, i1 = i0, j1 = j0, face = 's'] of LOTS) {
    if (!KURYE_LOTS[type]) continue;
    assert.deepEqual(KURYE_LOTS[type].slice(0, 5), [i0, j0, i1, j1, face], type);
  }
  // plaza dolgu hücresi (2,4)
  assert.deepEqual(KURYE_LOTS.plaza.slice(0, 5), [2, 4, 2, 4, 's']);
});

test('teslim noktaları yolda (lotların dışında), alma noktaları şehir içinde', () => {
  const inLot = (p) =>
    LOTS.some(([, i0, j0, i1 = i0, j1 = j0]) => p.x > -100 + 40 * i0 - 16 && p.x < -100 + 40 * i1 + 16 && p.z > -80 + 40 * j0 - 16 && p.z < -80 + 40 * j1 + 16);
  KURYE_DROPS.forEach((d) => assert.ok(!inLot(d), `${d.key} yolda olmalı (${d.x}, ${d.z})`));
  KURYE_PICKUPS.forEach((p) => assert.ok(Math.abs(p.x) < 170 && p.z > -150 && p.z < 104, p.key));
});
