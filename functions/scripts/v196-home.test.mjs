// v196 — 3 katlı ev: tembel kurulum, kat doğrulaması (çatı katı sınırı, merdiven / boşluk), duvar eşyası,
// envanter deltası, deneme → satın alma, kilit, Evler listesi (10 eşya, kilitli yok, 20 gün kuralı).
// Çalıştır: node --test functions/scripts/v196-home.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createHome, cleanHomeItem, placementOf } from '../home.js';
import { checkPlacement, groundsAt, FLOOR_Y, homeIdOf } from '../homeGeometry.js';
import { ITEM_PRICES } from '../houseCatalogData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const DAY = 86_400_000;
function world() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._get(p);
  const clock = { now: Date.UTC(2026, 10, 25, 9) };
  const home = createHome({ db, FieldValue, HttpsError, now: () => clock.now });
  S('users/ali', { displayName: 'Ali', gold: 10_000_000, emerald: 100 });
  S('users/veli', { displayName: 'Veli', gold: 0 });
  return { db, S, G, clock, home };
}
let n = 0;
const it = (k, x, z, f, extra = {}) => ({ i: `i${(n++).toString(36)}`, k, x, z, r: 0, c: 0, f, ...extra });

test('geometri: kat zeminleri, merdiven boşluğu, çatı katı dar', () => {
  assert.deepEqual(groundsAt(0, 0), [FLOOR_Y[0], FLOOR_Y[1], FLOOR_Y[2]]);
  assert.ok(!groundsAt(-8.2, 0).includes(FLOOR_Y[1]), '1. katta merdiven boşluğu');
  assert.ok(!groundsAt(7, 0).includes(FLOOR_Y[2]), 'çatı katı x ≤ 5,8');
  assert.equal(checkPlacement({ f: 2, x: 6.5, z: 0 }), 'bounds');
  assert.equal(checkPlacement({ f: 2, x: 5.0, z: 0 }), null);
  assert.equal(checkPlacement({ f: 0, x: -8.3, z: 0 }), 'stairs', 'merdivene eşya konmaz');
  assert.equal(checkPlacement({ f: 1, x: -8.3, z: 0 }), 'hole');
  assert.equal(checkPlacement({ f: 1, x: 2, z: -6.3 }), 'stairs', '1→2 merdiveni');
  assert.equal(checkPlacement({ f: 2, x: 2, z: -6.3 }), 'hole');
  assert.equal(checkPlacement({ f: 3, x: 0, z: 0 }), 'floor');
  // duvar eşyası: tam duvarda olmalı; çatı katında yan duvar 5,8
  assert.equal(checkPlacement({ f: 0, x: 0, z: -7 }, { wall: true }), null);
  assert.equal(checkPlacement({ f: 0, x: 0, z: -5 }, { wall: true }), 'wall');
  assert.equal(checkPlacement({ f: 2, x: 5.8, z: 1 }, { wall: true }), null);
  assert.equal(checkPlacement({ f: 2, x: 9, z: 1 }, { wall: true }), 'wall');
  assert.equal(checkPlacement({ f: 2, x: 0, z: 0 }, { ceil: true }), 'ceil-roof');
  assert.equal(placementOf({ k: 'painting', f: 1, x: 3, z: 7 }), null);
  assert.equal(cleanHomeItem({ i: 'a', k: 'ring', x: 0, z: 0, f: 0 }), null, 'kaldırılan eşya konamaz');
});

test('ev: ilk girişte tembel kurulum (tek yazma), ikinci girişte yazma yok; başkasının evi kurulmaz', async () => {
  const w = world();
  const r = await w.home.enter('ali', {});
  assert.equal(r.home.created, true);
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).kind, 'home');
  assert.deepEqual(w.G(`houses/${homeIdOf('ali')}`).items, []);
  const v = w.G(`houses/${homeIdOf('ali')}`);
  await w.home.enter('ali', {});
  assert.deepEqual(w.G(`houses/${homeIdOf('ali')}`), v, 'tekrar girişte değişmez');
  await assert.rejects(() => w.home.enter('veli', { homeId: homeIdOf('can') }), /bulunamadı/);
});

