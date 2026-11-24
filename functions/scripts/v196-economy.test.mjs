// v196 — ekonomi kuralları: mekân geliri (50 masraf / vergi / hissedar), çift vergi yok, oyunun mağazası tam
// fiyat, atölye %10 / %100, cafe-bar menüsü, internet kafe dakikası, salon 1.000, depo 2.000, çete siparişi
// (1.000 / %25) ve tırın otomatik satışı, elmas makinesi, Borsa mekân hissesi + hediye hisse sınırı,
// belediye kalemleri, yeni oyuncu parası. Çalıştır: node --test functions/scripts/v196-economy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createBusiness, GAME_VENUE_TYPES } from '../business.js';
import { createShop } from '../shop.js';
import { createVenue } from '../venue.js';
import { WEAPON_CATALOG, VEHICLE_CATALOG } from '../catalogData.js';
import { venueIncomeSplit, VENUE_SHARE_TYPES, VENUE_CO_ID, VENUE_CO_SK, MENU_PRICES, diamondMachinePriceOf, diamondFleetValueOf, GAME_VENUE_HOUSES, NEW_PLAYER_GOLD, REFERRAL_NEW_PLAYER_BONUS_V196, v196WorkshopPrice } from '../v196Shared.js';
import { BORSA_COS, collectTaxFrac, buyRoom, BORSA_UNITS } from '../borsa.js';
import { GAME_DEPO_PRICES } from '../depo.js';
import { GAME_GYM_PRICE } from '../gym.js';
import { SLOT_GAME_COST, GAME_SLOT_STATE_CUT, GAME_LOTTERY_CUT } from '../casinoRules.js';
import { DEFAULT_RATES, RATE_ITEMS, bizRateFrac } from '../belediyeRates.js';
import { workshopJob } from '../itemRules.js';
import { createHarness, setupGang } from '../gang/test/harness.js';
import { GANG } from '../gang/config.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const splitIncomeForDebt = (debt, amount) => ({ goldDelta: amount, debtDelta: 0 });
const statSum = (db, key) => Object.values(db._dump('stateLedger/')).reduce((a, d) => a + Number(d.stat?.[key] || 0), 0);
const taxSum = (db) => Object.values(db._dump('stateLedger/')).reduce((a, d) => a + Number(d.in?.vergi_isletme || d.in?.vergi_isl || 0), 0);

function world({ rate = 0.1 } = {}) {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._get(p);
  const clock = { now: Date.UTC(2026, 10, 24, 9) };
  const now = () => clock.now;
  const business = createBusiness({ db, FieldValue, HttpsError, now, venueTaxFrac: () => rate, log: { log() {}, error() {}, warn() {} } });
  const venue = createVenue({ db, FieldValue, HttpsError, splitIncomeForDebt, business, now });
  const shop = createShop({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, splitIncomeForDebt, business, now, extraOps: venue.ops });
  const act = (uid, data) => shop.shopAction({ auth: { uid }, data });
  S('users/ali', { displayName: 'Ali', gold: 10_000_000 });
  return { db, S, G, clock, business, shop, venue, act };
}

test('mekân geliri: 100 → 50 masraf, %10 vergi → 40 hissedar; vergi sınırı %50', () => {
  assert.deepEqual(venueIncomeSplit(100, 0.1), { gross: 100, expense: 50, tax: 10, share: 40 });
  assert.deepEqual(venueIncomeSplit(100, 0.2), { gross: 100, expense: 50, tax: 20, share: 30 });
  assert.deepEqual(venueIncomeSplit(100, 0.5), { gross: 100, expense: 50, tax: 50, share: 0 });
  assert.deepEqual(venueIncomeSplit(100, 0.9), { gross: 100, expense: 50, tax: 50, share: 0 }, 'en fazla %50');
  assert.deepEqual(venueIncomeSplit(0, 0.1), { gross: 0, expense: 0, tax: 0, share: 0 });
  // belediye: kalemlerin aralığı değişmedi (%1–20)
  for (const id of ['isSilahci', 'isGaleri', 'isMotoGaleri', 'isModifiye', 'isSpor', 'isKafe', 'isBar', 'isInternet']) {
    const it = RATE_ITEMS.find((x) => x.id === id);
    assert.ok(it, id);
    assert.equal(it.max(DEFAULT_RATES), 20);
  }
  assert.equal(bizRateFrac(DEFAULT_RATES, 'gazino'), 0);
  assert.equal(bizRateFrac(DEFAULT_RATES, 'depo'), 0);
  assert.deepEqual(GAME_VENUE_TYPES, VENUE_SHARE_TYPES);
});

