// v195 — pasif mekân (20 gün), oyunun mağazasında satış sırası, araç ömrü 10 + 10 tamir,
// ticari tamir (geliştirme yok), tek seferlik ömür geçişi, çete sipariş hakkı, futbol desteği.
// Çalıştır: node --test functions/scripts/v195.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { createBusiness } from '../business.js';
import { createShop } from '../shop.js';
import { BIZ_TYPES, bizDayKey } from '../businessCatalogData.js';
import { itemListingBand, valueRatioOf, workshopJob, lifeCapOf, vehicleLifeCap, VEHICLE_WEAPON_INITIAL_LIFE_DAYS, REPAIR_LIFE_BONUS_DAYS, VEHICLE_WEAPON_MAX_REPAIRS, MOTOR_LIFE_DAYS, AMAZOR_PRICES } from '../itemRules.js';
import { isPristineItem, isPristineListing } from '../shopStockRules.js';
import { canRepairVehicle, canUpgradeVehicle, JOBS } from '../vehicleKinds.js';
import { isBizPassive, BIZ_PASSIVE_TEXT } from '../bizPassive.js';
import { createV195Migration, vehiclePatchV195, listingPatchV195 } from '../v195Migration.js';
import { GANG } from '../gang/config.js';
import { WEAPON_CATALOG, VEHICLE_CATALOG } from '../catalogData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const splitIncomeForDebt = (debt, amount) => ({ goldDelta: amount, debtDelta: 0 });
const DAY = 86_400_000;

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const keys = (prefix) => [...db._store.keys()].filter((k) => k.startsWith(prefix));
  const clock = { now: Date.UTC(2026, 9, 7, 9) }; // 7 Ekim 12:00 İstanbul
  const now = () => clock.now;
  const business = createBusiness({ db, FieldValue, HttpsError, now, log: { log() {}, error() {}, warn() {} } });
  const shop = createShop({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, splitIncomeForDebt, business, now });
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
  const act = (uid, data) => shop.shopAction({ auth: { uid }, data });
  const hact = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const present = (uid, houseId) => S(`housePresence/${uid}`, { houseId, updatedAt: new Timestamp(clock.now) });
  const seen = (uid, daysAgo) => S(`users/${uid}/private/meta`, { lastSeenAtMs: clock.now - daysAgo * DAY });
  S('users/ali', { displayName: 'Ali', gold: 5_000_000 });
  seen('ali', 0);
  return { db, S, G, keys, clock, act, hact, present, seen, business, shop };
}
let seq = 0;
const it = (k) => ({ i: `x${(seq++).toString(36)}`, k, x: 0, z: 0, r: 0, c: 0, p: 1 });
async function openShop(h, type, owner) {
  if (!h.G(`users/${owner}`)) h.S(`users/${owner}`, { displayName: owner.toUpperCase(), gold: 5_000_000, emerald: 100 });
  if (!h.G(`users/${owner}/private/meta`)) h.seen(owner, 1);
  const { houseId } = await h.hact(owner, { op: 'buy', bizIntent: type });
  const items = [];
  BIZ_TYPES[type].groups.forEach((g) => {
    for (let n = 0; n < g.n; n++) items.push(it(g.any[0]));
  });
  h.S(`houses/${houseId}`, { ...h.G(`houses/${houseId}`), items });
  await h.hact(owner, { op: 'bizOpen', houseId, type });
  return houseId;
}
async function stockedShop(h, owner, price, { rank = null, cid = 6 } = {}) {
  const id = await openShop(h, 'silahci', owner);
  await h.act(owner, { op: 'stockAdd', houseId: id, catalogId: cid });
  if (price) await h.act(owner, { op: 'stockPrices', houseId: id, prices: { [cid]: price } });
  if (rank != null) h.S(`houses/${id}`, { ...h.G(`houses/${id}`), bizRank: rank });
  return id;
}
const today = (h) => bizDayKey('silahci', h.clock.now);
const earnedToday = (h, houseId, revenue) => h.S(`businessDaily/${houseId}_${today(h)}`, { houseId, ownerUid: h.G(`houses/${houseId}`).ownerUid, revenue });

