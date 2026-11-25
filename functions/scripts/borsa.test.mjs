// Neon Borsa testleri — v176 kuralları + v189 (sınırsız hisse, küsuratlı birimler, BigInt fiyat,
// alım birimi, v193 alım sınırı (10 hisse / satılmışın 10'da 1'i), gece temettü avı engeli, tembel geçiş, 20 gün oyuna girmeyen).
// Çalıştır: node --test functions/scripts/borsa.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import {
  createBorsa,
  buyCost,
  sellGet,
  buyQuote,
  sellQuote,
  buyBaseU,
  sellBaseU,
  priceNow,
  stepUnits,
  fmtShares,
  tradeButtons,
  pendingOf,
  splitCollect,
  change24h,
  sellAllValue,
  sortCos,
  BORSA_COS,
  marketGainAll,
  idleStep,
  holdState,
  coState,
  pendingAll,
  BORSA_UNITS as U,
  capOf,
  buyRoom,
} from '../borsa.js';
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
const D = 86_400_000;
// "Önceki dönem": piyasa 30.11'de kurulur (distDay 29.11); 30.11'de alınan hisseler 01.12 00:01'deki
// dağıtımla (30.11 geliri) dönemi kapatır → 01.12 gelirinden pay alır.
const P0 = Date.parse('2026-11-30T10:00:00+03:00');
const P1 = Date.parse('2026-12-01T00:01:00+03:00');

function setup({ tax = 0.1, rtdb = null } = {}) {
  let t = T0;
  const clock = () => t;
  const db = new FakeFirestore({ clock });
  const b = createBorsa({ db, FieldValue, HttpsError, goldTag, stateWrite, taxFrac: () => tax, dayKey: (ms) => stateDayKey(ms), addDayKey, now: clock, log: { log() {}, error() {} }, rtdb });
  const user = (uid, gold, extra = {}) => db.doc(`users/${uid}`).set({ gold, ...extra });
  const u = async (uid) => (await db.doc(`users/${uid}`).get()).data();
  const market = async () => (await db.doc('borsa/piyasa').get()).data();
  const income = async (day, sk, amount) => db.doc(`stateLedger/${day}_s${Math.floor(Math.random() * 16)}`).set({ dayKey: day, stat: { [`hs_${sk}`]: FieldValue.increment(amount) } }, { merge: true });
  const seen = (uid, ms) => db.doc(`users/${uid}/private/meta`).set({ lastSeenAtMs: ms }, { merge: true });
  const set = (ms) => (t = ms);
  // saniyede 1 işlem sınırı: her işlemden önce saat 1,001 sn ilerler
  const tick = () => (t += 1001);
  const al = (uid, co, x) => (tick(), b.trade(uid, { op: 'al', co, ...(x != null ? { x } : {}) }));
  const sat = (uid, co, x) => (tick(), b.trade(uid, { op: 'sat', co, ...(x != null ? { x } : {}) }));
  const topla = (uid) => (tick(), b.collect(uid));
  return { db, b, user, u, market, income, seen, set, tick, al, sat, topla, now: () => t };
}

// ---------------------------------------------------------------------------
// Fiyat formülü
// ---------------------------------------------------------------------------
test('fiyat ve %1 komisyon: tam hissede v188 ile birebir aynı (n = 0..250)', () => {
  for (let n = 0; n <= 250; n++) {
    // v188: alış ceil((n+1)×1000×1,01), satış floor(n×1000×0,99)
    assert.equal(buyCost(n), Math.ceil((n + 1) * 1000 * 1.01), `alış n=${n}`);
    assert.equal(sellGet(n), Math.floor(n * 1000 * 0.99), `satış n=${n}`);
    assert.equal(Number(buyBaseU(n * U, U)), (n + 1) * 1000);
    assert.equal(Number(sellBaseU(n * U, U)), n * 1000);
  }
  assert.equal(buyCost(0), 1010);
  assert.equal(buyCost(1), 2020);
  assert.equal(sellGet(1), 990);
  assert.equal(buyCost(100), 102010); // v189: 100'de sınır yok
});

test('sürekli formül: parçalara bölmek toplamı değiştirmez (yuvarlama hariç), satış = alışın tersi', () => {
  const S = 37 * U + 250_000;
  const x = 3 * U + 123_456;
  // 500·x·(2S+x+1) tam olarak
  const exact = (500n * BigInt(x) * (2n * BigInt(S) + BigInt(x) + 1_000_000n)) / 10n ** 12n;
  assert.ok(Number(buyBaseU(S, x)) - Number(exact) <= 1);
  // S'den x al, sonra S+x'ten x sat → temel tutar aynı (aynı eğri)
  assert.ok(Math.abs(Number(buyBaseU(S, x)) - Number(sellBaseU(S + x, x))) <= 1);
  // 10 parçada almak ≈ tek seferde
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(buyBaseU(S + (i * x) / 10, x / 10));
  assert.ok(Math.abs(sum - Number(buyBaseU(S, x))) <= 10);
  // yuvarlama sistemin lehine: alış yukarı, satış aşağı
  assert.ok(buyQuote(S, 1).total >= 1);
  assert.equal(sellQuote(S, 1).net, 0);
});

