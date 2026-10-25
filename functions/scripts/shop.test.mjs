// v77 Faz 2 — Silahçı / Modifiye / Galeri (functions/shop.js) testleri.
// Çalıştır: node --test functions/scripts/shop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { createBusiness } from '../business.js';
import { createShop, SHOP_MAX_ITEMS } from '../shop.js';
import { BIZ_TYPES } from '../businessCatalogData.js';
import { workshopBand, gameWorkshopPrice, itemListingBand, valueRatioOf, workshopJob, workshopCost, autoOwnQty } from '../itemRules.js';
import { WEAPON_CATALOG, VEHICLE_CATALOG } from '../catalogData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const splitIncomeForDebt = (debt, amount) => {
  const d = debt || 0;
  if (d <= 0 || amount <= 0) return { goldDelta: amount, debtDelta: 0 };
  const repay = Math.min(Math.floor(amount / 2), d);
  return { goldDelta: amount - repay, debtDelta: -repay };
};

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const keys = (prefix) => [...db._store.keys()].filter((k) => k.startsWith(prefix));
  const clock = { now: Date.UTC(2026, 9, 7, 9) }; // 12:00 İstanbul
  const now = () => clock.now;
  const business = createBusiness({ db, FieldValue, now });
  const onboard = [];
  const shop = createShop({
    db, FieldValue, HttpsError,
    requireAuth: (r) => r.auth.uid,
    onCall: (fn) => fn,
    splitIncomeForDebt,
    business,
    advanceOnboardingStep: async (uid, n) => onboard.push([uid, n]),
    now,
  });
  const houses = createHouses({
    db, FieldValue, HttpsError,
    requireAuth: (r) => r.auth.uid,
    onCall: (fn) => fn,
    isAdmin: () => false,
    assertCanSpeak: async () => {},
    isFriend: async () => false,
    now,
    bizHooks: shop.bizHooks,
  });
  S('users/usta', { displayName: 'Usta', gold: 2_000_000, emerald: 100 });
  S('users/ali', { displayName: 'Ali', gold: 100_000 });
  S('users/veli', { displayName: 'Veli', gold: 0 });
  const act = (uid, data) => shop.shopAction({ auth: { uid }, data });
  const hact = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const present = (uid, houseId) => S(`housePresence/${uid}`, { houseId, updatedAt: new Timestamp(clock.now) });
  return { db, S, G, keys, clock, act, hact, present, business, onboard };
}

let seq = 0;
const it = (k) => ({ i: `x${(seq++).toString(36)}`, k, x: 0, z: 0, r: 0, c: 0, p: 1 });
async function openShop(h, type, owner = 'usta') {
  const { houseId } = await h.hact(owner, { op: 'buy', bizIntent: type });
  const items = [];
  BIZ_TYPES[type].groups.forEach((g) => {
    for (let n = 0; n < g.n; n++) items.push(it(g.any[0]));
  });
  h.S(`houses/${houseId}`, { ...h.G(`houses/${houseId}`), items });
  await h.hact(owner, { op: 'bizOpen', houseId, type });
  return houseId;
}
function weapon(h, id, owner, extra = {}) {
  const c = WEAPON_CATALOG[1]; // Tabanca: 1.000 altın, 1.000 güç → tamir 10, geliştirme 10 malzeme
  h.S(`weapons/${id}`, { ownerId: owner, catalogId: 1, name: c.name, basePrice: c.price, basePower: c.power, power: c.power, level: 1, lifeDays: 5, repairsUsed: 0, ...extra });
}
function vehicle(h, id, owner, extra = {}) {
  const c = VEHICLE_CATALOG[2]; // Şehir Hatchback: 10.000 → tamir 100, geliştirme 20 malzeme
  h.S(`vehicles/${id}`, { ownerId: owner, catalogId: 2, model: c.name, baseGalleryValue: c.price, gearLevel: c.gearLevel, baseTank: c.baseTank, tankBonus: 0, lifeDays: 10, repairsUsed: 0, ...extra });
}
const inv = (h, uid, k) => h.G(`users/${uid}/inventory/${k}`)?.quantity || 0;

