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

test('şehir ızgarası (blocked): bina duvarından geçmez', () => {
  const rd = makeRagdoll({ pelvis: [0, 1.0, 0], frame: up, vel: [0, 0, 14], kind: 'moto' });
  const world = { blocked: (x, z, r) => z + r > 2, groundY: () => 0 };
  for (let i = 0; i < 600; i++) stepRagdoll(rd, 1 / 60, world);
  for (const p of rd.ps) assert.ok(p.p[2] + p.r <= 2.05, `binanın dışında ${p.p[2]}`);
  assert.ok(rd.rest, 'durdu');
});

test('eşikler: 25 km/sa motor çarpması fırlatmaz, 45 fırlatır', () => {
  assert.equal(ejectCheck(moto, 25 / 3.6), false);
  assert.equal(ejectCheck(moto, 45 / 3.6), true);
  assert.equal(ejectCheck(bike, 25 / 3.6), false);
});

test('v216.1: basamak / kaldırım / köprü altı gövdeyi tekrar fırlatmaz', () => {
  const worlds = {
    basamak: (x, z) => Math.floor(Math.max(0, z - 4) / 1.2) * 0.17,
    kaldirim: (x, z) => (z > 6 ? 0.18 : 0),
    kopruAlti: (x, z, y) => (z > 6 && z < 30 && y > 3 ? 4 : 0), // üstte köprü: oraya ışınlanmamalı
    bosluk: (x, z) => (z > 6 && z < 8 ? NaN : 0),
  };
  for (const [n, groundY] of Object.entries(worlds)) {
    const rd = makeRagdoll({ pelvis: [0, 1.0, 0], frame: up, vel: [0, 0, 13], kind: 'moto', seed: 2 });
    let landed = false;
    let maxUp = 0;
    for (let i = 0; i < 600 && !rd.rest; i++) {
      stepRagdoll(rd, 1 / 60, { groundY });
      if (rd.ground) landed = true;
      if (landed) maxUp = Math.max(maxUp, ...rd.ps.map((p) => p.v[1]));
    }
    assert.ok(rd.rest, `${n}: durdu`);
    assert.ok(maxUp < 3.2, `${n}: yere değdikten sonra yukarı fırlamadı (${maxUp.toFixed(1)} m/sn)`);
    assert.ok(rd.ps[0].p[1] < 2, `${n}: köprüye ışınlanmadı`);
  }
});

test('v216.2: pürüzlü zeminde de kısa sürede durur ve donar (titreme yok)', () => {
  let s = 7;
  const noise = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 0.03; // ±1,5 cm
  const world = { groundY: () => noise() };
  const rd = makeRagdoll({ pelvis: [0, 1.0, 0], frame: up, vel: [0, 0, 12], kind: 'moto', seed: 4 });
  let t = 0;
  let firstGround = null;
  while (!rd.rest && t < 10) {
    stepRagdoll(rd, 1 / 60, world);
    t += 1 / 60;
    if (rd.ground && firstGround == null) firstGround = t;
  }
  assert.ok(rd.rest, 'durdu');
  assert.ok(t - firstGround <= 3.6, `yere değdikten ${(t - firstGround).toFixed(1)} sn sonra durdu`);
  const before = JSON.stringify(rd.ps.map((p) => p.p));
  stepRagdoll(rd, 0.5, world);
  assert.equal(JSON.stringify(rd.ps.map((p) => p.p)), before, 'durduktan sonra hiç kıpırdamaz');
});

test('v216.3: fırlama başlangıcı (fj) kısa, geri çözülür; iki cihazda birebir aynı uçuş', async () => {
  const { encodeFj, decodeFj, launchFj } = await import('../../src/components/City/riderEject.js');
  const L0 = { x: -1234.5678, y: 1.0371, z: 2345.6789, vx: -12.3456, vz: 18.9876, yaw: -2.71828, kind: 'camel', seed: 51234 };
  const s = encodeFj(L0);
  assert.ok(s.length <= 80, `kısa: ${s.length}`);
  const L = decodeFj(s);
  assert.equal(L.kind, 'camel');
  assert.ok(Math.abs(L.x - L0.x) < 0.01 && Math.abs(L.vz - L0.vz) < 0.01);
  // gönderen ve izleyen aynı fj'den başlar → aynı sonuç
  const world = { groundY: (x, z) => (z > 2350 ? 0.17 : 0) };
  const a = launchFj(decodeFj(s));
  const b = launchFj(decodeFj(s));
  for (let i = 0; i < 400; i++) {
    stepRagdoll(a, 1 / 60, world);
    stepRagdoll(b, 1 / 60, world);
  }
  assert.deepEqual(a.ps.map((p) => p.p), b.ps.map((p) => p.p));
  // bozuk / kötü niyetli değerler reddedilir
  for (const bad of ['', '1,2,3', 'a,b,c,d,e,f,m,1', '1,1,1,999,0,0,m,1', 'x'.repeat(90)]) assert.equal(decodeFj(bad), null, bad);
});