test('BigInt: çok büyük S değerlerinde hassasiyet kaybı yok', () => {
  const S = 9_000_000_000 * U; // 9 milyar hisse (birim > 2^53 değil ama ara çarpımlar çok büyük)
  const b = buyBaseU(S, U);
  assert.equal(b, 9_000_000_001n * 1000n);
  assert.equal(sellBaseU(S, U), 9_000_000_000n * 1000n);
});

test('anlık fiyat ve alım birimi (her 10 katta bir basamak)', () => {
  assert.equal(priceNow(0), 500);
  assert.equal(priceNow(9 * U), 9500);
  assert.equal(stepUnits(9 * U), U); // < 10.000 → 1 hisse
  assert.equal(stepUnits(10 * U), U / 10); // 10.500 → 0,1
  assert.equal(stepUnits(200 * U), U / 100); // 200.500 → 0,01 (kullanıcı örneği)
  assert.equal(stepUnits(1500 * U), U / 1000);
  assert.equal(stepUnits(10 ** 9 * U), 1); // en az 1 birim
  // örnek: hisse ~200.000 → küçük buton 0,01 ≈ 2.000, büyük 0,1 ≈ 20.000
  const btn = tradeButtons(200 * U, 0);
  assert.equal(btn.small.buy.x, U / 100);
  assert.equal(btn.big.buy.x, U / 10);
  assert.ok(btn.small.buy.total >= 2000 && btn.small.buy.total < 2100, String(btn.small.buy.total));
  assert.ok(btn.big.buy.total >= 20000 && btn.big.buy.total < 20500, String(btn.big.buy.total));
  // her fiyat düzeyinde küçük buton ~1.000–10.000, büyük ~10.000–100.000 altın
  for (const shares of [0, 3, 9, 10, 55, 99, 100, 450, 999, 1000, 7777, 99999]) {
    const t = tradeButtons(shares * U, 0);
    assert.ok(t.small.buy.base >= 500 && t.small.buy.base < 10_100, `küçük ${shares}: ${t.small.buy.base}`);
    assert.ok(t.big.buy.base >= 5_000 && t.big.buy.base < 150_000, `büyük ${shares}: ${t.big.buy.base}`); // birim sınırının hemen altında 10 adım fiyatı da yükseltir
  }
});

test('hisse gösterimi: gereksiz sıfırlar olmadan', () => {
  assert.equal(fmtShares(10 * U), '10');
  assert.equal(fmtShares(10.5 * U), '10,5');
  assert.equal(fmtShares(0.03 * U), '0,03');
  assert.equal(fmtShares(1), '0,000001');
  assert.equal(fmtShares(1250 * U + 250_000), '1.250,25');
  assert.equal(fmtShares(0), '0');
});

test('v193 alım sınırı: 100 satılana kadar 10, sonra satılmışın 10da 1i (aldıkça artar)', () => {
  assert.equal(capOf(0), 10 * U);
  assert.equal(capOf(100 * U), 10 * U);
  assert.equal(capOf(200 * U), 20 * U);
  assert.equal(buyRoom(0, 50 * U), 10 * U);
  const r = buyRoom(0, 200 * U); // ~22,2 (kendi alımı toplamı da artırır)
  assert.ok(r > 22.2 * U && r < 22.3 * U, String(r / U));
  assert.ok(r <= capOf(200 * U + r), 'aldıktan sonra sınırın içinde');
  assert.equal(buyRoom(30 * U, 200 * U), 0, 'sınırın üstündeyse alamaz');
  assert.equal(buyRoom(7 * U, 20 * U), 3 * U);
});

test('butonlar: alım sınırı ve "elindekinin hepsi"', () => {
  const near = tradeButtons(5 * U, 9.7 * U);
  assert.equal(near.small.buy.x, 0.3 * U); // birim 1 hisse ama sınıra 0,3 kaldı
  assert.equal(near.big.buy.x, 0.3 * U);
  const full = tradeButtons(5 * U, 10 * U);
  assert.equal(full.small.buy.x, 0); // pasif
  assert.equal(full.small.sell.x, U); // satış serbest
  const few = tradeButtons(200 * U, 0.004 * U); // birim 0,01, elinde 0,004
  assert.equal(few.small.sell.x, 0.004 * U);
  assert.equal(few.big.sell.x, 0.004 * U);
});

test('toplama: vergi sonra borç payı', () => {
  assert.deepEqual(splitCollect(10000, 0.1, 0), { gross: 10000, tax: 1000, net: 9000, toDebt: 0, pay: 9000 });
  assert.deepEqual(splitCollect(10000, 0.1, 100000), { gross: 10000, tax: 1000, net: 9000, toDebt: 4500, pay: 4500 });
  assert.deepEqual(splitCollect(10000, 0.1, 1000), { gross: 10000, tax: 1000, net: 9000, toDebt: 1000, pay: 8000 });
});

test('24 saatlik değişim ve sıralama (hisse başına ortalama gelir)', () => {
  const ch = Array.from({ length: 30 }, (_, i) => (i < 5 ? 10000 : 12000));
  assert.equal(change24h(ch, 12000), 0);
  assert.equal(change24h(Array(25).fill(10000), 12000), 20);
  assert.equal(change24h(Array(24).fill(10000), 12000), null);
  // toplam gelir yüksek ama hisse başına düşük olan aşağıda
  const m = { co: { midyeci: { inc: [90000], ps: [900] }, kokorecci: { inc: [10000], ps: [5000] } } };
  assert.equal(sortCos(m)[0].id, 'kokorecci');
  assert.equal(BORSA_COS.length, 10);
});

