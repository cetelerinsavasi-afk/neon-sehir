// v132 — Mobilya pazarı (functions/furnMarket.js + houses.js checkout) testleri.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { furnPriceBand, validFurnPrice } from '../furnMarket.js';
import { ITEM_PRICES } from '../houseCatalogData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const keys = (prefix) => [...db._store.keys()].filter((k) => k.startsWith(prefix));
  const clock = { now: Date.UTC(2026, 9, 26, 9) };
  const houses = createHouses({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, isAdmin: () => false, assertCanSpeak: async () => {}, isFriend: async () => false, now: () => clock.now });
  const act = (uid, data) => houses.houseAction({ auth: { uid }, data });
  S('users/ayse', { displayName: 'Ayşe', gold: 2_000_000, emerald: 50 });
  S('users/mehmet', { displayName: 'Mehmet', gold: 2_000_000, emerald: 50 });
  S('users/can', { displayName: 'Can', gold: 2_000_000, emerald: 50 });
  return { db, S, G, keys, clock, act };
}

test('fiyat aralığı: yarısı (yukarı yuvarlanır) – 1 birim altı', () => {
  assert.equal(ITEM_PRICES.chester.t, 'gem');
  const b = furnPriceBand('chester'); // 5 zümrüt
  assert.deepEqual([b.t, b.min, b.max], ['gem', 3, 4]);
  const s = furnPriceBand('sofa3'); // 150.000 altın
  assert.deepEqual([s.t, s.min, s.max], ['gold', 75_000, 149_999]);
  assert.equal(validFurnPrice('chester', 2), false);
  assert.equal(validFurnPrice('chester', 5), false);
  assert.equal(validFurnPrice('chester', 4), true);
});

test('ilan: envanterden düşer; en ucuz görünür (eşitse ilk); iptal → envantere döner, sıradaki görünür', async () => {
  const h = setup();
  h.S('houseInventories/ayse', { items: { chester: 2 } });
  h.S('houseInventories/mehmet', { items: { chester: 1 } });
  await assert.rejects(h.act('ayse', { op: 'furnList', k: 'chester', v: 5 }), /furn-price:3:4/);
  const a1 = await h.act('ayse', { op: 'furnList', k: 'chester', v: 4 });
  assert.equal(h.G('houseInventories/ayse').items.chester, 1);
  assert.equal(h.G('furnMarket/main').best.chester.id, a1.id);
  h.clock.now += 1000;
  const m1 = await h.act('mehmet', { op: 'furnList', k: 'chester', v: 3 });
  assert.equal(h.G('houseInventories/mehmet').items.chester, undefined);
  assert.equal(h.G('furnMarket/main').best.chester.id, m1.id);
  h.clock.now += 1000;
  const a2 = await h.act('ayse', { op: 'furnList', k: 'chester', v: 3 });
  assert.equal(h.G('furnMarket/main').best.chester.id, m1.id, 'aynı fiyatta ilk konan');
  await assert.rejects(h.act('ayse', { op: 'furnList', k: 'chester', v: 3 }), /yok/);
  await assert.rejects(h.act('ayse', { op: 'furnCancel', id: m1.id }), /bulunamadı/);
  await h.act('mehmet', { op: 'furnCancel', id: m1.id });
  assert.equal(h.G('houseInventories/mehmet').items.chester, 1);
  assert.equal(h.G('furnMarket/main').best.chester.id, a2.id);
});

test('satın alma: pazar eşyası ilan fiyatıyla alınır, para satıcıya; kapanmış ilan sepetten düşer', async () => {
  const h = setup();
  h.S('houseInventories/ayse', { items: { chester: 1, sofa3: 1 } });
  const l1 = await h.act('ayse', { op: 'furnList', k: 'chester', v: 4 });
  const l2 = await h.act('ayse', { op: 'furnList', k: 'sofa3', v: 100_000 });
  const { houseId } = await h.act('can', { op: 'buy' });
  const design = { items: [{ i: 'a1', k: 'chester', x: 0, z: 0, m: l1.id }, { i: 'a2', k: 'sofa3', x: 1, z: 1, m: l2.id }, { i: 'a3', k: 'chairw', x: 2, z: 2 }] };
  await h.act('can', { op: 'save', houseId, design });
  assert.equal(h.G(`houses/${houseId}`).items.find((x) => x.i === 'a1').m, l1.id, 'deneme eşyası ilanı taşır');
  const q = await h.act('can', { op: 'quote', houseId, design });
  assert.deepEqual([q.gold, q.gem], [100_000 + ITEM_PRICES.chairw.v, 4]);
  // ilan iptal olursa sepetten düşer
  await h.act('ayse', { op: 'furnCancel', id: l2.id });
  await assert.rejects(h.act('can', { op: 'checkout', houseId, design, expect: { gold: q.gold, gem: q.gem } }), /değişti/);
  const g0 = h.G('users/ayse');
  await h.act('can', { op: 'checkout', houseId, design, expect: { gold: ITEM_PRICES.chairw.v, gem: 4 } });
  const items = h.G(`houses/${houseId}`).items;
  assert.deepEqual(items.map((x) => [x.i, x.p, x.m]), [['a1', 1, undefined], ['a3', 1, undefined]], 'iptal edilen ilanın eşyası odadan kalktı');
  assert.equal(h.G('users/ayse').emerald, g0.emerald + 4, 'zümrüt satıcıya');
  assert.equal(h.G('users/can').emerald, 46);
  assert.equal(h.G(`furnListings/${l1.id}`).status, 'sold');
  assert.equal(h.G('furnMarket/main').best.chester, undefined);
  assert.ok(h.keys('users/ayse/messages/').map((k) => h.G(k)).some((m) => m.type === 'furn_sold'));
});

test('kendi ilanını satın alamaz (deneme eşyası düşer)', async () => {
  const h = setup();
  h.S('houseInventories/ayse', { items: { chester: 1 } });
  const l1 = await h.act('ayse', { op: 'furnList', k: 'chester', v: 4 });
  const data = await h.act('ayse', { op: 'buy' });
  const design = { items: [{ i: 'a1', k: 'chester', x: 0, z: 0, m: l1.id }, { i: 'a3', k: 'chairw', x: 2, z: 2 }] };
  const q = await h.act('ayse', { op: 'quote', houseId: data.houseId, design });
  assert.deepEqual([q.gold, q.gem], [ITEM_PRICES.chairw.v, 0]);
});
