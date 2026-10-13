// v91 / v91.1 — Google Play Faturalandırma (zümrüt): teslim + iade koruması.
// Gerçek Google yerine sahte bir "Play" kullanılır; para akışının her
// senaryosu (başarılı, tekrar, yarış, ağ hatası, bekleyen ödeme, iade,
// chargeback, eksi bakiye, sayfalı iade listesi...) burada denenir.
// Çalıştır: node --test functions/scripts/play-billing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createPlayBilling, PLAY_REFUND_BLOCK_LIMIT } from '../playBilling.js';

class HttpsError extends Error {
  constructor(c, m) {
    super(m);
    this.code = c;
  }
}
const PACKS = { paket1: { id: 'paket1', emerald: 50 }, paket2: { id: 'paket2', emerald: 200 } };
const httpErr = (status) => Object.assign(new Error(`http ${status}`), { response: { status } });

// Sahte Google Play: satın almalar + iade listesi + arıza enjeksiyonu
function fakePlay(purchases = {}) {
  const play = {
    purchases,
    voided: [],
    calls: { get: 0, consume: 0, listVoided: 0 },
    failGet: null, // ör. 403 → izin yok
    failConsumeTimes: 0,
    pageSize: 1000,
    async getProductPurchase(_pkg, productId, token) {
      play.calls.get += 1;
      if (play.failGet) throw httpErr(play.failGet);
      const p = play.purchases[token];
      if (!p || p.productId !== productId) throw httpErr(404);
      return { ...p };
    },
    async consume(_pkg, _productId, token) {
      play.calls.consume += 1;
      if (play.failConsumeTimes > 0) {
        play.failConsumeTimes -= 1;
        throw httpErr(503);
      }
      if (play.purchases[token]) play.purchases[token].consumptionState = 1;
    },
    async listVoided(_pkg, { startTime, endTime, token }) {
      play.calls.listVoided += 1;
      const all = play.voided.filter((v) => v.voidedTimeMillis >= startTime && v.voidedTimeMillis <= endTime);
      const from = token ? Number(token) : 0;
      const page = all.slice(from, from + play.pageSize);
      const next = from + play.pageSize < all.length ? String(from + play.pageSize) : null;
      return { voidedPurchases: page, ...(next ? { tokenPagination: { nextPageToken: next } } : {}) };
    },
  };
  return play;
}

function setup(purchases) {
  const db = new FakeFirestore({ yieldEvery: false });
  const G = (p) => db._store.get(p)?.data;
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const play = fakePlay(purchases);
  const writeGoldStorePackage = (tx, uid, packageId) => {
    tx.set(db.collection('users').doc(uid), { emerald: FieldValue.increment(PACKS[packageId].emerald) }, { merge: true });
  };
  const pb = createPlayBilling({ db, FieldValue, HttpsError, writeGoldStorePackage, packages: PACKS, playApi: play });
  const msgs = (uid) => [...db._store.keys()].filter((k) => k.startsWith(`users/${uid}/messages/`)).map((k) => G(k).text);
  const em = (uid) => G(`users/${uid}`)?.emerald || 0;
  return { db, G, S, pb, play, msgs, em };
}
const buy = (pb, uid, productId, purchaseToken) => pb.verifyPlayPurchase(uid, { productId, purchaseToken });

// ---------------------------------------------------------------- TESLİM
test('ödenmiş satın alma bir kez yüklenir ve tüketilir; tekrar gönderilince ikinci kez yüklenmez', async () => {
  const { pb, play, em } = setup({ tok1: { productId: 'zumrut_200', purchaseState: 0, orderId: 'GPA.1' } });
  const r1 = await buy(pb, 'u1', 'zumrut_200', 'tok1');
  assert.equal(r1.credited, true);
  assert.equal(em('u1'), 200);
  assert.equal(play.calls.consume, 1);
  const r2 = await buy(pb, 'u1', 'zumrut_200', 'tok1');
  assert.equal(r2.alreadyCredited, true);
  assert.equal(em('u1'), 200);
});

test('aynı anda üç istek gelse bile tek yükleme', async () => {
  const { pb, em } = setup({ tok2: { productId: 'zumrut_50', purchaseState: 0 } });
  await Promise.all([1, 2, 3].map(() => buy(pb, 'u1', 'zumrut_50', 'tok2')));
  assert.equal(em('u1'), 50);
});