// ---------------------------------------------------------------------------
// Al / sat
// ---------------------------------------------------------------------------
test('al / sat (1 hisse, eski istemci isteği): altın, hissedar sayısı, ilk işlemde piyasa v2', async () => {
  const { user, u, market, al, sat } = setup();
  await user('a', 1_000_000);
  await user('b', 5_000);
  const r1 = await al('a', 'kokorecci');
  assert.equal(r1.price, 1010);
  const r2 = await al('a', 'kokorecci');
  assert.equal(r2.price, 2020);
  assert.equal((await u('a')).gold, 1_000_000 - 3030);
  assert.equal((await u('a')).borsa.kokorecci.u, 2 * U);
  assert.equal((await u('a')).borsa.kokorecci.v, 2);
  let m = await market();
  assert.equal(m.v, 2);
  assert.equal(m.co.kokorecci.u, 2 * U);
  assert.equal(m.co.kokorecci.h, 1);
  assert.equal(m.co.kokorecci.n, undefined, 'eski alan silindi');
  await user('b', 3_000);
  await assert.rejects(al('b', 'kokorecci'), /Yetersiz/);
  await user('b', 3_030);
  await al('b', 'kokorecci');
  m = await market();
  assert.equal(m.co.kokorecci.h, 2);
  const s = await sat('b', 'kokorecci');
  assert.equal(s.price, 2970);
  const ub = await u('b');
  assert.equal(ub.gold, 2970);
  assert.equal(ub.borsa?.kokorecci, undefined);
  assert.equal(ub.borsaSon, undefined);
  m = await market();
  assert.equal(m.co.kokorecci.u, 2 * U);
  assert.equal(m.co.kokorecci.h, 1);
  await assert.rejects(sat('b', 'kokorecci'), /hissen yok/);
  await assert.rejects(al('a', 'yok'), /Geçersiz/);
});

test('küsuratlı alım / satım, alım sınırına kadar alır, satış serbest', async () => {
  const { user, u, market, al, sat } = setup();
  await user('a', 100_000_000);
  const r = await al('a', 'simitci', 0.5 * U);
  assert.equal(r.x, 0.5 * U);
  assert.equal(r.price, buyQuote(0, 0.5 * U).total);
  await al('a', 'simitci', 9 * U);
  const r3 = await al('a', 'simitci', 5 * U); // 0,5 kaldı → sadece 0,5 alınır
  assert.equal(r3.x, 0.5 * U);
  assert.equal((await u('a')).borsa.simitci.u, 10 * U);
  await assert.rejects(al('a', 'simitci', 1), /Alım sınırı/);
  const s = await sat('a', 'simitci', 0.25 * U);
  assert.equal(s.x, 0.25 * U);
  const all = await sat('a', 'simitci', 1000 * U); // elindekinden fazla → hepsi
  assert.equal(all.x, 9.75 * U);
  assert.equal((await market()).co.simitci.u, 0);
  await assert.rejects(al('a', 'simitci', -5), /Geçersiz miktar/);
  await assert.rejects(al('a', 'simitci', 1.5), /Geçersiz miktar/);
});

test('fiyat değiştiyse (expect) işlem olmaz', async () => {
  const { b, user, tick } = setup();
  await user('a', 1_000_000);
  const q = buyQuote(0, U).total;
  tick();
  await assert.rejects(b.trade('a', { op: 'al', co: 'midyeci', x: U, expect: q - 1 }), /price-changed/);
  tick();
  const r = await b.trade('a', { op: 'al', co: 'midyeci', x: U, expect: q });
  assert.equal(r.price, q);
  tick();
  await assert.rejects(b.trade('a', { op: 'sat', co: 'midyeci', all: true, expect: sellQuote(U, U).net + 1 }), /price-changed/);
});

test('saniyede en fazla 1 borsa isteği (borsaSon)', async () => {
  const { b, user, tick } = setup();
  await user('a', 1_000_000);
  tick();
  await b.trade('a', { op: 'al', co: 'midyeci', x: U });
  await assert.rejects(b.trade('a', { op: 'al', co: 'midyeci', x: U }), /saniyede en fazla 1/);
  tick();
  await b.trade('a', { op: 'al', co: 'midyeci', x: U });
});

test('eşzamanlı alımlar: her hisse farklı fiyattan, sayaç tutarlı', async () => {
  const { b, user, u, market, tick } = setup();
  const ids = Array.from({ length: 25 }, (_, i) => `p${i}`);
  for (const id of ids) await user(id, 1_000_000);
  tick();
  const res = await Promise.all(ids.map((id) => b.trade(id, { op: 'al', co: 'simitci' })));
  const prices = res.map((r) => r.price).sort((x, y) => x - y);
  assert.deepEqual(prices, Array.from({ length: 25 }, (_, i) => buyCost(i)));
  const m = await market();
  assert.equal(m.co.simitci.u, 25 * U);
  assert.equal(m.co.simitci.h, 25);
  let spent = 0;
  for (const id of ids) spent += 1_000_000 - (await u(id)).gold;
  assert.equal(spent, prices.reduce((a, x) => a + x, 0));
});