test('kurallar: atölye bantları, oyunun fiyatı (tamir 13), 2. el bandı eski formülle aynı', () => {
  assert.deepEqual(workshopBand('tamirMalzemesi'), { matMin: 7, matMax: 10, laborMin: 1, laborMax: 3 });
  assert.deepEqual(workshopBand('silahUpgrade'), { matMin: 70, matMax: 100, laborMin: 10, laborMax: 30 });
  assert.deepEqual(workshopBand('arabaGelistirme'), { matMin: 350, matMax: 500, laborMin: 50, laborMax: 150 });
  const g = gameWorkshopPrice('tamirMalzemesi');
  assert.equal(g.mat + g.labor, 13);
  const w = { catalogId: 6, level: 2, lifeDays: 7, repairsUsed: 3 };
  const raw = WEAPON_CATALOG[6].price * 2 * valueRatioOf(w, 'weapon');
  assert.deepEqual(itemListingBand('weapon', w), { max: Math.round(raw), min: Math.floor(Math.round(raw) / 2), instant: Math.floor(raw / 2) });
  // iş gereksinimleri ve maliyet
  assert.deepEqual(workshopJob({ itemType: 'weapon', item: { catalogId: 1, lifeDays: 10 }, action: 'repair' }).block, 'full');
  assert.equal(workshopJob({ itemType: 'weapon', item: { catalogId: 1, level: 3 }, action: 'upgrade' }).block, 'maxLevel');
  // v78: araç geliştirmesi seviye 1→3; eski iki geliştirme = seviye 3
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 2, gearUpgraded: true }, action: 'upgrade', upgradeType: 'level' }).block, null);
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 2, gearUpgraded: true, tankUpgraded: true }, action: 'upgrade', upgradeType: 'level' }).block, 'maxLevel');
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 2, listed: true }, action: 'repair' }).block, 'listed');
  assert.deepEqual(workshopCost({ mat: 8, labor: 2, qty: 10, ownQty: 4 }), { own: 4, shopQty: 6, labor: 20, material: 48, total: 68 });
  assert.equal(autoOwnQty(10, 7), 7);
  assert.equal(autoOwnQty(10, 25), 10);
  assert.equal(autoOwnQty(10, 0), 0);
});

test('v124 stok + fiyat: malzeme ekleme/çekme kalktı (ortak envanter); bant dışı fiyat reddedilir, sadece sahibi', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 50 });
  await assert.rejects(h.act('usta', { op: 'stock', houseId: id, material: 'tamirMalzemesi', qty: 30 }), /ORTAK envanter/);
  assert.equal(inv(h, 'usta', 'tamirMalzemesi'), 50, 'envantere dokunulmaz');
  await h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 2 } } });
  assert.deepEqual(h.G(`houses/${id}`).bizPrices.materials.tamirMalzemesi, { mat: 8, labor: 2 });
  await assert.rejects(h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 6, labor: 2 } } }), /price-band:tamirMalzemesi:mat/);
  await assert.rejects(h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 4 } } }), /price-band:tamirMalzemesi:labor/);
  await assert.rejects(h.act('ali', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 2 } } }), /senin değil/);
});

