// v77 Faz 2 — Silahçı / Modifiye / Galeri (functions/shop.js) testleri.
// Çalıştır: node --test functions/scripts/shop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { createBusiness } from '../business.js';
import { createShop, SHOP_MAX_ITEMS } from '../shop.js';
import { BIZ_TYPES } from '../businessCatalogData.js';
import { workshopBand, gameWorkshopPrice, itemListingBand, valueRatioOf, workshopJob, workshopCost } from '../itemRules.js';
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
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 2, gearUpgraded: true }, action: 'upgrade', upgradeType: 'gear' }).block, 'done');
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 2, listed: true }, action: 'repair' }).block, 'listed');
  assert.deepEqual(workshopCost({ mat: 8, labor: 2, qty: 10, ownQty: 4 }), { own: 4, shopQty: 6, labor: 20, material: 48, total: 68 });
});

test('stok + fiyat: sahibin envanteri ⇄ dükkân, bant dışı fiyat reddedilir, sadece sahibi', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 50 });
  await h.act('usta', { op: 'stock', houseId: id, material: 'tamirMalzemesi', qty: 30 });
  assert.equal(inv(h, 'usta', 'tamirMalzemesi'), 20);
  assert.equal(h.G(`businessInventories/${id}`).materials.tamirMalzemesi, 30);
  await assert.rejects(h.act('usta', { op: 'stock', houseId: id, material: 'tamirMalzemesi', qty: 21 }), /stock-mine/);
  await assert.rejects(h.act('usta', { op: 'stock', houseId: id, material: 'tamirMalzemesi', qty: -31 }), /stock-shop/);
  await assert.rejects(h.act('usta', { op: 'stock', houseId: id, material: 'arabaGelistirme', qty: 1 }), /konamaz/);
  await assert.rejects(h.act('ali', { op: 'stock', houseId: id, material: 'tamirMalzemesi', qty: 1 }), /senin değil/);
  await h.act('usta', { op: 'stock', houseId: id, material: 'tamirMalzemesi', qty: -10 });
  assert.equal(inv(h, 'usta', 'tamirMalzemesi'), 30);
  await h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 2 } } });
  assert.deepEqual(h.G(`houses/${id}`).bizPrices.materials.tamirMalzemesi, { mat: 8, labor: 2 });
  await assert.rejects(h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 6, labor: 2 } } }), /price-band:tamirMalzemesi:mat/);
  await assert.rejects(h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 4 } } }), /price-band:tamirMalzemesi:labor/);
});

test('atölye (oyuncu dükkânı): karışık malzeme, işçilik zorunlu, malzeme KOPYALANMAZ, para sahibine, rapor', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 6 });
  await h.act('usta', { op: 'stock', houseId: id, material: 'tamirMalzemesi', qty: 6 });
  await h.act('usta', { op: 'prices', houseId: id, materials: { tamirMalzemesi: { mat: 8, labor: 2 } } });
  weapon(h, 'w1', 'ali');
  h.S('users/ali/inventory/tamirMalzemesi', { quantity: 7 });
  const req = { op: 'workshop', shop: id, itemId: 'w1', action: 'repair' };
  // içeride değil
  await assert.rejects(h.act('ali', { ...req, ownQty: 4, expect: 68 }), /not-present/);
  h.present('ali', id);
  // dükkân stoğu 6 → en az 4 kendi malzemesi gerekli
  await assert.rejects(h.act('ali', { ...req, ownQty: 3, expect: 76 }), /shop-short/);
  await assert.rejects(h.act('ali', { ...req, ownQty: 8, expect: 20 }), /own-short/);
  // fiyat değişti (istemci eski fiyatla onayladı)
  await assert.rejects(h.act('ali', { ...req, ownQty: 4, expect: 60 }), /price-changed:68/);
  const totalMatBefore = inv(h, 'ali', 'tamirMalzemesi') + inv(h, 'usta', 'tamirMalzemesi') + h.G(`businessInventories/${id}`).materials.tamirMalzemesi;
  const r = await h.act('ali', { ...req, ownQty: 4, expect: 68 });
  assert.equal(r.total, 68);
  assert.equal(h.G('users/ali').gold, 100_000 - 68);
  assert.equal(h.G('users/usta').gold, 2_000_000 - 500_000 + 68);
  assert.equal(inv(h, 'ali', 'tamirMalzemesi'), 3);
  assert.equal(h.G(`businessInventories/${id}`).materials.tamirMalzemesi, 0);
  const totalMatAfter = inv(h, 'ali', 'tamirMalzemesi') + inv(h, 'usta', 'tamirMalzemesi') + h.G(`businessInventories/${id}`).materials.tamirMalzemesi;
  assert.equal(totalMatBefore - totalMatAfter, 10, 'tam olarak işin gerektirdiği kadar malzeme yok olur');
  const w = h.G('weapons/w1');
  assert.equal(w.lifeDays, 6);
  assert.equal(w.repairsUsed, 1);
  const rep = h.G(`businessDaily/${id}_2026-10-07`);
  assert.equal(rep.revenue, 68);
  assert.equal(rep.byKind.labor, 20);
  assert.equal(rep.byKind.material, 48);
  assert.equal(rep.materialsUsed.tamirMalzemesi, 6);
  assert.ok(rep.cust.ali);
  // stok bitti → sahibe SMS işareti
  assert.equal(h.G(`houses/${id}`).bizShortagePending, true);
});