test('canlı fiyat yayını: işlemden sonra RTDB borsaFiyat/<mekân> = S (birim)', async () => {
  const writes = [];
  const rtdb = async () => ({ ref: (p) => ({ update: async (v) => writes.push([p, v]) }) });
  const { user, al, b } = setup({ rtdb });
  await user('a', 1_000_000);
  await al('a', 'midyeci', 2 * U);
  assert.deepEqual(writes.at(-1), ['borsaFiyat', { midyeci: 2 * U }]);
  await b.hourly();
  assert.equal(Object.keys(writes.at(-1)[1]).length, 10, 'saatlik tam liste');
});

// ---------------------------------------------------------------------------
// Gece dağıtımı
// ---------------------------------------------------------------------------
test('gece dağıtımı, toplama, borç ve tekrar çalışmada çift dağıtım yok', async () => {
  const S = setup({ tax: 0.1 });
  const { b, user, u, market, income, set, al, topla } = S;
  set(P0);
  await b.hourly(); // ilk kurulum (bugünün geliri yarın dağıtılır)
  let m = await market();
  const day0 = stateDayKey(T0);
  assert.equal(m.distDay, addDayKey(day0, -2));
  await user('a', 1_000_000);
  await user('c', 1_000_000, { debtToState: 100_000 });
  await al('a', 'kofteci', 2 * U);
  await al('c', 'kofteci');
  // dönem kapanışı: 01.12 00:01 dağıtımı (30.11 geliri yok) → bu alımlar hak kazanır
  set(P1);
  await b.hourly();
  await income(day0, 'kf', 30_000);
  await income(day0, 'kf', 3_000);
  await income(day0, 'md', 5_000); // midyecinin hissedarı yok → belediyeye
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  const r = await b.hourly();
  assert.deepEqual(r.distributed, [day0]);
  m = await market();
  assert.equal(m.distDay, day0);
  assert.equal(m.co.kofteci.inc.at(-1), 33_000);
  assert.equal(m.co.midyeci.inc.at(-1), 5_000);
  assert.equal(m.co.kofteci.ps.at(-1), 11_000); // hisse başına
  assert.equal(m.co.midyeci.ps.at(-1), 5_000);
  const r2 = await b.hourly();
  assert.deepEqual(r2.distributed, []);
  const before = (await u('a')).gold;
  // v202: hisse gelir vergisi kalktı — toplarken vergi yok (taxFrac verilse bile)
  const ca = await topla('a');
  assert.equal(ca.gross, 22_000);
  assert.equal(ca.tax, 0);
  assert.equal(ca.pay, 22_000);
  assert.equal((await u('a')).gold, before + 22_000);
  await assert.rejects(topla('a'), /Toplanacak gelir yok/);
  const cBefore = await u('c');
  const cc = await topla('c');
  assert.equal(cc.gross, 11_000);
  assert.equal(cc.toDebt, 5_500);
  const cAfter = await u('c');
  assert.equal(cAfter.gold, cBefore.gold + 5_500);
  assert.equal(cAfter.debtToState, 100_000 - 5_500);
  const led = await S.db.collection('stateLedger').get();
  let vergi = 0;
  let sahipsiz = 0;
  led.forEach((d) => {
    vergi += d.data().in?.vergi_hisse || 0;
    sahipsiz += d.data().in?.seyyar_sahipsiz || 0;
  });
  assert.equal(vergi, 0, 'v202: hisse vergisi yok');
  assert.equal(sahipsiz, 5_000);
});

test('GECE TEMETTÜ AVI: 23:59\'da alınan hisse 00:01\'deki dağıtımda 0 gelir alır, ertesi gün alır', async () => {
  const { b, user, u, market, income, set, topla } = setup({ tax: 0 });
  await b.hourly(); // kurulum 01.12 10:00 → distDay 30.11
  const d1 = stateDayKey(T0); // 2026-12-01
  await user('eski', 10_000_000);
  await user('avci', 10_000_000);
  // eski: 01.12 öğlen alır (bu dönem) → 01.12 gelirinden pay ALMAZ (günü tam tutmadı)
  set(Date.parse('2026-12-01T12:00:00+03:00'));
  await b.trade('eski', { op: 'al', co: 'kofteci', x: 2 * U });
  await income(d1, 'kf', 10_000);
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  let r = await b.hourly(); // 01.12 dağıtımı: hak kazanmış hisse yok → belediyeye
  assert.deepEqual(r.distributed, [d1]);
  assert.equal(pendingAll(await u('eski'), await market()).total, 0);
  // 02.12 boyunca eski elinde tutar; avcı 23:59'da alır
  const d2 = addDayKey(d1, 1);
  await income(d2, 'kf', 30_000);
  set(Date.parse('2026-12-02T23:59:00+03:00'));
  await b.trade('avci', { op: 'al', co: 'kofteci', x: 2 * U });
  set(Date.parse('2026-12-03T00:01:00+03:00'));
  r = await b.hourly(); // 02.12 dağıtımı
  assert.deepEqual(r.distributed, [d2]);
  let m = await market();
  assert.equal(pendingAll(await u('avci'), m).total, 0, '23:59 alımı 00:01 dağıtımından 0 alır');
  assert.equal(pendingAll(await u('eski'), m).total, 30_000, 'günü tam tutan hepsini alır');
  assert.equal(m.co.kofteci.ps.at(-1), 15_000, 'hisse başı = gelir / hak kazanmış hisse');
  // 03.12: ikisi de günü tam tutar → eşit
  const d3 = addDayKey(d1, 2);
  await income(d3, 'kf', 8_000);
  set(Date.parse('2026-12-04T00:01:00+03:00'));
  await b.hourly();
  m = await market();
  assert.equal(pendingAll(await u('avci'), m).total, 4_000);
  assert.equal(pendingAll(await u('eski'), m).total, 34_000);
  assert.equal((await topla('avci')).gross, 4_000);
  assert.equal((await topla('eski')).gross, 34_000);
});

