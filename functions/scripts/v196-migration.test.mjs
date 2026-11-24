// v196 — tek seferlik geçiş: dryRun / apply / iade defteri / elmas makinesi / hediye hisse / karargah.
// Çalıştır: node --test functions/scripts/v196-migration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createV196Migration, convertMachines, diamondMachinePrice, buildPlan, summarySms, materialBuyout, tieredFleetValueV196, V196_PAYOUTS } from '../v196Migration.js';
import { V196_ITEM_PRICES } from '../v196Prices.js';
import { VENUE_CO_ID, diamondMachinePriceOf, isRemovedKey } from '../v196Shared.js';
import { WEAPON_CATALOG, VEHICLE_CATALOG } from '../catalogData.js';

const catalogs = { WEAPON_CATALOG, VEHICLE_CATALOG };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 24, 9);

function world() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._get(p);
  const clock = { now: T0 };
  const mig = createV196Migration({ db, FieldValue, catalogs, now: () => clock.now, log: { log() {}, warn() {}, error() {} } });
  // oyuncular
  S('users/ali', { displayName: 'Ali', gold: 1000, emerald: 1, houseCount: 2, stockHoldings: 3, stockCostBasis: 30000 });
  S('users/ayse', { displayName: 'Ayşe', gold: 0, emerald: 0, houseCount: 1 });
  S('users/can', { displayName: 'Can', gold: 50 });
  S('investments/current', { diamondPrice: 10000, stockPrice: 12000, cryptoPrice: 100000 });
  // Ali: ev (satın alınmış + deneme eşya) + silahçı (kapanıştan önce açılmış)
  S('houses/h1', { ownerUid: 'ali', name: 'Ali Evi', items: [{ i: 'a', k: 'sofa3', p: 1 }, { i: 'b', k: 'chester', p: 1 }, { i: 'c', k: 'sofa2' }] });
  S('houses/h2', { ownerUid: 'ali', name: 'Silahçı', biz: { type: 'silahci', openedAtMs: T0 - 5 * DAY }, bizType: 'silahci', items: [] });
  // Ayşe: cafe (kapanıştan SONRA açılmış → hediye hisse yok) + mobilya kasası
  S('houses/h3', { ownerUid: 'ayse', biz: { type: 'cafe', openedAtMs: T0 + DAY }, items: [] });
  S('houseFunds/h3', { ownerUid: 'ayse', gold: 7000, gem: 2 });
  // oyunun mekânı + karargah (dokunulmaz / sadece kaldırılan eşya)
  S('houses/game_silahci', { ownerUid: '__game__', bizGame: true, items: [{ i: 'z', k: 'sofa3', p: 1 }] });
  S('houses/hq1', { ownerUid: 'gang_g1', hq: { worldId: 'w1', gangId: 'g1' }, door: { w: 2, x: 0, t: 'market', def: true, main: null }, items: [{ i: 'q', k: 'ring', p: 1 }, { i: 'r', k: 'sofa3', p: 1 }] });
  S('gangWorlds/w1/gangs/g1/private/state', { kasa: 100 });
  S('gangWorlds/w1/gangs/g1/private/depot', { items: { yasakliMadde: 4, 'silah:1': 1 }, listed: {}, capacity: 200 });
  S('gangWorlds/w1/market/m1', { gangId: 'g1', status: 'open', itemKey: 'yasakliMadde', quantity: 1 });
  // envanter: eşya + kaplama
  S('houseInventories/ali', { items: { armchair: 2 }, walls: ['tugla', 'boya_gri'], floors: ['parke_mese'] });
  // mobilya pazarı (ilan fiyatı şişirilmiş, mağaza fiyatı ödenir)
  S('furnListings/f1', { sellerUid: 'can', k: 'sofa2', t: 'gold', v: 99_000_000, status: 'open' });
  // dükkân stoğu
  S('shopStocks/h2', { ownerUid: 'ali', type: 'silahci', items: { 1: 2 }, paid: { 1: 750000 } });
  // malzemeler + açık malzeme ilanı
  S('users/ali/inventory/tamirMalzemesi', { quantity: 100 });
  S('users/ali/inventory/yasakliMadde', { quantity: 3 });
  S('marketplaceListings/l1', { sellerId: 'can', itemType: 'material', materialType: 'silahUpgrade', quantity: 10, sold: false });
  // fabrika: 10 tamir makinesi
  S('factories/ali', { ownerId: 'ali' });
  for (let i = 0; i < 10; i++) S(`factories/ali/machines/m${i}`, { type: 'tamirMalzemesi' });
  S('factories/ali/machines/mm', { type: 'mining' });
  // oyuncu deposu
  S('depots/hx', { ownerUid: 'ayse', gold: 500, yasakliMadde: 2 });
  return { db, S, G, clock, mig };
}

