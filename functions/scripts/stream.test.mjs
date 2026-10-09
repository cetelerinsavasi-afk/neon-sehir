// v80 — Yayıncılık (functions/stream.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createStream, streamSetOf, DONATION_DAILY_CAP, STREAM_STALE_MS } from '../stream.js';

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
  const clock = { now: Date.UTC(2026, 9, 9, 15) };
  const income = [];
  const muted = new Set();
  const st = createStream({
    db,
    FieldValue,
    HttpsError,
    splitIncomeForDebt,
    business: { recordIncomeTx: (tx, r) => income.push(r) },
    assertCanSpeak: async (uid) => {
      if (muted.has(uid)) throw new HttpsError('permission-denied', 'muted');
    },
    now: () => clock.now,
  });
  const present = (uid, houseId) => S(`housePresence/${uid}`, { houseId, updatedAt: new Timestamp(clock.now) });
  const items = (extra = []) => [
    { i: 'ch1', k: 'gamer', x: 0, z: 0, r: 0, c: 0, p: 1 },
    { i: 'pc1', k: 'pc', x: 1.5, z: 0.5, r: 0, c: 0, p: 1 },
    ...extra,
  ];
  S('users/ali', { displayName: 'Ali', gold: 50_000 });
  S('users/veli', { displayName: 'Veli', gold: 30_000 });
  S('users/kafeci', { displayName: 'Kafeci', gold: 0 });
  S('houses/ev1', { ownerUid: 'ali', name: 'Ali Evi', items: items() });
  S('houses/kafe', { ownerUid: 'kafeci', name: 'Neon Kafe', items: items(), biz: { type: 'internet' }, bizPrices: { stream: 300 } });
  const act = (uid, data) => st.action(uid, data);
  return { db, S, G, clock, act, present, income, muted, st };
}

test('kurulum: koltuk + menzilde bilgisayar gerekli', () => {
  assert.ok(streamSetOf([{ i: 'c', k: 'gamer', x: 0, z: 0, p: 1 }, { i: 'p', k: 'pc', x: 2, z: 2, p: 1 }], 'c'));
  // v81: İnternet Kafe İstasyonu yayın seti sayılmaz (sadece Oyuncu Bilgisayarı)
  assert.equal(streamSetOf([{ i: 'c', k: 'gamer', x: 0, z: 0, p: 1 }, { i: 'p', k: 'pcstation', x: 1, z: 0, p: 1 }], 'c'), null);
  assert.equal(streamSetOf([{ i: 'c', k: 'gamer', x: 0, z: 0, p: 1 }, { i: 'p', k: 'pc', x: 5, z: 0, p: 1 }], 'c'), null, 'bilgisayar çok uzak');
  assert.equal(streamSetOf([{ i: 'c', k: 'chairw', x: 0, z: 0, p: 1 }, { i: 'p', k: 'pc', x: 1, z: 0, p: 1 }], 'c'), null, 'oyuncu koltuğu değil');
  assert.equal(streamSetOf([{ i: 'c', k: 'gamer', x: 0, z: 0, p: 0 }, { i: 'p', k: 'pc', x: 1, z: 0, p: 1 }], 'c'), null, 'deneme ürünü');
});

