// v197 — oyuncu bildirimleri: oyunun spor salonunda üyelik + antrenman ("salon kapandı" hatası),
// garajda herkesin kendi aracı (users.favGarage), duvar / zemin kaplaması bir kez alınır, bütün katlarda geçer.
// Çalıştır: node --test functions/scripts/v197.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createHome } from '../home.js';
import { homeIdOf } from '../homeGeometry.js';
import { createGym, GAME_GYM_ID, GAME_GYM_PRICE } from '../gym.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function world() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._get(p);
  const clock = { now: Date.UTC(2026, 10, 25, 9) };
  S('users/ali', { displayName: 'Ali', gold: 10_000_000, emerald: 100 });
  return { db, S, G, clock };
}

test('v197 spor: oyunun salonunda üyelik alınır ve 3 görev bitince güç artar (eskiden "gym-closed")', async () => {
  const w = world();
  const income = [];
  const gym = createGym({
    db: w.db,
    FieldValue,
    HttpsError,
    splitIncomeForDebt: (_d, amt) => ({ goldDelta: amt, debtDelta: 0 }),
    business: { assertBizOpen: () => {}, recordGameIncomeTx: (_tx, x) => income.push(x) },
    now: () => w.clock.now,
    rnd: () => 0.5,
  });
  await gym.gymEnsureGame();
  const r = await gym.ops.gymStart('ali', { houseId: GAME_GYM_ID, expect: GAME_GYM_PRICE, position: 'FWD' });
  assert.equal(r.ok, true);
  assert.equal(r.tasks.length, 3);
  assert.equal(w.G('users/ali').gold, 10_000_000 - GAME_GYM_PRICE);
  for (let i = 0; i < 3; i++) {
    await gym.ops.gymStep('ali', { equipment: r.tasks[i] });
    w.clock.now += 11_000;
    const d = await gym.ops.gymStepDone('ali');
    if (i < 2) assert.equal(d.done, false);
    else {
      assert.equal(d.done, true);
      assert.ok(d.to > d.from, 'güç arttı');
    }
  }
  assert.equal(income.length, 1, 'ödeme oyunun salon gelirine');
});

test('v197 garaj: favori araç users.favGarage olarak da yazılır (herkes garajda kendi aracını görür)', async () => {
  const w = world();
  const home = createHome({ db: w.db, FieldValue, HttpsError, now: () => w.clock.now });
  w.S('vehicles/c1', { ownerId: 'ali', catalogId: 1, lifeDays: 10, mods: { renk: 2 } });
  w.S('vehicles/c2', { ownerId: 'ali', catalogId: 2, lifeDays: 10 });
  await home.ops.homeFav('ali', { vehicleId: 'c1' });
  assert.deepEqual(w.G('users/ali').favGarage, { id: 'c1', cid: 1, mods: { renk: 2 } }, 'evi olmasa da yazılır');
  await home.enter('ali', {});
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).garage.id, 'c1');
  const r = await home.ops.homeFav('ali', { vehicleId: null });
  assert.ok(r.garage, 'favori kalkınca en pahalı araç');
  assert.deepEqual(w.G('users/ali').favGarage, r.garage);
});

test('v197 kaplama: bir kez alınan duvar / zemin bütün katlarda ücretsiz; iki katta seçilse de bir kez ödenir', async () => {
  const w = world();
  const home = createHome({ db: w.db, FieldValue, HttpsError, now: () => w.clock.now });
  await home.enter('ali', {});
  await home.save('ali', { items: [], surf: { 0: { wall: 'tugla' }, 1: { wall: 'tugla' } } });
  const before = w.G('users/ali');
  const r = await home.checkout('ali', {});
  assert.ok(r.inv.walls.includes('tugla'), 'checkout sahip olunanları döndürür');
  const once = before.emerald - w.G('users/ali').emerald + (before.gold - w.G('users/ali').gold);
  assert.ok(once > 0);
  // üçüncü katta da aynı duvar: deneme değil, ücret yok
  await home.save('ali', { items: [], surf: { 0: { wall: 'tugla' }, 1: { wall: 'tugla' }, 2: { wall: 'tugla' } } });
  const h = w.G(`houses/${homeIdOf('ali')}`);
  assert.equal(h.surf[2].wallTry, undefined);
  const mid = w.G('users/ali');
  const r2 = await home.checkout('ali', { expect: { gold: 0, gem: 0 } });
  assert.equal(r2.gold + r2.gem, 0);
  assert.equal(w.G('users/ali').emerald, mid.emerald, 'ekstra zümrüt çıkmaz');
});