// ---------------------------------------------------------------------------
// 3 + 4 — ömür / tamir / 2. el değeri
// ---------------------------------------------------------------------------
test('v195 sabitler: araba + ticari 10 gün, 10 tamir, tamir +1; motor 20; silah değişmedi', () => {
  assert.equal(VEHICLE_WEAPON_INITIAL_LIFE_DAYS, 10);
  assert.equal(REPAIR_LIFE_BONUS_DAYS, 1);
  assert.equal(VEHICLE_WEAPON_MAX_REPAIRS, 10);
  assert.equal(MOTOR_LIFE_DAYS, 20);
  for (const id of [1, 5, 10, 11, 12, 13, 15]) assert.equal(vehicleLifeCap(id), 10, `araç ${id}`);
  for (const id of [21, 22, 23, 24, 25, 26, 27]) assert.equal(vehicleLifeCap(id), 20, `motor ${id}`);
  assert.equal(lifeCapOf('weapon'), 10);
  assert.equal(lifeCapOf('vehicle', { catalogId: 24 }), 20);
  assert.equal(lifeCapOf('vehicle'), 10, 'katalog no yoksa araba sayılır');
  // tamir: araba + ticari · geliştirme: sadece araba
  for (const id of [1, 10, 11, 15]) assert.equal(canRepairVehicle(id), true);
  for (const id of [21, 25, 27]) assert.equal(canRepairVehicle(id), false);
  assert.equal(canUpgradeVehicle(3), true);
  for (const id of [11, 12, 13, 15, 21]) assert.equal(canUpgradeVehicle(id), false);
});

test('v195 2. el değer / bant: araba, ticari, motor, silah', () => {
  const car = VEHICLE_CATALOG[3].price;
  // araba: (kalan hak × 1 + ömür) / 20
  assert.equal(valueRatioOf({ catalogId: 3, lifeDays: 10, repairsUsed: 0 }), 1);
  assert.equal(valueRatioOf({ catalogId: 3, lifeDays: 5, repairsUsed: 5 }), 0.5);
  assert.equal(valueRatioOf({ catalogId: 3, lifeDays: 0, repairsUsed: 10 }), 0);
  assert.equal(itemListingBand('vehicle', { catalogId: 3, lifeDays: 10, repairsUsed: 0, raceLevel: 3 }).max, car * 3, 'araba seviye çarpanı');
  // ticari (tır 500.000): tamir hakkı sayılır, seviye çarpanı YOK
  assert.equal(itemListingBand('vehicle', { catalogId: 11, lifeDays: 10, repairsUsed: 0, raceLevel: 3 }).max, 500_000);
  assert.equal(itemListingBand('vehicle', { catalogId: 11, lifeDays: 4, repairsUsed: 2 }).max, 300_000, '(8 + 4) / 20');
  assert.deepEqual(itemListingBand('vehicle', { catalogId: 13, lifeDays: 10, repairsUsed: 10 }), { max: 50_000, min: 25_000, instant: 25_000 });
  // motor: değişmedi — kalan ömür / 20, tamir yok
  const moto = VEHICLE_CATALOG[22].price;
  assert.equal(itemListingBand('vehicle', { catalogId: 22, lifeDays: 20 }).max, moto);
  assert.equal(itemListingBand('vehicle', { catalogId: 22, lifeDays: 10 }).max, Math.round(moto / 2));
  // silah: değişmedi — (kalan hak × 1 + ömür) / 20
  const w = WEAPON_CATALOG[6].price;
  assert.equal(itemListingBand('weapon', { catalogId: 6, lifeDays: 10, repairsUsed: 0, level: 2 }).max, w * 2);
  assert.equal(itemListingBand('weapon', { catalogId: 6, lifeDays: 5, repairsUsed: 5 }).max, Math.round(w / 2));
});

