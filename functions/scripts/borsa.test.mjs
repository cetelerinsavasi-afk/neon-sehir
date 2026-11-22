// v176 — Neon Borsa testleri: fiyat, komisyon, sınırlar, eşzamanlı alım, gece dağıtımı,
// toplama (vergi + borç), kaçırılan günler, 20 gün kuralı, hesap silme.
// Çalıştır: node --test functions/scripts/borsa.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createBorsa, buyCost, sellGet, pendingOf, splitCollect, change24h, sellAllValue, sortCos, BORSA_COS } from '../borsa.js';
import { stateWrite, stateDayKey } from '../stateTreasury.js';
import { addDayKey } from '../belediyeRates.js';
import { goldTag } from '../moneyLog.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
// İstanbul 2026-12-01 10:00
const T0 = Date.parse('2026-12-01T10:00:00+03:00');

function setup({ tax = 0.1 } = {}) {
  let t = T0;
  const clock = () => t;
  const db = new FakeFirestore({ clock });
  const b = createBorsa({ db, FieldValue, HttpsError, goldTag, stateWrite, taxFrac: () => tax, dayKey: (ms) => stateDayKey(ms), addDayKey, now: clock, log: { log() {}, error() {} } });
  const user = (uid, gold, extra = {}) => db.doc(`users/${uid}`).set({ gold, ...extra });
  const u = async (uid) => (await db.doc(`users/${uid}`).get()).data();
  const market = async () => (await db.doc('borsa/piyasa').get()).data();
  const income = async (day, sk, amount) => db.doc(`stateLedger/${day}_s${Math.floor(Math.random() * 16)}`).set({ dayKey: day, stat: { [`hs_${sk}`]: FieldValue.increment(amount) } }, { merge: true });
  const set = (ms) => (t = ms);
  return { db, b, user, u, market, income, set, now: () => t };
}

test('fiyat ve %1 komisyon', () => {
  assert.equal(buyCost(0), 1010);
  assert.equal(buyCost(1), 2020); // 1 hisse satılmışken 2. hisse
  assert.equal(sellGet(1), 990); // 1 hisse satılmışken satış
  assert.equal(buyCost(99), 101000);
  assert.equal(buyCost(100), null); // 100'ü dolunca alış durur
  assert.equal(sellGet(100), 99000);
  assert.equal(sellGet(0), 0);
  assert.equal(sellAllValue(3, 10), sellGet(10) + sellGet(9) + sellGet(8));
});

test('toplama: vergi sonra borç payı', () => {
  assert.deepEqual(splitCollect(10000, 0.1, 0), { gross: 10000, tax: 1000, net: 9000, toDebt: 0, pay: 9000 });
  assert.deepEqual(splitCollect(10000, 0.1, 100000), { gross: 10000, tax: 1000, net: 9000, toDebt: 4500, pay: 4500 });
  assert.deepEqual(splitCollect(10000, 0.1, 1000), { gross: 10000, tax: 1000, net: 9000, toDebt: 1000, pay: 8000 });
});

test('24 saatlik değişim ve sıralama', () => {
  const ch = Array.from({ length: 30 }, (_, i) => (i < 5 ? 10000 : 12000));
  assert.equal(change24h(ch, 12000), 0);
  assert.equal(change24h(Array(25).fill(10000), 12000), 20);
  assert.equal(change24h(Array(24).fill(10000), 12000), null);
  const m = { co: { midyeci: { inc: [90000, 90000] }, kokorecci: { inc: [10] } } };
  assert.equal(sortCos(m)[0].id, 'midyeci');
  assert.equal(BORSA_COS.length, 10); // v177: 6 mekân + 4 şirket
});