async function closeAndBackup(w) {
  await w.mig.close();
  await w.mig.recordBackup({ path: 'gs://test/yedek', manual: true });
}

test('elmas makinesi fiyatı: 20 elmas değeri, her 10 makinede +2', () => {
  assert.equal(diamondMachinePrice(0, 10000), 200000);
  assert.equal(diamondMachinePrice(9, 10000), 200000);
  assert.equal(diamondMachinePrice(10, 10000), 220000);
  assert.equal(diamondMachinePrice(25, 10000), 240000);
  assert.equal(diamondMachinePriceOf(0, 0), 0);
});

test('makine dönüşümü: tek havuz, kademeli, artan para iade', () => {
  // makinesi yok
  assert.deepEqual(convertMachines({}, 10000), { value: 0, machines: 0, refund: 0 });
  // tek tür: 10 tamir = 545.000 → 2 × 200.000, 145.000 artan
  assert.equal(tieredFleetValueV196('tamirMalzemesi', 10), 545000);
  assert.deepEqual(convertMachines({ tamirMalzemesi: 10 }, 10000), { value: 545000, machines: 2, refund: 145000 });
  // yetmiyor: 1 makine 50.000 < 200.000 → hepsi iade
  assert.deepEqual(convertMachines({ silahUpgrade: 1 }, 10000), { value: 50000, machines: 0, refund: 50000 });
  // çok tür tek havuz: 50 tamir + 20 silah + 5 araba
  const v = tieredFleetValueV196('tamirMalzemesi', 50) + tieredFleetValueV196('silahUpgrade', 20) + tieredFleetValueV196('arabaGelistirme', 5);
  const c = convertMachines({ tamirMalzemesi: 50, silahUpgrade: 20, arabaGelistirme: 5 }, 10000);
  assert.equal(c.value, v);
  // 5.175.000: 10 × 200.000 + 10 × 220.000 = 4.200.000; kalan 975.000 → 240.000'den 4 tane = 960.000
  assert.equal(v, 5_175_000);
  assert.equal(c.machines, 24);
  assert.equal(c.refund, 15_000);
  // kademe sınırında: tam 10. makine
  const exact = convertMachines({ yasakliMadde: 20 }, 10000); // 2.000.000
  assert.equal(exact.machines, 10);
  assert.equal(exact.refund, 0);
  // elmas fiyatı 0 → makine verilmez, hepsi iade
  assert.equal(convertMachines({ tamirMalzemesi: 10 }, 0).refund, 545000);
});

test('dryRun HİÇBİR oyuncu verisini değiştirmez, sadece raporu yazar', async () => {
  const w = world();
  await closeAndBackup(w);
  const before = w.db._dump();
  const r = await w.mig.dryRun({ prices: { diamondPrice: 10000, stockPrice: 12000 } });
  assert.equal(r.ok, true);
  const after = w.db._dump();
  const changed = Object.keys({ ...before, ...after }).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  assert.deepEqual(changed, ['migrations/v196Report']);
  const rep = w.G('migrations/v196Report');
  assert.equal(rep.cfg.diamondPrice, 10000);
  assert.ok(rep.top50.length >= 3);
  assert.equal(rep.top50[0].uid, 'ali');
});

test('apply: yedek ve onay şart', async () => {
  const w = world();
  await w.mig.close();
  const r1 = await w.mig.apply({ approve: 'x' });
  assert.equal(r1.ok, false);
  await w.mig.recordBackup({ path: 'gs://x', manual: true });
  const r2 = await w.mig.apply({ approve: 'yanlis' });
  assert.equal(r2.ok, false);
});