test('v195 sıfır sayılma: yeni tavana göre (araba / ticari 10, motor 20)', () => {
  assert.equal(isPristineItem('vehicle', { catalogId: 3, lifeDays: 10, repairsUsed: 0 }), true);
  assert.equal(isPristineItem('vehicle', { catalogId: 3, lifeDays: 9, repairsUsed: 0 }), false);
  assert.equal(isPristineItem('vehicle', { catalogId: 12, lifeDays: 10, repairsUsed: 0 }), true);
  assert.equal(isPristineItem('vehicle', { catalogId: 22, lifeDays: 10, repairsUsed: 0 }), false, 'motor 20 günde sıfır');
  assert.equal(isPristineItem('vehicle', { catalogId: 22, lifeDays: 20, repairsUsed: 0 }), true);
  assert.equal(isPristineListing({ itemType: 'vehicle', vehicleCatalogId: 3, vehicleLifeDays: 10, vehicleRepairsUsed: 0 }), true);
  assert.equal(isPristineListing({ itemType: 'vehicle', vehicleCatalogId: 22, vehicleLifeDays: 10, vehicleRepairsUsed: 0 }), false);
  assert.equal(isPristineListing({ itemType: 'vehicle', vehicleCatalogId: 22, vehicleLifeDays: 20, vehicleRepairsUsed: 0 }), true);
  assert.equal(isPristineItem('weapon', { catalogId: 1, lifeDays: 10, repairsUsed: 0, level: 1 }), true);
});

test('v195 ticari araç tamir olur (+1 gün, malzeme fiyat/100) ama geliştirilemez; motor ikisini de almaz', async () => {
  assert.deepEqual(workshopJob({ itemType: 'vehicle', item: { catalogId: 11, lifeDays: 5 }, action: 'repair' }), { material: 'tamirMalzemesi', qty: 5000, block: null, gain: 1 });
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 11, lifeDays: 5 }, action: 'upgrade', upgradeType: 'level' }).block, 'noWork');
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 22, lifeDays: 5 }, action: 'repair' }).block, 'noWork');
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 11, lifeDays: 10 }, action: 'repair' }).block, 'full');
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 11, lifeDays: 3, repairsUsed: 10 }, action: 'repair' }).block, 'repairs');
  // oyunun modifiye garajında gerçek tamir: tır 500.000 → 5.000 malzeme × (10 + 3) = 65.000
  const h = setup();
  h.S('vehicles/t1', { ownerId: 'ali', catalogId: 11, model: 'Tır', lifeDays: 5, repairsUsed: 0 });
  const r = await h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 't1', action: 'repair', expect: 65_000 });
  assert.equal(r.total, 65_000);
  assert.equal(h.G('vehicles/t1').lifeDays, 6);
  assert.equal(h.G('vehicles/t1').repairsUsed, 1);
  await assert.rejects(h.act('ali', { op: 'workshop', shop: 'game', shopType: 'modifiye', itemId: 't1', action: 'upgrade', upgradeType: 'level', expect: 0 }), /job-noWork/);
});

test('v195 yeni araç belgesi: araba / ticari 10 gün, motor 20 gün', async () => {
  const { newVehicleDoc } = await import('../shop.js');
  assert.equal(newVehicleDoc('u', 3, FieldValue).lifeDays, 10);
  assert.equal(newVehicleDoc('u', 13, FieldValue).lifeDays, 10);
  assert.equal(newVehicleDoc('u', 22, FieldValue).lifeDays, 20);
  assert.equal(newVehicleDoc('u', 26, FieldValue).lifeDays, 20);
});