test('v124 atölye (oyuncu dükkânı): stok = sahibin ortak envanteri; müşterinin malzemesi KULLANILMAZ; işçilik + malzeme, para sahibine, rapor', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 9 });
  await h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 2 } } });
  weapon(h, 'w1', 'ali');
  const req = { op: 'workshop', shop: id, itemId: 'w1', action: 'repair' };
  // içeride değil
  await assert.rejects(h.act('ali', { ...req, expect: 100 }), /not-present/);
  h.present('ali', id);
  // 10 lazım: dükkânda 9 → yetmez (müşterinin kendi 50 malzemesi sayılmaz)
  h.S('users/ali/inventory/tamirMalzemesi', { quantity: 50 });
  await assert.rejects(h.act('ali', { ...req, expect: 100 }), /shop-short/);
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 13 });
  // işçilik 10 × 2 = 20 + malzeme 10 × 8 = 80 → 100
  await assert.rejects(h.act('ali', { ...req, expect: 44 }), /price-changed:100/);
  const r = await h.act('ali', { ...req, expect: 100 });
  assert.equal(r.total, 100);
  assert.equal(r.own, 0);
  assert.equal(r.shopQty, 10);
  assert.equal(h.G('users/ali').gold, 100_000 - 100);
  assert.equal(inv(h, 'ali', 'tamirMalzemesi'), 50, 'müşterinin malzemesine dokunulmaz');
  assert.equal(inv(h, 'usta', 'tamirMalzemesi'), 3, 'sahibin ortak envanterinden düşer');
  // v77 vergi %10: işçilik 20 → 2, malzeme 80 → 8
  assert.equal(h.G('users/usta').gold, 2_000_000 - 500_000 + 100 - 2 - 8);
  const w = h.G('weapons/w1');
  assert.equal(w.lifeDays, 6);
  assert.equal(w.repairsUsed, 1);
  const rep = h.G(`businessDaily/${id}_2026-10-07`);
  assert.equal(rep.revenue, 100);
  assert.equal(rep.byKind.labor, 20);
  assert.equal(rep.byKind.material, 80);
  assert.equal(rep.tax, 10);
  assert.equal(rep.materialsUsed.tamirMalzemesi, 10);
  assert.ok(rep.cust.ali);
  // kalan stok (3) bir sonraki işe yetmez → sahibe SMS işareti
  assert.equal(h.G(`houses/${id}`).bizShortagePending, true);
});

test('atölye: altın yetmezse olmaz; sahip kendi dükkânında para ödemez; geliştirme silah gücü + onboarding', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  h.S('users/usta/inventory/silahUpgrade', { quantity: 100 }); // v124: ortak envanter
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 100 });
  weapon(h, 'w2', 'veli');
  h.present('veli', id);
  await assert.rejects(h.act('veli', { op: 'workshop', shop: id, itemId: 'w2', action: 'repair', ownQty: 0, expect: 130 }), /gold/);
  // sahip: oyunun fiyatı (varsayılan) ama altın ödemez, dükkân stoğundan düşer
  weapon(h, 'w3', 'usta');
  h.present('usta', id);
  const goldBefore = h.G('users/usta').gold;
  const r = await h.act('usta', { op: 'workshop', shop: id, itemId: 'w3', action: 'upgrade', ownQty: 0, expect: 1300 });
  assert.equal(r.total, 1300);
  assert.equal(h.G('users/usta').gold, goldBefore);
  assert.equal(inv(h, 'usta', 'silahUpgrade'), 90);
  const w = h.G('weapons/w3');
  assert.equal(w.level, 2);
  assert.equal(w.power, 1500);
  assert.deepEqual(h.onboard, [['usta', 19]]);
  assert.equal(h.G(`businessDaily/${id}_2026-10-07`), undefined, 'sahibin kendi işi rapora girmez');
});

test('atölye (oyunun dükkânı): %130, sınırsız malzeme; v124: müşterinin malzemesi kullanılmaz; araç vites', async () => {
  const h = setup();
  vehicle(h, 'v1', 'ali');
  h.S('users/ali/inventory/arabaGelistirme', { quantity: 20 });
  // Hatchback 10.000 → 20 malzeme × (500 + 150) = 13.000 (eski istemcinin ownQty'si yok sayılır)
  await assert.rejects(h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'upgrade', upgradeType: 'gear', ownQty: 20, expect: 3000 }), /price-changed:13000/);
  const r = await h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'upgrade', upgradeType: 'gear', ownQty: 20, expect: 13_000 });
  assert.equal(r.total, 13_000);
  assert.equal(h.G('users/ali').gold, 87_000);
  assert.equal(inv(h, 'ali', 'arabaGelistirme'), 20, 'müşterinin malzemesine dokunulmaz');
  const v = h.G('vehicles/v1');
  assert.equal(v.gearUpgraded, true);
  assert.equal(v.raceLevel, 2, 'v78: araç seviye 2');
  // ikinci geliştirme → seviye 3, sonra en yüksek seviye
  await h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'upgrade', upgradeType: 'level', ownQty: 0, expect: 20 * 650 });
  assert.equal(h.G('vehicles/v1').raceLevel, 3);
  await assert.rejects(h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'upgrade', upgradeType: 'level', ownQty: 0, expect: 0 }), /job-maxLevel/);
  // tamir: 100 malzeme × 13 = 1.300
  await h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'repair', ownQty: 0, expect: 1300 });
  assert.equal(h.G('vehicles/v1').lifeDays, 12);
  // başkasının aracı
  vehicle(h, 'v2', 'veli');
  await assert.rejects(h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v2', action: 'repair', ownQty: 0, expect: 1300 }), /not-owner/);
});

