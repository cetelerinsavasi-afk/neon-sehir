// v124 — Depolar (functions/depo.js) + tek seferlik geçişler (functions/v124Migrations.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createDepo, depoPricesOf, capOf, combineBizHooks, GAME_DEPO_ID, DEPO_BUY, DEPO_SELL } from '../depo.js';
import { createV124Migrations, limanRefundOf } from '../v124Migrations.js';
import { goldTag } from '../moneyLog.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const split = (debt, amount) => {
  if (!(debt > 0)) return { goldDelta: amount, debtDelta: 0 };
  const repay = Math.min(Math.floor(amount / 2), debt);
  return { goldDelta: amount - repay, debtDelta: -repay };
};

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const steps = [];
  const income = [];
  const business = { recordIncomeTx: (tx, e) => income.push(e) };
  const depo = createDepo({ db, FieldValue, HttpsError, splitIncomeForDebt: split, business, advanceOnboardingStep: async (uid, n) => steps.push([uid, n]) });
  S('users/ali', { gold: 100_000 });
  S('users/veli', { gold: 0, debtToState: 1000 });
  S('users/patron', { gold: 50_000 });
  S('users/patron/inventory/yasakliMadde', { quantity: 30 });
  S('users/veli/inventory/yasakliMadde', { quantity: 10 });
  S('houses/d1', { ownerUid: 'patron', name: 'Kaçak Depo', biz: { type: 'depo' }, bizType: 'depo', bizPrices: { depo: { buy: 1700, sell: 2050 } } });
  return { db, S, G, depo, steps, income };
}

test('fiyat bandı: alış 1.500–1.750, satış 2.000–2.250, 50’lik adım; oyunun deposu 1.500 / 2.250', () => {
  assert.deepEqual(depoPricesOf(null), { buy: 1500, sell: 2250 });
  assert.deepEqual(depoPricesOf({ bizPrices: { depo: { buy: 1700, sell: 2050 } } }), { buy: 1700, sell: 2050 });
  assert.deepEqual(depoPricesOf({ bizPrices: { depo: { buy: 1999, sell: 1 } } }), { buy: 1750, sell: 2000 }, 'banda çekilir');
  assert.deepEqual(depoPricesOf({}), { buy: DEPO_BUY.def, sell: DEPO_SELL.def });
  assert.equal(capOf(10_000, 1500), 6);
});

test('oyunun deposu: sınırsız; al 2.250 (görev 2 ilerler), sat 1.500 (borcun yarısı kesilir)', async () => {
  const h = setup();
  const r = await h.depo.trade('ali', { depotId: GAME_DEPO_ID, side: 'buy', qty: 3, expect: 2250 });
  assert.equal(r.total, 6750);
  assert.equal(h.G('users/ali').gold, 100_000 - 6750);
  assert.equal(h.G('users/ali/inventory/yasakliMadde').quantity, 3);
  assert.deepEqual(h.steps, [['ali', 2]]);
  await h.depo.trade('veli', { depotId: GAME_DEPO_ID, side: 'sell', qty: 2 });
  assert.equal(h.G('users/veli').gold, 2000, '3.000 − 1.000 borç (yarısı, en fazla borç kadar)');
  assert.equal(h.G('users/veli').debtToState, 0);
  assert.equal(h.G('users/veli/inventory/yasakliMadde').quantity, 8);
  await assert.rejects(h.depo.trade('ali', { depotId: GAME_DEPO_ID, side: 'buy', qty: 1, expect: 2000 }), /price-changed:2250/);
  await assert.rejects(h.depo.trade('ali', { depotId: GAME_DEPO_ID, side: 'buy', qty: 1_000 }), /gold/);
  await assert.rejects(h.depo.trade('veli', { depotId: GAME_DEPO_ID, side: 'sell', qty: 9 }), /own-short/);
});