test('temettü avı: dönem içinde alıp satan önce o dönemin birimlerini satar', async () => {
  const { b, user, u, market, income, set, topla } = setup({ tax: 0 });
  set(P0);
  await b.hourly();
  const d1 = stateDayKey(T0);
  await user('a', 10_000_000);
  await b.trade('a', { op: 'al', co: 'simitci', x: 2 * U }); // önceki dönem
  set(P1);
  await b.hourly(); // 2 hisse hak kazandı (dönem kapandı)
  set(Date.parse('2026-12-01T15:00:00+03:00'));
  await b.trade('a', { op: 'al', co: 'simitci', x: 3 * U }); // bu dönem (pay almaz)
  set(Date.parse('2026-12-01T16:00:00+03:00'));
  await b.trade('a', { op: 'sat', co: 'simitci', x: 1 * U }); // önce bu dönemin birimlerinden
  const h = holdState(await u('a'), 'simitci');
  assert.equal(h.u, 4 * U);
  assert.equal(h.b, 2 * U);
  const m0 = await market();
  assert.equal(m0.co.simitci.bt, 2 * U);
  await income(d1, 'sm', 10_000);
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  await b.hourly();
  assert.equal(pendingAll(await u('a'), await market()).total, 10_000, '2 hak kazanmış hisse günün tamamını alır');
  assert.equal((await market()).co.simitci.ps.at(-1), 5_000);
  assert.equal((await topla('a')).gross, 10_000);
});

test('temettü avı: mekânda tüm hisseler o gün alınmışsa gelir belediyeye', async () => {
  const S = setup({ tax: 0 });
  const { b, user, income, set } = S;
  await b.hourly();
  await user('a', 10_000_000);
  await b.trade('a', { op: 'al', co: 'donerci', x: U });
  await income(stateDayKey(T0), 'dn', 7_000);
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  await b.hourly();
  let sahipsiz = 0;
  (await S.db.collection('stateLedger').get()).forEach((d) => (sahipsiz += d.data().in?.seyyar_sahipsiz || 0));
  assert.equal(sahipsiz, 7_000);
});

test('temettü: dönem geçmişi yetmezse (40+ dağıtım işlem yok) gelir kaybolmaz', async () => {
  const { b, user, u, market, income, set, seen } = setup({ tax: 0 });
  await b.hourly();
  await user('a', 10_000_000);
  await seen('a', 9e15); // her gün oyuna giriyor (20 gün kuralı satmasın)
  await b.trade('a', { op: 'al', co: 'midyeci', x: U });
  let d = stateDayKey(T0);
  let total = 0;
  for (let i = 0; i < 45; i++) {
    await income(d, 'md', 1_000);
    if (i > 0) total += 1_000; // ilk gün (alım günü) pay yok
    set(Date.parse(`${addDayKey(d, 1)}T00:01:00+03:00`));
    await b.hourly();
    d = addDayKey(d, 1);
  }
  const got = pendingAll(await u('a'), await market()).total;
  // geçmiş 40 dağıtım: en kötü ihtimalle (yedek ba) alım günü de sayılır → 44.000 ya da 45.000; asla daha az değil
  assert.ok(got >= total && got <= total + 1_000, `${got}`);
});

test('küçük gelirler sıfıra yuvarlanıp kaybolmaz (küsurat birikir)', async () => {
  const { b, user, u, market, income, set, seen, al } = setup({ tax: 0 });
  set(P0);
  await b.hourly();
  await user('a', 100_000_000);
  await user('z', 100_000_000);
  await seen('a', 9e15);
  await seen('z', 9e15);
  await al('a', 'dondurmaci', 1); // 1 birim (milyonda bir hisse)
  await al('z', 'dondurmaci', 10 * U);
  set(P1);
  await b.hourly();
  let d = stateDayKey(T0);
  for (let i = 0; i < 12; i++) {
    await income(d, 'dd', 100_000); // birim başına 0,01 altın
    set(Date.parse(`${addDayKey(d, 1)}T00:01:00+03:00`));
    await b.hourly();
    d = addDayKey(d, 1);
  }
  const ua = holdState(await u('a'), 'dondurmaci');
  const m = await market();
  // 12 gün × 100.000 / (10.000.001 birim) ≈ 0,12 altın: tam sayıya varmadı ama kaybolmadı
  const co = coState(m, 'dondurmaci');
  const q = BigInt(ua.u) * (co.A - ua.a) + ua.pq;
  assert.ok(q > 0n && q < 10n ** 18n, 'küsurat birikiyor');
  // 100 kat daha → 1 altını geçer
  for (let i = 0; i < 100; i++) {
    await income(d, 'dd', 100_000);
    set(Date.parse(`${addDayKey(d, 1)}T00:01:00+03:00`));
    await b.hourly();
    d = addDayKey(d, 1);
  }
  assert.equal(pendingAll(await u('a'), await market()).total, 1);
});

