// v124 — Malzeme sistemi (functions/materials.js) + geçiş adımları + işletme kapatma kuralı
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { usableMaterials, closeBlockMaterials, buyoutValue, readHoldings } from '../materials.js';
import { createV124Migrations } from '../v124Migrations.js';
import { createHouses } from '../houses.js';
import { createShop } from '../shop.js';
import { createBusiness } from '../business.js';
import { BIZ_TYPES } from '../businessCatalogData.js';
import { goldTag } from '../moneyLog.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const mkdb = () => {
  const db = new FakeFirestore({ yieldEvery: false });
  return { db, S: (p, d) => db._store.set(p, { data: d, version: 1 }), G: (p) => db._store.get(p)?.data };
};

test('kim neyi tutar: fabrika hepsi · silahçı tamir + silah · modifiye tamir + araba · hiçbiri yok', () => {
  assert.deepEqual([...usableMaterials({ hasFactory: true })].sort(), ['arabaGelistirme', 'silahUpgrade', 'tamirMalzemesi']);
  assert.deepEqual([...usableMaterials({ bizTypes: ['silahci'] })].sort(), ['silahUpgrade', 'tamirMalzemesi']);
  assert.deepEqual([...usableMaterials({ bizTypes: ['modifiye'] })].sort(), ['arabaGelistirme', 'tamirMalzemesi']);
  assert.equal(usableMaterials({}).size, 0);
  assert.equal(buyoutValue('tamirMalzemesi', 101), 757, '101 × 10 × 0,75 = 757,5 → 757');
  assert.equal(buyoutValue('arabaGelistirme', 2), 750);
});

test('kapatma kuralı (kullanıcı örnekleri)', () => {
  const inv = { tamirMalzemesi: 5, silahUpgrade: 3, arabaGelistirme: 0 };
  // fabrika + silahçı → silahçı kapanır (fabrika her şeyi tutar)
  assert.deepEqual(closeBlockMaterials({ hasFactory: true, bizTypes: [] }, inv), []);
  // sadece silahçı → tamir + silah satılmalı
  assert.deepEqual(closeBlockMaterials({ hasFactory: false, bizTypes: [] }, inv), ['tamirMalzemesi', 'silahUpgrade']);
  // modifiye + silahçı, silahçı kapanıyor → tamir kalabilir, sadece silah geliştirme satılmalı
  assert.deepEqual(closeBlockMaterials({ hasFactory: false, bizTypes: ['modifiye'] }, inv), ['silahUpgrade']);
});

test('sahiplik okuma: kapanan işletme sayılmaz', async () => {
  const { db, S } = mkdb();
  S('factories/f', { ownerName: 'F' });
  S('houses/h1', { ownerUid: 'u', biz: { type: 'silahci' } });
  S('houses/h2', { ownerUid: 'u', biz: { type: 'modifiye' } });
  S('houses/h3', { ownerUid: 'u', biz: { type: 'cafe' } });
  assert.deepEqual(await readHoldings(db, 'u'), { hasFactory: false, bizTypes: ['silahci', 'modifiye'] });
  assert.deepEqual(await readHoldings(db, 'u', { excludeHouseId: 'h1' }), { hasFactory: false, bizTypes: ['modifiye'] });
  assert.equal((await readHoldings(db, 'f')).hasFactory, true);
});