test('al / sat: altın, sınır, hissedar sayısı', async () => {
  const { b, user, u, market } = setup();
  await user('a', 1_000_000);
  await user('b', 5_000);
  const r1 = await b.trade('a', { op: 'al', co: 'kokorecci' });
  assert.equal(r1.price, 1010);
  const r2 = await b.trade('a', { op: 'al', co: 'kokorecci' });
  assert.equal(r2.price, 2020);
  assert.equal((await u('a')).gold, 1_000_000 - 3030);
  assert.equal((await u('a')).borsa.kokorecci.n, 2);
  let m = await market();
  assert.equal(m.co.kokorecci.n, 2);
  assert.equal(m.co.kokorecci.h, 1);
  await user('b', 3_000);
  await assert.rejects(b.trade('b', { op: 'al', co: 'kokorecci' }), /Yetersiz/); // 3. hisse 3.030
  await user('b', 3_030);
  await b.trade('b', { op: 'al', co: 'kokorecci' });
  m = await market();
  assert.equal(m.co.kokorecci.h, 2);
  // satış: n=3 → 2970
  const s = await b.trade('b', { op: 'sat', co: 'kokorecci' });
  assert.equal(s.price, 2970);
  const ub = await u('b');
  assert.equal(ub.gold, 2970);
  assert.equal(ub.borsa?.kokorecci, undefined);
  assert.equal(ub.borsaSon, undefined);
  m = await market();
  assert.equal(m.co.kokorecci.n, 2);
  assert.equal(m.co.kokorecci.h, 1);
  await assert.rejects(b.trade('b', { op: 'sat', co: 'kokorecci' }), /hissen yok/);
  await assert.rejects(b.trade('a', { op: 'al', co: 'yok' }), /Geçersiz/);
  // en fazla 10
  for (let i = 0; i < 8; i++) await b.trade('a', { op: 'al', co: 'kokorecci' });
  await assert.rejects(b.trade('a', { op: 'al', co: 'kokorecci' }), /en fazla 10/);
});

test('eşzamanlı alımlar: her hisse farklı fiyattan, sayaç tutarlı', async () => {
  const { b, user, u, market } = setup();
  const ids = Array.from({ length: 25 }, (_, i) => `p${i}`);
  for (const id of ids) await user(id, 1_000_000);
  const res = await Promise.all(ids.map((id) => b.trade(id, { op: 'al', co: 'simitci' })));
  const prices = res.map((r) => r.price).sort((x, y) => x - y);
  assert.deepEqual(prices, Array.from({ length: 25 }, (_, i) => buyCost(i)));
  const m = await market();
  assert.equal(m.co.simitci.n, 25);
  assert.equal(m.co.simitci.h, 25);
  let spent = 0;
  for (const id of ids) spent += 1_000_000 - (await u(id)).gold;
  assert.equal(spent, prices.reduce((a, x) => a + x, 0));
});

test('gece dağıtımı, toplama, borç ve tekrar çalışmada çift dağıtım yok', async () => {
  const S = setup({ tax: 0.1 });
  const { b, user, u, market, income, set } = S;
  await b.hourly(); // ilk kurulum (bugünün geliri yarın dağıtılır)
  let m = await market();
  const day0 = stateDayKey(T0);
  assert.equal(m.distDay, addDayKey(day0, -1));
  await user('a', 1_000_000);
  await user('c', 1_000_000, { debtToState: 100_000 });
  await b.trade('a', { op: 'al', co: 'kofteci' });
  await b.trade('a', { op: 'al', co: 'kofteci' });
  await b.trade('c', { op: 'al', co: 'kofteci' });
  await income(day0, 'kf', 30_000);
  await income(day0, 'kf', 3_000);
  await income(day0, 'md', 5_000); // midyecinin hissedarı yok → belediyeye
  // ertesi gün 00:01
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  const r = await b.hourly();
  assert.deepEqual(r.distributed, [day0]);
  m = await market();
  assert.equal(m.distDay, day0);
  assert.equal(m.co.kofteci.inc.at(-1), 33_000);
  assert.equal(m.co.midyeci.inc.at(-1), 5_000);
  // v182: 1 hissenin günlük kazancı (3 hisse → 11.000; hissedarsız → tek hisse hepsini alırdı)
  assert.equal(m.co.kofteci.ps.at(-1), 11_000);
  assert.equal(m.co.midyeci.ps.at(-1), 5_000);
  // tekrar: çift dağıtım yok
  const r2 = await b.hourly();
  assert.deepEqual(r2.distributed, []);
  // a: 2/3, c: 1/3 → 22.000 / 11.000
  const before = (await u('a')).gold;
  const ca = await b.collect('a');
  assert.equal(ca.gross, 22_000);
  assert.equal(ca.tax, 2_200);
  assert.equal(ca.pay, 19_800);
  assert.equal((await u('a')).gold, before + 19_800);
  await assert.rejects(b.collect('a'), /Toplanacak gelir yok/);
  const cBefore = await u('c');
  const cc = await b.collect('c');
  assert.equal(cc.gross, 11_000);
  assert.equal(cc.toDebt, 4_950);
  const cAfter = await u('c');
  assert.equal(cAfter.gold, cBefore.gold + 4_950);
  assert.equal(cAfter.debtToState, 100_000 - 4_950);
  // vergi ve sahipsiz gelir devlet defterinde
  const led = await S.db.collection('stateLedger').get();
  let vergi = 0;
  let sahipsiz = 0;
  led.forEach((d) => {
    vergi += d.data().in?.vergi_hisse || 0;
    sahipsiz += d.data().in?.seyyar_sahipsiz || 0;
  });
  assert.equal(vergi, 2_200 + 1_100);
  assert.equal(sahipsiz, 5_000);
});