test('atölye: altın yetmezse olmaz; sahip kendi dükkânında para ödemez; geliştirme silah gücü + onboarding', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  h.S(`businessInventories/${id}`, { ...h.G(`businessInventories/${id}`), materials: { silahUpgrade: 100, tamirMalzemesi: 100 } });
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
  assert.equal(h.G(`businessInventories/${id}`).materials.silahUpgrade, 90);
  const w = h.G('weapons/w3');
  assert.equal(w.level, 2);
  assert.equal(w.power, 1500);
  assert.deepEqual(h.onboard, [['usta', 19]]);
  assert.equal(h.G(`businessDaily/${id}_2026-10-07`), undefined, 'sahibin kendi işi rapora girmez');
});

test('atölye (oyunun dükkânı): %130, sınırsız malzeme, kendi malzemesiyle sadece işçilik; araç vites', async () => {
  const h = setup();
  vehicle(h, 'v1', 'ali');
  h.S('users/ali/inventory/arabaGelistirme', { quantity: 20 });
  // Hatchback 10.000 → 20 malzeme; kendi malzemesiyle: 20 × 150 işçilik = 3.000
  await assert.rejects(h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'upgrade', upgradeType: 'gear', ownQty: 20, expect: 3000 - 1 }), /price-changed:3000/);
  const r = await h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'upgrade', upgradeType: 'gear', ownQty: 20, expect: 3000 });
  assert.equal(r.total, 3000);
  assert.equal(h.G('users/ali').gold, 97_000);
  assert.equal(inv(h, 'ali', 'arabaGelistirme'), 0);
  const v = h.G('vehicles/v1');
  assert.equal(v.gearUpgraded, true);
  assert.equal(v.gearLevel, VEHICLE_CATALOG[2].gearLevel + 1);
  await assert.rejects(h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'upgrade', upgradeType: 'gear', ownQty: 0, expect: 0 }), /job-done/);
  // tamir: 100 malzeme × 13 = 1.300
  await h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v1', action: 'repair', ownQty: 0, expect: 1300 });
  assert.equal(h.G('vehicles/v1').lifeDays, 12);
  // başkasının aracı
  vehicle(h, 'v2', 'veli');
  await assert.rejects(h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 'v2', action: 'repair', ownQty: 0, expect: 1300 }), /not-owner/);
});

test('vitrin: ekle (bant, 10 sınırı, ömür 0, polis), ilan kaldır cezasız, geri çek ömür −1 + bugün yasak', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  weapon(h, 'w1', 'usta', { lifeDays: 8 });
  const band = itemListingBand('weapon', h.G('weapons/w1'));
  await assert.rejects(h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'w1', price: band.max + 1 }), /price-band/);
  const r = await h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'w1', price: band.max });
  const w = h.G('weapons/w1');
  assert.equal(w.listed, true);
  assert.equal(w.shopHouseId, id);
  const l = h.G(`marketplaceListings/${r.listingId}`);
  assert.equal(l.shopHouseId, id);
  assert.equal(l.sellerId, 'usta');
  assert.equal(l.weaponName, 'Tabanca');
  // galeriye silah konmaz, başkasının silahı konmaz, ömrü 0 konmaz
  weapon(h, 'w0', 'usta', { lifeDays: 0 });
  await assert.rejects(h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'w0', price: 1 }), /life0/);
  weapon(h, 'wx', 'ali');
  await assert.rejects(h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'wx', price: 500 }), /not-owner/);
  // ilanı kaldır: vitrinde kalır (listed:true), ceza yok
  await h.act('usta', { op: 'vitrinUnlist', houseId: id, itemId: 'w1' });
  assert.equal(h.G(`marketplaceListings/${r.listingId}`).sold, true);
  assert.equal(h.G('weapons/w1').listed, true);
  assert.equal(h.G('weapons/w1').shopListingId, null);
  assert.equal(h.G('weapons/w1').lifeDays, 8);
  // yeniden ilan
  const r2 = await h.act('usta', { op: 'vitrinList', houseId: id, itemId: 'w1', price: band.min });
  assert.equal(h.G('weapons/w1').shopListingId, r2.listingId);
  // geri çek: ömür −1, ilan kapanır, bugün tekrar konamaz
  await h.act('usta', { op: 'vitrinRemove', houseId: id, itemId: 'w1' });
  const back = h.G('weapons/w1');
  assert.equal(back.listed, false);
  assert.equal(back.shopHouseId, undefined);
  assert.equal(back.lifeDays, 7);
  assert.equal(h.G(`marketplaceListings/${r2.listingId}`).sold, true);
  await assert.rejects(h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'w1', price: band.min }), /ban-today/);
  h.clock.now += 13 * 60 * 60 * 1000; // ertesi gün 01:00
  const b2 = itemListingBand('weapon', h.G('weapons/w1'));
  await h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'w1', price: b2.min });
  // 10 sınırı
  for (let n = 0; n < SHOP_MAX_ITEMS - 1; n++) {
    weapon(h, `wm${n}`, 'usta');
    await h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: `wm${n}`, price: itemListingBand('weapon', h.G(`weapons/wm${n}`)).min });
  }
  weapon(h, 'wlast', 'usta');
  await assert.rejects(h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'wlast', price: 500 }), /vitrin-full/);
});

