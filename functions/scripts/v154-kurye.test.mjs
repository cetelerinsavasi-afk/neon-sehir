// v154 — motokurye: her motorla; 6 satıcıdan al → mekâna götür; mesafe × performans; günde 10
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createJobs, planJob } from '../jobs.js';
import { JOBS, jobPerf, jobReward } from '../vehicleKinds.js';
import { KURYE_PICKUPS, KURYE_DROPS, KURYE_MIN_LEN, manhattan, kuryeMul } from '../cityJobsData.js';

class HE extends Error {
  constructor(code, msg) {
    super(msg);
    this.code = code;
  }
}
function setup() {
  const db = new FakeFirestore();
  const clock = { t: Date.parse('2026-11-10T09:00:00Z') };
  const jobs = createJobs({ db, FieldValue, HttpsError: HE, splitIncomeForDebt: (d, a) => ({ goldDelta: a, debtDelta: 0 }), now: () => clock.t });
  return { db, clock, ops: jobs.ops };
}

test('kurye: 6 satıcı, teslim en az 70 m uzakta, ücret çarpanı mesafeyle artar', () => {
  assert.equal(KURYE_PICKUPS.length, 6);
  for (let k = 0; k < 200; k++) {
    const p = planJob('kurye', { x: 0, z: 0 });
    const a = KURYE_PICKUPS[p.task.from];
    const b = KURYE_DROPS[p.task.to];
    assert.ok(a && b);
    assert.ok(manhattan(a, b) >= KURYE_MIN_LEN);
    assert.equal(p.mul, kuryeMul(manhattan(a, b)));
  }
  assert.ok(kuryeMul(400) > kuryeMul(100));
});

test('kurye: ortalama kazanç ≈ 500 (normal sürüşte)', () => {
  let s = 0;
  const N = 3000;
  for (let k = 0; k < N; k++) {
    const p = planJob('kurye', null);
    s += jobReward(JOBS.kurye.avg, p.mul, jobPerf(p.par, p.par, 0));
  }
  const avg = s / N;
  assert.ok(avg > 420 && avg < 580, `ortalama ${avg}`);
});

test('kurye: her motorla başlar, çarpma ve gecikme kazancı düşürür, günde 10', async () => {
  const { db, clock, ops } = setup();
  await db.doc('users/u').set({ gold: 0 });
  await db.doc('vehicles/m').set({ ownerId: 'u', catalogId: 21, lifeDays: 20 });
  await db.doc('vehicles/m2').set({ ownerId: 'u', catalogId: 24, lifeDays: 20 });
  const totals = [];
  for (let i = 0; i < 10; i++) {
    const vid = i % 2 ? 'm' : 'm2';
    const r = await ops.jobStart('u', { vehicleId: vid });
    assert.equal(r.run.job, 'kurye');
    assert.equal(r.daily, 10);
    clock.t += r.run.par * 2 * 1000;
    const good = i < 5;
    const d = await ops.jobDone('u', { vehicleId: vid, runId: r.run.id, t: good ? r.run.par : r.run.par * 2, hits: good ? 0 : 4 });
    totals.push({ good, k: d.total / r.run.len });
  }
  await assert.rejects(ops.jobStart('u', { vehicleId: 'm' }), /job-limit/);
  const avgK = (g) => totals.filter((x) => x.good === g).reduce((a, x) => a + x.k, 0) / 5;
  assert.ok(avgK(true) > avgK(false) * 1.4, 'geç + çarpışmalı teslimat belirgin daha az kazandırır');
});