test('v195 meslek ücretleri ×1,5 (polis ve kurye aynı)', () => {
  assert.equal(JOBS.tir.avg, 9000);
  assert.equal(JOBS.otobus.avg, 18750);
  assert.equal(JOBS.taksi.avg, 2250);
  assert.equal(JOBS.ambulans.avg, 5250);
  assert.equal(JOBS.polis.avg, 4000);
  assert.equal(JOBS.kurye.avg, 500);
  assert.equal(JOBS.tir.farMul, 3);
  assert.equal(JOBS.otobus.farMul, 1.5);
});

// ---------------------------------------------------------------------------
// Tek seferlik geçiş
// ---------------------------------------------------------------------------
test('v195 geçiş: 15→10, 10→10, 5→5, ticari 18→10, motor 20→20, silah dokunulmaz, ilan alanı + fiyat, iki kez çalışınca değişiklik yok', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  S('vehicles/c15', { ownerId: 'a', catalogId: 3, lifeDays: 15, repairsUsed: 4, listed: true });
  S('vehicles/c10', { ownerId: 'a', catalogId: 3, lifeDays: 10, repairsUsed: 0 });
  S('vehicles/c5', { ownerId: 'a', catalogId: 3, lifeDays: 5, repairsUsed: 7 });
  S('vehicles/t18', { ownerId: 'b', catalogId: 11, lifeDays: 18, repairsUsed: 0 });
  S('vehicles/m20', { ownerId: 'b', catalogId: 22, lifeDays: 20, repairsUsed: 0, listed: true });
  S('weapons/w9', { ownerId: 'a', catalogId: 6, lifeDays: 9, repairsUsed: 0 });
  const car = VEHICLE_CATALOG[3].price;
  // eski kuralla tavan: (6×2 + 15) / 40 → yeni kuralla (6 + 10) / 20 = 0,8 · ilan fiyatı yeni tavanın üstünde
  S('marketplaceListings/L1', { itemType: 'vehicle', sold: false, sellerId: 'a', vehicleId: 'c15', vehicleCatalogId: 3, vehicleLifeDays: 15, vehicleRepairsUsed: 4, price: car * 2 });
  S('marketplaceListings/L2', { itemType: 'vehicle', sold: false, sellerId: 'b', vehicleId: 'm20', vehicleCatalogId: 22, vehicleLifeDays: 20, vehicleRepairsUsed: 0, price: 1000 });
  S('marketplaceListings/L3', { itemType: 'vehicle', sold: true, sellerId: 'b', vehicleId: 'x', vehicleCatalogId: 3, vehicleLifeDays: 20, price: car * 5 });
  const news = [];
  const mig = createV195Migration({ db, FieldValue, log: { log() {}, warn() {}, error() {} }, announce: async (m) => news.push(m) });
  const r = await mig.run();
  assert.equal(r.vehiclesRead, 5);
  assert.equal(r.vehiclesCapped, 2);
  assert.equal(G('vehicles/c15').lifeDays, 10);
  assert.equal(G('vehicles/c15').repairsUsed, 4, 'tamir hakkı değişmez');
  assert.equal(G('vehicles/c10').lifeDays, 10);
  assert.equal(G('vehicles/c5').lifeDays, 5);
  assert.equal(G('vehicles/t18').lifeDays, 10);
  assert.equal(G('vehicles/m20').lifeDays, 20, 'motor dokunulmaz');
  assert.deepEqual(G('weapons/w9'), { ownerId: 'a', catalogId: 6, lifeDays: 9, repairsUsed: 0 });
  assert.equal(G('marketplaceListings/L1').vehicleLifeDays, 10);
  assert.equal(G('marketplaceListings/L1').price, Math.round(car * 0.8), 'fiyat yeni tavana çekildi');
  assert.equal(G('marketplaceListings/L2').price, 1000);
  assert.equal(G('marketplaceListings/L2').vehicleLifeDays, 20);
  assert.equal(G('marketplaceListings/L3').vehicleLifeDays, 20, 'satılmış ilana dokunulmaz');
  assert.equal(r.listingLifeFixed, 1);
  assert.equal(r.listingPriceCapped, 1);
  assert.equal(news.length, 1, 'tek genel duyuru');
  assert.ok(G('migrations/vehicleLifeCap10').doneAtMs);
  // ikinci çalıştırma: bayrak → hiçbir şey okunmaz
  const r2 = await mig.run();
  assert.equal(r2.skipped, true);
  // zorla tekrar: kurallar zaten uygulanmış → değişiklik yok, duyuru tekrarlanmaz
  const snap = JSON.stringify([...db._store.entries()].filter(([k]) => !k.startsWith('migrations/')).map(([k, v]) => [k, v.data]));
  const r3 = await mig.run({ force: true });
  assert.equal(r3.vehiclesCapped, 0);
  assert.equal(r3.listingsUpdated, 0);
  assert.equal(JSON.stringify([...db._store.entries()].filter(([k]) => !k.startsWith('migrations/')).map(([k, v]) => [k, v.data])), snap);
  assert.equal(news.length, 1);
});