test('evde yayın: ücretsiz, liste, bağış (not, sınır), kapatınca %10 vergiyle ödeme', async () => {
  const h = setup();
  await assert.rejects(h.act('ali', { op: 'start', houseId: 'ev1', chairId: 'ch1' }), /not-present/);
  h.present('ali', 'ev1');
  await assert.rejects(h.act('ali', { op: 'start', houseId: 'ev1', chairId: 'pc1' }), /no-set/);
  const r = await h.act('ali', { op: 'start', houseId: 'ev1', chairId: 'ch1', title: '  Akşam   yayını <b> ' });
  assert.ok(r.streamId);
  assert.equal(r.charged, 0);
  const s = h.G(`streams/${r.streamId}`);
  assert.equal(s.status, 'live');
  assert.equal(s.title, 'Akşam yayını b');
  assert.equal(s.pcId, 'pc1');
  assert.equal(h.G('users/ali').streamId, r.streamId);
  assert.equal(h.G('stats/streams').items[0].id, r.streamId);
  // aynı koltukta başkası yayın açamaz
  h.present('veli', 'ev1');
  // v81: başkasının evinde zaten yayın açılamaz
  await assert.rejects(h.act('veli', { op: 'start', houseId: 'ev1', chairId: 'ch1' }), /not-owner/);
  // bağış
  await assert.rejects(h.act('ali', { op: 'donate', streamId: r.streamId, amount: 100 }), /self/);
  await assert.rejects(h.act('veli', { op: 'donate', streamId: r.streamId, amount: 50 }), /Geçersiz miktar/);
  await h.act('veli', { op: 'donate', streamId: r.streamId, amount: 1000, note: 'Helal olsun!' });
  for (let k = 0; k < 9; k++) await h.act('veli', { op: 'donate', streamId: r.streamId, amount: 1000 });
  await assert.rejects(h.act('veli', { op: 'donate', streamId: r.streamId, amount: 10 }), /cap:0/);
  assert.equal(h.G('users/veli').gold, 30_000 - DONATION_DAILY_CAP);
  const s2 = h.G(`streams/${r.streamId}`);
  assert.equal(s2.donated, 10_000);
  assert.equal(s2.fx.length, 6);
  assert.equal(h.G(`streams/${r.streamId}`).fx[0].a, 1000);
  // susturulmuş oyuncu not yazamaz
  h.muted.add('veli');
  h.clock.now += 24 * 3600 * 1000; // ertesi gün (sınır sıfırlanır)
  h.present('ali', 'ev1');
  // v81: izleyiciler sunucuda sayılır
  await h.act('ali', { op: 'tick', streamId: r.streamId, viewers: 99, seen: 99 });
  for (const u of ['veli', 'kafeci', 'izleyici3']) await h.act(u, { op: 'watch', streamId: r.streamId, on: true });
  await assert.rejects(h.act('veli', { op: 'donate', streamId: r.streamId, amount: 10, note: 'merhaba' }), /muted/);
  await h.act('veli', { op: 'donate', streamId: r.streamId, amount: 10 });
  // sohbet
  h.muted.delete('veli');
  await h.act('veli', { op: 'chat', streamId: r.streamId, text: 'selam yayın' });
  await assert.rejects(h.act('veli', { op: 'chat', streamId: r.streamId, text: 'hızlı' }), /yavaş/);
  // kapat: 10.010 bağış → 1.001 vergi, 9.009 cebe
  const before = h.G('users/ali').gold;
  const end = await h.act('ali', { op: 'stop', streamId: r.streamId, viewers: 2, seen: 7 });
  assert.equal(end.summary.donated, 10_010);
  assert.equal(end.summary.tax, 1001);
  assert.equal(end.summary.net, 9009);
  assert.equal(end.summary.peak, 3);
  assert.equal(end.summary.seen, 3);
  assert.equal(h.G('users/ali').gold, before + 9009);
  assert.equal(h.G(`streams/${r.streamId}`).status, 'ended');
  assert.equal(h.G('users/ali').streamId, undefined);
  assert.equal(h.G('stats/streams').items.length, 0);
  const ledger = Object.entries(Object.fromEntries(h.db._store)).filter(([k]) => k.startsWith('taxLedger/'));
  assert.equal(ledger[0][1].data.bySource.yayin, 1001);
  // bitmiş yayına bağış olmaz
  await assert.rejects(h.act('veli', { op: 'donate', streamId: r.streamId, amount: 10 }), /ended/);
});

