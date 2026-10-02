// =============================================================================
// v75 — Oyun salonu ONLINE eşleşme: Firebase Realtime Database.
// Neden Firestore değil: maç boyunca saniyede ~15 durum + girdi gönderilir;
// Firestore'da her biri ücretli yazma/okuma olurdu. Realtime Database bant
// genişliğiyle ücretlenir (bu boyutta ücretsiz kotada kalır) ve daha hızlıdır.
// Yapı: arcade/{oyun}/{oda}/ meta · guest · state (ev sahibi yazar) · inH · inG
// Kurallar: database.rules.json. VITE_FIREBASE_DATABASE_URL tanımlı değilse
// online mod kapalıdır (sadece bota karşı).
// =============================================================================
import { app } from '../../firebase';

const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
export const ONLINE_ENABLED = Boolean(DB_URL);
const ROOM_TTL_MS = 15 * 60 * 1000;

let modP = null;
function rt() {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
}

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
          if (v?.meta && !v.guest && now - Number(v.meta.createdAt || 0) < ROOM_TTL_MS) list.push({ id: ch.key, ...v.meta });
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

export async function createRoom(gameId, me) {
  const { m, db } = await rt();
  const roomRef = m.push(m.ref(db, `arcade/${gameId}`));
  await m.set(m.child(roomRef, 'meta'), { game: gameId, hostUid: me.uid, hostName: String(me.name || 'Oyuncu').slice(0, 40), status: 'open', createdAt: m.serverTimestamp() });
  // bağlantı koparsa oda silinir (kural: sadece ev sahibi silebilir → meta yazıldıktan sonra kaydedilir)
  await m.onDisconnect(roomRef).remove();
  return roomRef.key;
}

export async function joinRoom(gameId, roomId, me) {
  const { m, db } = await rt();
  const gRef = m.ref(db, `arcade/${gameId}/${roomId}/guest`);
  const res = await m.runTransaction(gRef, (cur) => (cur ? undefined : { uid: me.uid, name: String(me.name || 'Oyuncu').slice(0, 40) }));
  if (!res.committed) throw new Error('Bu odaya başka biri katıldı.');
  await m.onDisconnect(m.child(gRef, 'left')).set(true);
}

// Ortak oda bağlantısı: role 'host' | 'guest'
export async function connectRoom(gameId, roomId, role, handlers) {
  const { m, db } = await rt();
  const base = `arcade/${gameId}/${roomId}`;
  const offs = [];
  const on = (path, fn) => offs.push(m.onValue(m.ref(db, `${base}/${path}`), (s) => fn(s.val())));
  on('meta', (v) => handlers.onMeta?.(v));
  on('guest', (v) => handlers.onGuest?.(v));
  if (role === 'host') on('inG', (v) => handlers.onInput?.(Number(v) || 0));
  else on('state', (v) => v && handlers.onState?.(v));
  let lastIn = -1;
  let lastInAt = 0;
  return {
    sendState: (json) => m.set(m.ref(db, `${base}/state`), json).catch(() => {}),
    sendInput: (bits) => {
      const now = performance.now();
      if (bits === lastIn && now - lastInAt < 1000) return;
      lastIn = bits;
      lastInAt = now;
      m.set(m.ref(db, `${base}/${role === 'host' ? 'inH' : 'inG'}`), bits).catch(() => {});
    },
    setStatus: (status, extra = {}) => m.update(m.ref(db, `${base}/meta`), { status, ...extra }).catch(() => {}),
    leave: async () => {
      offs.forEach((f) => f());
      try {
        if (role === 'host') await m.remove(m.ref(db, base));
        else {
          await m.set(m.ref(db, `${base}/guest/left`), true);
          await m.onDisconnect(m.ref(db, `${base}/guest/left`)).cancel();
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