test('v195 geçiş yamaları (saf): kapsam dışı ve sınır değerler', () => {
  assert.equal(vehiclePatchV195({ catalogId: 3, lifeDays: 10 }), null);
  assert.equal(vehiclePatchV195({ catalogId: 3, lifeDays: 11 }).lifeDays, 10);
  assert.equal(vehiclePatchV195({ catalogId: 24, lifeDays: 20 }), null);
  assert.equal(vehiclePatchV195({ catalogId: 3 }), null, 'ömür alanı yoksa dokunulmaz');
  assert.equal(listingPatchV195({ itemType: 'weapon', sold: false, weaponLifeDays: 20 }), null);
  assert.equal(listingPatchV195({ itemType: 'vehicle', sold: false, vehicleCatalogId: 3, vehicleLifeDays: 10, vehicleRepairsUsed: 0, price: 1 }), null);
});

test('v195 geçiş ASLA girişte / App.jsx\'ten çağrılmaz; sadece gizli anahtarlı URL', () => {
  const idx = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.equal(/createV195Migration|runV195MigrationNow|vehicleLifeCap10/.test(app), false);
  const uses = idx.split('createV195Migration(').length - 1;
  assert.equal(uses, 1, 'tek çağrı yeri');
  const at = idx.indexOf('createV195Migration({');
  const fn = idx.lastIndexOf('export const runV195MigrationNow', at);
  assert.ok(fn > 0 && at - fn < 1500, 'çağrı runV195MigrationNow içinde');
  // eski geçişler tarihî tavanla donduruldu (yeni 10 sabiti onları etkilemez)
  assert.match(idx, /const VEHICLE_WEAPON_INITIAL_LIFE_DAYS = LEGACY_LIFE_CAP_20;/);
});

