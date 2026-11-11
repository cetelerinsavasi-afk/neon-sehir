// v156 — benzinlik: benzin al (100, RP) + market (eldeki ürün); gelir devlete "benzinlik"
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createGasStation, FUEL_PRICE, GAS_MARKET_MENU } from '../gasStation.js';
import { stateWrite, STATE_IN } from '../stateTreasury.js';
import { HOUSE_PRODUCTS } from '../houseCatalogData.js';

class HE extends Error {
  constructor(code, msg) {
    super(msg);
    this.code = code;
  }
}
const setup = async (gold) => {
  const db = new FakeFirestore();
  await db.doc('users/u').set({ gold });
  const gs = createGasStation({ db, FieldValue, HttpsError: HE, goldTag: (s) => s, stateWrite, heldItemMs: 120_000, now: () => 1_000_000, dateKey: () => '2026-11-12' });
  return { db, gs };
};
const ledger = async (db) => {
  const all = await db.collection('stateLedger').get();
  return all.docs.map((d) => d.data()).reduce((a, d) => a + Number(d.in?.benzinlik || 0), 0);
};

test('benzin: 100 altın düşer, devlete benzinlik kalemi; eldeki ürün değişmez', async () => {
  const { db, gs } = await setup(150);
  assert.equal(FUEL_PRICE, 100);
  const r = await gs.fuelBuy('u');
  assert.equal(r.price, 100);
  assert.equal((await db.doc('users/u').get()).data().gold, 50);
  assert.equal(await ledger(db), 100);
  assert.equal((await db.doc('heldItems/u').get()).exists, false);
  await assert.rejects(gs.fuelBuy('u'), /Yetersiz altın/);
  assert.ok(STATE_IN.benzinlik);
});

test('market: menüdeki ürün ele gelir (2 dk), fiyat düşer; geçersiz ürün reddedilir', async () => {
  const { db, gs } = await setup(1000);
  for (const k of Object.keys(GAS_MARKET_MENU)) assert.ok(HOUSE_PRODUCTS[k], k);
  const r = await gs.marketBuy('u', { item: 'cips' });
  assert.equal(r.itemId, 'cips');
  assert.equal((await db.doc('users/u').get()).data().gold, 1000 - GAS_MARKET_MENU.cips);
  const h = (await db.doc('heldItems/u').get()).data();
  assert.equal(h.itemId, 'cips');
  assert.equal(h.untilMs, 1_000_000 + 120_000);
  await assert.rejects(gs.marketBuy('u', { item: 'tabanca' }), /Geçersiz ürün/);
  await assert.rejects(gs.marketBuy('u', { item: '__proto__' }), /Geçersiz ürün/);
  assert.equal(await ledger(db), GAS_MARKET_MENU.cips);
});
