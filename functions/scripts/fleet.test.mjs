// v177 — ticari araç sistemi testleri: satın alma noktası, türden 1 araç, şirket payı,
// şoförlük vergisi, tek seferlik geçiş (polis + fazla araç + galeri stok iadesi).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createFleet, splitDriverIncome, lifeValue, galeriSells, vehicleShopOf, canResell, countsAsOwned, FLEET } from '../fleet.js';
import { createJobs } from '../jobs.js';
import { newVehicleDoc } from '../shop.js';
import { statWrite, stateWrite, stateDayKey } from '../stateTreasury.js';
import { borsaCompanyStatKey, vendorIncomeSplit } from '../borsa.js';
import { goldTag } from '../moneyLog.js';
import { JOBS } from '../vehicleKinds.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function setup() {
  let t = Date.parse('2026-12-01T10:00:00+03:00');
  const db = new FakeFirestore({ clock: () => t });
  const fleet = createFleet({ db, FieldValue, HttpsError, goldTag, statWrite, stateWrite, ticariTaxFrac: () => 0.1, newVehicleDoc, companyStatKey: borsaCompanyStatKey, dayKey: (ms) => stateDayKey(ms), now: () => t, log: { log() {} } });
  const user = (uid, gold, extra = {}) => db.doc(`users/${uid}`).set({ gold, ...extra });
  const u = async (uid) => (await db.doc(`users/${uid}`).get()).data();
  const veh = (id, ownerId, catalogId, extra = {}) => db.doc(`vehicles/${id}`).set({ ownerId, catalogId, lifeDays: 20, model: 'X', ...extra });
  const ledger = async () => {
    const s = await db.collection('stateLedger').get();
    const out = { in: {}, stat: {} };
    s.forEach((d) => {
      for (const [k, v] of Object.entries(d.data().in || {})) out.in[k] = (out.in[k] || 0) + v;
      for (const [k, v] of Object.entries(d.data().stat || {})) out.stat[k] = (out.stat[k] || 0) + v;
    });
    return out;
  };
  return { db, fleet, user, u, veh, ledger, adv: (ms) => (t += ms), now: () => t };
}

test('kurallar: galeri ticari satmaz, ömür değeri, şoför geliri bölüşümü', () => {
  assert.equal(galeriSells(1), true);
  assert.equal(galeriSells(21), false); // v177 aşama 2: motorlar motor galerisinde
  assert.equal(vehicleShopOf(21), 'motogaleri');
  assert.equal(vehicleShopOf(25), null);
  assert.equal(vehicleShopOf(26), null);
  assert.equal(vehicleShopOf(5), 'galeri');
  for (const id of [11, 12, 13, 14, 15]) assert.equal(galeriSells(id), false);
  assert.equal(lifeValue({ catalogId: 11, lifeDays: 20 }), 500000);
  assert.equal(lifeValue({ catalogId: 11, lifeDays: 10 }), 250000);
  assert.equal(lifeValue({ catalogId: 14, lifeDays: 1 }), 20000);
  assert.equal(countsAsOwned({ lifeDays: 0 }), false);
  assert.equal(countsAsOwned({ lifeDays: 3, seizedByBank: true }), false);
  assert.deepEqual(splitDriverIncome('tir', 6000, 0.1), { gross: 6000, tax: 600, share: 600, net: 4800 });
  assert.equal(canResell(25), false);
  assert.equal(canResell(26), false);
  assert.equal(canResell(27), false);
  assert.equal(canResell(21), true);
  assert.equal(canResell(13), true);
  assert.deepEqual(splitDriverIncome('kurye', 1000, 0.1), { gross: 1000, tax: 100, share: 100, net: 800 }); // v199: vergi + %10 satıcıya
  // v195: ticari ücretler ×1,5
  assert.equal(JOBS.tir.avg, 9000);
  assert.equal(JOBS.otobus.avg, 18750);
  assert.equal(JOBS.taksi.avg, 2250);
  assert.equal(JOBS.ambulans.avg, 6825); // v219: ambulans geliri +%30
});