test('başka hesap aynı token ile yükleyemez', async () => {
  const { pb } = setup({ tok3: { productId: 'zumrut_50', purchaseState: 0 } });
  await buy(pb, 'u1', 'zumrut_50', 'tok3');
  await assert.rejects(buy(pb, 'u2', 'zumrut_50', 'tok3'), (e) => e.code === 'permission-denied');
});

test('bekleyen ödeme yüklenmez; ödeme onaylanınca (geri yüklemede) yüklenir', async () => {
  const { pb, play, em } = setup({ pend: { productId: 'zumrut_50', purchaseState: 2 } });
  const r = await buy(pb, 'u1', 'zumrut_50', 'pend');
  assert.equal(r.pending, true);
  assert.equal(em('u1'), 0);
  play.purchases.pend.purchaseState = 0; // "yavaş test kartı" onaylandı
  const r2 = await buy(pb, 'u1', 'zumrut_50', 'pend');
  assert.equal(r2.credited, true);
  assert.equal(em('u1'), 50);
});

test('iptal / sahte token / bilinmeyen ürün / başka ürünün token\'ı reddedilir', async () => {
  const { pb, em } = setup({ canc: { productId: 'zumrut_50', purchaseState: 1 }, ok: { productId: 'zumrut_50', purchaseState: 0 } });
  await assert.rejects(buy(pb, 'u1', 'zumrut_50', 'canc'), (e) => e.code === 'failed-precondition');
  await assert.rejects(buy(pb, 'u1', 'zumrut_50', 'yok'), (e) => e.code === 'invalid-argument');
  await assert.rejects(buy(pb, 'u1', 'bedava', 'x'), (e) => e.code === 'invalid-argument');
  await assert.rejects(buy(pb, 'u1', 'zumrut_200', 'ok'), (e) => e.code === 'invalid-argument', 'ucuz paketin token\'ıyla pahalı paket alınamaz');
  assert.equal(em('u1'), 0);
});

test('Google izni yoksa (403) para kaybolmaz: hata döner, izin gelince tekrar denemede yüklenir', async () => {
  const { pb, play, em } = setup({ t: { productId: 'zumrut_200', purchaseState: 0 } });
  play.failGet = 403;
  await assert.rejects(buy(pb, 'u1', 'zumrut_200', 't'), (e) => e.code === 'unavailable');
  assert.equal(em('u1'), 0);
  play.failGet = null;
  const r = await buy(pb, 'u1', 'zumrut_200', 't');
  assert.equal(r.credited, true);
  assert.equal(em('u1'), 200);
});

test('tüketme başarısız olursa zümrüt yine yüklenir; saatlik tarama tüketmeyi tamamlar', async () => {
  const { pb, play, G, em, db } = setup({ t: { productId: 'zumrut_50', purchaseState: 0 } });
  play.failConsumeTimes = 1;
  await buy(pb, 'u1', 'zumrut_50', 't');
  assert.equal(em('u1'), 50);
  const key = [...db._store.keys()].find((k) => k.startsWith('playPurchases/'));
  assert.equal(G(key).consumedAt, null, 'henüz tüketilmedi');
  const r = await pb.retryPendingConsumes(Date.now() + 10 * 60 * 1000);
  assert.equal(r.consumed, 1);
  assert.ok(G(key).consumedAt, 'tarama tüketti');
  assert.equal(em('u1'), 50, 'tarama ikinci kez yüklemez');
});

// ---------------------------------------------------------------- İADE
test('iade: zümrüt geri alınır, mesaj gider, aynı iade iki kez işlenmez', async () => {
  const { pb, play, em, msgs, G } = setup({ t: { productId: 'zumrut_200', purchaseState: 0, orderId: 'GPA.9' } });
  await buy(pb, 'u1', 'zumrut_200', 't');
  const now = Date.now();
  play.voided.push({ purchaseToken: 't', orderId: 'GPA.9', voidedTimeMillis: now - 1000, voidedReason: 1, voidedSource: 0 });
  const r = await pb.processVoidedPurchases(now);
  assert.equal(r.revoked, 1);
  assert.equal(em('u1'), 0);
  assert.equal(G('users/u1').playRefundCount, 1);
  assert.ok(msgs('u1').some((m) => m.includes('geri alındı')));
  const r2 = await pb.processVoidedPurchases(now + 1000);
  assert.equal(r2.revoked, 0);
  assert.equal(em('u1'), 0, 'ikinci tarama tekrar düşmez');
});