test('satıştan önce biriken gelir kaybolmaz; hisseyi satan da toplayabilir', async () => {
  const { b, user, u, income, set, topla, al } = setup({ tax: 0 });
  set(P0);
  await b.hourly();
  await user('a', 1_000_000);
  await al('a', 'midyeci');
  set(P1);
  await b.hourly();
  await income(stateDayKey(T0), 'md', 10_000);
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  await b.hourly();
  set(Date.parse('2026-12-02T09:00:00+03:00'));
  await b.trade('a', { op: 'sat', co: 'midyeci' });
  const ua = await u('a');
  assert.equal(ua.borsa.midyeci.u, 0);
  assert.equal(pendingAll(ua, {}).total >= 0, true);
  assert.ok(ua.borsaSon > 0);
  const c = await topla('a');
  assert.equal(c.pay, 10_000);
  const ua2 = await u('a');
  assert.equal(ua2.borsa?.midyeci, undefined);
  assert.equal(ua2.borsaSon, undefined);
});

test('kaçırılan günler sırayla dağıtılır', async () => {
  const { b, user, u, income, set, topla, al } = setup({ tax: 0 });
  set(P0);
  await b.hourly();
  await user('a', 1_000_000);
  await al('a', 'donerci');
  set(P1);
  await b.hourly();
  const d0 = stateDayKey(T0);
  await income(d0, 'dn', 1_000);
  await income(addDayKey(d0, 1), 'dn', 2_000);
  await income(addDayKey(d0, 2), 'dn', 4_000);
  set(Date.parse('2026-12-04T05:01:00+03:00'));
  const r = await b.hourly();
  assert.deepEqual(r.distributed, [d0, addDayKey(d0, 1), addDayKey(d0, 2)]);
  const c = await topla('a');
  assert.equal(c.gross, 7_000);
  assert.ok((await u('a')).gold > 0);
});

test('saatlik grafik: 1000 × S, saatte bir nokta, 7 günle sınırlı', async () => {
  const { b, user, market, set, al } = setup();
  await user('a', 1_000_000);
  await b.hourly();
  await b.hourly();
  let m = await market();
  assert.equal(m.co.dondurmaci.ch.length, 1);
  await al('a', 'dondurmaci', 1.5 * U);
  for (let h = 1; h <= 200; h++) {
    set(T0 + h * 3600_000);
    await b.hourly();
  }
  m = await market();
  assert.equal(m.co.dondurmaci.ch.length, 168);
  assert.equal(m.co.dondurmaci.ch.at(-1), 1500);
});

// ---------------------------------------------------------------------------
// 20 gün kuralı (v189: oyuna girmeyen)
// ---------------------------------------------------------------------------
test('20 gün: oyuna giren satılmaz (sayaç ileri alınır), girmeyen satılır, uyarı SMS\'i yok', async () => {
  const { db, b, user, u, market, income, seen, set, al } = setup({ tax: 0.1 });
  set(P0);
  await b.hourly();
  await user('eski', 1_000_000, { debtToState: 1_000_000 });
  await user('oynayan', 1_000_000);
  await user('aktif', 1_000_000);
  await al('eski', 'kokorecci', 2 * U);
  await al('oynayan', 'kokorecci');
  set(P1);
  await b.hourly();
  await income(stateDayKey(T0), 'kk', 30_000);
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  await b.hourly(); // 30.000 → eski 20.000, oynayan 10.000
  await seen('eski', Date.parse('2026-12-01T10:00:00+03:00')); // son giriş: 20 günden önce
  // oynayan 15. günde oyuna girdi (borsada işlem yok)
  await seen('oynayan', Date.parse('2026-12-15T10:00:00+03:00'));
  set(Date.parse('2026-12-22T00:01:00+03:00'));
  await b.trade('aktif', { op: 'al', co: 'kokorecci' });
  const r = await b.sweepIdle();
  assert.equal(r, 1);
  const ue = await u('eski');
  const uo = await u('oynayan');
  assert.equal(ue.borsa, undefined, 'girmeyen satıldı');
  assert.equal(holdState(uo, 'kokorecci').u, U, 'oynayanın hissesi duruyor');
  assert.equal(uo.borsaSon, Date.parse('2026-12-15T10:00:00+03:00'), 'sayaç son girişe çekildi');
  assert.equal((await db.collection('users/oynayan/messages').get()).size, 0, 'uyarı SMS\'i yok');
  const m = await market();
  assert.equal(m.co.kokorecci.u, 2 * U);
  // eski: S=4'ten 2 hisse sat → 3960+2970; gelir 20.000 → v202 vergi yok, borca 10.000 → 10.000
  assert.equal(ue.gold, 1_000_000 - 3030 + 3960 + 2970 + 10_000);
  assert.equal(ue.debtToState, 1_000_000 - 10_000);
  const sms = (await db.collection('users/eski/messages').get()).docs.map((d) => d.data());
  assert.equal(sms.length, 1);
  assert.equal(sms[0].type, 'borsa_tasfiye');
  assert.match(sms[0].text, /20 gündür oyuna girmediğin için/);
  // ikinci tarama: oynayan artık aday değil (okuma yok)
  assert.equal(await b.sweepIdle(), 0);
});