// ---------------------------------------------------------------------------
// v130 — vitrin kalktı: silahçı / galeri stoğu oyunun mağazasından alınır
// ---------------------------------------------------------------------------
import { stockUnitCost, stockPriceBand } from '../shopStockRules.js';

test('v130 vitrin kapalı: envanterden vitrine ürün konamaz / yeniden ilan yok', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  weapon(h, 'w1', 'usta', { lifeDays: 8 });
  await assert.rejects(h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'w1', price: 900 }), /vitrin-closed/);
  await assert.rejects(h.act('usta', { op: 'vitrinList', houseId: id, itemId: 'w1', price: 900 }), /vitrin-closed/);
  assert.equal(h.G('weapons/w1').listed, undefined);
});

test('v130 stok: sahip %75e ekler, fiyat %80–100, müşteri alır; vergi sadece kârdan; stok biter', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  const c6 = WEAPON_CATALOG[6]; // 100.000
  const gold0 = h.G('users/usta').gold;
  await h.act('usta', { op: 'stockAdd', houseId: id, catalogId: 6 });
  await h.act('usta', { op: 'stockAdd', houseId: id, catalogId: 6 });
  assert.equal(stockUnitCost(c6.price), 75_000);
  assert.equal(h.G('users/usta').gold, gold0 - 150_000, 'para oyundan çıkar');
  assert.equal(h.G(`shopStocks/${id}`).items['6'], 2);
  // başkası stok ekleyemez, galeri aracı silahçıya eklenemez, yetersiz altın
  await assert.rejects(h.act('ali', { op: 'stockAdd', houseId: id, catalogId: 6 }), /senin değil/);
  await assert.rejects(h.act('usta', { op: 'stockAdd', houseId: id, catalogId: 9 }), /Geçersiz ürün/);
  h.S('users/usta', { ...h.G('users/usta'), gold: 1000 });
  await assert.rejects(h.act('usta', { op: 'stockAdd', houseId: id, catalogId: 6 }), /gold/);
  h.S('users/usta', { ...h.G('users/usta'), gold: gold0 });
  // fiyat bandı
  const b = stockPriceBand(c6.price);
  assert.deepEqual(b, { min: 80_000, max: 100_000 });
  await assert.rejects(h.act('usta', { op: 'stockPrices', houseId: id, prices: { 6: 79_999 } }), /price-band/);
  await assert.rejects(h.act('usta', { op: 'stockPrices', houseId: id, prices: { 6: 90_050 } }), /price-band/, '100\'ün katı olmalı');
  await h.act('usta', { op: 'stockPrices', houseId: id, prices: { 6: 90_000 } });
  // müşteri: dükkânda olmalı, fiyat değişmişse reddedilir, sahip kendinden alamaz
  h.S('users/ali', { ...h.G('users/ali'), gold: 500_000 });
  await assert.rejects(h.act('ali', { op: 'stockBuy', houseId: id, catalogId: 6, expect: 90_000 }), /not-present/);
  h.present('ali', id);
  await assert.rejects(h.act('ali', { op: 'stockBuy', houseId: id, catalogId: 6, expect: 100_000 }), /price-changed:90000/);
  await assert.rejects(h.act('usta', { op: 'stockBuy', houseId: id, catalogId: 6, expect: 90_000 }), /own-shop/);
  await assert.rejects(h.act('ali', { op: 'stockBuy', houseId: id, catalogId: 1, expect: 1000 }), /stock-out/);
  const before = h.G('users/usta').gold;
  const r = await h.act('ali', { op: 'stockBuy', houseId: id, catalogId: 6, expect: 90_000 });
  assert.equal(h.G('users/ali').gold, 410_000);
  // kâr 15.000 → %10 = 1.500 vergi
  assert.equal(h.G('users/usta').gold, before + 90_000 - 1_500);
  const w = h.G(`weapons/${r.itemId}`);
  assert.equal(w.ownerId, 'ali');
  assert.equal(w.name, c6.name);
  assert.equal(w.level, 1);
  assert.equal(w.listed, undefined);
  assert.equal(h.G(`shopStocks/${id}`).items['6'], 1);
  assert.equal(h.G(`shopStocks/${id}`).paid['6'], 75_000);
  const daily = h.keys('businessDaily/').map((k) => h.G(k)).find((d) => d.houseId === id);
  assert.equal(daily.revenue, 90_000);
  assert.equal(daily.tax, 1_500);
  assert.deepEqual(h.onboard.at(-1), ['ali', 5]);
  // kapanınca kalan stoğun ödenen tutarı iade
  h.S(`housePresence/ali`, { houseId: 'baska' });
  const st = await h.hact('usta', { op: 'bizStatus', houseId: id });
  assert.equal(st.returns.stockRefund, 75_000);
  const g = h.G('users/usta').gold;
  const c = await h.hact('usta', { op: 'bizClose', houseId: id });
  assert.equal(c.returned.stockRefund, 75_000);
  assert.equal(h.G('users/usta').gold, g + 75_000);
  assert.equal(h.G(`shopStocks/${id}`), undefined);
});