test('apply: iadeler, defter = rapor, ikinci çalıştırma hiçbir şey değiştirmez', async () => {
  const w = world();
  await closeAndBackup(w);
  const d = await w.mig.dryRun({ prices: { diamondPrice: 10000, stockPrice: 12000 } });
  const r = await w.mig.apply({ approve: d.reportId });
  assert.equal(r.done, true);
  const ali = w.G('users/ali');
  const L = w.G(`${V196_PAYOUTS}/ali`);
  // ev × 2 + sofa3 (altın) + chester (zümrüt) — deneme sofa2 sayılmaz
  const sofa3 = V196_ITEM_PRICES.sofa3.v;
  const chester = V196_ITEM_PRICES.chester.v;
  const arm = V196_ITEM_PRICES.armchair.v;
  assert.equal(L.lines.ev.gold, 1_000_000);
  assert.equal(L.lines.mobilya.gold, sofa3 + 2 * arm);
  assert.equal(L.lines.mobilyaGem.gem, chester);
  // kaplama: tugla 5 zümrüt, boya_gri 100.000 altın, parke_mese ücretsiz
  assert.equal(L.lines.kaplama.gold, 100000);
  assert.equal(L.lines.kaplamaGem.gem, 5);
  assert.equal(L.lines.stok.gold, 750000);
  assert.equal(L.lines.malzeme.gold, materialBuyout('tamirMalzemesi', 100));
  assert.equal(L.lines.hisseSenedi.gold, 36000);
  assert.equal(L.lines.makine.gold, 145000);
  assert.equal(L.diamondMachines, 2);
  assert.equal(ali.gold, 1000 + L.gold);
  assert.equal(ali.emerald, 1 + L.emerald);
  assert.equal(ali.houseCount, 0);
  assert.equal(ali.stockHoldings, 0);
  // hediye hisse: silahçı (kapanıştan önce) → 10 hisse, hak kazanmış (b = 0)
  const co = VENUE_CO_ID.silahci;
  assert.equal(ali.borsa[co].u, 10_000_000);
  assert.equal(ali.borsa[co].b, 0);
  assert.equal(w.G('borsa/piyasa').co[co].u, 10_000_000);
  assert.equal(w.G('borsa/piyasa').co[co].h, 1);
  assert.equal(w.G('factories/ali').dm.n, 2);
  // malzeme makineleri silindi, mining kaldı; yasaklı madde dokunulmadı
  assert.equal(w.G('factories/ali/machines/m0'), undefined);
  assert.ok(w.G('factories/ali/machines/mm'));
  assert.equal(w.G('users/ali/inventory/tamirMalzemesi'), undefined);
  assert.equal(w.G('users/ali/inventory/yasakliMadde').quantity, 3);
  // Ayşe: cafe kapanıştan sonra açıldı → hisse yok; kasa + depo
  const ayse = w.G('users/ayse');
  assert.equal(ayse.borsa, undefined);
  const LA = w.G(`${V196_PAYOUTS}/ayse`);
  assert.equal(LA.lines.kasa.gold, 7000);
  assert.equal(LA.lines.kasaGem.gem, 2);
  assert.equal(LA.lines.kasaMekan.gold, 500);
  assert.equal(w.G('users/ayse/inventory/yasakliMadde').quantity, 2);
  // Can: ilan MAĞAZA fiyatından (şişirilmiş ilan fiyatı değil) + malzeme ilanı %75
  const LC = w.G(`${V196_PAYOUTS}/can`);
  assert.equal(LC.lines.pazar.gold, V196_ITEM_PRICES.sofa2.v);
  assert.equal(LC.lines.malzeme.gold, materialBuyout('silahUpgrade', 10));
  // tek özet SMS
  const sms = Object.keys(w.db._dump('users/ali/messages/'));
  assert.equal(sms.length, 1);
  // evler silindi; oyunun mekânı kaldı
  assert.equal(w.G('houses/h1'), undefined);
  assert.equal(w.G('houses/h2'), undefined);
  assert.ok(w.G('houses/game_silahci'));
  // karargah: kaldırılan eşya (ring) çıktı, bedeli çete kasasına; kapı varsayılana döndü
  const hq = w.G('houses/hq1');
  assert.deepEqual(hq.items.map((x) => x.k), ['sofa3']);
  assert.equal(hq.door.t, 'ahsap');
  const gst = w.G('gangWorlds/w1/gangs/g1/private/state');
  const ringV = V196_ITEM_PRICES.ring.t === 'gold' ? V196_ITEM_PRICES.ring.v : 0;
  // depo kapasitesi 200 → 2 × 100.000; depo malları otomatik satış: 4 × 1.500 + silah 1 × %50
  const silah = Math.floor(WEAPON_CATALOG[1].price * 0.5);
  assert.equal(gst.kasa, 100 + ringV + 200000 + 6000 + silah);
  assert.equal(w.G('gangWorlds/w1/market/m1').status, 'cancelled');
  assert.equal(w.G('gangWorlds/w1/gangs/g1/private/depot').capacity, 0);
  // defter toplamı = rapor toplamı
  const rep = w.G('migrations/v196Report');
  const sum = Object.values(w.db._dump(`${V196_PAYOUTS}/`)).reduce((a, x) => a + x.gold, 0);
  assert.equal(sum, rep.totals.gold);
  // ikinci çalıştırma: hiçbir şey değişmez
  const snap = w.db._dump();
  const r2 = await w.mig.apply({ approve: d.reportId });
  assert.equal(r2.already, true);
  assert.deepEqual(w.db._dump(), snap);
});