test('satıştan önce biriken gelir kaybolmaz; hisseyi satan da toplayabilir', async () => {
  const { b, user, u, income, set } = setup({ tax: 0 });
  await b.hourly();
  await user('a', 1_000_000);
  await b.trade('a', { op: 'al', co: 'midyeci' });
  await income(stateDayKey(T0), 'md', 10_000);
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  await b.hourly();
  await b.trade('a', { op: 'sat', co: 'midyeci' });
  const ua = await u('a');
  assert.equal(ua.borsa.midyeci.n, 0);
  assert.equal(ua.borsa.midyeci.p, 10_000);
  assert.ok(ua.borsaSon > 0); // birikmiş gelir varken 20 gün sayacı sürer
  const c = await b.collect('a');
  assert.equal(c.pay, 10_000);
  const ua2 = await u('a');
  assert.equal(ua2.borsa?.midyeci, undefined);
  assert.equal(ua2.borsaSon, undefined);
});

test('kaçırılan günler sırayla dağıtılır', async () => {
  const { b, user, u, income, set } = setup({ tax: 0 });
  await b.hourly();
  await user('a', 1_000_000);
  await b.trade('a', { op: 'al', co: 'donerci' });
  const d0 = stateDayKey(T0);
  await income(d0, 'dn', 1_000);
  await income(addDayKey(d0, 1), 'dn', 2_000);
  await income(addDayKey(d0, 2), 'dn', 4_000);
  set(Date.parse('2026-12-04T05:01:00+03:00'));
  const r = await b.hourly();
  assert.deepEqual(r.distributed, [d0, addDayKey(d0, 1), addDayKey(d0, 2)]);
  const c = await b.collect('a');
  assert.equal(c.gross, 7_000);
  assert.ok((await u('a')).gold > 0);
});

test('saatlik grafik: saatte bir nokta, 7 günle sınırlı', async () => {
  const { b, user, market, set } = setup();
  await user('a', 1_000_000);
  await b.hourly();
  await b.hourly(); // aynı saat → ek nokta yok
  let m = await market();
  assert.equal(m.co.dondurmaci.ch.length, 1);
  await b.trade('a', { op: 'al', co: 'dondurmaci' });
  for (let h = 1; h <= 200; h++) {
    set(T0 + h * 3600_000);
    await b.hourly();
  }
  m = await market();
  assert.equal(m.co.dondurmaci.ch.length, 168);
  assert.equal(m.co.dondurmaci.ch.at(-1), 1000);
});