test('geçiş: malzeme + makine ilanları iade, işletme envanteri taşınır, yeri olmayan malzeme %75 ile alınır; hepsi tek seferlik', async () => {
  const { db, S, G } = mkdb();
  S('users/fab', { gold: 0 }); // fabrikası var
  S('factories/fab', { ownerName: 'Fab' });
  S('users/silah', { gold: 0 }); // sadece silahçı
  S('houses/hs', { ownerUid: 'silah', biz: { type: 'silahci' } });
  S('users/yok', { gold: 0 }); // hiçbir şeyi yok
  S('users/fabsiz', { gold: 0 }); // makine ilanı var, fabrikası yok
  // ilanlar
  S('marketplaceListings/m1', { sellerId: 'yok', itemType: 'material', materialType: 'tamirMalzemesi', quantity: 100, sold: false });
  S('marketplaceListings/m2', { sellerId: 'system', itemType: 'material', materialType: 'silahUpgrade', quantity: 50, sold: false });
  S('marketplaceListings/m3', { sellerId: 'silah', itemType: 'material', materialType: 'arabaGelistirme', quantity: 4, sold: false });
  S('marketplaceListings/k1', { sellerId: 'fab', itemType: 'machine', machineType: 'tamirMalzemesi', price: 40_000, sold: false });
  S('marketplaceListings/k2', { sellerId: 'fabsiz', itemType: 'machine', machineType: 'tamirMalzemesi', price: 40_000, sold: false });
  // işletme envanteri (silahçı) + oyuncu envanterleri
  S('businessInventories/hs', { ownerUid: 'silah', type: 'silahci', materials: { tamirMalzemesi: 30, silahUpgrade: 5 } });
  S('users/silah/inventory/silahUpgrade', { quantity: 2 });
  S('users/yok/inventory/silahUpgrade', { quantity: 10 });
  S('users/yok/inventory/yasakliMadde', { quantity: 7 });
  S('users/fab/inventory/arabaGelistirme', { quantity: 9 });
  const m = createV124Migrations({ db, FieldValue, goldTag, log: () => {}, machineRefund: (l) => Math.min(l.price, 50_000) });
  const r = await m.runAll({});
  assert.ok(!Object.values(r).some((x) => x?.error), JSON.stringify(r));
  // ilanlar kapandı
  for (const id of ['m1', 'm2', 'm3', 'k1', 'k2']) assert.equal(G(`marketplaceListings/${id}`).cancelled, true, id);
  // makine: fabrikası olana geri, olmayana ilan fiyatı
  const facMachines = [...db._store.keys()].filter((k) => k.startsWith('factories/fab/machines/'));
  assert.equal(facMachines.length, 1);
  assert.equal(G('users/fabsiz').gold, 40_000);
  // fabrika sahibi: her şeyini tutar
  assert.equal(G('users/fab/inventory/arabaGelistirme').quantity, 9);
  assert.equal(G('users/fab').gold, 0);
  // silahçı: işletme envanteri ortak envantere taşındı (30 tamir, 5+2 silah); ilandaki 4 araba malzemesi tutulamaz → %75
  assert.equal(G('users/silah/inventory/tamirMalzemesi').quantity, 30);
  assert.equal(G('users/silah/inventory/silahUpgrade').quantity, 7);
  assert.equal(G('users/silah/inventory/arabaGelistirme').quantity, 0);
  assert.equal(G('users/silah').gold, buyoutValue('arabaGelistirme', 4));
  assert.deepEqual(G('businessInventories/hs').materials, {});
  // hiçbir şeyi yok: ilandan dönen 100 tamir + 10 silah → %75; yasaklı madde dokunulmaz
  assert.equal(G('users/yok').gold, buyoutValue('tamirMalzemesi', 100) + buyoutValue('silahUpgrade', 10));
  assert.equal(G('users/yok/inventory/tamirMalzemesi').quantity, 0);
  assert.equal(G('users/yok/inventory/yasakliMadde').quantity, 7);
  const sms = [...db._store.keys()].filter((k) => k.startsWith('users/yok/messages/')).map((k) => G(k));
  assert.ok(sms.some((x) => x.type === 'materials_buyout' && /%75/.test(x.text)));
  // ikinci çalışma: bayraklar → hiçbir şey; bayraklar silinse bile çift ödeme yok
  const gold = G('users/yok').gold;
  await m.runAll({});
  for (const k of [...db._store.keys()].filter((x) => x.startsWith('migrations/'))) db._store.delete(k);
  await m.runAll({});
  assert.equal(G('users/yok').gold, gold);
  assert.equal(G('users/silah/inventory/tamirMalzemesi').quantity, 30);
  assert.equal([...db._store.keys()].filter((k) => k.startsWith('factories/fab/machines/')).length, 1);
});

