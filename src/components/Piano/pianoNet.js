// =============================================================================
// v77 — Piyano (cafe/bar ve evler): aynı anda TEK kişi çalar, mekândaki herkes
// duyar. Notalar Firebase Realtime Database'den gider (her nota Firestore'da
// ücretli yazma olurdu — arcade online ile aynı gerekçe). Yapı:
//   piano/{houseId}/player = { uid, name, at }   — çalan (30 sn nabızsız → boşa düşer)
//   piano/{houseId}/n      = { k, t, uid }       — son nota (0–11), en az 80 ms arayla
// Kurallar: database.rules.json. VITE_FIREBASE_DATABASE_URL yoksa piyano sadece
// çalan kişide sesli çalışır (diğerlerine gitmez).
// =============================================================================
import { app } from '../../firebase';

const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
export const PIANO_ONLINE = Boolean(DB_URL);
export const PIANO_STALE_MS = 30_000;
export const PIANO_NOTE_MIN_MS = 90;

let modP = null;
function rt() {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
}
// Realtime Database'e ulaşılamazsa (kurulmamış/kurallar yüklenmemiş/ağ) piyano
// donmasın: kısa süre içinde cevap gelmezse yerel moda düşer (sadece çalan duyar).
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Çalma hakkını al. Döner: { ok, holder, local }
export async function claimPiano(houseId, me) {
  if (!PIANO_ONLINE) return { ok: true, holder: null, local: true };
  try {
    return await withTimeout(claimOnline(houseId, me), 3500);
  } catch (e) {
    console.warn('piyano çevrim içi değil, yerel çalınıyor:', e?.message || e);
    return { ok: true, holder: null, local: true };
  }
}
async function claimOnline(houseId, me) {
  const { m, db } = await rt();
  const r = m.ref(db, `piano/${houseId}/player`);
  let holder = null;
  const res = await m.runTransaction(r, (cur) => {
    if (!cur || cur.uid === me.uid || Date.now() - Number(cur.at || 0) > PIANO_STALE_MS) return { uid: me.uid, name: String(me.name || 'Oyuncu').slice(0, 40), at: Date.now() };
    holder = cur;
    return undefined; // vazgeç (dolu)
  });
  if (!res.committed) return { ok: false, holder };
  await m.onDisconnect(r).remove();
  return { ok: true, holder: null };
}

export async function pianoHeartbeat(houseId, me) {
  if (!PIANO_ONLINE) return;
  const { m, db } = await rt();
  await m.set(m.ref(db, `piano/${houseId}/player`), { uid: me.uid, name: String(me.name || 'Oyuncu').slice(0, 40), at: Date.now() });
}

export async function releasePiano(houseId, uid) {
  if (!PIANO_ONLINE) return;
  const { m, db } = await rt();
  const r = m.ref(db, `piano/${houseId}/player`);
  await m.runTransaction(r, (cur) => (cur && cur.uid === uid ? null : cur));
}

export async function sendNote(houseId, uid, k) {
  if (!PIANO_ONLINE) return;
  const { m, db } = await rt();
  await m.set(m.ref(db, `piano/${houseId}/n`), { k, t: Date.now(), uid });
}

// cb({ player, note }) — note sadece yeni gelen notada dolu
export function watchPiano(houseId, cb) {
  if (!PIANO_ONLINE) return () => {};
  let off = () => {};
  let alive = true;
  let lastT = 0;
  rt().then(({ m, db }) => {
    if (!alive) return;
    off = m.onValue(
      m.ref(db, `piano/${houseId}`),
      (snap) => {
        const v = snap.val() || {};
        const player = v.player && Date.now() - Number(v.player.at || 0) < PIANO_STALE_MS ? v.player : null;
        let note = null;
        if (v.n && Number(v.n.t) > lastT) {
          if (lastT) note = v.n; // ilk okumada eski notayı çalma
          lastT = Number(v.n.t);
        }
        cb({ player, note });
      },
      () => cb({ player: null, note: null })
    );
  });
  return () => {
    alive = false;
    off();
  };
}
