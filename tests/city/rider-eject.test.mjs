// v216 — binekten fırlama (src/components/City/riderEject.js). Çalıştır:
// node --test tests/city/rider-eject.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riderKind, ejectCheck, EJECT_MIN, makeRagdoll, stepRagdoll, ragdollFrame, stepFallenBike } from '../../src/components/City/riderEject.js';

const moto = { moto: true, catalogId: 22 };
const bike = { moto: true, ride: 'bike', catalogId: 25 };
const horse = { moto: true, ride: 'horse', walker: true, catalogId: 26 };
const camel = { moto: true, ride: 'horse', walker: true, catalogId: 27 };
const car = { len: 4.4, halfW: 0.95 };
const up = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

test('binek türleri', () => {
  assert.equal(riderKind(moto), 'moto');
  assert.equal(riderKind(bike), 'bike');
  assert.equal(riderKind(horse), 'horse');
  assert.equal(riderKind(camel), 'camel');
  assert.equal(riderKind(car), null);
});

test('yavaş çarpma fırlatmaz, sert çarpma fırlatır; arabada hiç fırlama yok', () => {
  for (const v of [moto, bike, horse, camel]) {
    const k = riderKind(v);
    assert.equal(ejectCheck(v, EJECT_MIN[k] * 0.6), false, `${k} yavaş`);
    assert.equal(ejectCheck(v, EJECT_MIN[k] + 0.1), true, `${k} sert`);
  }
  assert.equal(ejectCheck(car, 40), false);
});

test('düz yerde fırlayan sürücü öne uçar, yere düşer, kayar ve durur', () => {
  const rd = makeRagdoll({ pelvis: [0, 1.0, 0], frame: up, vel: [0, 0, 14], kind: 'moto' });
  const world = { boxes: [] };
  let maxY = 0;
  let t = 0;
  while (!rd.rest && t < 12) {
    stepRagdoll(rd, 1 / 60, world);
    t += 1 / 60;
    maxY = Math.max(maxY, rd.ps[0].p[1]);
  }
  assert.ok(rd.rest, 'durdu');
  assert.ok(maxY > 1.3, `havaya kalktı ${maxY}`);
  const z = rd.ps[0].p[2];
  assert.ok(z > 6 && z < 40, `öne gitti ${z}`);
  // yerde yatıyor: baş ile kalça aşağı yukarı aynı yükseklikte
  const f = ragdollFrame(rd);
  assert.ok(Math.abs(f.y[1]) < 0.5, `yatık ${f.y[1]}`);
  for (const p of rd.ps) assert.ok(p.p[1] > 0.05 && p.p[1] < 0.6, 'yerin içine girmedi');
});

test('duvara çarpan sürücü duvardan geçmez, dibine düşer', () => {
  const rd = makeRagdoll({ pelvis: [0, 1.0, 0], frame: up, vel: [0, 0, 16], kind: 'moto' });
  const world = { boxes: [{ x: 0, z: 2, w: 10, d: 0.6, h: 3 }] };
  let peak = 0;
  for (let i = 0; i < 600; i++) peak = Math.max(peak, stepRagdoll(rd, 1 / 60, world));
  for (const p of rd.ps) assert.ok(p.p[2] < 1.7 + 0.01, `duvarın önünde ${p.p[2]}`);
  assert.ok(peak > 5, `sert temas ${peak}`);
  assert.ok(rd.ps[0].p[1] < 0.6, 'yere indi');
});

test('alçak bariyerin üstünden aşar', () => {
  const rd = makeRagdoll({ pelvis: [0, 1.0, 0], frame: up, vel: [0, 0, 15], kind: 'moto' });
  const world = { boxes: [{ x: 0, z: 1.6, w: 10, d: 0.5, h: 0.8 }] };
  for (let i = 0; i < 600; i++) stepRagdoll(rd, 1 / 60, world);
  assert.ok(rd.ps[0].p[2] > 2.5, `bariyerin arkasına düştü ${rd.ps[0].p[2]}`);
});

test('sürücüsüz motor yana yatar ve kayarak durur', () => {
  const c = { vx: 0, vz: 12, spin: 0, roll: 0, rollV: 0, fall: 1 };
  for (let i = 0; i < 300; i++) stepFallenBike(c, 1 / 60);
  assert.ok(Math.abs(c.roll) > 1.2, `yattı ${c.roll}`);
  assert.ok(Math.hypot(c.vx, c.vz) < 0.01, 'durdu');
});
