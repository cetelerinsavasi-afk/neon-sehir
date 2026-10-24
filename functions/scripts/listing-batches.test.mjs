// v103 — 2. el malzeme ilanı: parti bazlı 7 gün + otomatik satış.
// Saf yardımcılar + index.js'teki GERÇEK settleMaterialListing (sahte Firestore).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import * as LB from '../listingBatches.js';
import { autoSellsAt as clientAutoSellsAt } from '../../src/lib/autoSell.js';
import { resaleTax, taxLedgerWrite } from '../tax.js';
import { goldTag } from '../moneyLog.js';

const DAY = 24 * 60 * 60 * 1000;

test('otomatik satış eşiği: aralığın %50 altı; tam %50 üstte sayılır; istemci = sunucu', () => {
  // tamir 5–10 → orta 7,5
  assert.equal(LB.autoSellsAt(7, 5, 10), true);
  assert.equal(LB.autoSellsAt(5, 5, 10), true);
  assert.equal(LB.autoSellsAt(8, 5, 10), false);
  assert.equal(LB.autoSellsAt(10, 5, 10), false);
  // tam %50: silah geliştirme 50–100 → 75
  assert.equal(LB.autoSellsAt(74, 50, 100), true);
  assert.equal(LB.autoSellsAt(75, 50, 100), false, 'tam %50 üstte sayılır');
  // yasaklı madde 1250–2500 → 1875
  assert.equal(LB.autoSellsAt(1874, 1250, 2500), true);
  assert.equal(LB.autoSellsAt(1875, 1250, 2500), false);
  for (const [p, a, b] of [[7, 5, 10], [8, 5, 10], [75, 50, 100], [1874, 1250, 2500], [300, 250, 500]]) {
    assert.equal(clientAutoSellsAt(p, a, b), LB.autoSellsAt(p, a, b));
  }
});

test('partiler: ekle, FIFO tüket, süresi dolanı ayır', () => {
  const t0 = 1_000_000;
  let b = LB.addBatch([], 100_000, t0);
  b = LB.addBatch(b, 100_000, t0 + 6 * DAY);
  assert.equal(LB.nextExpireAtMs(b), t0 + 7 * DAY);
  const due = LB.splitDue(b, t0 + 7 * DAY);
  assert.equal(due.dueQty, 100_000, '7. gün sadece ilk 100.000');
  assert.deepEqual(due.keep, [{ q: 100_000, at: t0 + 6 * DAY }]);
  const after = LB.consumeBatches(b, 150_000);
  assert.deepEqual(after, [{ q: 50_000, at: t0 + 6 * DAY }], 'satış en eski partiden düşer');
  // eski partisiz ilan tek parti sayılır
  assert.deepEqual(LB.batchesOf({ quantity: 7 }, t0), [{ q: 7, at: t0 }]);
  // tutarsız toplam düzeltilir
  assert.deepEqual(LB.batchesOf({ quantity: 5, batches: [{ q: 4, at: 1 }, { q: 4, at: 2 }] }), [{ q: 4, at: 1 }, { q: 1, at: 2 }]);
});

// --- settleMaterialListing (index.js'ten) ---
const src = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
const a = src.indexOf('async function settleMaterialListing(');
const b = src.indexOf('// settleMaterialListingBatches');
assert.ok(a > 0 && b > a);
const code = "const MATERIAL_SMS_LABELS = { tamirMalzemesi: 'tamir malzemesi', yasakliMadde: 'yasaklı madde' };\n" + src.slice(a, b) + '\nreturn { settleMaterialListing };';

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const admin = { firestore: { FieldValue, Timestamp } };
  const sms = [];
  const addUserSms = (w, uid, text, type) => {
    sms.push({ uid, text, type });
    w.set(db.collection('users').doc(uid).collection('messages').doc(), { text, type });
  };
  const splitIncomeForDebt = (debt, amount) => {
    if (!(debt > 0)) return { goldDelta: amount, debtDelta: 0 };
    const repay = Math.min(Math.floor(amount / 2), debt);
    return { goldDelta: amount - repay, debtDelta: -repay };
  };
  const fns = new Function(
    'db', 'admin', 'AMAZOR_PRICES', 'resaleTax', 'taxLedgerWrite', 'splitIncomeForDebt', 'goldTag', 'addUserSms',
    'autoSellsAt', 'materialRange', 'batchesOf', 'splitDue', 'nextExpireAtMs',
    code
  )(db, admin, { tamirMalzemesi: 10, silahUpgrade: 100, arabaGelistirme: 500, yasakliMadde: 2500 }, resaleTax, taxLedgerWrite, splitIncomeForDebt, goldTag, addUserSms,
    LB.autoSellsAt, LB.materialRange, LB.batchesOf, LB.splitDue, LB.nextExpireAtMs);
  return { db, S, G, sms, fns };
}

