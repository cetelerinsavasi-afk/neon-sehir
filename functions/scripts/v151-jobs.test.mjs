// v151 — meslekler (jobStart / jobDone / jobCancel) + ticari / motor modifiye kuralları
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createJobs } from '../jobs.js';
import { modDefaults, sanitizeMods, compactMods, modCost, modProfile } from '../vehicleMods.js';
import { itemListingBand, workshopJob } from '../itemRules.js';

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

test('meslek: işi sunucu seçer, en kısa süreden önce bitmez, kazanç ortalama civarında', async () => {
  const { db, clock, ops } = setup();
  await db.doc('users/u').set({ gold: 0 });
  await db.doc('vehicles/t').set({ ownerId: 'u', catalogId: 11, lifeDays: 20 });
  const r = await ops.jobStart('u', { vehicleId: 't', x: 0, z: 0 });
  assert.equal(r.run.job, 'tir');
  assert.ok(r.run.task.depot === 0 || r.run.task.depot === 1);
  await assert.rejects(ops.jobDone('u', { vehicleId: 't', runId: r.run.id, t: 1, hits: 0 }), /too-fast/);
  clock.t += r.run.par * 1000;
  const d = await ops.jobDone('u', { vehicleId: 't', runId: r.run.id, t: r.run.par, hits: 0 });
  assert.ok(d.total > 3000 && d.total < 7000, `kazanç ${d.total}`);
  assert.equal((await db.doc('users/u').get()).data().gold, d.total);
  assert.equal(d.left, 4); // v157: tır şehir içi günde 5
  // aynı iş ikinci kez ödenmez
  await assert.rejects(ops.jobDone('u', { vehicleId: 't', runId: r.run.id, t: r.run.par, hits: 0 }), /no-run/);
});

test('meslek: haklar OYUNCU bazlı (10 tır alan da günde 5 sevkiyat), ertesi gün yenilenir', async () => {
  const { db, clock, ops } = setup();
  await db.doc('users/u').set({ gold: 0 });
  await db.doc('vehicles/t1').set({ ownerId: 'u', catalogId: 11, lifeDays: 20 });
  await db.doc('vehicles/t2').set({ ownerId: 'u', catalogId: 11, lifeDays: 20 });
  await db.doc('vehicles/b').set({ ownerId: 'u', catalogId: 12, lifeDays: 20 });
  for (let i = 0; i < 5; i++) {
    const r = await ops.jobStart('u', { vehicleId: i % 2 ? 't1' : 't2' });
    clock.t += r.run.par * 1000;
    await ops.jobDone('u', { vehicleId: i % 2 ? 't1' : 't2', runId: r.run.id, t: r.run.par, hits: 1 });
  }
  await assert.rejects(ops.jobStart('u', { vehicleId: 't1' }), /job-limit/);
  await assert.rejects(ops.jobStart('u', { vehicleId: 't2' }), /job-limit/);
  // otobüs ayrı meslek: v157 günde 1 şehir içi sefer
  const b1 = await ops.jobStart('u', { vehicleId: 'b' });
  assert.equal(b1.daily, 1);
  clock.t += 26 * 3600_000;
  const r = await ops.jobStart('u', { vehicleId: 't1' });
  assert.equal(r.left, 5);
});

test('meslek: sadece sahibi, ticari araç, ilandaki araç çalışmaz', async () => {
  const { db, ops } = setup();
  await db.doc('users/u').set({ gold: 0 });
  await db.doc('vehicles/car').set({ ownerId: 'u', catalogId: 5, lifeDays: 20 });
  await db.doc('vehicles/x').set({ ownerId: 'baska', catalogId: 13, lifeDays: 20 });
  await db.doc('vehicles/l').set({ ownerId: 'u', catalogId: 13, lifeDays: 20, listed: true });
  await assert.rejects(ops.jobStart('u', { vehicleId: 'car' }), /not-work-vehicle/);
  await assert.rejects(ops.jobStart('u', { vehicleId: 'x' }), /senin değil/);
  await assert.rejects(ops.jobStart('u', { vehicleId: 'l' }), /listed/);
});

test('ticari / motor: tamir + geliştirme yok, 2. el değeri kalan ömre göre, modifiye kuralları', () => {
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 12 }, action: 'repair' }).block, 'noWork');
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 21 }, action: 'upgrade', upgradeType: 'level' }).block, 'noWork');
  assert.equal(itemListingBand('vehicle', { catalogId: 11, lifeDays: 10 }).max, 250_000);
  assert.equal(modProfile(11), 'truck');
  assert.equal(modProfile(23), 'moto');
  // tır: dorse tipi %3 (500.000 → 15.000), plaka %5
  const d = modDefaults(11);
  const c = modCost(11, null, { ...d, trailer: 'tanker', plate: '34 ENES 1' });
  assert.deepEqual(c.items.map((x) => [x.key, x.price]), [['trailer', 15_000], ['plate', 25_000]]);
  // taksi tipi değişince boya alanı yok (tip belirler); kayıt sadece farklar
  assert.deepEqual(compactMods(13, { taxiType: 'vip', paint: '#ff0000' }), { taxiType: 'vip' });
  // motor: kask / mont yok (oyuncunun avatarı)
  assert.equal('helmet' in sanitizeMods(24, { helmet: '#ffffff' }), false);
  // geçersiz otobüs tipi yok sayılır
  assert.equal(sanitizeMods(12, { variant: 'roket' }).variant, 'otobus');
});