test('internet kafe: yayın seti dakika ücreti kafe sahibine, para bitince yayın kapanır', async () => {
  const h = setup();
  h.S('users/veli', { displayName: 'Veli', gold: 700 });
  h.present('veli', 'kafe');
  await assert.rejects(h.act('veli', { op: 'start', houseId: 'kafe', chairId: 'ch1', expect: 200 }), /price-changed:300/);
  const r = await h.act('veli', { op: 'start', houseId: 'kafe', chairId: 'ch1', expect: 300 });
  assert.equal(r.charged, 300);
  assert.equal(h.G('users/veli').gold, 400);
  assert.equal(h.G('users/kafeci').gold, 270, '%10 vergi düşülür');
  assert.equal(h.income[0].products.yayin, 1);
  // süre dolmadan nabız: ücret yok
  h.clock.now += 20_000;
  h.present('veli', 'kafe');
  let t = await h.act('veli', { op: 'tick', streamId: r.streamId, viewers: 1 });
  assert.equal(t.charged, undefined);
  // dakika doldu: yeni ücret
  h.clock.now += 40_000;
  h.present('veli', 'kafe');
  t = await h.act('veli', { op: 'tick', streamId: r.streamId, viewers: 1 });
  assert.equal(t.charged, 300);
  assert.equal(h.G('users/veli').gold, 100);
  // bir sonraki dakikaya para yetmez → yayın kapanır
  h.clock.now += 60_000;
  h.present('veli', 'kafe');
  t = await h.act('veli', { op: 'tick', streamId: r.streamId, viewers: 1 });
  assert.equal(t.stopped, 'gold');
  assert.equal(h.G(`streams/${r.streamId}`).status, 'ended');
  assert.equal(h.G(`streams/${r.streamId}`).summary.paidTotal, 600);
  // kafe sahibi kendi kafesinde ücret ödemez; fiyat ayarı
  h.present('kafeci', 'kafe');
  const own = await h.act('kafeci', { op: 'start', houseId: 'kafe', chairId: 'ch1' });
  assert.equal(own.charged, 0);
  await assert.rejects(h.act('kafeci', { op: 'price', houseId: 'kafe', price: 20 }), /price-band/);
  await h.act('kafeci', { op: 'price', houseId: 'kafe', price: 500 });
  assert.equal(h.G('houses/kafe').bizPrices.stream, 500);
  await assert.rejects(h.act('ali', { op: 'price', houseId: 'ev1', price: 500 }), /internet/);
});

test('yayıncı odadan çıkarsa nabızda kapanır; nabzı kesilen yayın süpürmede kapanıp bağışları ödenir', async () => {
  const h = setup();
  h.present('ali', 'ev1');
  const r = await h.act('ali', { op: 'start', houseId: 'ev1', chairId: 'ch1' });
  h.S('housePresence/ali', { houseId: 'baska', updatedAt: new Timestamp(h.clock.now) });
  const t = await h.act('ali', { op: 'tick', streamId: r.streamId });
  assert.equal(t.stopped, 'left');
  // yeni yayın + bağış + uygulama kapandı (nabız yok)
  h.present('ali', 'ev1');
  const r2 = await h.act('ali', { op: 'start', houseId: 'ev1', chairId: 'ch1' });
  await h.act('veli', { op: 'donate', streamId: r2.streamId, amount: 100 });
  const gold = h.G('users/ali').gold;
  h.clock.now += STREAM_STALE_MS + 1000;
  const sw = await h.st.sweep();
  assert.equal(sw.closed, 1);
  assert.equal(h.G(`streams/${r2.streamId}`).status, 'ended');
  assert.equal(h.G('users/ali').gold, gold + 90);
  // aynı kişi yeni yayın açınca eski açık yayını kapatıp öder (bağışlar kaybolmaz)
  h.present('ali', 'ev1');
  const r3 = await h.act('ali', { op: 'start', houseId: 'ev1', chairId: 'ch1' });
  await h.act('veli', { op: 'donate', streamId: r3.streamId, amount: 1000 });
  h.clock.now += STREAM_STALE_MS + 1000;
  h.present('ali', 'ev1');
  const g2 = h.G('users/ali').gold;
  const r4 = await h.act('ali', { op: 'start', houseId: 'ev1', chairId: 'ch1' });
  assert.notEqual(r4.streamId, r3.streamId);
  assert.equal(h.G(`streams/${r3.streamId}`).status, 'ended');
  assert.equal(h.G('users/ali').gold, g2 + 900);
});

