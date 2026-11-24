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

test('ev: garajda favori araç — yoksa en pahalı kullanılabilir; ilandaki / haczedilen sayılmaz; modifiye taşınır', async () => {
  const w = world();
  w.S('vehicles/v1', { ownerId: 'ali', catalogId: 1 });
  w.S('vehicles/v2', { ownerId: 'ali', catalogId: 4, mods: { paint: '#ff0000' } });
  w.S('vehicles/v9', { ownerId: 'ali', catalogId: 10, listed: true });
  w.S('vehicles/v3', { ownerId: 'veli', catalogId: 3 });
  await w.home.enter('ali', {});
  let h = w.G(`houses/${homeIdOf('ali')}`);
  assert.equal(h.garageCar, 4);
  assert.deepEqual(h.garage.mods, { paint: '#ff0000' });
  await w.home.settings('ali', { vehicleId: 'v1' });
  assert.equal(w.G('users/ali').favVehicleId, 'v1');
  await w.home.enter('ali', {});
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).garageCar, 1);
  await assert.rejects(() => w.home.settings('ali', { vehicleId: 'v3' }), /senin değil/);
  // favori satıldı → en pahalıya döner
  w.S('vehicles/v1', { ownerId: 'veli', catalogId: 1 });
  await w.home.enter('ali', {});
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).garageCar, 4);
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

test('ev: kat başına duvar / zemin kaplaması (deneme → satın al) ve pencere stili (ücretsiz, doğrulanır)', async () => {
  const w = world();
  await w.home.enter('ali', {});
  await w.home.save('ali', {
    items: [],
    surf: { 0: { floor: 'mermer_beyaz', wall: 'boya_beyaz' }, 1: { wall: 'tugla' }, 2: { floor: 'yok_boyle' } },
    win: { '0_0_1': { m: 3, c: 2 }, '1_2_0': { m: 9, c: 1 }, 'x': { m: 1 }, '0_1_0': { m: 0, c: 0 } },
  });
  let h = w.G(`houses/${homeIdOf('ali')}`);
  assert.equal(h.surf[0].floor, 'mermer_beyaz');
  assert.equal(h.surf[0].floorTry, true, 'ücretli zemin deneme');
  assert.equal(h.surf[0].wallTry, undefined, 'ücretsiz duvar deneme değil');
  assert.equal(h.surf[1].wallTry, true);
  assert.equal(h.surf[2], undefined, 'bilinmeyen kaplama atılır');
  assert.deepEqual(h.win, { '0_0_1': { m: 3, c: 2 }, '1_2_0': { m: 0, c: 1 } }, 'geçersiz kimlik / model elenir, varsayılan yazılmaz');
  const r = await w.home.checkout('ali', {});
  assert.equal(r.gold + r.gem > 0, true);
  h = w.G(`houses/${homeIdOf('ali')}`);
  assert.equal(h.surf[0].floorTry, undefined);
  assert.ok(h.inv.floors.includes('mermer_beyaz'));
  assert.ok(h.inv.walls.includes('tugla'));
  // pencere gönderilmeyen kayıt stili silmez
  await w.home.save('ali', { items: [], surf: h.surf });
  assert.deepEqual(w.G(`houses/${homeIdOf('ali')}`).win, { '0_0_1': { m: 3, c: 2 }, '1_2_0': { m: 0, c: 1 } });
});

test('mobilya pazarı (v196): envanter kişisel evde — ilan ver, iptal, başkası alır (para satıcıya, eşya alıcının ev envanterine)', async () => {
  const { createFurnMarket, furnPriceBand } = await import('../furnMarket.js');
  const w = world();
  const furn = createFurnMarket({ db: w.db, FieldValue, HttpsError, now: () => w.clock.now });
  await w.home.enter('ali', {});
  // ali'nin evinde 2 koltuk envanterde
  const hid = homeIdOf('ali');
  const h = w.G(`houses/${hid}`);
  w.S(`houses/${hid}`, { ...h, inv: { items: { sofa3: 2 }, walls: [], floors: [] } });
  const band = furnPriceBand('sofa3');
  await assert.rejects(() => furn.list('veli', { k: 'sofa3', v: band.min }), /Önce evine/);
  const r = await furn.list('ali', { k: 'sofa3', v: band.min });
  assert.equal(w.G(`houses/${hid}`).inv.items.sofa3, 1);
  await furn.cancel('ali', { id: r.id });
  assert.equal(w.G(`houses/${hid}`).inv.items.sofa3, 2);
  const r2 = await furn.list('ali', { k: 'sofa3', v: band.min });
  await w.home.enter('veli', {});
  w.S('users/veli', { ...w.G('users/veli'), gold: 10_000_000, emerald: 100 });
  await furn.buyToInventory('veli', { id: r2.id, expect: { t: band.t, v: band.min } });
  assert.equal(w.G(`houses/${homeIdOf('veli')}`).inv.items.sofa3, 1);
  assert.equal(w.G(`houses/${hid}`).inv.items.sofa3, 1);
  const paid = band.t === 'gem' ? w.G('users/ali').emerald - 100 : w.G('users/ali').gold - 10_000_000;
  assert.equal(paid, band.min, 'para satıcıya (vergisiz)');
});