test('v130 galeri stoğu: araç oyunun galerisindekiyle aynı belge; kredi SMS + görev', async () => {
  const h = setup();
  const id = await openShop(h, 'galeri');
  await h.act('usta', { op: 'stockAdd', houseId: id, catalogId: 2 });
  h.present('ali', id);
  const r = await h.act('ali', { op: 'stockBuy', houseId: id, catalogId: 2, expect: VEHICLE_CATALOG[2].price });
  const v = h.G(`vehicles/${r.itemId}`);
  assert.equal(v.ownerId, 'ali');
  assert.equal(v.model, VEHICLE_CATALOG[2].name);
  assert.equal(v.mortgaged, false);
  assert.ok(h.keys('users/ali/messages/').map((k) => h.G(k)).some((m) => m.type === 'loan_offer'));
  assert.deepEqual(h.onboard.at(-1), ['ali', 11]);
  // kâr 2.500 → vergi 250
  assert.equal(h.G(`shopStocks/${id}`).items['2'], 0);
});

test('v130 geçiş: ilandaki vitrin ürünü 2. elde satışta kalır, ilansız olan envantere döner; ömür değişmez; bir kez', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  weapon(h, 'w1', 'usta', { lifeDays: 6, listed: true, shopHouseId: id, shopListingId: 'L1', shopAddedDayKey: '2026-10-01' });
  weapon(h, 'w2', 'usta', { lifeDays: 4, listed: true, shopHouseId: id, shopListingId: null, shopAddedDayKey: '2026-10-01' });
  h.S('marketplaceListings/L1', { sellerId: 'usta', itemType: 'weapon', weaponId: 'w1', price: 900, sold: false, shopHouseId: id, shopName: 'Dükkân' });
  const shop2 = createShop({ db: h.db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, splitIncomeForDebt, business: h.business, now: () => h.clock.now });
  const r = await shop2.migrateVitrin();
  assert.equal(r.items, 2);
  const w1 = h.G('weapons/w1');
  assert.equal(w1.listed, true);
  assert.equal(w1.shopHouseId, undefined);
  assert.equal(w1.lifeDays, 6);
  const l = h.G('marketplaceListings/L1');
  assert.equal(l.sold, false);
  assert.equal(l.shopHouseId, undefined);
  const w2 = h.G('weapons/w2');
  assert.equal(w2.listed, false);
  assert.equal(w2.shopHouseId, undefined);
  assert.equal(w2.lifeDays, 4);
  assert.ok(h.keys('users/usta/messages/').map((k) => h.G(k)).some((m) => m.type === 'biz_shop_v130'));
  assert.deepEqual(await shop2.migrateVitrin(), { skipped: true });
});