test('20 gün kuralı: en uzun pasif önce, satış + gelir yatar, SMS gider', async () => {
  const { db, b, user, u, market, income, set } = setup({ tax: 0.1 });
  await b.hourly();
  await user('eski', 0, { debtToState: 1_000_000 });
  await user('yeni', 0);
  await user('aktif', 1_000_000);
  await db.doc('users/eski').update({ gold: 1_000_000 });
  await b.trade('eski', { op: 'al', co: 'kokorecci' });
  await b.trade('eski', { op: 'al', co: 'kokorecci' });
  set(T0 + 3600_000);
  await db.doc('users/yeni').update({ gold: 1_000_000 });
  await b.trade('yeni', { op: 'al', co: 'kokorecci' });
  await income(stateDayKey(T0), 'kk', 30_000);
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  await b.hourly(); // 30.000 → eski 20.000, yeni 10.000
  // 20 gün sonra ikisi de pasif; "aktif" yeni alır
  set(Date.parse('2026-12-22T00:01:00+03:00'));
  await b.trade('aktif', { op: 'al', co: 'kokorecci' });
  await b.hourly();
  const ue = await u('eski');
  const uy = await u('yeni');
  assert.equal(ue.borsa, undefined);
  assert.equal(uy.borsa, undefined);
  const m = await market();
  assert.equal(m.co.kokorecci.n, 1);
  assert.equal(m.co.kokorecci.h, 1);
  // eski önce: n=4,3 ile satar → 3960+2970; gelir 20.000 → vergi 2.000, borca 9.000 → 9.000
  assert.equal(ue.gold, 1_000_000 - 3030 + 3960 + 2970 + 9_000);
  assert.equal(ue.debtToState, 1_000_000 - 9_000);
  // yeni sonra: n=2 → 1980; satış parası borca gitmez; gelir 10.000 → 9.000
  assert.equal(uy.gold, 1_000_000 - 3030 + 1980 + 9_000); // 3. hisseyi 3.030'a almıştı
  const sms = await db.collection('users/eski/messages').get();
  assert.equal(sms.size, 1);
  assert.match(sms.docs[0].data().text, /20 gündür/);
});

test('hesap silme: hisseler havuza döner', async () => {
  const { b, user, u, market } = setup();
  await user('a', 1_000_000);
  await user('b', 1_000_000);
  await b.trade('a', { op: 'al', co: 'simitci' });
  await b.trade('a', { op: 'al', co: 'simitci' });
  await b.trade('b', { op: 'al', co: 'simitci' });
  assert.equal(await b.releaseForDeletion('a'), 2);
  const m = await market();
  assert.equal(m.co.simitci.n, 1);
  assert.equal(m.co.simitci.h, 1);
  assert.deepEqual((await u('a')).borsa || {}, {});
  assert.equal(await b.releaseForDeletion('a'), 0);
});

test('biriken gelir formülü', () => {
  assert.equal(pendingOf({ n: 3, a: 1000, p: 5 }, { acc: 4000 }), 5 + 9);
  assert.equal(pendingOf({ n: 0, a: 0, p: 7 }, { acc: 99999 }), 7);
});

test('v181 hepsini sat: tüm mekânlar, tek tek satmakla aynı tutar, gösterilen tutar değiştiyse satmaz', async () => {
  const { b, user, u, market } = setup();
  await user('a', 1_000_000);
  await user('z', 1_000_000);
  for (let i = 0; i < 3; i++) await b.trade('a', { op: 'al', co: 'kokorecci' });
  await b.trade('a', { op: 'al', co: 'nakliye' });
  await b.trade('z', { op: 'al', co: 'kokorecci' });
  const m0 = await market();
  const want = sellAllValue(3, m0.co.kokorecci.n) + sellAllValue(1, m0.co.nakliye.n);
  const g0 = (await u('a')).gold;
  await assert.rejects(b.sellAll('a', { expect: want + 1 }), /price-changed/);
  const r = await b.sellAll('a', { expect: want });
  assert.equal(r.total, want);
  assert.equal(r.shares, 4);
  assert.equal((await u('a')).gold, g0 + want);
  assert.deepEqual((await u('a')).borsa || {}, {});
  const m = await market();
  assert.equal(m.co.kokorecci.n, 1);
  assert.equal(m.co.kokorecci.h, 1);
  assert.equal(m.co.nakliye.n, 0);
  await assert.rejects(b.sellAll('a', {}), /hissen yok/);
});
