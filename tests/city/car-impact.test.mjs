// v193 — gerçekçi çarpma + havada süzülme (src/components/City/carImpact.js). Çalıştır:
// node --test tests/city/car-impact.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyImpact, findContact, impactParams, yawInertia, spring, airPitch } from '../../src/components/City/carImpact.js';

const car = { len: 4.4, halfW: 0.95 };
const I = yawInertia(car);

test('önden duvara: geri seker (esneklik kadar), dönmez', () => {
  const c = { x: 0, z: 0, vx: 0, vz: 20, spin: 0 };
  const r = applyImpact(c, { px: 0, pz: 2.2, nx: 0, nz: -1 }, { ...impactParams(car), I });
  assert.ok(Math.abs(r.vn - 20) < 1e-9);
  assert.ok(c.vz < 0 && c.vz > -7, `geri sekme ${c.vz}`); // 20 × 0,27 ≈ 5,4
  assert.ok(Math.abs(c.spin) < 1e-9);
});

test('köşeden çarpınca araba kendi etrafında döner', () => {
  const c = { x: 0, z: 0, vx: 0, vz: 15, spin: 0 };
  applyImpact(c, { px: 0.9, pz: 2.2, nx: 0, nz: -1 }, { ...impactParams(car), I });
  assert.ok(Math.abs(c.spin) > 1, `dönüş ${c.spin}`);
});

test('duvara sürtünerek: kayar, hız biraz düşer, durmaz', () => {
  const c = { x: 0, z: 0, vx: 1.5, vz: 18, spin: 0 }; // duvara (x = +) hafifçe sürtüyor
  applyImpact(c, { px: 0.95, pz: 0, nx: -1, nz: 0 }, { ...impactParams(car), I });
  assert.ok(c.vz > 14, `kayarak devam: ${c.vz}`);
  assert.ok(c.vx <= 0, 'duvardan uzaklaşıyor');
});

test('ağır araç (tır) daha az seker', () => {
  const a = { x: 0, z: 0, vx: 0, vz: 20, spin: 0 };
  const b = { x: 0, z: 0, vx: 0, vz: 20, spin: 0 };
  const tir = { len: 12, halfW: 1.25 };
  applyImpact(a, { px: 0, pz: 2, nx: 0, nz: -1 }, { ...impactParams(car), I });
  applyImpact(b, { px: 0, pz: 6, nx: 0, nz: -1 }, { ...impactParams(tir), I: yawInertia(tir) });
  assert.ok(Math.abs(b.vz) < Math.abs(a.vz));
});

test('ayrılan araca itki uygulanmaz', () => {
  const c = { x: 0, z: 0, vx: 0, vz: -5, spin: 0 };
  assert.equal(applyImpact(c, { px: 0, pz: 2, nx: 0, nz: -1 }).vn, 0);
  assert.equal(c.vz, -5);
});

test('temas normali engelden araca doğru', () => {
  const circ = (x, z) => z + 0.8 > 2.5; // yarıçap 0,8'lik daire duvara (z > 2,5) değiyor mu
  const pt = (x, z) => z > 2.5;
  const k = findContact([[0, 2.3], [0, 0], [0, -2.3]], 0.8, circ, pt);
  assert.ok(k && k.nz < -0.9, JSON.stringify(k));
});

test('süspansiyon yay: çöker, sallanır, söner', () => {
  const s = { x: 0, v: -1.2 };
  let min = 0;
  for (let i = 0; i < 30; i++) {
    spring(s, 140, 9, 1 / 30);
    min = Math.min(min, s.x);
  }
  assert.ok(min < -0.05, 'çöktü');
  assert.ok(Math.abs(s.x) < 0.01 && Math.abs(s.v) < 0.1, `durdu ${s.x}`);
});

test('havada: burun yörüngeyi izler (çıkarken yukarı, inerken aşağı)', () => {
  const a = { gp: 0.3, gpV: 0 };
  let vy = 6;
  const seen = [];
  for (let i = 0; i < 60; i++) {
    vy -= 22 / 30;
    airPitch(a, vy, 20, 0, 1 / 30);
    seen.push(a.gp);
  }
  assert.ok(seen[5] > 0, 'yükselirken burun yukarı');
  assert.ok(seen[59] < -0.3, `inerken burun aşağı: ${seen[59]}`);
  const b = { gp: 0, gpV: 0 };
  for (let i = 0; i < 15; i++) airPitch(b, 0, 20, 1, 1 / 30); // gaz → burun aşağı
  assert.ok(b.gp < -0.05);
});