test('durakdan taksi: 1 tane; v202 Ticari Araç Vergisi fiyatın üstüne (alıcı öder), şirkete %50 vergisiz; hurda sayılmaz', async () => {
  const { db, fleet, user, u, veh, ledger } = setup();
  await user('a', 1_000_000);
  await assert.rejects(fleet.fleetBuy('a', { job: 'taksi', expect: 100000 }), /price-changed:110000/);
  const r = await fleet.fleetBuy('a', { job: 'taksi', expect: 110000 });
  assert.equal(r.price, 100000);
  assert.equal(r.tax, 10000);
  assert.equal(r.total, 110000);
  assert.equal((await u('a')).gold, 890000);
  await assert.rejects(fleet.fleetBuy('a', { job: 'taksi' }), /Zaten bir taksi/);
  const L = await ledger();
  assert.equal(L.stat.hs_tk, 50000); // 100.000 → 50.000 masraf, 50.000 hissedarlara (şirket vergisi yok)
  assert.equal(L.in.vergi_ticariArac, 10000); // alıcının ödediği vergi
  assert.equal(L.in.vergi_sirket, undefined);
  // başka tür serbest — 500.000'lik tır (+50.000 vergi): 250.000 masraf, 250.000 hissedarlara
  await fleet.fleetBuy('a', { job: 'tir' });
  assert.equal((await ledger()).stat.hs_nk, 250000);
  assert.equal((await ledger()).in.vergi_ticariArac, 60000);
  // ömrü bitmiş (hurda) taksi engel değil
  await user('b', 1_000_000);
  await veh('old', 'b', 13, { lifeDays: 0 });
  await fleet.fleetBuy('b', { job: 'taksi' });
  // ilanda olan sayılır
  await user('c', 1_000_000);
  await veh('lst', 'c', 12, { lifeDays: 9, listed: true });
  await assert.rejects(fleet.fleetBuy('c', { job: 'otobus' }), /Zaten/);
  await user('d', 50_000);
  await assert.rejects(fleet.fleetBuy('d', { job: 'ambulans' }), /Yetersiz/);
  await assert.rejects(fleet.fleetBuy('d', { job: 'polis' }), /Geçersiz/);
  const vs = await db.collection('vehicles').where('ownerId', '==', 'a').get();
  assert.equal(vs.size, 2);
});

test('2. elden: aynı türden araç varken alınamaz', async () => {
  const { db, fleet, user, veh } = setup();
  await user('a', 1_000_000);
  await veh('v1', 'a', 11, { lifeDays: 5 });
  await assert.rejects(db.runTransaction((tx) => fleet.assertCanOwn(tx, 'a', 11)), /Zaten bir tır/);
  await db.runTransaction((tx) => fleet.assertCanOwn(tx, 'a', 12)); // başka tür serbest
  await db.runTransaction((tx) => fleet.assertCanOwn(tx, 'a', 4)); // araba kuralsız
});