test('20 gün adımı', () => {
  const t = T0;
  assert.equal(idleStep({ borsaSon: t - 21 * D }, t - 1 * D, t), null, 'dün oyuna girdi');
  assert.equal(idleStep({ borsaSon: t - 21 * D }, t - 21 * D, t), 'sell');
  assert.equal(idleStep({ borsaSon: t - 21 * D }, 0, t), 'sell');
  assert.equal(idleStep({ borsaSon: t - 19 * D }, 0, t), null);
  assert.equal(idleStep({}, 0, t), null);
});

// ---------------------------------------------------------------------------
// Hepsini sat, hesap silme, kâr/zarar
// ---------------------------------------------------------------------------
test('hesap silme: hisseler havuza döner (bu dönemin sayacı da)', async () => {
  const { b, user, u, market, al } = setup();
  await user('a', 1_000_000);
  await user('b', 1_000_000);
  await al('a', 'simitci', 1.5 * U);
  await al('b', 'simitci');
  assert.equal(await b.releaseForDeletion('a'), 1.5);
  const m = await market();
  assert.equal(m.co.simitci.u, U);
  assert.equal(m.co.simitci.h, 1);
  assert.equal(m.co.simitci.bt, U);
  assert.deepEqual((await u('a')).borsa || {}, {});
  assert.equal(await b.releaseForDeletion('a'), 0);
});

test('hepsini sat: tüm mekânlar, gösterilen tutar değiştiyse satmaz', async () => {
  const { b, user, u, market, al, tick } = setup();
  await user('a', 1_000_000);
  await user('z', 1_000_000);
  await al('a', 'kokorecci', 3 * U);
  await al('a', 'nakliye', 0.5 * U);
  await al('z', 'kokorecci');
  const m0 = await market();
  const want = sellAllValue(3 * U, m0.co.kokorecci.u) + sellAllValue(0.5 * U, m0.co.nakliye.u);
  assert.equal(sellAllValue(3 * U, 4 * U), sellGet(4) + sellGet(3) + sellGet(2), 'tek tek satmakla aynı');
  const g0 = (await u('a')).gold;
  tick();
  await assert.rejects(b.sellAll('a', { expect: want + 1 }), /price-changed/);
  tick();
  const r = await b.sellAll('a', { expect: want });
  assert.equal(r.total, want);
  assert.equal(r.shares, 3.5);
  assert.equal((await u('a')).gold, g0 + want);
  assert.deepEqual((await u('a')).borsa || {}, {});
  const m = await market();
  assert.equal(m.co.kokorecci.u, U);
  assert.equal(m.co.kokorecci.h, 1);
  assert.equal(m.co.nakliye.u, 0);
  tick();
  await assert.rejects(b.sellAll('a', {}), /hissen yok/);
});

test('tek mekânda hepsini sat (all: true)', async () => {
  const { b, user, u, al, tick } = setup();
  await user('a', 1_000_000);
  await al('a', 'terminal', 2.75 * U);
  tick();
  const r = await b.trade('a', { op: 'sat', co: 'terminal', all: true, expect: sellAllValue(2.75 * U, 2.75 * U) });
  assert.equal(r.x, 2.75 * U);
  assert.equal((await u('a')).borsa?.terminal, undefined);
});

test('hisselerim kâr/zarar: kendi alış-satışım değeri oynatmaz, sadece piyasa', async () => {
  const { user, u, market, al, sat } = setup();
  await user('a', 10_000_000);
  await user('z', 10_000_000);
  const gain = async () => marketGainAll(await u('a'), await market()).gain;
  await al('a', 'simitci', 2 * U);
  assert.equal(await gain(), 0);
  await al('z', 'simitci', 2 * U);
  assert.equal(await gain(), 2 * 2 * 1000);
  await sat('a', 'simitci');
  assert.equal(await gain(), 2000);
  await sat('z', 'simitci', 2 * U);
  assert.equal(await gain(), 0);
  await sat('a', 'simitci');
  assert.equal((await u('a')).borsa?.simitci, undefined);
});

// ---------------------------------------------------------------------------
// TEMBEL GEÇİŞ: eski (v188) belgeler
// ---------------------------------------------------------------------------
const LEGACY_MARKET = {
  v: 1,
  distDay: '2026-11-30',
  co: { simitci: { n: 14, h: 2, acc: 123_456, inc: [5000, 7000], ps: [400, 500], ch: [12000, 14000] }, midyeci: { n: 3, h: 1, acc: 9_000 } },
};
const LEGACY_USER = { gold: 1_000, borsaSon: T0 - 3600_000, borsa: { simitci: { n: 10, a: 100_000, p: 777, c: 54_000, r: 13_000, g: 2500 }, midyeci: { n: 0, a: 9000, p: 15, c: 0 } } };