test('favori araç profilden (homeFav): garaj hemen güncellenir; başkasının aracı olmaz; kaldırınca en pahalı', async () => {
  const w = world();
  w.S('vehicles/c1', { ownerId: 'ali', catalogId: 1, lifeDays: 10 });
  w.S('vehicles/c2', { ownerId: 'ali', catalogId: 2, lifeDays: 10 });
  w.S('vehicles/v9', { ownerId: 'veli', catalogId: 3, lifeDays: 10 });
  await w.home.enter('ali', {});
  await assert.rejects(() => w.home.ops.homeFav('ali', { vehicleId: 'v9' }), /senin değil/);
  const r = await w.home.ops.homeFav('ali', { vehicleId: 'c1' });
  assert.equal(r.garage.id, 'c1');
  assert.equal(w.G('users/ali').favVehicleId, 'c1');
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).garage.id, 'c1');
  const r2 = await w.home.ops.homeFav('ali', { vehicleId: null });
  assert.equal(w.G('users/ali').favVehicleId, undefined);
  assert.ok(r2.garage, 'favori yoksa en pahalı kullanılabilir araç');
});

// v198 — "👣 bugün" hesap başına: aynı oyuncunun tekrar girişleri sayılmaz; ertesi gün sıfırlanır
test('ev: günlük ziyaret sayacı hesap başına (aynı hesapla spam yok)', async () => {
  const w = world();
  w.S('users/can', { displayName: 'Can', gold: 0 });
  await w.home.enter('ali', {});
  for (let i = 0; i < 5; i++) await w.home.enter('veli', { homeId: homeIdOf('ali') });
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).popN, 1, 'veli 5 kez girdi → 1');
  const r = await w.home.enter('can', { homeId: homeIdOf('ali') });
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).popN, 2);
  assert.equal(r.home.popU, undefined, 'ziyaretçi listesi istemciye gitmez');
  w.clock.now += DAY;
  await w.home.enter('veli', { homeId: homeIdOf('ali') });
  await w.home.enter('veli', { homeId: homeIdOf('ali') });
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).popN, 1, 'yeni gün: tekrar 1');
});

// v198 — eski envantere (houseInventories/{uid}) geçişten sonra düşmüş eşyalar kişisel eve taşınır (bir kez)
test('ev: kayıp eşya kurtarma — geçişten sonraki eski envanter eve taşınır, öncesi taşınmaz', async () => {
  const w = world();
  w.S('migrations/v196', { appliedAtMs: w.clock.now - 1000 });
  w.S('houseInventories/ali', { items: { sofa3: 2, chairm: 1 }, walls: ['tugla'], floors: [], updatedAtMs: w.clock.now - 10 });
  await w.home.enter('ali', {}); // ev kuruluyor (henüz yok)
  const { inv198: _a, ...oldA } = w.G(`houses/${homeIdOf('ali')}`); // v198 öncesi ev (bayrak yok)
  void _a;
  w.S(`houses/${homeIdOf('ali')}`, oldA);
  await w.home.enter('ali', {});
  const h = w.G(`houses/${homeIdOf('ali')}`);
  assert.equal(h.inv.items.sofa3, 2);
  assert.equal(h.inv.items.chairm, 1);
  assert.ok(h.inv.walls.includes('tugla'));
  assert.equal(w.G('houseInventories/ali'), undefined, 'eski belge silindi');
  await w.home.enter('ali', {});
  assert.equal(w.G(`houses/${homeIdOf('ali')}`).inv.items.sofa3, 2, 'ikinci kez eklenmez');
  // geçişten ÖNCEKİ eski envanter (iade edilmiş) taşınmaz
  w.S('houseInventories/veli', { items: { sofa3: 5 }, updatedAtMs: w.clock.now - 5000 });
  await w.home.enter('veli', {});
  const { inv198: _v, ...oldV } = w.G(`houses/${homeIdOf('veli')}`);
  void _v;
  w.S(`houses/${homeIdOf('veli')}`, oldV);
  await w.home.enter('veli', {});
  assert.equal(w.G(`houses/${homeIdOf('veli')}`).inv?.items?.sofa3, undefined);
});