test('iş kazancı: şoförlük vergisi + şirket payı; v199 kurye: vergi + %10 seyyar satıcıya', async () => {
  const { db, user, u, veh, ledger, adv } = setup();
  const jobs = createJobs({ db, FieldValue, HttpsError, splitIncomeForDebt: (d, a) => ({ goldDelta: a, debtDelta: 0 }), stateWrite, taxFrac: () => 0.1, vendorTaxFrac: () => 0.1, companyTaxFrac: () => 0, companyStatKey: borsaCompanyStatKey, now: () => Date.parse('2026-12-01T10:00:00+03:00') + 0 });
  await user('a', 0);
  await veh('amb', 'a', 15);
  await veh('mot', 'a', 21);
  // ambulans işi
  const s = await jobs.ops.jobStart('a', { vehicleId: 'amb' });
  await db.doc('vehicles/amb').update({ 'job.run.at': 0 });
  const d = await jobs.ops.jobDone('a', { vehicleId: 'amb', runId: s.run.id, t: s.run.par, hits: 0 });
  assert.equal(d.tax + d.share + d.net, d.gross);
  assert.equal(d.share, Math.round(d.gross * 0.1));
  assert.equal((await u('a')).gold, d.net);
  assert.equal((await db.doc('vehicles/amb').get()).data().jobEarned, d.net);
  let L = await ledger();
  assert.equal(L.in.vergi_sofor, d.tax);
  // v202: şoförün %10 payı şirket geliri → %50 masraf, kalan VERGİSİZ hissedarlara (şirket vergisi kalktı)
  const cs = vendorIncomeSplit(d.share, 0);
  assert.equal(L.stat.hs_hn, cs.share);
  assert.equal(cs.share, d.share - Math.round(d.share * 0.5));
  assert.equal(L.in.vergi_sirket, undefined);
  // kurye
  const k = await jobs.ops.jobStart('a', { vehicleId: 'mot' });
  await db.doc('vehicles/mot').update({ 'job.run.at': 0 });
  const kd = await jobs.ops.jobDone('a', { vehicleId: 'mot', runId: k.run.id, t: k.run.par, hits: 0 });
  assert.equal(kd.tax, Math.round(kd.gross * 0.1));
  assert.equal(kd.share, Math.round(kd.gross * 0.1));
  assert.equal(kd.tax + kd.share + kd.net, kd.gross);
  L = await ledger();
  assert.equal(L.in.vergi_sofor, d.tax + kd.tax);
  // v200: satıcının sipariş parası satıcı geliri: %50 masraf + seyyar satıcı vergisi, kalan o satıcının hissedarlarına
  const vs = vendorIncomeSplit(kd.share, 0.1);
  const vend = ['hs_kk', 'hs_sm', 'hs_dn', 'hs_kf', 'hs_md', 'hs_dd'].reduce((a, k) => a + (L.stat[k] || 0), 0);
  assert.equal(vend, vs.share);
  assert.equal(L.in.vergi_seyyar || 0, vs.tax);
  assert.deepEqual(vendorIncomeSplit(100, 0.1), { gross: 100, expense: 50, tax: 10, share: 40 });
  adv(0);
  // polis arabasıyla iş yok
  await veh('pol', 'a', 14);
  await assert.rejects(jobs.ops.jobStart('a', { vehicleId: 'pol' }), /retired/);
});

test('tek seferlik geçiş: polis + fazla ticari + galeri stoğu, bir kez', async () => {
  const { db, fleet, user, u, veh } = setup();
  await user('p', 0);
  await user('q', 10);
  await user('g', 0);
  await veh('pol1', 'p', 14, { lifeDays: 10, listed: true }); // ilanda
  await db.collection('marketplaceListings').doc('L1').set({ vehicleId: 'pol1', sold: false, itemType: 'vehicle' });
  await veh('pol2', 'p', 14, { lifeDays: 0 }); // hurda → 0 ödenir, yine kalkar
  await veh('t1', 'q', 11, { lifeDays: 12 });
  await veh('t2', 'q', 11, { lifeDays: 4 }); // ömrü az olan gider
  await veh('t3', 'q', 11, { lifeDays: 0 }); // hurda sayılmaz, dokunulmaz
  await veh('x1', 'q', 13, { lifeDays: 8 }); // tek taksi kalır
  await db.doc('shopStocks/h1').set({ ownerUid: 'g', type: 'galeri', items: { 4: 2, 11: 1, 13: 3, 22: 1 }, paid: { 4: 75000, 11: 375000, 13: 225000, 22: 26250 }, prices: { 4: 50000, 11: 500000 } });
  await db.doc('shopOffers/vehicle').set({ v: 1, offers: { 11: { h1: 500000 }, 4: { h1: 50000 } } });
  await veh('bike', 'q', 25, { listed: true });
  await db.collection('marketplaceListings').doc('L2').set({ vehicleId: 'bike', sold: false, itemType: 'vehicle', vehicleCatalogId: 25, sellerId: 'q', vehicleModel: 'Bisiklet' });
  const r = await fleet.migrateV177();
  assert.equal(r.removed, 3);
  assert.equal(r.refunds, 1);
  assert.equal((await u('p')).gold, 200000); // 400.000 × 10/20
  assert.equal((await u('q')).gold, 10 + 100000); // 500.000 × 4/20
  assert.equal((await u('g')).gold, 375000 + 225000 + 26250); // ticari + motor iade
  assert.equal((await db.doc('vehicles/t1').get()).exists, true);
  assert.equal((await db.doc('vehicles/t2').get()).exists, false);
  assert.equal((await db.doc('vehicles/t3').get()).exists, true);
  assert.equal((await db.doc('vehicles/pol1').get()).exists, false);
  assert.equal((await db.doc('marketplaceListings/L1').get()).exists, false);
  const st = (await db.doc('shopStocks/h1').get()).data();
  assert.deepEqual(st.items, { 4: 2 });
  assert.deepEqual(st.paid, { 4: 75000 });
  const off = (await db.doc('shopOffers/vehicle').get()).data().offers;
  assert.equal(off[11]?.h1, undefined);
  assert.equal(off[4].h1, 50000);
  assert.equal((await db.doc('marketplaceListings/L2').get()).data().cancelled, true);
  assert.equal((await db.doc('vehicles/bike').get()).data().listed, false);
  const sms = await db.collection('users/q/messages').get();
  assert.equal(sms.size, 1);
  const again = await fleet.migrateV177();
  assert.equal(again.skipped, true);
  assert.equal(Object.keys(FLEET).length, 4);
});