test('ucuz ilan (7 < 7,5): 7. gün sadece ilk parti otomatik satılır, yeni parti kendi gününde', async () => {
  const { S, G, sms, fns, db } = setup();
  const t0 = Date.UTC(2026, 9, 1);
  S('users/s1', { gold: 0 });
  S('marketplaceListings/mat_s1_tamirMalzemesi_7', {
    sellerId: 's1', itemType: 'material', materialType: 'tamirMalzemesi', unitPrice: 7, quantity: 200_000, price: 1_400_000, sold: false,
    batches: [{ q: 100_000, at: t0 }, { q: 100_000, at: t0 + 6 * DAY }], expireAtMs: t0 + 7 * DAY,
  });
  const ref = db.collection('marketplaceListings').doc('mat_s1_tamirMalzemesi_7');
  const r = await fns.settleMaterialListing(ref, t0 + 7 * DAY);
  assert.equal(r.auto, true);
  assert.equal(r.qty, 100_000);
  const l = G('marketplaceListings/mat_s1_tamirMalzemesi_7');
  assert.equal(l.quantity, 100_000);
  assert.equal(l.sold, false);
  assert.equal(l.expireAtMs, t0 + 13 * DAY);
  assert.equal(G('users/s1').gold, 700_000, 'v124: malzeme satışında vergi yok');
  assert.equal(sms.length, 1);
  assert.match(sms[0].text, /otomatik satıldı/);
  // 13. gün: kalan da satılır, ilan kapanır
  await fns.settleMaterialListing(ref, t0 + 13 * DAY);
  const l2 = G('marketplaceListings/mat_s1_tamirMalzemesi_7');
  assert.equal(l2.sold, true);
  assert.equal(l2.autoSold, true);
  assert.equal(l2.expireAtMs, undefined);
  assert.equal(G('users/s1').gold, 2 * 700_000);
});

test('pahalı ilan (8 ≥ 7,5): süresi dolan parti iade edilir; borçlu satıcıda otomatik satışın yarısı borca', async () => {
  const { S, G, sms, fns, db } = setup();
  const t0 = Date.UTC(2026, 9, 1);
  S('users/s1', { gold: 0 });
  S('marketplaceListings/x', {
    sellerId: 's1', itemType: 'material', materialType: 'tamirMalzemesi', unitPrice: 8, quantity: 30, price: 240, sold: false,
    batches: [{ q: 30, at: t0 }], expireAtMs: t0 + 7 * DAY,
  });
  await fns.settleMaterialListing(db.collection('marketplaceListings').doc('x'), t0 + 7 * DAY);
  assert.equal(G('users/s1/inventory/tamirMalzemesi').quantity, 30);
  assert.equal(G('users/s1').gold, 0);
  assert.equal(G('marketplaceListings/x').cancelled, true);
  assert.match(sms[0].text, /iade edildi/);

  S('users/s2', { gold: 0, debtToState: 1_000_000 });
  S('marketplaceListings/y', {
    sellerId: 's2', itemType: 'material', materialType: 'yasakliMadde', unitPrice: 1300, quantity: 10, price: 13_000, sold: false,
    createdAt: Timestamp.fromMillis(t0),
  });
  await fns.settleMaterialListing(db.collection('marketplaceListings').doc('y'), t0 + 7 * DAY);
  const net = 13_000; // v124: malzeme satışında vergi yok
  assert.equal(G('users/s2').gold, net - Math.floor(net / 2), 'eski (partisiz) ilan da kurala girer');
  assert.equal(G('users/s2').debtToState, 1_000_000 - Math.floor(net / 2));
});

test('süresi dolmamış parti dokunulmaz; sistem ilanı atlanır', async () => {
  const { S, G, fns, db } = setup();
  const t0 = Date.UTC(2026, 9, 1);
  S('marketplaceListings/z', { sellerId: 's1', itemType: 'material', materialType: 'tamirMalzemesi', unitPrice: 6, quantity: 5, sold: false, batches: [{ q: 5, at: t0 }], expireAtMs: t0 + 7 * DAY });
  const r = await fns.settleMaterialListing(db.collection('marketplaceListings').doc('z'), t0 + 6 * DAY);
  assert.equal(r.skipped, 'not_due');
  assert.equal(G('marketplaceListings/z').quantity, 5);
  S('marketplaceListings/sys', { sellerId: 'system', itemType: 'material', materialType: 'tamirMalzemesi', unitPrice: 6, quantity: 5, sold: false, expireAtMs: 1 });
  const r2 = await fns.settleMaterialListing(db.collection('marketplaceListings').doc('sys'), t0 + 8 * DAY);
  assert.equal(r2.skipped, 'closed');
  assert.equal(G('marketplaceListings/sys').sold, false);
});

