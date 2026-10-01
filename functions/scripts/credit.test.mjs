// v67 — Kredi puanı & banka kredisi: index.js'teki GERÇEK kod sahte Firestore ile.
// Çalıştır: node --test functions/scripts/credit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';

const src = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
const a = src.indexOf('const CREDIT_SCORE_RATIO');
const b = src.indexOf('// repayStateDebt — Banka');
assert.ok(a > 0 && b > a);
const code = src.slice(a, b).replace(/export const /g, 'const ') + '\nreturn { computeCreditScore, getCreditInfo, takeCredit, repayCredit, processCreditDefaults };';

class HttpsError extends Error {
  constructor(c, m) {
    super(m);
    this.code = c;
  }
}
function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const admin = { firestore: { FieldValue, Timestamp } };
  const fns = new Function(
    'db', 'admin', 'HttpsError', 'onCall', 'onSchedule', 'requireAuth', 'VEHICLE_CATALOG', 'WEAPON_CATALOG', 'valueRatioOf',
    'AMAZOR_PRICES', 'VEHICLE_WEAPON_INITIAL_LIFE_DAYS', 'computeFactoryValue', 'computeFutbolTeamValue', 'getCurrentPrices', 'advanceOnboardingStep',
    code
  )(
    db, admin, HttpsError, (fn) => fn, (_o, fn) => fn, (r) => r.auth.uid,
    { araba: { price: 100_000 } }, { tabanca: { price: 10_000 } }, () => 1,
    { tamirMalzemesi: 10, yasakliMadde: 2500 }, 20,
    () => 200_000, async () => 300_000, async () => ({ cryptoPrice: 1 }), async () => {}
  );
  S('users/u1', { displayName: 'Ali', gold: 5000 });
  S('vehicles/v1', { ownerId: 'u1', catalogId: 'araba', lifeDays: 10 }); // 50.000
  S('vehicles/v2', { ownerId: 'u1', catalogId: 'araba', listed: true }); // sayılmaz
  S('weapons/w1', { ownerId: 'u1', catalogId: 'tabanca', level: 2 }); // 10.000
  S('users/u1/inventory/yasakliMadde', { quantity: 4 }); // 4 × 1250 = 5.000
  S('factories/u1', { ownerName: 'Ali' }); // 200.000, %25 hisse dışarıda → 150.000
  S('factories/u1/shares/s1', { status: 'active', percent: 25 });
  S('futbolTeams/t1', { ownerUid: 'u1' }); // 300.000
  return { db, S, G, fns, call: (fn, data, uid = 'u1') => fn({ auth: { uid }, data }) };
}

test('kredi puanı = %20 × varlıkların anında satış değeri + fabrika + takım', async () => {
  const { fns } = setup();
  const s = await fns.computeCreditScore('u1');
  assert.deepEqual(
    { v: s.vehicles, w: s.weapons, m: s.materials, f: s.factory, t: s.team },
    { v: 50_000, w: 10_000, m: 5_000, f: 150_000, t: 300_000 }
  );
  assert.equal(s.total, 515_000);
  assert.equal(s.limit, 103_000);
});

test('kredi çek: limit, tek aktif kredi, devlet borcu, ödeme ve kapanış', async () => {
  const { fns, G, S, call } = setup();
  await assert.rejects(call(fns.takeCredit, { amount: 103_001 }), /kredi puanın/i);
  await assert.rejects(call(fns.takeCredit, { amount: 500 }), /En az/);
  const r = await call(fns.takeCredit, { amount: 100_000 });
  assert.equal(r.totalOwed, 120_000);
  assert.equal(G('users/u1').gold, 105_000);
  assert.equal(G('users/u1').credit.totalOwed, 120_000);
  await assert.rejects(call(fns.takeCredit, { amount: 1000 }), /aktif bir kredin/);
  await assert.rejects(call(fns.repayCredit, { amount: 200_000 }), /Yetersiz/, 'altını yetmeyen ödeyemez');
  const p1 = await call(fns.repayCredit, { amount: 20_000 });
  assert.equal(p1.remaining, 100_000);
  S('users/u1', { ...G('users/u1'), gold: 1_000_000 });
  const p2 = await call(fns.repayCredit, { amount: 999_999 });
  assert.equal(p2.applied, 100_000, 'fazlası alınmaz');
  assert.equal(p2.closed, true);
  assert.equal(G('users/u1').credit, undefined);
  assert.equal(G('users/u1').gold, 900_000);
  // v68: devlete borcu olan da çekebilir; kredinin tamamı hesaba yatar (borca kesinti yok)
  S('users/u1', { ...G('users/u1'), debtToState: 50_000 });
  const g0 = G('users/u1').gold;
  await call(fns.takeCredit, { amount: 10_000 });
  assert.equal(G('users/u1').gold, g0 + 10_000);
  assert.equal(G('users/u1').debtToState, 50_000);
  await assert.rejects(call(fns.takeCredit, { amount: 1000 }), /aktif bir kredin/, 'aktif kredisi olan çekemez');
});

test('araç kredisi varken yeni kredi yok; vadesi dolan kredi devlete borç olur', async () => {
  const { fns, G, S, call } = setup();
  S('vehicles/v3', { ownerId: 'u1', catalogId: 'araba', mortgaged: true });
  await assert.rejects(call(fns.takeCredit, { amount: 1000 }), /araç kredini/);
  S('vehicles/v3', { ownerId: 'u1', catalogId: 'araba', mortgaged: false });
  await call(fns.takeCredit, { amount: 10_000 });
  await call(fns.repayCredit, { amount: 2_000 });
  const c = G('users/u1').credit;
  S('users/u1', { ...G('users/u1'), credit: { ...c, dueAtMs: Date.now() - 1 } });
  await fns.processCreditDefaults();
  assert.equal(G('users/u1').credit, undefined);
  assert.equal(G('users/u1').debtToState, 10_000);
});