// v199 — bölme duvarının yüzüne duvar eşyası (TV, tablo) takılabilir
test('v199: duvar eşyası bölme duvarının yüzünde geçerli, havada değil', async () => {
  const { placementOf: pl } = await import('../home.js');
  const div = { i: 'd1', k: 'wall4', x: 2, z: 1, r: 0, f: 1 };
  const tv = { i: 't1', k: 'tvwall', x: 2.5, z: 1 + 0.08, r: 0, f: 1 };
  assert.equal(pl(tv, [div, tv]), null, 'ön yüz');
  assert.equal(pl({ ...tv, z: 1 - 0.08, r: 4 }, [div, tv]), null, 'arka yüz');
  assert.equal(pl(tv, [tv]), 'wall', 'bölme yoksa olmaz');
  assert.equal(pl(tv, [{ ...div, f: 0 }, tv]), 'wall', 'başka kattaki bölme sayılmaz');
  assert.equal(pl({ ...tv, x: 5 }, [div, tv]), 'wall', 'bölmenin dışında');
  // döndürülmüş bölme (r = 2 → 90°)
  const d2 = { i: 'd2', k: 'wall2', x: -3, z: 0, r: 2, f: 0 };
  assert.equal(pl({ i: 'p', k: 'painting', x: -3 + 0.08, z: 0.3, r: 2, f: 0 }, [d2]), null);
});

// v200 — evden çıkar: sadece kilitli evin sahibi; haber RTDB kutusuna
test('v200: evden çıkar sadece kilitliyken, RTDB kutusuna yazılır', async () => {
  const { db, S, clock } = world();
  const box = {};
  const rtdb = async () => ({ ref: (p) => ({ set: async (v) => (box[p] = v) }) });
  const home = createHome({ db, FieldValue, HttpsError, rtdb, now: () => clock.now });
  await home.ops.homeEnter('ali', {});
  await assert.rejects(home.ops.homeKick('ali', { uid: 'veli' }), /kilitle/);
  await home.ops.homeSettings('ali', { locked: true });
  await home.ops.homeKick('ali', { uid: 'veli' });
  assert.deepEqual(box['cityBox/veli/k'], { h: 'home_ali', t: clock.now });
  await assert.rejects(home.ops.homeKick('ali', { uid: 'ali' }), /Geçersiz/);
  await assert.rejects(home.ops.homeEnter('veli', { homeId: 'home_ali' }), /kapalı/);
  void S;
});

// v200 — ısmarla: elindeki ürün kalan süresiyle karşıya (RTDB kutusu); süresi bitmiş / engelli olmaz
test('v200: ısmarla elindekini kalan süresiyle verir', async () => {
  const { db, clock } = world();
  const box = {};
  const rtdb = async () => ({ ref: (p) => ({ set: async (v) => (box[p] = v) }) });
  const blocked = new Set(['veli>ali']);
  const home = createHome({ db, FieldValue, HttpsError, rtdb, isBlockedBy: async (a, b) => blocked.has(`${a}>${b}`), now: () => clock.now });
  const u = clock.now + 70_000;
  await assert.rejects(home.ops.cityGift('ali', { uid: 'veli', i: 'cay', u }), /ısmarlanamıyor/);
  blocked.clear();
  await home.ops.cityGift('ali', { uid: 'veli', i: 'cay', u });
  assert.deepEqual(box['cityBox/veli/g'], { f: 'ali', n: 'Ali', i: 'cay', u, t: clock.now });
  await assert.rejects(home.ops.cityGift('ali', { uid: 'veli', i: 'cay', u: clock.now - 5 }), /süresi bitti/);
  await assert.rejects(home.ops.cityGift('ali', { uid: 'ali', i: 'cay', u }), /Geçersiz/);
});
