// =============================================================================
// belediyeKasa.js — v127 BELEDİYE KASASI: eksiye düşmeyen kasa + borçlar
// -----------------------------------------------------------------------------
// Devlet defteri (functions/stateTreasury.js) olduğu gibi çalışmaya devam eder.
// Bu modül, defterin üstüne "kasada ne kadar para var, şu gider ödenebilir mi?"
// denetimini ekler — okuma maliyeti düşük kalacak şekilde:
//
//   stateTreasury/live  — { balance, outCumAt, atMs, today }
//       Defterin (kapanmış bakiye + açık günlerin parçaları) TAM toplamı; en fazla
//       10 dakikada bir yeniden hesaplanır (fold: ~17 okuma).
//   belediye/kasa       — { outCum, reserved }
//       outCum: canlı defterdeki her giderin ANINDA artırdığı sayaç
//       (stateWrite → kasa). reserved: gece maaşları / maaş borcu ödenirken
//       ayrılan para (ödendikçe düşer).
//
//   Harcanabilir = live.balance − (kasa.outCum − live.outCumAt) − kasa.reserved
//
//   fold kasa.outCum'u defterden ÖNCE okur: arada yazılan gider iki kez düşülür
//   (temkinli — kasa olduğundan az görünür, asla fazla görünmez). Gün içinde
//   gelen vergiler en geç 10 dk içinde harcanabilir olur.
//
// BORÇLAR (kullanıcı kuralları):
//   • Maaş borcu: o gece kasa yetmediyse maaşların TAMAMI ödenmez; gün gün ayrı
//     kayıt (belediyeDebts/{gün}), faizsiz. Başkan / yardımcı bir günün tamamını
//     tek seferde kapatır; ayrıca her gece bugünün maaşları ödenebildiyse en yeni
//     günden başlayarak yetebildiği kadar gün kapanır. İşi bırakan da parasını
//     sonradan alır.
//   • Diğer borçlar (belediye/otherDebt — tek kalem): kasa yetmezken yapılan
//     soygun ödemeleri (%1 günlük faiz, 00:00) + güncelleme anındaki eski kasa
//     açığı (faizsiz). Sadece başkan ve yardımcılar elle, parça parça öder.
// =============================================================================
import { foldDocs, stateWrite, statWrite, stateDayKey, KASA_DOC } from './stateTreasury.js';

export const LIVE_DOC = 'stateTreasury/live';
export const OTHER_DEBT_DOC = 'belediye/otherDebt';
export const FOLD_STALE_MS = 10 * 60 * 1000;
export const ROBBERY_DEBT_DAILY_INTEREST = 0.01;
const LOG_MAX = 40;

export function spendableOf(kasa, live) {
  const balance = Number(live?.balance || 0);
  const outNow = Number(kasa?.outCum || 0);
  const outAt = Number(live?.outCumAt ?? outNow);
  return Math.floor(balance - Math.max(0, outNow - outAt) - Math.max(0, Number(kasa?.reserved || 0)));
}