test('stok uyarısı: günde en fazla bir SMS, eksikler tek mesajda; v124: ortak envantere stok gelince işaret kalkar', async () => {
  const h = setup();
  const id = await openShop(h, 'modifiye');
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), bizShortage: { items: { tamirMalzemesi: true, arabaGelistirme: true } }, bizShortagePending: true });
  assert.equal(await h.business.sendShortageSms(), 1);
  assert.equal(await h.business.sendShortageSms(), 0, 'aynı gün ikinci SMS yok');
  const sms = h.keys('users/usta/messages/').map((k) => h.G(k)).filter((m) => m.type === 'biz_shortage');
  assert.equal(sms.length, 1);
  assert.match(sms[0].text, /Tamir.*Araba geliştirme/);
  // v124: stok sahibinin ortak envanterine gelince (Mağaza / fabrika) bir sonraki taramada işaret kalkar
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 5 });
  h.S('users/usta/inventory/arabaGelistirme', { quantity: 5 });
  h.clock.now += 24 * 3600_000;
  assert.equal(await h.business.sendShortageSms(), 0);
  assert.deepEqual(h.G(`houses/${id}`).bizShortage.items, {});
  assert.equal(h.G(`houses/${id}`).bizShortagePending, false);
});

// ---------------------------------------------------------------------------
// v128 — eksik malzemeyi Mağaza'dan otomatik tamamlama
// ---------------------------------------------------------------------------
import { planAutoSupply } from '../autoSupply.js';

const matListing = (h, id, sellerId, unitPrice, quantity, extra = {}) =>
  h.S(`marketplaceListings/${id}`, { itemType: 'material', materialType: 'tamirMalzemesi', sellerId, sellerName: sellerId, unitPrice, quantity, price: unitPrice * quantity, sold: false, createdAtMs: 1, ...extra });

test('v128 otomatik tedarik: en ucuz → eşitse stoğu az olan; sahibin fiyatı üstü / iptal kullanılmaz; paralar doğru yere', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  await h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 2 } } });
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 4 });
  h.S('users/zeki', { displayName: 'Zeki', gold: 0 });
  h.S('users/nur', { displayName: 'Nur', gold: 0, debtToState: 1000 });
  matListing(h, 'L1', 'veli', 7, 30);
  matListing(h, 'L2', 'zeki', 6, 5);
  matListing(h, 'L3', 'nur', 6, 2, { batches: [{ q: 2, at: 5 }], expireAtMs: 999 });
  matListing(h, 'L4', 'veli', 9, 50); // sahibin fiyatından (8) pahalı
  matListing(h, 'L6', 'veli', 4, 50, { cancelled: true });
  weapon(h, 'w1', 'ali');
  h.present('ali', id);
  const usta0 = h.G('users/usta').gold;
  const r = await h.act('ali', { op: 'workshop', shop: id, itemId: 'w1', action: 'repair', expect: 100 });
  assert.equal(r.autoSupplied, 6);
  assert.equal(h.G('users/ali').gold, 100_000 - 100, 'müşteri aynı fiyatı öder');
  // 2 adet nur (6, stoğu az) + 4 adet zeki (6) = 36 altın
  assert.equal(h.G('marketplaceListings/L3').sold, true);
  assert.equal(h.G('marketplaceListings/L2').quantity, 1);
  assert.equal(h.G('marketplaceListings/L2').price, 6);
  assert.equal(h.G('marketplaceListings/L1').quantity, 30, 'pahalı ilana dokunulmaz');
  assert.equal(h.G('users/zeki').gold, 24);
  assert.equal(h.G('users/nur').gold, 6, 'borçlu satıcıya yarısı');
  assert.equal(h.G('users/nur').debtToState, 994);
  assert.equal(inv(h, 'usta', 'tamirMalzemesi'), 0, 'envanterdeki 4 kullanıldı, eksi olmaz');
  // vergi %10: 2 + 8 = 10 · sahip: 100 − 10 − 36
  assert.equal(h.G('users/usta').gold, usta0 + 100 - 10 - 36);
  assert.equal(h.G('weapons/w1').lifeDays, 6);
  const msgs = [...h.db._store.keys()].filter((k) => k.startsWith('users/usta/messages/')).map((k) => h.G(k));
  assert.ok(msgs.some((m) => m.type === 'biz_auto_supply' && /tamir malzemesi olmadığı için Mağaza'dan 6 adet otomatik alındı/.test(m.text)));
  assert.equal(h.G(`houses/${id}`).bizShortagePending, true, 'stok ekle hatırlatması sürer');
});