test('binekler: at / deve renkli alınır, renk listesi dışı reddedilir; modifiye ve 2. el yok', async () => {
  const { createStable, ANIMALS } = await import('../stable.js');
  const { canModify } = await import('../fleet.js');
  const { db, user, u } = setup();
  const st = createStable({ db, FieldValue, HttpsError, goldTag, statWrite, newVehicleDoc, dayKey: (ms) => stateDayKey(ms) });
  await user('a', 160_000);
  const r = await st.animalBuy('a', { kind: 'deve', paint: ANIMALS.deve.colors[2], expect: 50_000 });
  const v = (await db.doc(`vehicles/${r.vehicleId}`).get()).data();
  assert.equal(v.catalogId, 27);
  assert.equal(v.mods.paint, ANIMALS.deve.colors[2]);
  assert.equal((await u('a')).gold, 110_000);
  // varsayılan renk → mods yok
  const r2 = await st.animalBuy('a', { kind: 'at', paint: '#7a4a2a' });
  assert.equal((await db.doc(`vehicles/${r2.vehicleId}`).get()).data().mods, undefined);
  await assert.rejects(st.animalBuy('a', { kind: 'at', paint: '#ff0000' }), /Geçersiz renk/);
  await assert.rejects(st.animalBuy('a', { kind: 'at', paint: '#7a4a2a' }), /Yetersiz/);
  await assert.rejects(st.animalBuy('a', { kind: 'deve', paint: '#c9a26b', expect: 1 }), /price-changed/);
  assert.equal(canModify(27), false);
  assert.equal(canModify(24), true);
});

test('kiralık bisiklet: dakika peşin, en fazla 2 dakika ileri, altın yetmezse olmaz', async () => {
  const { createStable, BIKE_RENT } = await import('../stable.js');
  const { db, user, u, adv, now } = setup();
  const st = createStable({ db, FieldValue, HttpsError, goldTag, statWrite, newVehicleDoc, dayKey: (ms) => stateDayKey(ms), now });
  await user('a', 250);
  const r1 = await st.bikeRent('a');
  assert.equal(r1.until - r1.now, 60_000);
  const r2 = await st.bikeRent('a');
  assert.equal(r2.until - r2.now, 120_000);
  await assert.rejects(st.bikeRent('a'), /already-paid/);
  assert.equal((await u('a')).gold, 250 - 2 * BIKE_RENT.perMin);
  adv(120_000);
  await assert.rejects(st.bikeRent('a'), /Yetersiz/);
  assert.equal((await db.collection('vehicles').where('ownerId', '==', 'a').get()).size, 0);
});
