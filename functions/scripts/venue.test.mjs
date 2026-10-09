// v77 Faz 3 — Cafe/Bar menüsü + İnternet Kafe (functions/venue.js) testleri.
// Çalıştır: node --test functions/scripts/venue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { createBusiness } from '../business.js';
import { createShop } from '../shop.js';
import { createVenue, menuOf, MENU_DAILY_LIMIT, NET_LOCK_PAD_MS } from '../venue.js';
import { BIZ_TYPES } from '../businessCatalogData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const splitIncomeForDebt = (debt, amount) => ({ goldDelta: amount, debtDelta: 0 });

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const clock = { now: Date.UTC(2026, 9, 7, 9) };
  const now = () => clock.now;
  const business = createBusiness({ db, FieldValue, now });
  const venue = createVenue({ db, FieldValue, HttpsError, splitIncomeForDebt, business, now });
  const shop = createShop({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, splitIncomeForDebt, business, now, extraOps: venue.ops });
  const houses = createHouses({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, isAdmin: () => false, assertCanSpeak: async () => {}, isFriend: async () => false, now, bizHooks: shop.bizHooks });
  S('users/sahip', { displayName: 'Sahip', gold: 2_000_000, emerald: 100 });
  S('users/ali', { displayName: 'Ali', gold: 50_000 });
  S('users/fakir', { displayName: 'Fakir', gold: 150 });
  const act = (uid, data) => shop.shopAction({ auth: { uid }, data });
  const hact = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const present = (uid, houseId) => S(`housePresence/${uid}`, { houseId, updatedAt: new Timestamp(clock.now) });
  return { db, S, G, clock, act, hact, present, venue };
}
let seq = 0;
const it = (k, extra = {}) => ({ i: `x${(seq++).toString(36)}`, k, x: 0, z: 0, r: 0, c: 0, p: 1, ...extra });
async function openBiz(h, type, extra = []) {
  const { houseId } = await h.hact('sahip', { op: 'buy', bizIntent: type });
  const items = [...extra];
  BIZ_TYPES[type].groups.forEach((g) => {
    for (let n = 0; n < g.n; n++) items.push(it(g.any[0]));
  });
  h.S(`houses/${houseId}`, { ...h.G(`houses/${houseId}`), items });
  await h.hact('sahip', { op: 'bizOpen', houseId, type });
  return houseId;
}

test('menü: mekândaki dolaplardan oluşur (silah yok), pasta vitrini pasta/kurabiye verir', () => {
  const m = menuOf([it('cafecounter'), it('cakecase'), it('cafetable'), it('guncab'), it('fridge', { p: undefined })]);
  assert.deepEqual(Object.keys(m).sort(), ['cay', 'espresso', 'kahve', 'kurabiye', 'latte', 'pasta']);
});

test('cafe: fiyat bandı, anında al, para sahibine, rapor, ücretsiz alma kapalı, sahip bedava alır', async () => {
  const h = setup();
  const id = await openBiz(h, 'cafe', [it('cakecase')]);
  await assert.rejects(h.act('sahip', { op: 'menuPrices', houseId: id, prices: { pasta: 5 } }), /price-band/);
  await assert.rejects(h.act('sahip', { op: 'menuPrices', houseId: id, prices: { tabanca: 50 } }), /Geçersiz ürün/);
  await h.act('sahip', { op: 'menuPrices', houseId: id, prices: { pasta: 250 } });
  h.present('ali', id);
  await assert.rejects(h.act('ali', { op: 'menuBuy', houseId: id, product: 'pasta', expect: 100 }), /price-changed:250/);
  await assert.rejects(h.act('ali', { op: 'menuBuy', houseId: id, product: 'kokteyl', expect: 100 }), /not-on-menu/);
  const r = await h.act('ali', { op: 'menuBuy', houseId: id, product: 'pasta', expect: 250 });
  assert.equal(r.spent, 250);
  assert.equal(h.G('users/ali').gold, 50_000 - 250);
  assert.equal(h.G('users/sahip').gold, 2_000_000 - 500_000 + 225); // 250 − %10 vergi
  assert.equal(h.G('heldItems/ali').itemId, 'pasta');
  assert.equal(h.G('housePresence/ali').holding, 'pasta');
  const rep = h.G(`businessDaily/${id}_2026-10-07`);
  assert.equal(rep.byKind.menu, 250);
  assert.equal(rep.products.pasta, 1);
  // varsayılan fiyat 100
  await h.act('ali', { op: 'menuBuy', houseId: id, product: 'kahve', expect: 100 });
  // ücretsiz alma müşteriye kapalı, sahibe açık
  const counter = h.G(`houses/${id}`).items.find((x) => x.k === 'cafecounter');
  await assert.rejects(h.hact('ali', { op: 'take', houseId: id, itemId: counter.i, product: 'kahve' }), /biz-menu/);
  h.present('sahip', id);
  await h.hact('sahip', { op: 'take', houseId: id, itemId: counter.i, product: 'kahve' });
  const g = h.G('users/sahip').gold;
  const own = await h.act('sahip', { op: 'menuBuy', houseId: id, product: 'pasta', expect: 0 });
  assert.equal(own.price, 0);
  assert.equal(h.G('users/sahip').gold, g);
  // içeride değilse alamaz; altın yetmezse olmaz
  await assert.rejects(h.act('fakir', { op: 'menuBuy', houseId: id, product: 'pasta', expect: 250 }), /not-present/);
  h.present('fakir', id);
  await assert.rejects(h.act('fakir', { op: 'menuBuy', houseId: id, product: 'pasta', expect: 250 }), /gold/);
});