// ---------------------------------------------------------------------------
// 2 — oyunun mağazasında satış sırası
// ---------------------------------------------------------------------------
test('v195 satış: eşit fiyat → BUGÜN en az kazanan; o da eşitse dün en az kazanan (bizRank)', async () => {
  const h = setup();
  const a = await stockedShop(h, 'usta', 90_000, { rank: 5 }); // dün en az kazanan ama bugün çok kazanmış
  const b = await stockedShop(h, 'veli', 90_000, { rank: 1 });
  earnedToday(h, a, 50_000);
  earnedToday(h, b, 1_000);
  const r = await h.shop.gameStoreBuy('ali', 'weapon', 6, 90_000);
  assert.equal(r.fromShop, true);
  assert.equal(h.G(`shopStocks/${b}`).items['6'], 0, 'bugün en az kazanan (veli) sattı');
  assert.equal(h.G(`shopStocks/${a}`).items['6'], 1);
  // kazanç tutarı herkese açık belgeye yazılmaz
  assert.equal(JSON.stringify(h.G(`houses/${b}`)).includes('revenue'), false);
  assert.equal(JSON.stringify(h.G('shopOffers/weapon')).includes('revenue'), false);
  // bugün eşit → dünkü sıra (rank 5 = daha az kazanan) kazanır
  const c = await stockedShop(h, 'can', 90_000, { rank: 2 });
  const d = await stockedShop(h, 'dan', 90_000, { rank: 7 });
  earnedToday(h, a, 0);
  earnedToday(h, c, 0);
  earnedToday(h, d, 0);
  await h.shop.gameStoreBuy('ali', 'weapon', 6, 90_000);
  assert.equal(h.G(`shopStocks/${d}`).items['6'], 0, 'bugün hepsi 0 → dün en az kazanan (rank 7)');
  // daha ucuz fiyat her zaman kazanır (bugün çok kazansa bile)
  const e = await stockedShop(h, 'eda', 85_000, { rank: 1 });
  earnedToday(h, e, 999_999);
  await h.shop.gameStoreBuy('ali', 'weapon', 6, 85_000);
  assert.equal(h.G(`shopStocks/${e}`).items['6'], 0);
});

test('v195 satış: pasif dükkân aday olmaz (teklifi silinir), alıcının kendi dükkânı atlanır, stok yoksa oyun satar', async () => {
  const h = setup();
  const p = await stockedShop(h, 'pasif', 80_000, { rank: 9 });
  const a = await stockedShop(h, 'usta', 90_000);
  h.S(`houses/${p}`, { ...h.G(`houses/${p}`), biz: { ...h.G(`houses/${p}`).biz, passive: true } });
  const r = await h.shop.gameStoreBuy('ali', 'weapon', 6, 90_000);
  assert.equal(r.fromShop, true);
  assert.equal(h.G(`shopStocks/${a}`).items['6'], 0);
  assert.equal(h.G(`shopStocks/${p}`).items['6'], 1, 'pasifin stoğu olduğu gibi');
  assert.equal(h.G('shopOffers/weapon').offers['6'][p], undefined, 'pasifin teklifi dizinden çıktı');
  // kendi dükkânı atlanır: usta kendi (tek) dükkânından değil oyundan alır
  await h.act('usta', { op: 'stockAdd', houseId: a, catalogId: 6 });
  const g = await h.shop.gameStoreBuy('usta', 'weapon', 6, 100_000);
  assert.equal(g.fromShop, false, 'kendi dükkânı atlandı → oyun sattı');
  assert.equal(h.G(`shopStocks/${a}`).items['6'], 1);
});