test('iade edilen zümrüt harcanmışsa bakiye eksiye düşer; sonraki satın almadan düşülür', async () => {
  const { pb, play, em, S } = setup({
    a: { productId: 'zumrut_200', purchaseState: 0 },
    b: { productId: 'zumrut_200', purchaseState: 0 },
  });
  await buy(pb, 'u1', 'zumrut_200', 'a');
  S('users/u1', { emerald: 10 }); // 190 zümrüt harcadı
  play.voided.push({ purchaseToken: 'a', voidedTimeMillis: Date.now(), voidedReason: 7 });
  await pb.processVoidedPurchases(Date.now() + 1);
  assert.equal(em('u1'), -190, 'borç');
  await buy(pb, 'u1', 'zumrut_200', 'b');
  assert.equal(em('u1'), 10, 'yeni paket borcu kapattı');
});

test('iade edilmiş satın alma sonradan yüklenemez (yüklenmeden iade edilmiş olsa bile)', async () => {
  const { pb, play, em } = setup({ x: { productId: 'zumrut_50', purchaseState: 0 }, y: { productId: 'zumrut_50', purchaseState: 0 } });
  // y: hiç yüklenmeden iade edildi
  play.voided.push({ purchaseToken: 'y', voidedTimeMillis: Date.now(), voidedReason: 8 });
  const r = await pb.processVoidedPurchases(Date.now() + 1);
  assert.equal(r.notCredited, 1);
  await assert.rejects(buy(pb, 'u1', 'zumrut_50', 'y'), (e) => e.code === 'failed-precondition');
  // x: yüklendi, iade edildi, tekrar gönderiliyor
  await buy(pb, 'u1', 'zumrut_50', 'x');
  play.voided.push({ purchaseToken: 'x', voidedTimeMillis: Date.now() + 2, voidedReason: 1 });
  await pb.processVoidedPurchases(Date.now() + 3);
  await assert.rejects(buy(pb, 'u1', 'zumrut_50', 'x'), (e) => e.code === 'failed-precondition');
  assert.equal(em('u1'), 0);
});

test(`${PLAY_REFUND_BLOCK_LIMIT} iadeden sonra hesabın mağazası kısıtlanır`, async () => {
  const toks = {};
  for (let i = 0; i < PLAY_REFUND_BLOCK_LIMIT; i++) toks[`r${i}`] = { productId: 'zumrut_50', purchaseState: 0 };
  const { pb, play, G } = setup(toks);
  const now = Date.now();
  for (let i = 0; i < PLAY_REFUND_BLOCK_LIMIT; i++) {
    await buy(pb, 'u1', 'zumrut_50', `r${i}`);
    play.voided.push({ purchaseToken: `r${i}`, voidedTimeMillis: now + i, voidedReason: 1 });
  }
  await pb.processVoidedPurchases(now + 100);
  assert.equal(G('users/u1').playRefundCount, PLAY_REFUND_BLOCK_LIMIT);
  assert.equal(G('users/u1').playPurchaseBlocked, true);
});

test('iade listesi sayfalıysa tüm sayfalar işlenir; kontrol noktası ilerler', async () => {
  const toks = {};
  for (let i = 0; i < 5; i++) toks[`p${i}`] = { productId: 'zumrut_50', purchaseState: 0 };
  const { pb, play, em, G } = setup(toks);
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    await buy(pb, `u${i}`, 'zumrut_50', `p${i}`);
    play.voided.push({ purchaseToken: `p${i}`, voidedTimeMillis: now + i, voidedReason: 1 });
  }
  play.pageSize = 2;
  const r = await pb.processVoidedPurchases(now + 100);
  assert.equal(r.revoked, 5);
  for (let i = 0; i < 5; i++) assert.equal(em(`u${i}`), 0);
  assert.equal(G('system/playVoidedSweep').lastEndMs, now + 100);
});
