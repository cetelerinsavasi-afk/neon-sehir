// v160.5 — yol tarifi (iğne): dış dünyada gerçek en kısa yol
// Çalıştır: node --test tests/city/nav-route.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navRoute, worldRoute } from '../../src/components/City/cityJobs.js';
import { geo } from '../../src/components/City/world/roadsideGeo.js';
import { fromTown } from '../../src/components/City/world/route.js';

const len = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);
const pad = (k) => geo().pads.find((p) => p.key === k);

test('Gölyaka → Kuğu Gölü terası Kervankent üstünden dolaşmaz', () => {
  const a = { x: pad('golyaka').mx, z: pad('golyaka').mz };
  const b = { x: pad('gol_seyir').mx, z: pad('gol_seyir').mz };
  const r = navRoute(a, b);
  assert.ok(len(r) < 1500, `rota ${Math.round(len(r))} m`);
  assert.deepEqual(r.at(-1), b);
});

test('şehir → Kervankent eskisi kadar kısa', () => {
  const a = { x: 0, z: 0 };
  const b = fromTown(0, 10);
  assert.ok(len(navRoute(a, b)) <= len(worldRoute(a, b, Infinity)) + 50);
});

test('rotada yolsuz uzun düz atlama yok', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 150; i++) {
    const r = () => ({ x: -100 + rnd() * 2300, z: 150 - rnd() * 2450 });
    const p = navRoute(r(), r());
    for (let k = 2; k < p.length - 2; k++) assert.ok(Math.hypot(p[k].x - p[k - 1].x, p[k].z - p[k - 1].z) < 100); // (Kervankent caddeleri düz ve uzun)
  }
});
