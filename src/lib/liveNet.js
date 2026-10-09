// =============================================================================
// v79 — Canlı konum akışı (Realtime Database)
// Mekânlarda yürürken konum/poz her ~0,35–1 sn değişir. Bunu Firestore'a yazmak
// mekândaki HERKESE ayrı bir okuma yazdırıyordu (kişi sayısının karesiyle artan
// maliyet). Artık:
//   • Firestore presence belgesi (kim nerede, ad/avatar, sohbet, eldeki ürün,
//     kovma/güvenlik kontrolleri) aynen kalır, sadece SEYREK yenilenir
//     (giriş, oturma/hareket, durma, ~15–20 sn nabız).
//   • Yürürken sık değişen konum alanları RTDB'den akar:
//       live/{alan}/{oda}/{uid} = { x, y|z, facing, pose, seat, left, emote, emoteTs, t }
//     RTDB okuma başına değil, indirilen veri başına ücretlendirilir ve
//     gecikmesi daha düşüktür → hem ucuz hem akıcı.
// Okuyan taraf iki kaynağı zaman damgasıyla birleştirir (hangisi yeniyse o):
// eski sürüm istemciler (sadece Firestore yazan) da doğru görünür.
// RTDB'ye ulaşılamazsa / yazma reddedilirse (kurallar yüklenmemiş vb.) istemci
// otomatik olarak eski yola (her adımda Firestore) döner — oyun bozulmaz.
// Kurallar: database.rules.json › live
// =============================================================================
import { app } from '../firebase';
import { LIVE_KEYS as KEYS } from './liveMerge.js';

const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
let modP = null;
let broken = !DB_URL;
const rt = () => {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
};
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// RTDB kullanılabilir mi? (false → çağıran Firestore'a yazar)
export const liveReady = () => !broken;

const pick = (o) => {
  const out = {};
  for (const k of KEYS) {
    if (!(k in o)) continue;
    const v = o[k];
    if (v === undefined) continue;
    if (typeof v === 'number') out[k] = Math.round(v * 100) / 100;
    else if (typeof v === 'string') out[k] = v.slice(0, 40);
    else if (typeof v === 'boolean' || v === null) out[k] = v;
  }
  return out;
};
const safe = (s) => String(s || '').replace(/[.#$[\]/]/g, '_').slice(0, 120);
const pathOf = (room, uid) => `live/${room.split('/').map(safe).join('/')}/${safe(uid)}`;

const disconnectArmed = new Set();
let failures = 0;

// Konumu RTDB'ye yazar. Döner: true (gitti) | false (çağıran Firestore'a yazsın)
export async function liveWrite(room, uid, data) {
  if (broken || !room || !uid) return false;
  try {
    const { m, db } = await rt();
    const r = m.ref(db, pathOf(room, uid));
    const key = pathOf(room, uid);
    if (!disconnectArmed.has(key)) {
      disconnectArmed.add(key);
      m.onDisconnect(r).remove().catch(() => disconnectArmed.delete(key));
    }
    await withTimeout(m.set(r, { ...pick(data), t: m.serverTimestamp() }), 4000);
    failures = 0;
    return true;
  } catch (err) {
    const code = String(err?.code || err?.message || '');
    // izin reddi → kurallar yok/eski: bu oturumda kalıcı olarak Firestore'a dön.
    // Zaman aşımı → geçici olabilir; üst üste 3 kez olursa dön.
    if (/permission|PERMISSION_DENIED/i.test(code) || ++failures >= 3) {
      broken = true;
      console.warn('Canlı konum (RTDB) kullanılamıyor, Firestore ile devam:', code);
    }
    return false;
  }
}

export async function liveRemove(room, uid) {
  if (broken || !room || !uid) return;
  try {
    const { m, db } = await rt();
    await withTimeout(m.remove(m.ref(db, pathOf(room, uid))), 3000);
  } catch {
    /* onDisconnect zaten temizler */
  }
}

// Odadaki canlı konumları dinler. cb({ uid: { x, y, …, t } })
export function watchLive(room, cb) {
  if (broken || !room) return () => {};
  let off = () => {};
  let alive = true;
  rt()
    .then(({ m, db }) => {
      if (!alive) return;
      off = m.onValue(
        m.ref(db, `live/${room.split('/').map(safe).join('/')}`),
        (snap) => cb(snap.val() || {}),
        () => cb({})
      );
    })
    .catch(() => cb({}));
  return () => {
    alive = false;
    off();
  };
}

export { mergeLive } from './liveMerge.js';