test('ev: deneme eşyası → checkout altın / zümrüt; envanter deltası; kat doğrulaması sunucuda', async () => {
  const w = world();
  await w.home.enter('ali', {});
  const sofa = it('sofa3', 0, 0, 0);
  const ch = it('chester', 0, 0, 1);
  await w.home.save('ali', { items: [sofa, ch] });
  const r = await w.home.checkout('ali', {});
  assert.equal(r.gold, ITEM_PRICES.sofa3.v);
  assert.equal(r.gem, ITEM_PRICES.chester.v);
  assert.equal(w.G('users/ali').gold, 10_000_000 - ITEM_PRICES.sofa3.v);
  let h = w.G(`houses/${homeIdOf('ali')}`);
  assert.equal(h.itemCount, 2);
  // satın alınmış eşya kaldırılınca envantere döner, başka kata konabilir
  await w.home.save('ali', { items: [{ ...ch, p: 1 }] });
  h = w.G(`houses/${homeIdOf('ali')}`);
  assert.equal(h.inv.items.sofa3, 1);
  await w.home.save('ali', { items: [{ ...ch, p: 1 }, { ...it('sofa3', 3, 2, 2), p: 1 }] });
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).inv.items.sofa3, undefined);
  // envanterde olmayan eşya satın alınmış gibi konamaz
  await assert.rejects(() => w.home.save('ali', { items: [{ ...it('sofa2', 0, 0, 0), p: 1 }] }), /Envanterinde olmayan/);
  // çatı katı dışı / merdiven sunucuda reddedilir
  await assert.rejects(() => w.home.save('ali', { items: [it('sofa2', 7.5, 0, 2)] }), /place-bounds/);
  await assert.rejects(() => w.home.save('ali', { items: [it('sofa2', -8.3, 1, 0)] }), /place-stairs/);
  await assert.rejects(() => w.home.save('ali', { items: [it('painting', 0, 3, 0)] }), /place-wall/);
});

test('ev: kilitli ev girilmez ve listelenmez; 10 eşya kuralı; 20 gün girmeyenin evi gizli; sahibi sayılmaz', async () => {
  const w = world();
  await w.home.enter('ali', {});
  const items = Array.from({ length: 10 }, (_, i) => ({ ...it('chairm', -4 + i * 0.8, 3, 0) }));
  await w.home.save('ali', { items });
  await w.home.checkout('ali', {});
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).listable, true);
  let L = await w.home.list('veli', {});
  assert.deepEqual(L.homes.map((x) => x.id), [homeIdOf('ali')]);
  await w.home.enter('veli', { homeId: homeIdOf('ali') });
  await w.home.enter('ali', {});
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).popN, 1, 'sahibinin girişi sayılmaz');
  await w.home.settings('ali', { locked: true });
  L = await w.home.list('veli', {});
  assert.equal(L.homes.length, 0, 'kilitli ev listede yok');
  await assert.rejects(() => w.home.enter('veli', { homeId: homeIdOf('ali') }), /kapalı/);
  await w.home.settings('ali', { locked: false });
  w.clock.now += 21 * DAY;
  L = await w.home.list('veli', {});
  assert.equal(L.homes.length, 0, '20 gün girmeyenin evi gizli');
  await w.home.enter('ali', {});
  L = await w.home.list('veli', {});
  assert.equal(L.homes.length, 1);
  // 10'dan az eşyalı ev sadece içinde biri varsa (istemci homeIds gönderir)
  await w.home.enter('veli', {});
  L = await w.home.list('ali', {});
  assert.ok(!L.homes.some((x) => x.id === homeIdOf('veli')));
  L = await w.home.list('ali', { homeIds: [homeIdOf('veli')] });
  assert.ok(L.homes.some((x) => x.id === homeIdOf('veli')));
});

test('ev: garajda favori araç — seçilmemişse bir kez en pahalısı; seçilen kendi aracı olmalı', async () => {
  const w = world();
  w.S('vehicles/v1', { ownerId: 'ali', catalogId: 1 });
  w.S('vehicles/v2', { ownerId: 'ali', catalogId: 4 });
  w.S('vehicles/v3', { ownerId: 'veli', catalogId: 3 });
  await w.home.enter('ali', {});
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).garageCar, 4);
  await w.home.settings('ali', { vehicleId: 'v1' });
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).garageCar, 1);
  await assert.rejects(() => w.home.settings('ali', { vehicleId: 'v3' }), /senin değil/);
  await w.home.enter('veli', {});
  assert.equal(w.G(`houses/${homeIdOf('veli')}`).garageCar, 3);
  await w.home.enter('can', {}).catch(() => {});
});

test('ev: ana kapı türü — kalkan kapı ve garaj kapısı seçilemez', async () => {
  const w = world();
  await w.home.enter('ali', {});
  await w.home.settings('ali', { doorType: 'cift', name: '  Köşk  ' });
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).door.t, 'cift');
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).name, 'Köşk');
  await assert.rejects(() => w.home.settings('ali', { doorType: 'doner' }), /ana kapı olamaz/);
  await assert.rejects(() => w.home.settings('ali', { doorType: 'garagedoor' }), /ana kapı olamaz/);
});