test('oyuncu deposu: sahip ekler/çeker (vergisiz); müşteri stok kadar alır, kasa kadar satar; sahip kendi deposuyla ticaret yapamaz', async () => {
  const h = setup();
  await h.depo.stock('patron', { depotId: 'd1', asset: 'yasakliMadde', qty: 20 });
  await h.depo.stock('patron', { depotId: 'd1', asset: 'gold', qty: 10_000 });
  assert.equal(h.G('users/patron').gold, 40_000);
  assert.equal(h.G('users/patron/inventory/yasakliMadde').quantity, 10);
  assert.deepEqual(h.G('depotView/d1'), { buy: 1700, sell: 2050, stock: 20, cap: 5, updatedAtMs: h.G('depotView/d1').updatedAtMs });
  await assert.rejects(h.depo.stock('ali', { depotId: 'd1', asset: 'gold', qty: 1 }), /senin değil/);
  await assert.rejects(h.depo.trade('patron', { depotId: 'd1', side: 'buy', qty: 1 }), /Kendi deponla/);
  // al: stok sınırı
  await assert.rejects(h.depo.trade('ali', { depotId: 'd1', side: 'buy', qty: 21 }), /depo-stock:20/);
  await h.depo.trade('ali', { depotId: 'd1', side: 'buy', qty: 5, expect: 2050 });
  assert.equal(h.G('users/ali').gold, 100_000 - 10_250);
  assert.equal(h.G('depots/d1').gold, 20_250);
  assert.equal(h.G('depots/d1').yasakliMadde, 15);
  assert.equal(h.G('depotView/d1').cap, 11);
  // sat: deponun kasası sınırı (1.700'den 11 adet)
  h.S('users/veli/inventory/yasakliMadde', { quantity: 50 });
  await assert.rejects(h.depo.trade('veli', { depotId: 'd1', side: 'sell', qty: 12 }), /depo-gold:11/);
  await h.depo.trade('veli', { depotId: 'd1', side: 'sell', qty: 11, expect: 1700 });
  assert.equal(h.G('depots/d1').gold, 20_250 - 18_700);
  assert.equal(h.G('depots/d1').yasakliMadde, 26);
  assert.equal(h.G('depotView/d1').cap, 0);
  // rapor kayıtları: satış geliri + alınan mal
  assert.equal(h.income.filter((e) => e.amount === 10_250).length, 1);
  assert.ok(h.income.some((e) => e.materialsIn?.yasakliMadde === 11));
  // çekme: depodakinden fazla olmaz
  await assert.rejects(h.depo.stock('patron', { depotId: 'd1', asset: 'gold', qty: -10_000 }), /depo-short/);
  await h.depo.stock('patron', { depotId: 'd1', asset: 'gold', qty: -1550 });
  assert.equal(h.G('depots/d1').gold, 0);
});

test('fiyat: sadece sahip, bant + 50 adım; görünüm güncellenir', async () => {
  const h = setup();
  await assert.rejects(h.depo.price('patron', { depotId: 'd1', buy: 1725, sell: 2100 }), /price-band:buy/);
  await assert.rejects(h.depo.price('patron', { depotId: 'd1', buy: 1500, sell: 1950 }), /price-band:sell/);
  await assert.rejects(h.depo.price('ali', { depotId: 'd1', buy: 1500, sell: 2000 }), /senin değil/);
  await h.depo.price('patron', { depotId: 'd1', buy: 1750, sell: 2000 });
  assert.deepEqual(h.G('houses/d1').bizPrices.depo, { buy: 1750, sell: 2000 });
  assert.equal(h.G('depotView/d1').sell, 2000);
});

test('işletme kapanınca depodaki altın + mal sahibine döner (bir kez); kancalar birleşir', async () => {
  const h = setup();
  h.S('depots/d1', { ownerUid: 'patron', gold: 7000, yasakliMadde: 4 });
  const hooks = combineBizHooks({ onCloseRead: async () => 'shop', onCloseWrite: (tx, a) => ({ shopState: a.state }) }, h.depo.bizHooks);
  const house = h.G('houses/d1');
  const run = async () => {
    let out;
    await h.db.runTransaction(async (tx) => {
      const st = await hooks.onCloseRead(tx, { houseId: 'd1', h: house });
      out = hooks.onCloseWrite(tx, { houseId: 'd1', h: house, state: st });
    });
    return out;
  };
  const r = await run();
  assert.deepEqual(r, { shopState: 'shop', depotGold: 7000, depotContraband: 4 });
  assert.equal(h.G('users/patron').gold, 57_000);
  assert.equal(h.G('users/patron/inventory/yasakliMadde').quantity, 34);
  const again = await run();
  assert.equal(again.depotGold, 0, 'ikinci kapanış iade etmez');
  assert.equal(h.G('users/patron').gold, 57_000);
});

test('oyunun deposu evi: idempotent kurulum', async () => {
  const h = setup();
  await h.depo.ensureGame();
  await h.depo.ensureGame();
  const g = h.G(`houses/${GAME_DEPO_ID}`);
  assert.equal(g.bizType, 'depo');
  assert.equal(g.bizGame, true);
  assert.ok(g.items.some((i) => i.k === 'bosstable') && g.items.some((i) => i.k === 'crates'));
});

