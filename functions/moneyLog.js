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
const SRC_RE = /^[a-zA-Z0-9_]{1,24}$/;
const cleanSrc = (v) => String(v || 'diger').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'diger';
// Altını değiştiren yazmaya eklenecek etiket ("kaynak|benzersiz").
// v92.3 — entries verilirse ("kaynak|benzersiz|kalem:tutar,…") rapora altın farkı
// DEĞİL bu kalemler yazılır. Yatırım/banka: anapara yatırıp çekmek rapora
// girmez; sadece gerçekleşen kâr/zarar, faiz ve komisyon girer. Boş entries
// ({}) → bu hareket rapora hiç yazılmaz.
export function goldTag(source, entries) {
  seq = (seq + 1) % 1_000_000;
  const base = `${cleanSrc(source)}|${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (!entries || typeof entries !== 'object') return base;
  const parts = Object.entries(entries)
    .map(([k, v]) => [cleanSrc(k), Math.round(Number(v) || 0)])
    .filter(([, v]) => v && Number.isFinite(v))
    .map(([k, v]) => `${k}:${v}`);
  return `${base}|${parts.join(',')}`;
}
export function tagSource(tag) {
  const k = String(tag || '').split('|')[0];
  return SRC_RE.test(k) ? k : 'diger';
}
// Etiketteki rapor kalemleri: null = kalem yok (altın farkı yazılır) · [] = hiçbir şey yazılmaz
export function tagEntries(tag) {
  const parts = String(tag || '').split('|');
  if (parts.length < 3) return null;
  const out = [];
  for (const e of parts[2].split(',')) {
    const m = /^([a-zA-Z0-9_]{1,24}):(-?\d{1,15})$/.exec(e);
    if (m && Number(m[2])) out.push([m[1], Number(m[2])]);
  }
  return out;
}
// v92.3 — Yatırım satışında gerçekleşen kâr/zarar (ortalama maliyet yöntemi).
// cost: elde kalan varlığın toplam alış maliyeti (altın) · have: eldeki adet ·
// units: satılan adet · gross: komisyon öncesi satış tutarı.
export function realizeSale({ cost, have, units, gross }) {
  const c = Math.max(0, Number(cost) || 0);
  const h = Number(have) || 0;
  const u = Math.max(0, Number(units) || 0);
  const all = h <= 0 || u >= h - 1e-9;
  const part = all ? c : c * (u / h);
  return { pnl: Math.round((Number(gross) || 0) - part), newCost: all ? 0 : Math.max(0, c - part) };
}
// Banka çekiminde anaparanın üstündeki kısım = kazanılan faiz.
export function realizeBankWithdraw({ principal, balance, amount }) {
  const b = Number(balance) || 0;
  const p = Math.min(Math.max(0, Number(principal) || 0), b);
  const a = Math.max(0, Number(amount) || 0);
  if (b <= 0) return { interest: 0, newPrincipal: 0 };
  const part = a >= b ? p : p * (a / b);
  return { interest: Math.max(0, Math.round(a - part)), newPrincipal: a >= b ? 0 : Math.max(0, p - part) };
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
  const entries = (changed && tagEntries(after.goldTag)) || [[src, delta]];
  if (!entries.length) return { skipped: true, src, delta };
  const day = midnightDayKey(atMs || Date.now());
  const ref = db.collection('moneyLog').doc(`${uid}_${day}`);
  let inSum = 0;
  let outSum = 0;
  const by = {};
  for (const [k, v] of entries) {
    const inc = v > 0 ? v : 0;
    const out = v < 0 ? -v : 0;
    inSum += inc;
    outSum += out;
    by[k] = { in: FieldValue.increment(inc), out: FieldValue.increment(out), n: FieldValue.increment(1) };
  }
  const patch = {
    uid,
    day,
    in: FieldValue.increment(inSum),
    out: FieldValue.increment(outSum),
    n: FieldValue.increment(1),
    by,
    updatedAtMs: Date.now(),
  };
  await ref.set(patch, { merge: true });
  return { day, src, delta, entries };
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