test('v81: izleyici sayısı sunucuda sayılır (katıl / nabız / ayrıl / zaman aşımı)', async () => {
  const h = setup();
  h.present('ali', 'ev1');
  const { streamId } = await h.act('ali', { op: 'start', houseId: 'ev1', chairId: 'ch1' });
  let r = await h.act('veli', { op: 'watch', streamId, on: true });
  assert.equal(r.viewers, 1);
  r = await h.act('kafeci', { op: 'watch', streamId, on: true });
  assert.equal(r.viewers, 2);
  assert.equal(h.G(`streams/${streamId}`).viewers, 2);
  assert.equal(h.G(`streams/${streamId}`).peak, 2);
  // yayıncı kendini izleyici saymaz
  r = await h.act('ali', { op: 'watch', streamId, on: true });
  assert.equal(r.self, true);
  // biri ayrıldı
  r = await h.act('kafeci', { op: 'watch', streamId, on: false });
  assert.equal(r.viewers, 1);
  assert.equal(h.G(`streams/${streamId}`).viewers, 1);
  // nabzı kesilen izleyici düşer; yayıncı nabzı sayıyı günceller
  h.clock.now += 80_000;
  h.present('ali', 'ev1');
  const t = await h.act('ali', { op: 'tick', streamId, viewers: 99, seen: 99 });
  assert.equal(t.viewers, 0, 'istemcinin yolladığı sayı değil, sunucu sayısı');
  assert.equal(h.G(`streams/${streamId}`).viewers, 0);
  const st = await h.act('ali', { op: 'stop', streamId, viewers: 50, seen: 50 });
  assert.equal(st.summary.seen, 2, 'farklı izleyici sayısı');
  assert.equal(st.summary.peak, 2);
});

test('v81: başkasının evindeki/dükkânındaki setle yayın açılamaz; internet kafede ücretli açılır', async () => {
  const h = setup();
  h.present('veli', 'ev1'); // ev1 Ali'nin
  await assert.rejects(h.act('veli', { op: 'start', houseId: 'ev1', chairId: 'ch1' }), /not-owner/);
  h.S('houses/dukkan', { ownerUid: 'ali', name: 'Ali Kafe', items: h.G('houses/ev1').items, biz: { type: 'cafe' } });
  h.present('veli', 'dukkan');
  await assert.rejects(h.act('veli', { op: 'start', houseId: 'dukkan', chairId: 'ch1' }), /not-owner/);
  h.present('veli', 'kafe'); // internet kafe: ücretli olur
  const r = await h.act('veli', { op: 'start', houseId: 'kafe', chairId: 'ch1', expect: 300 });
  assert.equal(r.charged, 300);
  // aynı kafe koltuğunda ikinci yayın açılamaz
  h.S('users/ayse', { displayName: 'Ayşe', gold: 5000 });
  h.present('ayse', 'kafe');
  await assert.rejects(h.act('ayse', { op: 'start', houseId: 'kafe', chairId: 'ch1', expect: 300 }), /seat-busy/);
  h.present('ali', 'dukkan'); // sahibi kendi dükkânında ücretsiz
  const r2 = await h.act('ali', { op: 'start', houseId: 'dukkan', chairId: 'ch1' });
  assert.equal(r2.charged, 0);
});

test('v81: en çok bağış yapan 3 kişi (toplam, sıralı) yayın belgesinde', async () => {
  const h = setup();
  h.present('ali', 'ev1');
  const { streamId } = await h.act('ali', { op: 'start', houseId: 'ev1', chairId: 'ch1' });
  for (const u of ['u1', 'u2', 'u3', 'u4']) h.S(`users/${u}`, { displayName: u.toUpperCase(), gold: 10_000 });
  await h.act('u1', { op: 'donate', streamId, amount: 100 });
  await h.act('u2', { op: 'donate', streamId, amount: 1000 });
  await h.act('u3', { op: 'donate', streamId, amount: 10 });
  await h.act('u1', { op: 'donate', streamId, amount: 1000 }); // u1 toplam 1100 → birinci
  await h.act('u4', { op: 'donate', streamId, amount: 100 }); // u3'ü geçer
  const top = h.G(`streams/${streamId}`).top;
  assert.deepEqual(top.map((x) => [x.n, x.a]), [['U1', 1100], ['U2', 1000], ['U4', 100]]);
  const end = await h.act('ali', { op: 'stop', streamId });
  assert.equal(end.summary.top[0].n, 'U1');
});

test('v81: internet kafe — sette oyun için ödenmiş süre varken yayın açmak ikinci kez ücret almaz', async () => {
  const h = setup();
  h.present('veli', 'kafe');
  h.S('netSessions/kafe_veli', { houseId: 'kafe', uid: 'veli', deviceId: 'pc1', creditUntilMs: h.clock.now + 40_000 });
  const goldBefore = h.G('users/veli').gold;
  const r = await h.act('veli', { op: 'start', houseId: 'kafe', chairId: 'ch1', expect: 1 });
  assert.equal(r.charged, 0);
  assert.equal(r.paidUntilMs, h.clock.now + 40_000);
  assert.equal(h.G('users/veli').gold, goldBefore);
});