// ---- geçişler ----------------------------------------------------------------------
test('liman iadesi: yüklenmiş + bekleyen kovalar (eski anahtarlar dahil); tek seferlik; SMS', async () => {
  assert.deepEqual(limanRefundOf({ loaded: { tamirMalzemesi: 10, yasakliMadde: 1 }, pending: { vitesUpgrade: 2 } }), {
    refund: 80 + 2000 + 800,
    lines: { tamirMalzemesi: 10, yasakliMadde: 1, arabaGelistirme: 2 },
  });
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  S('users/a', { gold: 0 });
  S('users/b', { gold: 5 });
  S('limanOrders/a', { loaded: { silahUpgrade: 3 }, pending: { yasakliMadde: 2 } });
  S('limanOrders/b', { loaded: { silahUpgrade: 0 }, pending: {} }); // teslim edilmiş
  S('limanOrders/gone', { pending: { tamirMalzemesi: 5 } }); // silinmiş hesap
  const m = createV124Migrations({ db, FieldValue, goldTag, log: () => {} });
  const r = await m.refundLimanOrders();
  assert.deepEqual(r, { refunded: 1, gold: 240 + 4000 }, 'silinmiş hesabın siparişi kapanır, ödeme yapılacak kimse yok');
  assert.deepEqual(G('limanOrders/gone').pending, {});
  assert.equal(G('users/a').gold, 4240);
  assert.equal(G('users/b').gold, 5);
  assert.deepEqual(G('limanOrders/a').loaded, {});
  const sms = Object.entries(Object.fromEntries(db._store)).filter(([k]) => k.startsWith('users/a/messages/'));
  assert.equal(sms.length, 1);
  assert.match(sms[0][1].data.text, /4\.240 altın hesabına iade/);
  assert.deepEqual(await m.refundLimanOrders(), { skipped: true });
  // bayrak silinse bile ikinci kez ödeme olmaz (kovalar sıfır)
  db._store.delete('migrations/v124_liman');
  const r2 = await m.refundLimanOrders();
  assert.equal(r2.gold, 0);
  assert.equal(G('users/a').gold, 4240);
});

test('2. el yasaklı madde ilanları: oyuncuya iade, sistem ilanı kapanır, çete ilanı depoya; tek seferlik', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  S('users/s', { gold: 0 });
  S('users/s/inventory/yasakliMadde', { quantity: 1 });
  S('marketplaceListings/l1', { sellerId: 's', itemType: 'material', materialType: 'yasakliMadde', quantity: 7, sold: false });
  S('marketplaceListings/l2', { sellerId: 'system', itemType: 'material', materialType: 'yasakliMadde', quantity: 100, sold: false });
  S('marketplaceListings/l3', { sellerId: 's', itemType: 'material', materialType: 'yasakliMadde', quantity: 9, sold: true });
  S('marketplaceListings/l4', { sellerId: 's', itemType: 'material', materialType: 'tamirMalzemesi', quantity: 9, sold: false });
  S('gangWorlds/live/market/g1', { gangId: 'kg', itemKey: 'yasakliMadde', quantity: 30, status: 'open' });
  S('gangWorlds/live/gangs/kg/private/depot', { items: { yasakliMadde: 40 }, listed: { yasakliMadde: 30 } });
  const m = createV124Migrations({ db, FieldValue, goldTag, log: () => {} });
  const r = await m.cancelContrabandListings({ liveWorldId: 'live' });
  assert.deepEqual(r, { players: 1, qtyBack: 7, gangs: 1 });
  assert.equal(G('users/s/inventory/yasakliMadde').quantity, 8);
  assert.equal(G('marketplaceListings/l1').cancelled, true);
  assert.equal(G('marketplaceListings/l2').cancelled, true);
  assert.equal(G('marketplaceListings/l3').cancelled, undefined, 'satılmış ilana dokunulmaz');
  assert.equal(G('marketplaceListings/l4').sold, false, 'başka malzemeye dokunulmaz');
  assert.equal(G('gangWorlds/live/market/g1').status, 'cancelled');
  assert.equal(G('gangWorlds/live/gangs/kg/private/depot').listed.yasakliMadde, 0);
  db._store.delete('migrations/v124_contraband2el');
  const r2 = await m.cancelContrabandListings({ liveWorldId: 'live' });
  assert.deepEqual(r2, { players: 0, qtyBack: 0, gangs: 0 });
  assert.equal(G('users/s/inventory/yasakliMadde').quantity, 8);
});
