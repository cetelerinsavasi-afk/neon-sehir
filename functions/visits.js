// =============================================================================
// v77 — Mekân ziyaret sayacı (Soygun › Ziyaret › "Popüler" listesi için)
//
// Bir hesap bir mekâna günde en fazla 1 ziyaret sayılır (günde 100 kez girse
// de 1). Mekân sahibi de sayılır. Gün 00:00'da döner (İstanbul).
//   venueVisits/{gün}_{anahtar}: { dayKey, key, kind: 'venue'|'house', count,
//                                  houseId?, name?, ownerName?, bizType? }
//   anahtar: oyunun mekânları için VISIT_VENUES, evler/işletmeler için h_{houseId}
//   venueVisitLast/{uid}: { [anahtar]: gün } (bugün sayıldı mı; sadece sunucu)
// Popüler listesi: dünün en çok ziyaret edilen 8 mekânı + şu an içinde biri
// olan mekânlar → önce anlık kişi sayısı, eşitlikte dünkü ziyaret (istemci).
// =============================================================================
import { midnightDayKey } from './businessCatalogData.js';

export const VISIT_VENUES = ['park', 'banka', 'karakol', 'camii', 'gazino', 'araba_galerisi', 'silah_magazasi', 'modifiye_garaji'];
export const houseVisitKey = (houseId) => `h_${houseId}`;

export function createVisits({ db, FieldValue, now = () => Date.now() }) {
  // Ziyareti say. meta: ev/işletme bilgisi (listede göstermek için). Hata fırlatmaz.
  async function recordVisit(uid, key, meta = null) {
    if (!uid || !key) return { ok: false };
    const t = now();
    const day = midnightDayKey(t);
    const lastRef = db.collection('venueVisitLast').doc(uid);
    const visitRef = db.collection('venueVisits').doc(`${day}_${key}`);
    let counted = false;
    try {
      await db.runTransaction(async (tx) => {
        const ls = await tx.get(lastRef);
        if (ls.exists && ls.data()?.[key] === day) return; // bugün zaten sayıldı
        const patch = { dayKey: day, key, kind: meta ? 'house' : 'venue', count: FieldValue.increment(1), updatedAtMs: t };
        if (meta) Object.assign(patch, meta);
        tx.set(visitRef, patch, { merge: true });
        tx.set(lastRef, { [key]: day }, { merge: true });
        counted = true;
      });
    } catch (err) {
      console.warn('recordVisit', key, err?.message || err);
    }
    return { ok: true, counted };
  }
  async function recordVenueVisit(uid, p) {
    const key = String(p?.venue || '');
    if (!VISIT_VENUES.includes(key)) return { ok: false };
    return recordVisit(uid, key);
  }
  // Ev/işletme girişi (houses.js enter). Sadece herkese açık evler ve işletmeler listede yer alır.
  async function recordHouseVisit(uid, houseId, h) {
    if (!houseId || !h) return { ok: false };
    if (h.privacy !== 'public' && !h.biz?.type) return { ok: false };
    return recordVisit(uid, houseVisitKey(houseId), {
      houseId,
      name: String(h.name || 'Ev').slice(0, 40),
      ownerName: String(h.ownerName || 'Oyuncu').slice(0, 40),
      bizType: h.biz?.type || null,
    });
  }
  return { recordVisit, recordVenueVisit, recordHouseVisit };
}
