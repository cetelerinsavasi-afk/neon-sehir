// =============================================================================
// v196Closing.js — KAPANIŞ MODU (Faz 1.1)
// -----------------------------------------------------------------------------
// migrations/v196 = { closing: true, closingAtMs } (sadece sunucu yazar; kurallarda istemciye kapalı).
// Açık olduğunda yeni ev / ofis / işletme açma, mobilya pazarı (ilan + alım), dükkân stoğu ekleme,
// malzeme ilanı, işletme fiyatı değiştirme, fabrika makinesi alma ve yatırımlarda hisse senedi alma
// reddedilir. Hediye hisse hakkı closingAtMs anındaki duruma göre belirlenir (Faz 6.11).
//
// MALİYET: bayrak örnek (instance) başına en çok 60 sn'de bir okunur (1 okuma). Sadece kapatılan
// işlemlerde bakılır — diğer işlemlere ek okuma yok.
// Açma / kapama: runV196MigrationNow?secret=…&op=close (functions/index.js).
// =============================================================================
import { V196_FLAG_DOC, CLOSING_TEXT, CLOSING_HOUSE_OPS, CLOSING_SHOP_OPS, CLOSING_STREAM_OPS } from './v196Shared.js';

export const CLOSING_CACHE_MS = 60_000;

export function createClosing({ db, HttpsError, now = () => Date.now() }) {
  let cache = null; // { atMs, v: { closing, closingAtMs } }
  async function state() {
    const t = now();
    if (cache && t - cache.atMs < CLOSING_CACHE_MS) return cache.v;
    let v = { closing: false, closingAtMs: null };
    try {
      const s = await db.doc(V196_FLAG_DOC).get();
      const d = s.exists ? s.data() : {};
      // geçiş uygulanınca (appliedAtMs) kapanış biter: kalkan işlemler zaten yönlendiricilerde kibarca reddedilir,
      // makine alımı gibi süren işlemler yeniden açılır
      v = { closing: d.closing === true && !d.appliedAtMs, closingAtMs: Number(d.closingAtMs) || null, applied: Boolean(d.appliedAtMs) };
    } catch (err) {
      // okunamazsa önceki değer korunur (yoksa açık sayılmaz)
      if (cache) return cache.v;
    }
    cache = { atMs: t, v };
    return v;
  }
  const fail = () => {
    throw new HttpsError('failed-precondition', CLOSING_TEXT);
  };
  async function assertOpen() {
    if ((await state()).closing) fail();
  }
  async function guardOp(kind, op) {
    const list = kind === 'house' ? CLOSING_HOUSE_OPS : kind === 'shop' ? CLOSING_SHOP_OPS : kind === 'stream' ? CLOSING_STREAM_OPS : [];
    if (list.includes(op)) await assertOpen();
  }
  const reset = () => (cache = null);
  return { state, assertOpen, guardOp, reset };
}