test('cafe/bar: mekân başına günlük 10.000 sınırı; başka mekân ve ertesi gün serbest', async () => {
  const h = setup();
  const bar = await openBiz(h, 'bar');
  const bar2 = await openBiz(h, 'bar');
  await h.act('sahip', { op: 'menuPrices', houseId: bar, prices: { kokteyl: 1000 } });
  await h.act('sahip', { op: 'menuPrices', houseId: bar2, prices: { kokteyl: 1000 } });
  h.present('ali', bar);
  for (let n = 0; n < 10; n++) await h.act('ali', { op: 'menuBuy', houseId: bar, product: 'kokteyl', expect: 1000 });
  await assert.rejects(h.act('ali', { op: 'menuBuy', houseId: bar, product: 'kokteyl', expect: 1000 }), new RegExp(`limit:${MENU_DAILY_LIMIT}`));
  h.present('ali', bar2);
  await h.act('ali', { op: 'menuBuy', houseId: bar2, product: 'kokteyl', expect: 1000 });
  h.clock.now += 15 * 60 * 60 * 1000; // ertesi gün
  h.present('ali', bar);
  await h.act('ali', { op: 'menuBuy', houseId: bar, product: 'kokteyl', expect: 1000 });
  // temizlik eski günün sayaçlarını siler
  const c = await h.venue.cleanup();
  assert.equal(c.spend, 2);
});

test('internet kafe: ilk 60 sn ödenir, kredi mekâna bağlı (cihaz değişince ödeme yok), süre bitince oturuyorsa yeni dakika', async () => {
  const h = setup();
  const id = await openBiz(h, 'internet', [it('pc')]);
  const items = h.G(`houses/${id}`).items;
  const station = items.find((x) => x.k === 'pcstation').i;
  const pc = items.find((x) => x.k === 'pc').i;
  await assert.rejects(h.act('sahip', { op: 'netPrice', houseId: id, price: 40 }), /price-band/);
  await h.act('sahip', { op: 'netPrice', houseId: id, price: 200 });
  h.present('ali', id);
  await assert.rejects(h.act('ali', { op: 'netStart', houseId: id, itemId: station, expect: 100 }), /price-changed:200/);
  const r = await h.act('ali', { op: 'netStart', houseId: id, itemId: station, expect: 200 });
  assert.equal(r.charged, 200);
  assert.equal(h.G('users/ali').gold, 49_800);
  assert.equal(h.G(`houses/${id}`).bizLockUntilMs, h.clock.now + 60_000 + NET_LOCK_PAD_MS, 'v79: kilit 5 dk payla');
  // 20 sn sonra başka cihaza: ödeme yok
  h.clock.now += 20_000;
  h.present('ali', id);
  const r2 = await h.act('ali', { op: 'netStart', houseId: id, itemId: pc, expect: 200 });
  assert.equal(r2.charged, 0);
  assert.equal(h.G('users/ali').gold, 49_800);
  // nabız: süre bitmedi → ödeme yok
  const t1 = await h.act('ali', { op: 'netTick', houseId: id });
  assert.equal(t1.charged, 0);
  // sahip fiyatı değiştirir → ödenmiş kredi eski fiyatla biter, sonraki dakika yeni fiyat
  await h.act('sahip', { op: 'netPrice', houseId: id, price: 300 });
  h.clock.now += 39_000;
  h.present('ali', id);
  const t2 = await h.act('ali', { op: 'netTick', houseId: id });
  assert.equal(t2.charged, 300);
  assert.equal(h.G('users/ali').gold, 49_500);
  // kalktı (netLeave) → süre bitince çekilmez; mekândan çıkıp gelince kalan kredi devam
  await h.act('ali', { op: 'netLeave', houseId: id });
  h.clock.now += 120_000;
  h.present('ali', id);
  const t3 = await h.act('ali', { op: 'netTick', houseId: id });
  assert.equal(t3.stopped, 'none');
  assert.equal(h.G('users/ali').gold, 49_500);
  // rapor
  assert.equal(h.G(`businessDaily/${id}_2026-10-07`).byKind.service, 500);
});