test('vitrin: polisin son silahı konamaz; vitrinden anında sat (2. el ile aynı ödeme + sistem ilanı)', async () => {
  const h = setup();
  const id = await openShop(h, 'silahci');
  h.S('users/usta', { ...h.G('users/usta'), profession: 'polis' });
  weapon(h, 'p1', 'usta');
  await assert.rejects(h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'p1', price: 500 }), /police-last/);
  weapon(h, 'p2', 'usta');
  await h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'p2', price: itemListingBand('weapon', h.G('weapons/p2')).min });
  // anında sat
  const before = h.G('users/usta').gold;
  const r = await h.act('usta', { op: 'vitrinInstantSell', houseId: id, itemId: 'p2' });
  assert.equal(r.payout, itemListingBand('weapon', h.G('weapons/p2')).instant);
  assert.equal(h.G('users/usta').gold, before + r.payout);
  const p2 = h.G('weapons/p2');
  assert.equal(p2.listed, true);
  assert.equal(p2.shopHouseId, undefined);
  const sys = h.keys('marketplaceListings/').map((k) => h.G(k)).find((l) => l.sellerId === 'system');
  assert.equal(sys.weaponId, 'p2');
  assert.equal(sys.price, Math.ceil(r.payout * 1.1));
});

test('işletme kapanınca vitrindeki ürünler sahibine döner (ömür −1, bugün tekrar konamaz), ilanlar kapanır; bizStatus sayar', async () => {
  const h = setup();
  const id = await openShop(h, 'galeri');
  vehicle(h, 'v1', 'usta');
  vehicle(h, 'v2', 'usta');
  const a = await h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'v1', price: itemListingBand('vehicle', h.G('vehicles/v1')).max });
  await h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'v2', price: itemListingBand('vehicle', h.G('vehicles/v2')).max });
  await h.act('usta', { op: 'vitrinUnlist', houseId: id, itemId: 'v2' });
  const st = await h.hact('usta', { op: 'bizStatus', houseId: id });
  assert.equal(st.returns.vehicles, 2);
  const c = await h.hact('usta', { op: 'bizClose', houseId: id });
  assert.equal(c.returned.vehicles, 2);
  for (const v of ['v1', 'v2']) {
    const d = h.G(`vehicles/${v}`);
    assert.equal(d.listed, false);
    assert.equal(d.shopHouseId, undefined);
    assert.equal(d.lifeDays, 9, 'vitrinden çekmekle aynı: ömür −1');
    assert.equal(d.shopBanDayKey, '2026-10-07');
  }
  assert.equal(h.G(`marketplaceListings/${a.listingId}`).cancelled, true);
  await assert.rejects(h.act('usta', { op: 'vitrinAdd', houseId: id, itemId: 'v1', price: 5000 }), /biz-closed/);
});

test('stok uyarısı: günde en fazla bir SMS, eksikler tek mesajda; stok eklenince işaret kalkar', async () => {
  const h = setup();
  const id = await openShop(h, 'modifiye');
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), bizShortage: { items: { tamirMalzemesi: true, arabaGelistirme: true } }, bizShortagePending: true });
  assert.equal(await h.business.sendShortageSms(), 1);
  assert.equal(await h.business.sendShortageSms(), 0, 'aynı gün ikinci SMS yok');
  const sms = h.keys('users/usta/messages/').map((k) => h.G(k)).filter((m) => m.type === 'biz_shortage');
  assert.equal(sms.length, 1);
  assert.match(sms[0].text, /Tamir.*Araba geliştirme/);
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 5 });
  await h.act('usta', { op: 'stock', houseId: id, material: 'tamirMalzemesi', qty: 5 });
  assert.deepEqual(h.G(`houses/${id}`).bizShortage.items, { arabaGelistirme: true });
  assert.equal(h.G(`houses/${id}`).bizShortagePending, true);
});