test('oyunun silahçısı: tam fiyat, gelir paylaşımı defterde, eski sıfır satış vergisi YOK (çift vergi yok)', async () => {
  const w = world();
  const r = await w.shop.gameStoreBuy('ali', 'weapon', 1, WEAPON_CATALOG[1].price);
  const p = WEAPON_CATALOG[1].price;
  assert.equal(r.price, p);
  assert.equal(w.G('users/ali').gold, 10_000_000 - p);
  const sp = venueIncomeSplit(p, 0.1);
  assert.equal(r.tax, sp.tax);
  assert.equal(statSum(w.db, `hs_${VENUE_CO_SK.silahci}`), sp.share, 'hissedar payı Borsa gelir sayacına');
  const daily = Object.entries(w.db._dump('businessDaily/')).find(([k]) => k.startsWith('businessDaily/game_silahci_'))[1];
  assert.equal(daily.revenue, p);
  assert.equal(daily.tax, sp.tax);
  const ledger = Object.values(w.db._dump('stateLedger/'));
  const inTotal = ledger.reduce((a, d) => a + Number(d.inTotal || 0), 0);
  assert.equal(inTotal, sp.tax, 'devlete sadece mekân vergisi (bir kez)');
  // galeri / motor galerisi
  const vid = Object.keys(VEHICLE_CATALOG).find((c) => VEHICLE_CATALOG[c].price > 0 && Number(c) <= 10);
  const rv = await w.shop.gameStoreBuy('ali', 'vehicle', vid, VEHICLE_CATALOG[vid].price);
  assert.equal(rv.price, VEHICLE_CATALOG[vid].price);
  assert.ok(statSum(w.db, `hs_${VENUE_CO_SK.galeri}`) > 0);
});

test('atölye: tamir = ürün fiyatının %10\'u, geliştirme = tamamı; işçilik yok; malzeme sınırsız', async () => {
  const w = world();
  const p = WEAPON_CATALOG[1].price;
  w.S('weapons/w1', { ownerId: 'ali', catalogId: 1, level: 1, basePower: 10, lifeDays: 1, repairsUsed: 0 });
  const job = workshopJob({ itemType: 'weapon', item: w.G('weapons/w1'), action: 'repair' });
  const repair = v196WorkshopPrice(job);
  assert.equal(repair, Math.round(p / 100) * 10);
  assert.ok(Math.abs(repair - p * 0.1) <= 10);
  const r = await w.act('ali', { op: 'workshop', shopType: 'silahci', itemId: 'w1', action: 'repair', expect: repair });
  assert.equal(r.total, repair);
  assert.equal(r.labor, 0);
  const up = v196WorkshopPrice(workshopJob({ itemType: 'weapon', item: w.G('weapons/w1'), action: 'upgrade' }));
  assert.ok(Math.abs(up - p) <= 100, 'geliştirme ≈ ürün fiyatı');
  const r2 = await w.act('ali', { op: 'workshop', shopType: 'silahci', itemId: 'w1', action: 'upgrade', expect: up });
  assert.equal(r2.total, up);
  assert.equal(w.G('weapons/w1').level, 2);
  // eski istemci oyuncu dükkânı göndermiş olsa bile oyunun atölyesi
  await assert.rejects(() => w.act('ali', { op: 'stockAdd' }), /işletmeleri kapandı/);
});

test('cafe / bar: sabit menü, günlük 10.000 sınırı, gelir paylaşımı; oyuncu mekânı yok', async () => {
  const w = world();
  await w.venue.venueEnsureGame();
  assert.ok(w.G('houses/game_cafe').bizGame);
  const r = await w.act('ali', { op: 'menuBuy', houseId: 'game_cafe', product: 'kahve', expect: MENU_PRICES.kahve });
  assert.equal(r.price, 100);
  assert.equal(statSum(w.db, `hs_${VENUE_CO_SK.cafe}`), 40);
  await assert.rejects(() => w.act('ali', { op: 'menuBuy', houseId: 'game_bar', product: 'kahve', expect: 50 }), /price-changed/);
  for (let i = 0; i < 20; i++) await w.act('ali', { op: 'menuBuy', houseId: 'game_bar', product: 'viski', expect: 500 });
  await assert.rejects(() => w.act('ali', { op: 'menuBuy', houseId: 'game_bar', product: 'viski', expect: 500 }), /limit/);
  w.S('houses/p1', { ownerUid: 'veli', biz: { type: 'cafe' }, items: [] });
  await assert.rejects(() => w.act('ali', { op: 'menuBuy', houseId: 'p1', product: 'kahve', expect: 100 }), /işletmeleri kapandı/);
  assert.equal(MENU_PRICES.cay, 50);
  assert.equal(MENU_PRICES.viski, 500);
});

