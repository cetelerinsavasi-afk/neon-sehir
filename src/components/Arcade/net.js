// =============================================================================
// v75 — Oyun salonu ONLINE eşleşme: Firebase Realtime Database.
// Neden Firestore değil: maç boyunca saniyede ~20 durum + girdi gönderilir;
// Firestore'da her biri ücretli yazma/okuma olurdu. Realtime Database bant
// genişliğiyle ücretlenir ve daha hızlıdır.
// v79 — 2–4 kişilik odalar:
//   arcade/{oyun}/{oda}/meta   = { game, hostUid, hostName, status, createdAt, max,
//                                  roster? (başlayınca: [{ uid, name, bot }]) }
//   arcade/{oyun}/{oda}/p/{1..3} = { uid, name, left? }   — katılan oyuncular (koltuk)
//   arcade/{oyun}/{oda}/i/{uid}  = zaman(ms)·64 + girdi bitleri (konuklar yazar)
//   arcade/{oyun}/{oda}/state    = ev sahibinin yetkili oyun durumu (JSON metin)
// Kurallar: database.rules.json. VITE_FIREBASE_DATABASE_URL tanımlı değilse
// online mod kapalıdır (sadece bota karşı).
// =============================================================================
import { app } from '../../firebase';
import { IN_MASK } from './games/common.js';

const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
export const ONLINE_ENABLED = Boolean(DB_URL);
const ROOM_TTL_MS = 15 * 60 * 1000;
const SLOTS = [1, 2, 3];

let modP = null;
function rt() {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
}
const cleanName = (n) => String(n || 'Oyuncu').slice(0, 40);
export const playersOf = (p) =>
  Object.entries(p || {})
    .filter(([, v]) => v && v.uid && !v.left)
    .map(([slot, v]) => ({ slot: Number(slot), uid: v.uid, name: String(v.name || 'Oyuncu').slice(0, 14) }))
    .sort((a, b) => a.slot - b.slot);

// Açık odaları canlı listeler; dönüş: aboneliği bitiren fonksiyon
export function watchRooms(gameId, cb) {
  let off = () => {};
  let alive = true;
  rt().then(({ m, db }) => {
    if (!alive) return;
    const q = m.query(m.ref(db, `arcade/${gameId}`), m.orderByChild('meta/status'), m.equalTo('open'), m.limitToLast(30));
    off = m.onValue(
      q,
      (snap) => {
        const now = Date.now();
        const list = [];
        snap.forEach((ch) => {
          const v = ch.val();
          if (!v?.meta || now - Number(v.meta.createdAt || 0) > ROOM_TTL_MS) return;
          const max = Math.max(2, Math.min(4, Number(v.meta.max || 2)));
          const n = 1 + playersOf(v.p).length + (v.guest && !v.guest.left ? 1 : 0);
          if (n < max) list.push({ id: ch.key, ...v.meta, max, n });
        });
        cb(list.sort((a, b) => b.createdAt - a.createdAt));
      },
      () => cb([])
    );
  });
  return () => {
    alive = false;
    off();
  };
}

export async function createRoom(gameId, me, max = 2) {
  const { m, db } = await rt();
  const roomRef = m.push(m.ref(db, `arcade/${gameId}`));
  await m.set(m.child(roomRef, 'meta'), { game: gameId, hostUid: me.uid, hostName: cleanName(me.name), status: 'open', createdAt: m.serverTimestamp(), max: Math.max(2, Math.min(4, max)) });
  // bağlantı koparsa oda silinir (kural: sadece ev sahibi silebilir → meta yazıldıktan sonra kaydedilir)
  await m.onDisconnect(roomRef).remove();
  return roomRef.key;
}