test('v115 araç/silah ilanı: 00:00 öncesi iptal bedelsiz, sonrası ceza; zaman/bant alanları', async () => {
  const { itemListingTimeFields, itemCancelPenalty, istanbulDayKeyOf, LISTING_TTL_MS: TTL, autoSellsAt: auto } = await import('../listingBatches.js');
  const t = Date.UTC(2026, 9, 23, 20, 59); // 23:59 İstanbul
  const f = itemListingTimeFields(t, { min: 5000, max: 10000 });
  assert.equal(f.listedDayKey, '2026-10-23');
  assert.equal(f.expireAtMs, t + TTL);
  assert.equal(f.bandMin, 5000);
  assert.equal(f.bandMax, 10000);
  assert.equal(itemCancelPenalty(f, t + 30 * 1000), false, '23:59:30 bedelsiz');
  assert.equal(itemCancelPenalty(f, t + 2 * 60 * 1000), true, '00:01 ceza');
  // eski ilan: listedDayKey yok → createdAt'ten
  const legacy = { createdAt: { toMillis: () => Date.UTC(2026, 9, 23, 6) } };
  assert.equal(itemCancelPenalty(legacy, Date.UTC(2026, 9, 23, 18)), false);
  assert.equal(itemCancelPenalty(legacy, Date.UTC(2026, 9, 23, 22)), true);
  assert.equal(istanbulDayKeyOf(Date.UTC(2026, 9, 23, 21)), '2026-10-24');
  // 7. gün: 7.499 otomatik satılır, 7.500 kaldırılır
  assert.equal(auto(7499, 5000, 10000), true);
  assert.equal(auto(7500, 5000, 10000), false);
});

// --- v115: settleItemListing (index.js'ten, gerçek kod) ---
function setupItems() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const admin = { firestore: { FieldValue, Timestamp } };
  const splitIncomeForDebt = (debt, amount) => ({ goldDelta: amount, debtDelta: 0 });
  const code2 = src.slice(a, b) + '\nreturn { settleItemListing };';
  const fns = new Function(
    'db', 'admin', 'AMAZOR_PRICES', 'resaleTax', 'taxLedgerWrite', 'splitIncomeForDebt', 'goldTag', 'addUserSms',
    'autoSellsAt', 'materialRange', 'batchesOf', 'splitDue', 'nextExpireAtMs', 'LISTING_TTL_MS', 'itemListingBand',
    code2
  )(db, admin, {}, resaleTax, taxLedgerWrite, splitIncomeForDebt, goldTag, () => {},
    LB.autoSellsAt, LB.materialRange, LB.batchesOf, LB.splitDue, LB.nextExpireAtMs, LB.LISTING_TTL_MS, () => ({ min: 5000, max: 10000 }));
  return { db, S, G, fns };
}

test('v115 araç/silah ilanı 7. gün: ortanın altı oyuna satılır (ürün silinir), %50 ve üstü kaldırılır (ömür aynı); süresi dolmamış dokunulmaz', async () => {
  const { S, G, fns, db } = setupItems();
  const t0 = Date.UTC(2026, 9, 1, 9);
  S('users/u1', { gold: 0 });
  S('vehicles/v1', { ownerId: 'u1', listed: true, lifeDays: 9 });
  S('vehicles/v2', { ownerId: 'u1', listed: true, lifeDays: 9 });
  S('weapons/w1', { ownerId: 'u1', listed: true, lifeDays: 4, shopHouseId: 'h1', shopListingId: 'L3' });
  S('marketplaceListings/L1', { sellerId: 'u1', itemType: 'vehicle', vehicleId: 'v1', vehicleModel: 'Şahin', price: 7000, ...LB.itemListingTimeFields(t0, { min: 5000, max: 10000 }), sold: false });
  S('marketplaceListings/L2', { sellerId: 'u1', itemType: 'vehicle', vehicleId: 'v2', price: 7500, ...LB.itemListingTimeFields(t0, { min: 5000, max: 10000 }), sold: false });
  S('marketplaceListings/L3', { sellerId: 'u1', itemType: 'weapon', weaponId: 'w1', price: 9000, shopHouseId: 'h1', ...LB.itemListingTimeFields(t0, { min: 5000, max: 10000 }), sold: false });

  // 6. gün: dokunulmaz
  assert.equal((await fns.settleItemListing(db.collection('marketplaceListings').doc('L1'), t0 + 6 * DAY)).skipped, 'not_due');
  assert.equal(G('marketplaceListings/L1').sold, false);

  const now = t0 + 7 * DAY;
  await fns.settleItemListing(db.collection('marketplaceListings').doc('L1'), now);
  await fns.settleItemListing(db.collection('marketplaceListings').doc('L2'), now);
  await fns.settleItemListing(db.collection('marketplaceListings').doc('L3'), now);

  assert.equal(G('marketplaceListings/L1').autoSold, true);
  assert.equal(G('vehicles/v1'), undefined, 'oyuna satılan araç oyundan çıkar');
  assert.equal(G('users/u1').gold, 7000 - resaleTax(7000));

  assert.equal(G('marketplaceListings/L2').cancelled, true);
  assert.equal(G('vehicles/v2').listed, false);
  assert.equal(G('vehicles/v2').lifeDays, 9, 'ömür azalmaz');

  assert.equal(G('marketplaceListings/L3').cancelled, true);
  assert.equal(G('weapons/w1').listed, true, 'vitrin ilanı düşer, ürün vitrinde kalır');
  assert.equal(G('weapons/w1').shopListingId, null);
  assert.equal(G('marketplaceListings/L3').expireAtMs, undefined);
});
