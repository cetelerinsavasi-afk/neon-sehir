// v64 — mekân ürünleri (büfe/bar) ve ısmarlama için çevrimdışı test.
// index.js'teki GERÇEK kod parçası sahte Firestore ile çalıştırılır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { HOUSE_PRODUCTS } from '../houseCatalogData.js';

const src = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
const a = src.indexOf('const BUFE_PRICES = {');
const b = src.indexOf("// placeLimanOrder — Liman'dan toplu/ucuz malzeme siparişi.");
const code = src.slice(a, src.lastIndexOf('// -----', b)).replace(/^export const /gm, 'const ') + '\nreturn { buyFromBufe, buyFromGazinoBar, giftHeldItem, BUFE_PRICES, GAZINO_BAR_PRICES };';

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
  const blocks = new Set();
  const moderation = { isBlockedBy: async (o, t) => blocks.has(`${o}>${t}`) };
  const fns = new Function('db', 'admin', 'HttpsError', 'onCall', 'requireAuth', 'moderation', 'HOUSE_PRODUCTS', code)(
    db, { firestore: { FieldValue } }, HttpsError, (fn) => fn, (r) => r.auth.uid, moderation, HOUSE_PRODUCTS
  );
  const fresh = () => new Timestamp(Date.now());
  for (const [u, g] of [['ali', 5000], ['veli', 5000], ['ayse', 5000]]) S(`users/${u}`, { displayName: u.toUpperCase(), gold: g });
  const call = (fn, uid, data) => fns[fn]({ auth: { uid }, data });
  return { db, S, G, fns, call, blocks, fresh };
}

test('yeni fiyatlar', () => {
  const { fns } = setup();
  assert.deepEqual(fns.BUFE_PRICES, { sosisli: 200, tost: 300, cay: 20, kahve: 100, oralet: 40, latte: 500 });
  assert.deepEqual(fns.GAZINO_BAR_PRICES, { cay: 100, kahve: 500, kokteyl: 1000 });
});

test('satın alma elde tutulan ürünü sunucuya yazar (2 dk) ve konum kaydına işler', async () => {
  const { S, G, call, fresh } = setup();
  S('parkPresence/ali', { holding: null, updatedAt: fresh() });
  const r = await call('buyFromBufe', 'ali', { itemId: 'kahve' });
  assert.equal(G('users/ali').gold, 4900);
  const h = G('heldItems/ali');
  assert.deepEqual([h.itemId, h.venue], ['kahve', 'park']);
  assert.ok(Math.abs(h.untilMs - Date.now() - 120_000) < 2000);
  assert.equal(r.untilMs, h.untilMs);
  assert.equal(G('parkPresence/ali').holding, 'kahve');
});

test('ısmarlama: süre sıfırlanmaz, ürün karşıya geçer; eli dolu olana ya da mekânda olmayana ısmarlanmaz', async () => {
  const { S, G, call, fresh, blocks } = setup();
  S('interiorPresence/ali', { locationId: 'gazino', holding: null, updatedAt: fresh() });
  S('interiorPresence/veli', { locationId: 'gazino', holding: null, updatedAt: fresh() });
  S('interiorPresence/ayse', { locationId: 'gazino', holding: 'cay', updatedAt: fresh() });
  S('heldItems/ayse', { itemId: 'cay', venue: 'gazino', untilMs: Date.now() + 60_000 });
  await assert.rejects(call('giftHeldItem', 'ali', { targetUid: 'veli', venue: 'gazino' }), /Elinde ısmarlayacak/);
  await call('buyFromGazinoBar', 'ali', { itemId: 'kokteyl' });
  assert.equal(G('users/ali').gold, 4000);
  const until = G('heldItems/ali').untilMs;
  await assert.rejects(call('giftHeldItem', 'ali', { targetUid: 'ayse', venue: 'gazino' }), /elinde zaten/);
  await assert.rejects(call('giftHeldItem', 'ali', { targetUid: 'veli', venue: 'park' }), /Elinde ısmarlayacak/, 'başka mekân');
  blocks.add('veli>ali');
  await assert.rejects(call('giftHeldItem', 'ali', { targetUid: 'veli', venue: 'gazino' }), /ısmarlanamıyor/);
  blocks.clear();
  const r = await call('giftHeldItem', 'ali', { targetUid: 'veli', venue: 'gazino' });
  assert.equal(r.label, 'Kokteyl');
  assert.equal(G('heldItems/ali'), undefined, 'benden çıktı');
  const v = G('heldItems/veli');
  assert.deepEqual([v.itemId, v.venue, v.untilMs, v.giftedByName], ['kokteyl', 'gazino', until, 'ALI'], 'süre aynen devam');
  assert.equal(G('interiorPresence/ali').holding, null);
  assert.equal(G('interiorPresence/veli').holding, 'kokteyl');
  assert.equal(G('users/veli').gold, 5000, 'alan para ödemez');
});

test('süresi dolmuş ürün ısmarlanamaz; karşının süresi dolmuşsa ısmarlanabilir; mekânda olmayana olmaz', async () => {
  const { S, G, call, fresh } = setup();
  S('parkPresence/ali', { updatedAt: fresh() });
  S('parkPresence/veli', { updatedAt: fresh() });
  S('parkPresence/ayse', { updatedAt: new Timestamp(Date.now() - 5 * 60_000) });
  S('heldItems/ali', { itemId: 'tost', venue: 'park', untilMs: Date.now() - 1 });
  await assert.rejects(call('giftHeldItem', 'ali', { targetUid: 'veli', venue: 'park' }), /Elinde ısmarlayacak/);
  S('heldItems/ali', { itemId: 'tost', venue: 'park', untilMs: Date.now() + 30_000 });
  S('heldItems/veli', { itemId: 'cay', venue: 'park', untilMs: Date.now() - 1 });
  await assert.rejects(call('giftHeldItem', 'ali', { targetUid: 'ayse', venue: 'park' }), /artık burada değil/);
  await call('giftHeldItem', 'ali', { targetUid: 'veli', venue: 'park' });
  assert.equal(G('heldItems/veli').itemId, 'tost');
});

test('v66 ev: aynı evdeki oyuncuya ısmarlanır, başka evdekine ısmarlanmaz', async () => {
  const { S, G, call, fresh } = setup();
  const until = Date.now() + 60_000;
  S('heldItems/ali', { itemId: 'kola', venue: 'ev', houseId: 'h1', untilMs: until });
  S('housePresence/ali', { houseId: 'h1', holding: 'kola', updatedAt: fresh() });
  S('housePresence/veli', { houseId: 'h1', holding: null, updatedAt: fresh() });
  S('housePresence/ayse', { houseId: 'h2', holding: null, updatedAt: fresh() });
  await assert.rejects(call('giftHeldItem', 'ali', { targetUid: 'ayse', venue: 'ev' }), /bu evde değil/);
  const r = await call('giftHeldItem', 'ali', { targetUid: 'veli', venue: 'ev' });
  assert.equal(r.label, 'Kola');
  assert.equal(G('heldItems/veli').itemId, 'kola');
  assert.equal(G('heldItems/veli').untilMs, until);
  assert.equal(G('housePresence/veli').holding, 'kola');
});