export function createKasa({ db, FieldValue, now = () => Date.now() }) {
  const kasaRef = db.doc(KASA_DOC);
  const liveRef = db.doc(LIVE_DOC);
  const otherRef = db.doc(OTHER_DEBT_DOC);
  const inc = (n) => FieldValue.increment(n);

  // Defterin tam bakiyesi (kapanmış + açık günler). kasa.outCum ÖNCE okunur.
  async function fold() {
    const kasa = (await kasaRef.get()).data() || {};
    const outCumAt = Number(kasa.outCum || 0);
    const main = (await db.doc('stateTreasury/main').get()).data() || {};
    const closed = main.closedThrough || '';
    let q = db.collection('stateLedger');
    if (closed) q = q.where('dayKey', '>', closed);
    const snap = await q.get();
    const days = foldDocs(snap.docs.filter((d) => (d.data().dayKey || '') > closed));
    let balance = Number(main.balance || 0);
    for (const d of Object.values(days)) balance += d.inTotal - d.outTotal;
    const todayKey = stateDayKey(now());
    const t = days[todayKey];
    const live = {
      balance: Math.round(balance),
      outCumAt,
      atMs: now(),
      today: t ? { dayKey: todayKey, in: t.in, out: t.out, inTotal: t.inTotal, outTotal: t.outTotal, stat: t.stat || {} } : { dayKey: todayKey, in: {}, out: {}, inTotal: 0, outTotal: 0, stat: {} },
    };
    await liveRef.set(live);
    // v127 tek seferlik: güncelleme anında kasa eksideyse eksi kısım borca
    // çevrilir (faizsiz "eski açık") ve kasa 0'dan başlar.
    if (!kasa.initDone) await initOnce(live);
    return live;
  }

  async function initOnce(live) {
    await db.runTransaction(async (tx) => {
      const [k, l, o] = await Promise.all([tx.get(kasaRef), tx.get(liveRef), tx.get(otherRef)]);
      if (k.data()?.initDone) return;
      const cur = l.data() || live;
      const sp = spendableOf(k.data() || {}, cur);
      const at = now();
      if (sp < 0) {
        const gap = -sp;
        const od = o.data() || {};
        stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'borc_acik', amount: gap, atMs: at });
        tx.set(liveRef, { balance: inc(gap) }, { merge: true });
        tx.set(otherRef, { eski: inc(gap), log: [{ atMs: at, kind: 'eski', amount: gap, note: 'Güncelleme anındaki kasa açığı' }, ...(od.log || [])].slice(0, LOG_MAX), updatedAtMs: at }, { merge: true });
      }
      tx.set(kasaRef, { initDone: true, initAtMs: at, initSpendable: sp }, { merge: true });
    });
  }

  async function liveFresh(maxAgeMs = FOLD_STALE_MS) {
    const l = (await liveRef.get()).data();
    if (!l || now() - Number(l.atMs || 0) > maxAgeMs) return fold();
    return l;
  }

  // İşlem içinde (YAZMALARDAN ÖNCE) kasa durumu
  async function readTx(tx) {
    const [k, l] = await Promise.all([tx.get(kasaRef), tx.get(liveRef)]);
    const kasa = k.data() || {};
    const live = l.data() || {};
    return { kasa, live, spendable: spendableOf(kasa, live) };
  }

  // Denetimli gider (işlem içinde, okumalardan sonra). Yeterliyse yazar → true.
  function spendTx(tx, st, { cat, amount, atMs = now(), dayKey = null, stat = null, fromReserved = false }) {
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    if (!amt) return true;
    if (!fromReserved && st.spendable < amt) return false;
    stateWrite(tx, db, FieldValue, { kind: 'out', cat, amount: amt, atMs, dayKey, stat, noKasa: true });
    tx.set(kasaRef, { outCum: inc(amt), ...(fromReserved ? { reserved: inc(-amt) } : {}), updatedAtMs: atMs }, { merge: true });
    if (!fromReserved) st.spendable -= amt;
    return true;
  }

  // Kasa yeterse öde, yetmezse TAMAMI "diğer borç" (soygun: %1 faizli) — kasa değişmez.
  async function spendOrDebt({ cat, amount, note = '', dayKey = null, debtKind = 'soygun' }) {
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    if (!amt) return { paid: true, amount: 0 };
    await liveFresh();
    return db.runTransaction(async (tx) => {
      const st = await readTx(tx);
      const od = (await tx.get(otherRef)).data() || {};
      const at = now();
      if (spendTx(tx, st, { cat, amount: amt, atMs: at, dayKey })) return { paid: true, amount: amt };
      tx.set(otherRef, { [debtKind]: inc(amt), log: [{ atMs: at, kind: debtKind, amount: amt, note: String(note).slice(0, 120) }, ...(od.log || [])].slice(0, LOG_MAX), updatedAtMs: at }, { merge: true });
      statWrite(tx, db, FieldValue, { atMs: at, dayKey, stat: { borcYazilan: amt, [`borcYazilan_${cat}`]: amt } });
      return { paid: false, debt: amt };
    });
  }

  // Diğer borçlardan parça ödeme (önce faizli soygun borcu, sonra eski açık)
  async function payOther({ amount, byName = '' }) {
    const want = Math.max(0, Math.floor(Number(amount) || 0));
    if (!want) return { ok: false, error: 'Tutar gir.' };
    await liveFresh(15 * 1000);
    return db.runTransaction(async (tx) => {
      const st = await readTx(tx);
      const od = (await tx.get(otherRef)).data() || {};
      const soygun = Math.max(0, Math.round(Number(od.soygun || 0)));
      const eski = Math.max(0, Math.round(Number(od.eski || 0)));
      const total = soygun + eski;
      if (!total) return { ok: false, error: 'Ödenecek borç yok.' };
      const pay = Math.min(want, total);
      if (st.spendable < pay) return { ok: false, error: `Kasada yeterli para yok (kasa: ${Math.max(0, st.spendable).toLocaleString('tr-TR')} altın).` };
      const a = Math.min(pay, soygun);
      const b = pay - a;
      const at = now();
      spendTx(tx, st, { cat: 'borc_diger', amount: pay, atMs: at });
      tx.set(otherRef, { soygun: inc(-a), eski: inc(-b), paidTotal: inc(pay), log: [{ atMs: at, kind: 'odeme', amount: pay, note: byName ? `${byName} ödedi` : '' }, ...(od.log || [])].slice(0, LOG_MAX), updatedAtMs: at }, { merge: true });
      return { ok: true, paid: pay, left: total - pay };
    });
  }

  // 00:00 — soygun borçlarına %1 faiz (gün başına bir kez)
  async function applyInterest(dayKey) {
    return db.runTransaction(async (tx) => {
      const od = (await tx.get(otherRef)).data() || {};
      if (od.lastInterestDay === dayKey) return { skipped: true };
      const base = Math.max(0, Math.round(Number(od.soygun || 0)));
      const add = Math.round(base * ROBBERY_DEBT_DAILY_INTEREST);
      const at = now();
      const patch = { lastInterestDay: dayKey, updatedAtMs: at };
      if (add > 0) {
        patch.soygun = inc(add);
        patch.interestTotal = inc(add);
        patch.log = [{ atMs: at, kind: 'faiz', amount: add, note: '%1 günlük faiz' }, ...(od.log || [])].slice(0, LOG_MAX);
      }
      tx.set(otherRef, patch, { merge: true });
      return { added: add };
    });
  }

  // Ayırma: tutarın tamamı harcanabilirse ayrılır (reserved += tutar) → true
  function reserveTx(tx, st, amount) {
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    if (st.spendable < amt) return false;
    tx.set(kasaRef, { reserved: inc(amt), updatedAtMs: now() }, { merge: true });
    st.spendable -= amt;
    return true;
  }
  function releaseTx(tx, amount) {
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    if (amt) tx.set(kasaRef, { reserved: inc(-amt), updatedAtMs: now() }, { merge: true });
  }

  async function status(maxAgeMs = 60 * 1000) {
    const live = await liveFresh(maxAgeMs);
    const [k, od] = await Promise.all([kasaRef.get(), otherRef.get()]);
    const kasa = k.data() || {};
    const other = od.data() || {};
    return {
      spendable: spendableOf(kasa, live),
      reserved: Math.max(0, Number(kasa.reserved || 0)),
      atMs: live.atMs,
      today: live.today || null,
      other: { soygun: Math.round(Number(other.soygun || 0)), eski: Math.round(Number(other.eski || 0)), log: (other.log || []).slice(0, 20), lastInterestDay: other.lastInterestDay || null },
    };
  }

  return { fold, liveFresh, readTx, spendTx, spendOrDebt, payOther, applyInterest, reserveTx, releaseTx, status, kasaRef, liveRef, otherRef };
}