test('yarıda kesilen apply devam edince çift ödeme olmaz', async () => {
  const w = world();
  await closeAndBackup(w);
  const d = await w.mig.dryRun({ prices: { diamondPrice: 10000, stockPrice: 12000 } });
  // zaman bütçesi 0: ilk oyuncudan önce durur → hiç ödeme yapılmaz, partial
  // ilk oyuncunun defteri yazılınca süre "dolar"
  const paidCount = () => Object.keys(w.db._dump(`${V196_PAYOUTS}/`)).length;
  const slow = createV196Migration({ db: w.db, FieldValue, catalogs, now: () => w.clock.now + (paidCount() >= 1 ? 10 ** 9 : 0), timeBudgetMs: 1000, batchMax: 8 });
  const r1 = await slow.apply({ approve: d.reportId });
  assert.equal(r1.partial, true);
  const paidFirst = Object.keys(w.db._dump(`${V196_PAYOUTS}/`)).length;
  const r2 = await w.mig.apply({ approve: d.reportId });
  assert.equal(r2.done, true);
  const ali = w.G('users/ali');
  const L = w.G(`${V196_PAYOUTS}/ali`);
  assert.equal(ali.gold, 1000 + L.gold);
  assert.ok(paidFirst >= 1 && paidFirst < 3, 'ilk çalıştırma bir kısmını ödemeli: ' + paidFirst);
  const rep = w.G('migrations/v196Report');
  const sum = Object.values(w.db._dump(`${V196_PAYOUTS}/`)).reduce((a, x) => a + x.gold, 0);
  assert.equal(sum, rep.totals.gold);
});

test('özet SMS: kalemler tek mesajda', () => {
  const plan = buildPlan(
    { houses: [{ id: 'h', h: { ownerUid: 'u', biz: { type: 'bar', openedAtMs: 1 }, items: [] } }], machines: { u: { tamirMalzemesi: 10 } } },
    { closingAtMs: 10, diamondPrice: 10000, stockPrice: 0, nowMs: 0 }
  );
  const txt = summarySms(plan.users.get('u'));
  assert.match(txt, /Ev \/ ofis \/ işletme: 500\.000 altın/);
  assert.match(txt, /2 elmas makinesine/);
  assert.match(txt, /10 Bar/);
});

test('katalog: kaldırılan / taşınan', () => {
  assert.equal(isRemovedKey('ring'), true);
  assert.equal(isRemovedKey('bunk'), false); // karargaha taşındı
  assert.equal(isRemovedKey('drinkfridge'), false); // mutfağa taşındı
  assert.equal(isRemovedKey('shelf'), true); // dükkân kategorisi
  assert.equal(isRemovedKey('sofa3'), false);
  assert.equal(isRemovedKey('door_cam'), true);
});

test('v196 kuralları: tür başına 10 hisse, stok alış fiyatından, malzeme %75 (eski dükkân envanteri dahil), zümrüt tam, karargahtan kalkan eşya kasaya', () => {
  const gemItem = Object.entries(V196_ITEM_PRICES).find(([k, p]) => p.t === 'gem' && !isRemovedKey(k))[0];
  const removed = Object.entries(V196_ITEM_PRICES).find(([k, p]) => p.t === 'gold' && isRemovedKey(k))[0];
  const plan = buildPlan(
    {
      houses: [
        { id: 'h1', h: { ownerUid: 'u', biz: { type: 'silahci', openedAtMs: 1 }, items: [{ i: 'a', k: gemItem, p: 1 }] } },
        { id: 'h2', h: { ownerUid: 'u', biz: { type: 'modifiye', openedAtMs: 1 }, items: [] } },
        { id: 'hq_g1', h: { ownerUid: 'gang_g1', hq: { worldId: 'w', gangId: 'g1' }, items: [{ i: 'x', k: removed, p: 1 }] } },
      ],
      shopStocks: [{ id: 'h1', d: { ownerUid: 'u', type: 'galeri', items: { 7: 1 }, paid: { 7: 750_000 } } }],
      businessInventories: [{ id: 'h2', d: { materials: { tamirMalzemesi: 100 } } }],
    },
    { closingAtMs: 10, diamondPrice: 10000, stockPrice: 0, nowMs: 0 }
  );
  const p = plan.users.get('u');
  assert.deepEqual(p.shares, { silahci: 10, modifiye: 10 });
  assert.equal(p.lines.stok.gold, 750_000, 'galerici ne verdiyse o');
  assert.equal(p.lines.malzeme.gold, materialBuyout('tamirMalzemesi', 100));
  assert.equal(p.emerald, V196_ITEM_PRICES[gemItem].v, 'zümrüt eksiksiz');
  assert.ok(!Object.keys(p.lines).some((k) => /vergi|tax/i.test(k)), 'geçişte vergi yok');
  const g = [...plan.gangs.values()][0];
  assert.equal(g.kasa, V196_ITEM_PRICES[removed].v);
});