test('v128 otomatik tedarik: sahip zarar edecekse ya da kâr 0 ise alınmaz ("malzeme yok"); +1 ise alınır', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  await h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 1 } } });
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 9 }); // 10 lazım → 1 eksik
  matListing(h, 'L1', 'veli', 8, 10); // 9 gelir − 1 vergi − 8 = 0 → alınmaz
  weapon(h, 'w1', 'ali');
  h.present('ali', id);
  const req = { op: 'workshop', shop: id, itemId: 'w1', action: 'repair', expect: 90 };
  await assert.rejects(h.act('ali', req), /shop-short/);
  assert.equal(h.G('marketplaceListings/L1').quantity, 10);
  matListing(h, 'L2', 'veli', 7, 10); // +1 kâr → alınır
  const usta0 = h.G('users/usta').gold;
  const r = await h.act('ali', req);
  assert.equal(r.autoSupplied, 1);
  assert.equal(h.G('marketplaceListings/L2').quantity, 9);
  assert.equal(h.G('users/usta').gold, usta0 + 90 - 9 - 7, 'vergi 1 + 8 = 9, alış 7');
});

test('v128 otomatik tedarik: eksiğin tamamı yoksa hiç alınmaz; sahibin kendi işinde otomatik alım yok', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  await h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 2 } } });
  matListing(h, 'L1', 'veli', 5, 4); // 10 lazım, 4 var
  weapon(h, 'w1', 'ali');
  weapon(h, 'w2', 'usta');
  h.present('ali', id);
  h.present('usta', id);
  await assert.rejects(h.act('ali', { op: 'workshop', shop: id, itemId: 'w1', action: 'repair', expect: 100 }), /shop-short/);
  assert.equal(h.G('marketplaceListings/L1').quantity, 4);
  matListing(h, 'L2', 'veli', 5, 40);
  await assert.rejects(h.act('usta', { op: 'workshop', shop: id, itemId: 'w2', action: 'repair', expect: 100 }), /shop-short/);
  assert.equal(h.G('marketplaceListings/L2').quantity, 40);
});

test('v128 planAutoSupply: kullanıcının örneği (vergi %20, işçilik 1, malzeme 8)', () => {
  const tax20 = (a) => Math.max(0, Math.round(a * 0.2));
  const base = { need: 1, have: 0, qty: 1, mat: 8, labor: 1, ownerUid: 'o', taxOf: tax20 };
  const L = (unitPrice, quantity = 5, extra = {}) => ({ id: `l${unitPrice}_${quantity}`, itemType: 'material', sellerId: 's', unitPrice, quantity, sold: false, ...extra });
  assert.equal(planAutoSupply({ ...base, listings: [L(8)] }), null, '9 − 2 vergi − 8 = −1 → yok');
  assert.equal(planAutoSupply({ ...base, listings: [L(7)] }), null, '0 kâr → yok');
  const ok = planAutoSupply({ ...base, listings: [L(7), L(6, 9), L(6, 3)] });
  assert.equal(ok.profit, 1);
  assert.equal(ok.takes[0].listing.id, 'l6_3', 'aynı fiyatta stoğu az olan önce');
});

