// =============================================================================
// moneyLog.js — v92 Profil › Günlük Rapor (cebe giren / çıkan altın)
// =============================================================================
// Oyuncunun altını (users/{uid}.gold) sunucuda yüzlerce yerden değişiyor. Her
// noktaya ayrı kayıt eklemek yerine:
//   1) users/{uid} her güncellendiğinde (Firestore tetikleyicisi) altın farkı
//      alınır → moneyLog/{uid}_{gün} günlük özetine eklenir. Böylece HİÇBİR
//      hareket kaçmaz (kaynağı bilinmese de "Diğer" olarak sayılır).
//   2) Kaynak: altını değiştiren yazma, aynı belgeye `goldTag: goldTag('kaynak')`
//      da yazar. Etiket her yazmada benzersizdir (sonuna rastgele ek) → tetikleyici
//      sadece BU yazmada değişen etiketi kullanır; etiketsiz yazma "diger" olur.
// Gün: İstanbul gece yarısı (00:00). İstemci bugün + önceki 2 günü okur.
// moneyLog/{uid}_{gün} = { uid, day, in, out, n, by: { kaynak: { in, out, n } }, updatedAtMs }
// =============================================================================
import { midnightDayKey } from './businessCatalogData.js';

let seq = 0;
// Altını değiştiren yazmaya eklenecek etiket ("kaynak|benzersiz")
export function goldTag(source) {
  seq = (seq + 1) % 1_000_000;
  const k = String(source || 'diger').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'diger';
  return `${k}|${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
export function tagSource(tag) {
  const k = String(tag || '').split('|')[0];
  return /^[a-zA-Z0-9_]{1,24}$/.test(k) ? k : 'diger';
}
export const MONEY_LOG_KEEP_DAYS = 3;

// Tetikleyici gövdesi (index.js → onDocumentUpdated('users/{uid}')).
// before/after: belge verileri · atMs: olay zamanı
export async function recordGoldChange({ db, FieldValue, uid, before, after, atMs }) {
  if (!before || !after || !uid) return null;
  const delta = Math.round(Number(after.gold || 0) - Number(before.gold || 0));
  if (!delta || !Number.isFinite(delta)) return null;
  const changed = after.goldTag && after.goldTag !== before.goldTag;
  const src = changed ? tagSource(after.goldTag) : 'diger';
  const day = midnightDayKey(atMs || Date.now());
  const ref = db.collection('moneyLog').doc(`${uid}_${day}`);
  const inc = delta > 0 ? delta : 0;
  const out = delta < 0 ? -delta : 0;
  const patch = {
    uid,
    day,
    in: FieldValue.increment(inc),
    out: FieldValue.increment(out),
    n: FieldValue.increment(1),
    by: { [src]: { in: FieldValue.increment(inc), out: FieldValue.increment(out), n: FieldValue.increment(1) } },
    updatedAtMs: Date.now(),
  };
  await ref.set(patch, { merge: true });
  return { day, src, delta };
}

// Eski kayıtları siler (saatlik bakım): 3 günden eski günlük özetler.
export async function cleanupMoneyLog({ db, now = Date.now() }) {
  const keepFrom = midnightDayKey(now - (MONEY_LOG_KEEP_DAYS - 1) * 24 * 60 * 60 * 1000);
  const old = await db.collection('moneyLog').where('day', '<', keepFrom).limit(400).get();
  if (!old.size) return { days: 0 };
  const batch = db.batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return { days: old.size };
}