test('işletme kapatma: kalanların kullanamayacağı malzeme varsa kapanmaz; durum ekranı önceden söyler', async () => {
  const { db, S } = mkdb();
  const clock = { now: Date.UTC(2026, 9, 7, 9) };
  const now = () => clock.now;
  const business = createBusiness({ db, FieldValue, now });
  const shop = createShop({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, splitIncomeForDebt: (d, a) => ({ goldDelta: a, debtDelta: 0 }), business, now });
  const houses = createHouses({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, isAdmin: () => false, assertCanSpeak: async () => {}, isFriend: async () => false, now, bizHooks: shop.bizHooks });
  const hact = (uid, data) => houses.houseAction({ auth: { uid }, data });
  S('users/u', { displayName: 'U', gold: 5_000_000, emerald: 500 });
  let seq = 0;
  const it = (k) => ({ i: `y${(seq++).toString(36)}`, k, x: 0, z: 0, r: 0, c: 0, p: 1 });
  async function open(type) {
    const { houseId } = await hact('u', { op: 'buy', bizIntent: type });
    const items = [];
    BIZ_TYPES[type].groups.forEach((g) => {
      for (let n = 0; n < g.n; n++) items.push(it(g.any[0]));
    });
    S(`houses/${houseId}`, { ...db._store.get(`houses/${houseId}`).data, items });
    await hact('u', { op: 'bizOpen', houseId, type });
    return houseId;
  }
  const silah = await open('silahci');
  const mod = await open('modifiye');
  S('users/u/inventory/tamirMalzemesi', { quantity: 5 });
  S('users/u/inventory/silahUpgrade', { quantity: 3 });
  // silahçı kapanırsa silah geliştirme malzemesini modifiye tutamaz
  const st = await hact('u', { op: 'bizStatus', houseId: silah });
  assert.deepEqual((st.data || st).materialBlock, ['silahUpgrade']);
  await assert.rejects(hact('u', { op: 'bizClose', houseId: silah }), /biz-close-materials:silahUpgrade/);
  // malzeme satılınca kapanır; tamir malzemesi modifiyede kullanılır → engel değil
  S('users/u/inventory/silahUpgrade', { quantity: 0 });
  // Mağaza'da açık ilanı varsa da kapanmaz (iptal edince envantere döner)
  S('marketplaceListings/ml', { sellerId: 'u', itemType: 'material', materialType: 'silahUpgrade', quantity: 2, sold: false });
  await assert.rejects(hact('u', { op: 'bizClose', houseId: silah }), /biz-close-materials:silahUpgrade/);
  S('marketplaceListings/ml', { sellerId: 'u', itemType: 'material', materialType: 'silahUpgrade', quantity: 0, sold: true });
  await hact('u', { op: 'bizClose', houseId: silah });
  // modifiye (son işletme) kapanırsa tamir malzemesi satılmalı
  await assert.rejects(hact('u', { op: 'bizClose', houseId: mod }), /biz-close-materials:tamirMalzemesi/);
  // fabrika varsa serbest
  S('factories/u', { ownerName: 'U' });
  await hact('u', { op: 'bizClose', houseId: mod });
  void Timestamp;
});

test('index.js: Mağaza alıcı/satıcı kontrolü, malzeme vergisi yok, makine satışı yok, eski tamir/geliştirme kapalı', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const sec = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
  const create = sec('export const createListing', 'export const instantSellListing');
  assert.ok(create.includes('canUseMaterial(await readHoldings(db, uid), materialType)'));
  assert.ok(create.includes('MACHINE_SALE_TEXT'));
  const buy = src.slice(src.indexOf('export const buyListing')).slice(0, 4000);
  assert.ok(buy.includes("pre?.itemType === 'machine'") && buy.includes('MATERIAL_HOLDER_TEXT'));
  assert.ok(src.includes('const saleTax = isSystemListing || isMaterial ? 0 : resaleTax(cost, listing.itemType);'));
  for (const f of ['upgradeVehicle', 'upgradeWeapon', 'repairItem', 'sellMaterial', 'sellSilahMaterial']) {
    const body = src.slice(src.indexOf(`export const ${f} = onCall`)).slice(0, 400);
    assert.ok(body.includes('Bu işlem kaldırıldı'), f);
  }
});

test('istemci (v124 4b): 2. el sadece araç+silah, Mağaza ayrı, fabrikada Envanter, hisse satışı kapalı', () => {
  const rd = (p) => fs.readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
  const mk = rd('components/MarketplaceScreen/MarketplaceScreen.jsx');
  const cats = mk.slice(mk.indexOf('const CATEGORIES = ['), mk.indexOf('];', mk.indexOf('const CATEGORIES = [')));
  assert.ok(!cats.includes("'material'") && !cats.includes("'machine'"));
  assert.ok(mk.includes('export function MagazaScreen') && !mk.includes('runMergeLegacyMaterialListings'));
  const fac = rd('components/FactoryScreen/FactoryScreen.jsx');
  assert.ok(fac.includes('📦 Envanter') && !fac.includes('Hisse Sat\n') && !fac.includes('useListedFactoryShares'));
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  for (const f of ['listFactoryShare', 'buyFactoryShare']) {
    const body = src.slice(src.indexOf(`export const ${f} = onCall`)).slice(0, 300);
    assert.ok(body.includes('SHARE_SALES_CLOSED'), f);
  }
  const wk = rd('components/Workshop/Workshop.jsx');
  assert.ok(!wk.includes('Gerekli:') && !wk.includes('businessInventories'));
});