test('internet kafe: kapasite (istasyon 2, bilgisayar 1), altın bitince oturum biter, kredi varken mobilya kilitli', async () => {
  const h = setup();
  const id = await openBiz(h, 'internet', [it('pc')]);
  const items = h.G(`houses/${id}`).items;
  const pc = items.find((x) => x.k === 'pc').i;
  const station = items.find((x) => x.k === 'pcstation').i;
  h.S('users/veli', { gold: 100_000 });
  h.S('users/ayse', { gold: 100_000 });
  for (const u of ['ali', 'veli', 'ayse', 'fakir']) h.present(u, id);
  await h.act('ali', { op: 'netStart', houseId: id, itemId: pc, expect: 100 });
  await assert.rejects(h.act('veli', { op: 'netStart', houseId: id, itemId: pc, expect: 100 }), /device-full/);
  await h.act('veli', { op: 'netStart', houseId: id, itemId: station, expect: 100 });
  await h.act('ayse', { op: 'netStart', houseId: id, itemId: station, expect: 100 });
  await assert.rejects(h.act('fakir', { op: 'netStart', houseId: id, itemId: station, expect: 100 }), /device-full/);
  // fakir: 150 altın → 1 dakika öder, ikincide oturum biter
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: [...h.G(`houses/${id}`).items, it('arcade', { i: 'arc1' })] });
  await h.act('fakir', { op: 'netStart', houseId: id, itemId: 'arc1', expect: 100 });
  h.clock.now += 59_000;
  h.present('fakir', id);
  const t = await h.act('fakir', { op: 'netTick', houseId: id });
  assert.equal(t.stopped, 'gold');
  assert.equal(h.G('users/fakir').gold, 50);
  assert.equal(h.G(`netSessions/${id}_fakir`).deviceId, null);
  // kredi sürerken gerekli mobilya kaldırılamaz (müşteriler çıkmış olsa bile)
  for (const u of ['ali', 'veli', 'ayse', 'fakir']) h.db._store.delete(`housePresence/${u}`);
  h.clock.now += 0;
  const d = h.G(`houses/${id}`);
  const removed = { items: d.items.filter((x) => x.k !== 'speaker'), wall: d.wall, floor: d.floor };
  await assert.rejects(h.hact('sahip', { op: 'save', houseId: id, design: removed, allowBizClose: true }), /biz-locked:0:/);
});

test('v81: internet kafede canlı yayındaysan oyun süresi ücretsiz (yayın seti ücreti zaten ödeniyor)', async () => {
  const h = setup();
  const id = await openBiz(h, 'internet', [it('pc')]);
  const items = h.G(`houses/${id}`).items;
  const pc = items.find((x) => x.k === 'pc').i;
  await h.act('sahip', { op: 'netPrice', houseId: id, price: 200 });
  h.present('ali', id);
  // bu kafede canlı yayın
  h.S('streams/y1', { uid: 'ali', houseId: id, status: 'live', lastBeatMs: h.clock.now });
  h.S('users/ali', { ...h.G('users/ali'), streamId: 'y1' });
  const r = await h.act('ali', { op: 'netStart', houseId: id, itemId: pc, expect: 999 });
  assert.equal(r.charged, 0);
  assert.equal(h.G('users/ali').gold, 50_000);
  h.clock.now += 58_000;
  h.present('ali', id);
  h.S('streams/y1', { ...h.G('streams/y1'), lastBeatMs: h.clock.now });
  const t = await h.act('ali', { op: 'netTick', houseId: id });
  assert.equal(t.charged, 0);
  assert.equal(h.G('users/ali').gold, 50_000);
  // yayın bitti → oyun yine ücretli
  h.S('streams/y1', { ...h.G('streams/y1'), status: 'ended' });
  h.clock.now += 61_000;
  h.present('ali', id);
  const t2 = await h.act('ali', { op: 'netTick', houseId: id });
  assert.equal(t2.charged, 200);
  assert.equal(h.G('users/ali').gold, 49_800);
});