test('v129 otomatik tedarik: envanter bitince önce sahibin KENDİ ilanı kullanılır (para el değiştirmez), sonra başkası', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  await h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 2 } } });
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 2 });
  h.S('users/zeki', { displayName: 'Zeki', gold: 0 });
  matListing(h, 'OWN', 'usta', 9, 5); // kendi ilanı (fiyatı önemli değil)
  matListing(h, 'Z', 'zeki', 7, 10);
  weapon(h, 'w1', 'ali');
  h.present('ali', id);
  const usta0 = h.G('users/usta').gold;
  const r = await h.act('ali', { op: 'workshop', shop: id, itemId: 'w1', action: 'repair', expect: 100 });
  assert.equal(r.autoSupplied, 8);
  assert.equal(h.G('marketplaceListings/OWN').sold, true, '5 adet kendi ilanından');
  assert.equal(h.G('marketplaceListings/Z').quantity, 7, '3 adet zekiden');
  assert.equal(h.G('users/zeki').gold, 21);
  assert.equal(inv(h, 'usta', 'tamirMalzemesi'), 0);
  assert.equal(h.G('users/usta').gold, usta0 + 100 - 10 - 21, 'kendi ilanı için para ödenmez');
});

test('v129 oyunun dükkânı: envanter yok — Mağaza\'dan en ucuz alınır, parası ilan sahibine; kâr vergisi belediyeye; yetmezse tavan fiyattan sonsuz', async () => {
  const h = setup();
  h.S('users/fab', { displayName: 'Fabrikacı', gold: 0 });
  h.S('users/fab2', { displayName: 'Fabrikacı 2', gold: 0 });
  vehicle(h, 'v1', 'ali');
  // tamir 100 malzeme × 13 = 1.300 · Mağaza: 60 adet 7'den, 30 adet 8'den → 10 eksik tavandan (10)
  matListing(h, 'A', 'fab', 7, 60);
  matListing(h, 'B', 'fab2', 8, 30);
  matListing(h, 'C', 'fab2', 6, 5, { materialType: 'silahUpgrade' }); // başka malzeme
  const r = await h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'repair', expect: 1300 });
  assert.equal(h.G('users/ali').gold, 100_000 - 1300);
  assert.equal(r.boughtQty, 90);
  assert.equal(r.virtualQty, 10);
  assert.equal(r.materialCost, 60 * 7 + 30 * 8 + 10 * 10);
  assert.equal(h.G('users/fab').gold, 420);
  assert.equal(h.G('users/fab2').gold, 240);
  assert.equal(h.G('marketplaceListings/A').sold, true);
  assert.equal(h.G('marketplaceListings/C').quantity, 5);
  // kâr 1300 − 760 = 540 → vergi %10 = 54
  assert.equal(r.tax, 54);
  const led = [...h.db._store.keys()].filter((k) => k.startsWith('taxLedger/')).map((k) => h.G(k));
  assert.equal(led.reduce((a, x) => a + Number(x.amount || x.total || 0), 0) > 0, true, 'vergi deftere yazıldı');
});

test('v129 oyunun dükkânı: kullanıcının örneği — 100 tamir malzemesi 7\'den, 1.300 ödendi → vergi kâr üzerinden', async () => {
  const h = setup();
  h.S('users/fab', { displayName: 'Fabrikacı', gold: 0 });
  vehicle(h, 'v1', 'ali');
  matListing(h, 'A', 'fab', 7, 500);
  const r = await h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'repair', expect: 1300 });
  assert.equal(r.virtualQty, 0);
  assert.equal(h.G('users/fab').gold, 700);
  assert.equal(r.tax, 60, 'kâr 600 × %10');
  assert.equal(h.G('marketplaceListings/A').quantity, 400);
});