test('internet kafe: oyun dakikası 100, yayın bilgisayarı 200; gelir oyuna', async () => {
  const w = world();
  await w.venue.venueEnsureGame();
  const items = GAME_VENUE_HOUSES.internet.items;
  const r = await w.act('ali', { op: 'netStart', houseId: 'game_internet', itemId: 'npc1', expect: 100 });
  assert.equal(r.charged, 100);
  assert.equal(statSum(w.db, `hs_${VENUE_CO_SK.internet}`), 40);
  const r2 = await w.act('ali', { op: 'netStart', houseId: 'game_internet', itemId: 'nspc', expect: 200 });
  assert.equal(r2.price, 200, 'yayın seti bilgisayarı 200');
  assert.ok(items.some((x) => x.k === 'console'));
});

test('sabit fiyatlar: salon 1.000, depo 2.000 (güvenli satış 2.500 kalır), slot 1.400 (devlete 0), piyango kesintisiz', () => {
  assert.equal(GAME_GYM_PRICE, 1000);
  assert.equal(GAME_DEPO_PRICES.sell, 2000);
  assert.equal(GAME_DEPO_PRICES.buy, 1500);
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.ok(src.includes('const PARK_SAFE_SELL_PRICE = 2500;') && src.includes('const PARK_SAFE_GANG_CUT = 500;'));
  assert.equal(SLOT_GAME_COST, 1400);
  assert.equal(GAME_SLOT_STATE_CUT, 0);
  assert.equal(GAME_LOTTERY_CUT, 0);
});

test('Borsa: 8 mekân hissesi; toplarken mekân payına hisse vergisi kesilmez; hediye hisse sınırı aşar ama hata yok', () => {
  const ids = BORSA_COS.filter((c) => c.kind === 'mekan').map((c) => c.id);
  assert.deepEqual(ids.sort(), Object.values(VENUE_CO_ID).sort());
  assert.equal(collectTaxFrac({ [VENUE_CO_ID.bar]: 100 }, 0.1), 0);
  assert.equal(collectTaxFrac({ simitci: 100 }, 0.1), 0.1);
  assert.equal(collectTaxFrac({ [VENUE_CO_ID.bar]: 50, simitci: 50 }, 0.1), 0.05);
  // 10 hediye hisse, piyasada sadece 10 satılmış: alım sınırı dolu (0), ama negatif / hata yok
  assert.equal(buyRoom(10 * BORSA_UNITS, 10 * BORSA_UNITS), 0);
  // başkaları alınca yer açılır (S büyüdükçe)
  assert.ok(buyRoom(10 * BORSA_UNITS, 1000 * BORSA_UNITS) > 0);
});

test('elmas makinesi: fiyat 20 elmas, 10 makinede bir +2; filo değeri', () => {
  assert.equal(diamondMachinePriceOf(0, 10_000), 200_000);
  assert.equal(diamondMachinePriceOf(10, 10_000), 220_000);
  assert.equal(diamondFleetValueOf(2, 10_000), 400_000);
  assert.equal(diamondFleetValueOf(11, 10_000), 10 * 200_000 + 220_000);
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.ok(src.includes('* DIAMOND_PROD_FACTOR'), 'üretim kriptonun 10 katı');
  assert.ok(src.includes("where('dm.trig', '==', prevDateKey)"), 'tek sorgu, makine başı belge yok');
  assert.ok(src.includes('addElectricity(factoryId, Math.round(value * MINING_ELECTRICITY_RATE))'), 'elektrik %30');
});