test('geçiş: eski 10 hisse = yeni 10,0 hisse; satış değeri, biriken gelir, kâr/zarar aynı', () => {
  const h = holdState(LEGACY_USER, 'simitci');
  const co = coState(LEGACY_MARKET, 'simitci');
  assert.equal(h.u, 10 * U);
  assert.equal(fmtShares(h.u), '10');
  assert.equal(co.u, 14 * U);
  // satış değeri: v188 sellAllValue(10, 14) = sellGet(14)+…+sellGet(5)
  let old = 0;
  for (let n = 14; n > 4; n--) old += Math.floor(n * 1000 * 0.99);
  assert.equal(sellAllValue(h.u, co.u), old);
  // biriken gelir: v188 p + floor(n × (acc − a) / 1000)
  const oldPend = 777 + Math.floor((10 * (123_456 - 100_000)) / 1000);
  assert.equal(pendingOf(h, co, LEGACY_MARKET.distDay), oldPend);
  assert.equal(pendingAll(LEGACY_USER, LEGACY_MARKET).by.midyeci, 15);
  // kâr/zarar: v188 g + n × (sellBase(coN) − r)
  assert.equal(marketGainAll({ borsa: { simitci: LEGACY_USER.borsa.simitci } }, LEGACY_MARKET).gain, 2500 + 10 * (14_000 - 13_000));
  // r yok (v185 öncesi): ortalama maliyet
  assert.equal(marketGainAll({ borsa: { simitci: { n: 2, c: 3000, a: 0, p: 0 } } }, { co: { simitci: { n: 4 } } }).gain, 2 * (4000 - 1500));
});

test('geçiş: eski belgelerle işlem → değerler korunur, yeni biçim yazılır, piyasa bir kez v2 olur', async () => {
  const { db, b, u, market, tick, topla } = setup({ tax: 0 });
  await db.doc('borsa/piyasa').set(LEGACY_MARKET);
  await db.doc('users/a').set(LEGACY_USER);
  const pend0 = pendingAll(LEGACY_USER, LEGACY_MARKET).total;
  tick();
  // 1 hisse sat (S=14 → satış 13.860)
  const r = await b.trade('a', { op: 'sat', co: 'simitci' });
  assert.equal(r.price, Math.floor(14 * 1000 * 0.99));
  const ua = await u('a');
  assert.equal(ua.borsa.simitci.v, 2);
  assert.equal(ua.borsa.simitci.u, 9 * U);
  assert.equal(ua.borsa.simitci.c, 54_000 - 5_400, 'maliyet orantılı düştü');
  assert.equal(ua.borsa.midyeci.n, 0, 'dokunulmayan mekân eski biçimde kalır (tembel)');
  const m = await market();
  assert.equal(m.v, 2);
  assert.equal(m.co.simitci.u, 13 * U);
  assert.equal(m.co.midyeci.u, 3 * U, 'diğer mekânlar da çevrildi');
  assert.equal(m.co.midyeci.A, String(9000n * 10n ** 9n));
  assert.equal(m.co.simitci.n, undefined);
  assert.equal(m.co.simitci.acc, undefined);
  assert.deepEqual(m.co.simitci.inc, [5000, 7000]);
  assert.deepEqual(m.co.simitci.ch, [12000, 14000]);
  // biriken gelir aynı kaldı
  assert.equal(pendingAll(ua, m).total, pend0);
  const c = await topla('a');
  assert.equal(c.gross, pend0);
});

test('geçiş: eski oyuncu belgesi + eski piyasa saatlik işte de doğru çevrilir', async () => {
  const { db, b, market, set, u, income } = setup({ tax: 0 });
  await db.doc('borsa/piyasa').set(LEGACY_MARKET);
  await db.doc('users/a').set(LEGACY_USER);
  set(Date.parse('2026-12-01T00:01:00+03:00'));
  await income('2026-11-30', 'sm', 0);
  await b.hourly();
  set(Date.parse('2026-12-01T10:01:00+03:00'));
  await income('2026-12-01', 'sm', 14_000);
  set(Date.parse('2026-12-02T00:01:00+03:00'));
  await b.hourly();
  const m = await market();
  assert.equal(m.v, 2);
  // eski hisseler hak kazanmıştır: 14.000 / 14 hisse → 10 hisse 10.000
  const before = pendingAll(LEGACY_USER, LEGACY_MARKET).total;
  assert.equal(pendingAll(await u('a'), m).total, before + 10_000);
});

test('v193: 200 satılmışken ~22 alınır; başkaları satınca sınırın üstünde kalan alamaz ama satar', async () => {
  const { user, u, al, sat, market } = setup();
  await user('a', 1e13);
  for (let i = 0; i < 20; i++) {
    await user(`b${i}`, 1e13);
    await al(`b${i}`, 'kofteci', 10 * U);
  }
  assert.equal((await market()).co.kofteci.u, 200 * U);
  const r = await al('a', 'kofteci', 100 * U);
  assert.ok(r.x > 22.2 * U && r.x < 22.3 * U, `alınan ${r.x / U}`);
  await assert.rejects(al('a', 'kofteci', U), /Alım sınırı/);
  for (let i = 0; i < 10; i++) await sat(`b${i}`, 'kofteci', 10 * U); // toplam düşer → a sınırın üstünde
  await assert.rejects(al('a', 'kofteci', U), /Alım sınırı/);
  await sat('a', 'kofteci', 1000 * U);
  assert.ok(!((await u('a')).borsa?.kofteci?.u > 0), 'hepsini sattı');
});