// ---------------------------------------------------------------------------
// 1 — pasif mekân
// ---------------------------------------------------------------------------
test('v195 pasiflik: 20 gün girmeyen → gizli + gelir yok; oyunun mekânı muaf; stok / para durur', async () => {
  const h = setup();
  const id = await stockedShop(h, 'usta', 90_000);
  const act = await stockedShop(h, 'veli', 95_000);
  h.seen('usta', 25);
  h.seen('veli', 3);
  const gold0 = h.G('users/usta').gold;
  await h.business.rollover(['silahci']);
  assert.equal(h.G(`houses/${id}`).biz.passive, true);
  assert.equal(isBizPassive(h.G(`houses/${id}`)), true, 'listeler bu bayrakla filtreler (useBusinessList)');
  assert.equal(h.G('users/usta').bizPassive, true);
  assert.equal(h.G(`houses/${act}`).biz.passive, undefined, '3 gün önce giren aktif');
  assert.equal(h.G('shopOffers/weapon').offers['6'][id], undefined);
  assert.equal(h.G(`shopStocks/${id}`).items['6'], 1, 'stok silinmez');
  assert.equal(h.G('users/usta').gold, gold0, 'para olduğu gibi');
  // aktif sahibin bir sonraki kontrolü girişinden 20 gün sonra (her gece giriş kaydı okunmaz)
  const next = h.G('bizIdle/silahci').next;
  assert.equal(next[act], h.clock.now - 3 * DAY + 20 * DAY);
  assert.equal(next[id], undefined);
  // oyunun mağazası pasifi görmez
  await h.shop.gameStoreBuy('ali', 'weapon', 6, 95_000);
  assert.equal(h.G(`shopStocks/${act}`).items['6'], 0);
  // doğrudan alım ve atölye de kapalı
  h.present('ali', id);
  await assert.rejects(h.act('ali', { op: 'stockBuy', houseId: id, catalogId: 6, expect: 90_000 }), (e) => e.message === BIZ_PASSIVE_TEXT);
  h.S('weapons/w1', { ownerId: 'ali', catalogId: 1, name: 'Tabanca', basePrice: 1000, basePower: 1000, power: 1000, level: 1, lifeDays: 5, repairsUsed: 0 });
  h.S('users/usta/inventory/tamirMalzemesi', { quantity: 100 });
  await assert.rejects(h.act('ali', { op: 'workshop', shop: id, itemId: 'w1', action: 'repair', expect: 130 }), (e) => e.message === BIZ_PASSIVE_TEXT);
  assert.equal(h.G('users/usta').gold, gold0, 'hiçbir yoldan para girmedi');
  assert.equal(h.keys(`businessDaily/${id}_`).length, 0);
  // oyunun kendi mekânları muaf
  assert.equal(isBizPassive({ bizGame: true, ownerUid: '__game__', biz: { type: 'spor', passive: true } }), false);
  assert.equal(isBizPassive({ ownerUid: '__game__', biz: { type: 'silahci', passive: true } }), false);
});