test('fabrika: Çalış butonu günde 1 kez 5.000 (dailyActions); işçi sistemi kibar ret; kurulum 2 kripto + 2 elmas', () => {
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const fw = src.slice(src.indexOf('export const factoryWork'), src.indexOf('export const factoryWork') + 1500);
  assert.ok(fw.includes("collection('dailyActions').doc(`${uid}_${dateKey}`)") && fw.includes('factoryWork: true') && fw.includes('WORK_BUTTON_REWARD'));
  assert.ok(fw.includes('advanceOnboardingStep(uid, 1)'));
  for (const n of ['setFactorySalary', 'joinFactoryMachine', 'autoJoinFactory', 'produceAtFactory', 'listFactoryShare', 'buyFactoryShare']) {
    const b = src.slice(src.indexOf(`export const ${n} =`), src.indexOf(`export const ${n} =`) + 220);
    assert.ok(b.includes('FACTORY_WORKER_GONE') || b.includes('FACTORY_SHARE_GONE'), n);
  }
  assert.ok(src.includes("const FACTORY_STARTER_MACHINES = ['mining', 'mining'];"));
});

test('yeni oyuncu 5.000, referansla 10.000', () => {
  assert.equal(NEW_PLAYER_GOLD, 5000);
  assert.equal(NEW_PLAYER_GOLD + REFERRAL_NEW_PLAYER_BONUS_V196, 10000);
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.ok(src.includes('gold: NEW_PLAYER_GOLD,'));
  assert.ok(src.includes('const REFERRAL_NEW_PLAYER_BONUS = REFERRAL_NEW_PLAYER_BONUS_V196;'));
});

// ---- ÇETE ------------------------------------------------------------------------------
async function tradeGang(h) {
  const G = await setupGang(h, { members: 4, name: 'Alfa' });
  for (const [i, p, r] of [[0, 5_000_000, 'sagkol'], [3, 4_000_000, 'sagkol'], [1, 2_000_000, 'kidemli'], [2, 1_000_000, 'kidemli']]) {
    await h.setPrestige(G.gangId, G.ids[i], p);
    await h.setRank(G.gangId, G.ids[i], r);
  }
  await h.fundKasa(G.gangId, 5_000_000);
  return G;
}
const kasaOf = (h, gangId) => h.get(`gangs/${gangId}/private/state`).kasa;

test('çete: yasaklı madde 1.000, üye × 3.000 hak; silah / araba %25; depo kapasitesi gerekmez', async () => {
  assert.equal(GANG.CONTRABAND_ORDER_PER_MEMBER, 3000);
  assert.equal(GANG.TRADE_ROUTE_BUY_RATIO, 0.25);
  assert.equal(GANG.CONTRABAND_ORDER_PRICE, 1000);
  const h = await createHarness();
  const G = await tradeGang(h);
  const { truckId } = await h.act(G.baba, 'buyTruck');
  const k0 = kasaOf(h, G.gangId);
  // 4 üye (00:00 kaydı yok → anlık üye sayısı) × 3.000 = 12.000 = 12 adet
  const members = h.get(`gangs/${G.gangId}`).memberCount;
  const ok = await h.act(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: members * 3 } });
  assert.ok(ok);
  assert.equal(k0 - kasaOf(h, G.gangId), members * 3 * 1000);
  await assert.rejects(() => h.act(G.baba, 'buyDepot'), /Depo kapasitesi kalktı/);
});

test('çete: tır ulaşınca otomatik satış — yasaklı madde 1.500, silah / araba %50; para kasaya, sohbete mesaj', async () => {
  const h = await createHarness();
  const G = await tradeGang(h);
  await h.giveRoute(G.gangId, 'araba', 1_000_000);
  const { truckId } = await h.act(G.baba, 'buyTruck');
  const price = VEHICLE_CATALOG[1].price;
  const k0 = kasaOf(h, G.gangId);
  await h.act(G.baba, 'placeOrder', { truckId, product: 'araba', items: { 'araba:1': 4 } });
  assert.equal(k0 - kasaOf(h, G.gangId), 4 * Math.floor(price * 0.25), 'sipariş %25');
  const k1 = kasaOf(h, G.gangId);
  await h.tickTo('2026-09-21', '12:02');
  await h.tickTo('2026-09-22', '00:05');
  assert.equal(kasaOf(h, G.gangId) - k1, 4 * Math.floor(price * 0.5), 'otomatik satış %50');
  assert.ok(h.chat(G.gangId).some((m) => /Siparişlerden [\d.]+ altın kazandınız/.test(m)));
  assert.equal(h.get(`trucks/${truckId}`).status, 'idle');
  // sınır korunur: savaş limitinden fazla sipariş yok
  h.at('2026-09-22', '07:30');
  await assert.rejects(() => h.act(G.baba, 'placeOrder', { truckId, product: 'araba', items: { 'araba:10': 10 } }), /limit/i);
});
