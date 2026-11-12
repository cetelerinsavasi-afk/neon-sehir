// v157 — tır / otobüs: yakın (şehir içi) ve uzak (O-77 → Kervankent) işler, ayrı günlük haklar, uzak kazanç
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createJobs, planJob } from '../jobs.js';
import { JOBS } from '../vehicleKinds.js';
import { DEPOTS, FAR_DEPOT, OTOGARS } from '../cityJobsData.js';

class HE extends Error {
  constructor(code, msg) {
    super(msg);
    this.code = code;
  }
}
function setup() {
  const db = new FakeFirestore();
  const clock = { t: Date.parse('2026-11-12T09:00:00Z') };
  const jobs = createJobs({ db, FieldValue, HttpsError: HE, splitIncomeForDebt: (d, a) => ({ goldDelta: a, debtDelta: 0 }), now: () => clock.t });
  return { db, clock, ops: jobs.ops };
}
const runOne = async (ops, clock, vid, range) => {
  const r = await ops.jobStart('u', { vehicleId: vid, range, x: 0, z: 0 });
  clock.t += r.run.par * 1000;
  return { r, d: await ops.jobDone('u', { vehicleId: vid, runId: r.run.id, t: r.run.par, hits: 0 }) };
};

test('v157: tek şehir deposu kaldı (limana yakın olan kalktı), uzak depo Kervankent', () => {
  assert.equal(DEPOTS.length, 1);
  assert.equal(DEPOTS[0].key, 'dogu');
  assert.ok(FAR_DEPOT.x > 2000 && FAR_DEPOT.z < -2000);
  assert.equal(OTOGARS.length, 2);
});

test('v157: tır şehir içi günde 5, uzak günde 2 — sayaçlar ayrı', async () => {
  const { db, clock, ops } = setup();
  await db.doc('users/u').set({ gold: 0 });
  await db.doc('vehicles/t').set({ ownerId: 'u', catalogId: 11, lifeDays: 20 });
  for (let i = 0; i < 5; i++) await runOne(ops, clock, 't', 'near');
  await assert.rejects(ops.jobStart('u', { vehicleId: 't', range: 'near' }), /job-limit/);
  const f1 = await runOne(ops, clock, 't', 'far');
  assert.equal(f1.r.run.far, true);
  assert.equal(f1.r.run.task.far, true);
  assert.equal(f1.d.left, 1);
  await runOne(ops, clock, 't', 'far');
  await assert.rejects(ops.jobStart('u', { vehicleId: 't', range: 'far' }), /job-limit/);
  const u = (await db.doc('users/u').get()).data();
  assert.equal(u.jobs.n.tir, 5);
  assert.equal(u.jobs.n.tir_uzak, 2);
});

test('v157: uzak tır ortalama ~3 kat, uzak otobüs ~1,5 kat kazandırır; uzak iş kısa sürede bitmez', async () => {
  const { db, clock, ops } = setup();
  await db.doc('users/u').set({ gold: 0 });
  await db.doc('vehicles/t').set({ ownerId: 'u', catalogId: 11, lifeDays: 20 });
  await db.doc('vehicles/b').set({ ownerId: 'u', catalogId: 12, lifeDays: 20 });
  const r = await ops.jobStart('u', { vehicleId: 't', range: 'far' });
  await assert.rejects(ops.jobDone('u', { vehicleId: 't', runId: r.run.id, t: 30, hits: 0 }), /too-fast/);
  // ortalamalar (çok sayıda plan): kazanç = avg × mul × performans
  let tir = 0;
  for (let i = 0; i < 400; i++) tir += planJob('tir', null, true).mul;
  assert.ok(Math.abs(tir / 400 - JOBS.tir.farMul) < 0.35, `tır çarpanı ${tir / 400}`);
  assert.equal(planJob('otobus', { x: 0, z: 0 }, true).mul, JOBS.otobus.farMul);
  // otobüs: günde 1 şehir içi + 1 uzun yol
  await runOne(ops, clock, 'b', 'near');
  await assert.rejects(ops.jobStart('u', { vehicleId: 'b', range: 'near' }), /job-limit/);
  const f = await runOne(ops, clock, 'b', 'far');
  assert.ok(f.d.total > 10000, `uzun yol kazancı ${f.d.total}`);
  await assert.rejects(ops.jobStart('u', { vehicleId: 'b', range: 'far' }), /job-limit/);
});

test('v157: uzak otobüs yakın otogardan kalkar; taksi gibi diğer işlerde uzak yok', () => {
  assert.equal(planJob('otobus', { x: 2100, z: -2300 }, true).task.from, 1);
  assert.equal(planJob('otobus', { x: 0, z: 0 }, true).task.from, 0);
  const t = planJob('taksi', { x: 0, z: 0 }, true);
  assert.notEqual(t.task.far, true);
});