// Boş bir koltuğa oturur. Döner: koltuk numarası
export async function joinRoom(gameId, roomId, me, max = 2) {
  const { m, db } = await rt();
  for (const slot of SLOTS.slice(0, Math.max(1, max - 1))) {
    const r = m.ref(db, `arcade/${gameId}/${roomId}/p/${slot}`);
    try {
      const res = await m.runTransaction(r, (cur) => (cur && cur.uid && !cur.left && cur.uid !== me.uid ? undefined : { uid: me.uid, name: cleanName(me.name) }));
      if (res.committed) {
        await m.onDisconnect(m.child(r, 'left')).set(true);
        return slot;
      }
    } catch {
      /* oda başlamış/kapanmış olabilir → sonraki koltuk */
    }
  }
  throw new Error('Bu oda dolu ya da maç başladı.');
}

export async function leaveSeat(gameId, roomId, slot) {
  const { m, db } = await rt();
  try {
    const r = m.ref(db, `arcade/${gameId}/${roomId}/p/${slot}/left`);
    await m.set(r, true);
    await m.onDisconnect(r).cancel();
  } catch {
    /* yoksay */
  }
}

// Bekleme odası: oyuncular ve meta (başladı mı) dinlenir
export function watchLobby(gameId, roomId, { onPlayers, onMeta }) {
  let offs = [];
  let alive = true;
  rt().then(({ m, db }) => {
    if (!alive) return;
    const base = `arcade/${gameId}/${roomId}`;
    offs = [
      m.onValue(m.ref(db, `${base}/p`), (s) => onPlayers?.(playersOf(s.val()))),
      m.onValue(m.ref(db, `${base}/meta`), (s) => onMeta?.(s.val())),
    ];
  });
  return () => {
    alive = false;
    offs.forEach((f) => f());
  };
}

// Ev sahibi maçı başlatır (kadro sabitlenir, oda listeden düşer)
export async function startRoom(gameId, roomId, roster) {
  const { m, db } = await rt();
  await m.update(m.ref(db, `arcade/${gameId}/${roomId}/meta`), { status: 'playing', roster: roster.map((r) => ({ uid: r.uid || '', name: String(r.name || '').slice(0, 14), bot: Boolean(r.bot) })) });
}

// Maç bağlantısı: role 'host' | 'guest'
export async function connectRoom(gameId, roomId, role, handlers, myUid) {
  const { m, db } = await rt();
  const base = `arcade/${gameId}/${roomId}`;
  const offs = [];
  const on = (path, fn) => offs.push(m.onValue(m.ref(db, `${base}/${path}`), (s) => fn(s.val())));
  on('meta', (v) => handlers.onMeta?.(v));
  if (role === 'host') {
    on('i', (v) => handlers.onInputs?.(v || {}));
    on('p', (v) => handlers.onPlayers?.(v || {}));
  } else on('state', (v) => v && handlers.onState?.(v));
  let lastIn = -1;
  let lastInAt = 0;
  return {
    sendState: (json) => m.set(m.ref(db, `${base}/state`), json).catch(() => {}),
    // girdi + gönderim anı tek sayıda → ev sahibi zamanı geri yansıtır (state._e),
    // konuk gecikmeyi ölçer. değer = zaman(ms)·64 + bitler
    sendInput: (bits) => {
      if (role !== 'guest' || !myUid) return;
      const now = performance.now();
      if (bits === lastIn && now - lastInAt < 400) return;
      lastIn = bits;
      lastInAt = now;
      m.set(m.ref(db, `${base}/i/${myUid}`), Math.round(now) * 64 + (bits & IN_MASK)).catch(() => {});
    },
    setStatus: (status, extra = {}) => m.update(m.ref(db, `${base}/meta`), { status, ...extra }).catch(() => {}),
    leave: async (slot) => {
      offs.forEach((f) => f());
      try {
        if (role === 'host') await m.remove(m.ref(db, base));
        else if (slot) {
          await m.set(m.ref(db, `${base}/p/${slot}/left`), true);
          await m.onDisconnect(m.ref(db, `${base}/p/${slot}/left`)).cancel();
        }
      } catch {
        /* yoksay */
      }
    },
    close: () => offs.forEach((f) => f()),
  };
}

export async function cancelRoom(gameId, roomId) {
  const { m, db } = await rt();
  try {
    await m.remove(m.ref(db, `arcade/${gameId}/${roomId}`));
  } catch {
    /* yoksay */
  }
}