test('v195 pasiflik: girişte otomatik aktif — teklifler stoktan geri yazılır, bayrak kalkar, tekrar satar', async () => {
  const h = setup();
  const id = await stockedShop(h, 'usta', 90_000);
  h.seen('usta', 21);
  await h.business.rollover(['silahci']);
  assert.equal(h.G(`houses/${id}`).biz.passive, true);
  // giriş (initializePlayer): users belgesi zaten okunuyor; bayrak varsa açılır
  h.seen('usta', 0);
  const n = await h.business.reactivateOwner('usta');
  assert.equal(n, 1);
  assert.equal(h.G(`houses/${id}`).biz.passive, undefined);
  assert.equal(h.G('users/usta').bizPassive, undefined);
  assert.equal(h.G('shopOffers/weapon').offers['6'][id], 90_000, 'teklif stoktan geri yazıldı');
  const r = await h.shop.gameStoreBuy('ali', 'weapon', 6, 90_000);
  assert.equal(r.fromShop, true);
  assert.equal(h.G(`shopStocks/${id}`).items['6'], 0);
  // bayrağı olmayan oyuncuda giriş ek iş yapmaz (index.js: sadece bizPassive varsa çağrılır)
  const idx = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(idx, /bizPassive = Boolean\(snap\.exists && snap\.data\(\)\?\.bizPassive\);/);
  assert.match(idx, /if \(bizPassive\) \{\s*try \{\s*await business\.reactivateOwner\(uid\);/);
});

test('v195 pasiflik: depo ve ofis de pasif olur; ofis dizini ilk gece bir kez kurulur', async () => {
  const h = setup();
  const dep = await openShop(h, 'depo', 'depocu');
  h.S(`depots/${dep}`, { ownerUid: 'depocu', gold: 0, yasakliMadde: 5 });
  h.S('shopOffers/depo', { v: 1, offers: { [dep]: { p: 2250, s: 5, o: 'depocu' } } });
  h.S('houses/of1', { ownerUid: 'ofisci', kind: 'ofis', office: { keys: { bagiskutusu: true } }, items: [] });
  h.S('users/ofisci', { displayName: 'Ofisçi', gold: 0 });
  h.seen('depocu', 30);
  h.seen('ofisci', 40);
  await h.business.rollover(['depo', 'silahci']);
  assert.equal(h.G(`houses/${dep}`).biz.passive, true);
  assert.equal(h.G('shopOffers/depo').offers[dep], undefined);
  assert.equal(h.G(`depots/${dep}`).yasakliMadde, 5, 'depo malı durur');
  assert.equal(h.G('houses/of1').office.passive, true);
  assert.equal(isBizPassive(h.G('houses/of1')), true);
  assert.equal(h.G('bizIdle/ofis').v, 1);
  // geri açılış: depo teklifi stoktan yazılır
  h.seen('depocu', 0);
  await h.business.reactivateOwner('depocu');
  assert.deepEqual(h.G('shopOffers/depo').offers[dep], { p: 2250, s: 5, o: 'depocu' });
  await h.business.reactivateOwner('ofisci');
  assert.equal(h.G('houses/of1').office.passive, undefined);
  assert.equal(h.G('bizIdle/ofis').own.of1, 'ofisci', 'açılan ofis yeniden dizinde');
});

test('v195 pasiflik: recordIncomeTx\'e giden her yol kapalı (ödenmiş emanet hariç)', async () => {
  const h = setup();
  const h0 = { ownerUid: 'x', biz: { type: 'cafe', passive: true } };
  await assert.rejects(
    h.db.runTransaction(async (tx) => h.business.recordIncomeTx(tx, { houseId: 'hh', h: h0, amount: 100, kind: 'menu', customerUid: 'c' })),
    (e) => e.message === BIZ_PASSIVE_TEXT
  );
  assert.equal(h.keys('businessDaily/hh_').length, 0);
  // pasiflikten önce ödenmiş iş (kullanıcı kararı): tamamlanır
  await h.db.runTransaction(async (tx) => h.business.recordIncomeTx(tx, { houseId: 'hh', h: h0, amount: 100, kind: 'menu', customerUid: 'c', allowPassive: true }));
  assert.equal(h.keys('businessDaily/hh_').length, 1);
  // kaynak kodda recordIncomeTx kullanan her modül pasifi bu ortak kontrolden geçirir; gelir yolu olup
  // recordIncomeTx'e gitmeyenler (gazino, ofis) kendi kontrolünü yapar
  const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(src('casino.js'), /isBizPassive\(c\.h\)/);
  assert.match(src('office.js'), /if \(!gangHq && isBizPassive\(h\)\) fail/);
  assert.match(src('depo.js'), /isBizPassive\(dep\.h\)/);
  assert.match(src('gym.js'), /business\?\.assertBizOpen\?\.\(h\)/);
});

// ---------------------------------------------------------------------------
// 5 + 6 — futbol desteği, çete sipariş hakkı
// ---------------------------------------------------------------------------
test('v195 çete yasaklı madde: adet 1.250, üye başına 3 adet → 10 üye = 30 adet', () => {
  const unit = Math.floor(AMAZOR_PRICES.yasakliMadde * GANG.TRADE_ROUTE_BUY_RATIO);
  assert.equal(unit, 1250);
  assert.equal(GANG.CONTRABAND_ORDER_PER_MEMBER, 3750);
  assert.equal((10 * GANG.CONTRABAND_ORDER_PER_MEMBER) / unit, 30);
});

test('v195 futbol transfer desteği ×2; kasa tavanı = destek tavanı (birebir)', () => {
  const idx = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(idx, /const FUTBOL_TRANSFER_SUPPORT_UNIT = 40000;/);
  assert.match(idx, /const FUTBOL_TRANSFER_SUPPORT_CAP_MULT = 5;/);
  assert.match(idx, /function futbolTreasuryCap\(tier, leagueCount\) \{\s*return futbolTransferSupportCap\(tier, leagueCount\);/);
});
