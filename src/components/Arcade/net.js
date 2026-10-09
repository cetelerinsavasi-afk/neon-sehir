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

// v79.1 — UYUMLULUK: sunucudaki Realtime Database kuralları henüz yeni koltuk
// alanlarına (p/, i/) izin vermiyorsa (kurallar yüklenmemiş), eski tek-konuk
// yoluna (guest / inG) otomatik düşülür. Böylece 2 kişilik maçlar ve "1 arkadaş +
// botlar" her durumda çalışır; 3–4 gerçek oyuncu için yeni kurallar gerekir.
export const LEGACY_SLOT = 'g';
// v81 — ESKİ KURALLARLA 3–4 KİŞİ: eski kurallar odada tek konuk koltuğuna izin
// veriyor. 3. ve 4. oyuncu, ana odanın yanına KENDİ "yan odasını" kurar
//   arcade/{oyun}/{oda}~2  ve  ~3   (meta.hostUid = o oyuncu)
// ve girdisini oranın state alanına yazar (eski kurallar bunu zaten izin verir:
// odayı kuran kendi odasına yazar). Ana oda sahibi yan odaları dinler. Yan oda
// sadece yoksa kurulabildiği için aynı koltuğa iki kişi oturamaz. Yan odalar
// "playing" durumunda kurulur → açık oda listesinde görünmez.
const SIDE = [2, 3];
const sideKey = (roomId, n) => `${roomId}~${n}`;
export const isSideSlot = (slot) => typeof slot === 'string' && /^s[23]$/.test(slot);
const sideNum = (slot) => Number(String(slot).slice(1));
const isPerm = (e) => /permission|PERMISSION_DENIED/i.test(String(e?.code || e?.message || e));

// Boş bir koltuğa oturur. Döner: koltuk numarası (1–3) ya da 'g' (eski yol)
export async function joinRoom(gameId, roomId, me, max = 2) {
  const { m, db } = await rt();
  const base = `arcade/${gameId}/${roomId}`;
  let denied = false;
  for (const slot of SLOTS.slice(0, Math.max(1, max - 1))) {
    const r = m.ref(db, `${base}/p/${slot}`);
    try {
      const res = await m.runTransaction(r, (cur) => (cur && cur.uid && !cur.left && cur.uid !== me.uid ? undefined : { uid: me.uid, name: cleanName(me.name) }));
      if (res.committed) {
        await m.onDisconnect(m.child(r, 'left')).set(true);
        return slot;
      }
    } catch (e) {
      if (isPerm(e)) {
        denied = true;
        break;
      }
    }
  }
  if (denied) {
    // eski yol: tek konuk koltuğu
    const g = m.ref(db, `${base}/guest`);
    try {
      const res = await m.runTransaction(g, (cur) => (cur && cur.uid && !cur.left && cur.uid !== me.uid ? undefined : { uid: me.uid, name: cleanName(me.name) }));
      if (res.committed) {
        await m.onDisconnect(m.child(g, 'left')).set(true);
        return LEGACY_SLOT;
      }
    } catch (e) {
      console.warn('arcade join (eski yol):', e?.code || e);
    }
    // v81: konuk koltuğu dolu → 3. / 4. oyuncu yan odaya oturur
    if (max > 2) {
      const meta = await m.get(m.ref(db, `${base}/meta`)).catch(() => null);
      if (meta?.exists() && meta.val()?.status === 'open') {
        for (const n of SIDE.slice(0, Math.max(0, max - 2))) {
          const side = m.ref(db, `arcade/${gameId}/${sideKey(roomId, n)}`);
          try {
            await m.set(m.child(side, 'meta'), { game: gameId, hostUid: me.uid, hostName: cleanName(me.name), status: 'playing', createdAt: m.serverTimestamp() });
            await m.onDisconnect(side).remove();
            return `s${n}`;
          } catch {
            /* koltuk dolu → sıradaki */
          }
        }
      }
    }
    throw new Error('Bu oda dolu ya da maç başladı.');
  }
  throw new Error('Bu oda dolu ya da maç başladı.');
}

const seatPath = (base, slot) => (slot === LEGACY_SLOT ? `${base}/guest/left` : `${base}/p/${slot}/left`);

export async function leaveSeat(gameId, roomId, slot) {
  const { m, db } = await rt();
  if (isSideSlot(slot)) {
    try {
      const side = m.ref(db, `arcade/${gameId}/${sideKey(roomId, sideNum(slot))}`);
      await m.onDisconnect(side).cancel();
      await m.remove(side);
    } catch {
      /* yoksay */
    }
    return;
  }
  try {
    const r = m.ref(db, seatPath(`arcade/${gameId}/${roomId}`, slot));
    await m.set(r, true);
    await m.onDisconnect(r).cancel();
  } catch {
    /* yoksay */
  }
}

// p/ (yeni) + guest (eski) koltuklarını tek listede birleştirir
function seatWatcher(m, db, base, cb) {
  let p = {};
  let g = null;
  const side = {}; // n → { uid, name, left }
  const emit = () => {
    const list = playersOf(p);
    if (g && g.uid && !g.left && !list.some((x) => x.uid === g.uid)) list.push({ slot: LEGACY_SLOT, uid: g.uid, name: String(g.name || 'Oyuncu').slice(0, 14) });
    SIDE.forEach((n) => {
      const v = side[n];
      if (v && v.uid && !v.left && !list.some((x) => x.uid === v.uid)) list.push({ slot: `s${n}`, uid: v.uid, name: String(v.name || 'Oyuncu').slice(0, 14) });
    });
    cb(list, { p, g, side });
  };
  const sideOffs = SIDE.map((n) =>
    m.onValue(
      m.ref(db, `${base}~${n}/meta`),
      (s) => {
        const v = s.val();
        if (v?.hostUid) side[n] = { uid: v.hostUid, name: v.hostName, left: false };
        else if (side[n]) side[n] = { ...side[n], left: true }; // yan oda kapandı → ayrıldı
        emit();
      },
      () => {}
    )
  );
  const ok = (fn) => (s) => {
    fn(s.val());
    emit();
  };
  return [
    m.onValue(m.ref(db, `${base}/p`), ok((v) => (p = v || {})), () => {}),
    m.onValue(m.ref(db, `${base}/guest`), ok((v) => (g = v || null)), () => {}),
    ...sideOffs,
  ];
}

// Bekleme odası: oyuncular ve meta (başladı mı) dinlenir
export function watchLobby(gameId, roomId, { onPlayers, onMeta }) {
  let offs = [];
  let alive = true;
  rt().then(({ m, db }) => {
    if (!alive) return;
    const base = `arcade/${gameId}/${roomId}`;
    offs = [...seatWatcher(m, db, base, (list) => onPlayers?.(list)), m.onValue(m.ref(db, `${base}/meta`), (s) => onMeta?.(s.val()))];
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
export async function connectRoom(gameId, roomId, role, handlers, myUid, mySlot) {
  const { m, db } = await rt();
  const base = `arcade/${gameId}/${roomId}`;
  const offs = [];
  const on = (path, fn) => offs.push(m.onValue(m.ref(db, `${base}/${path}`), (s) => fn(s.val()), () => {}));
  on('meta', (v) => handlers.onMeta?.(v));
  if (role === 'host') {
    let legacyUid = '';
    const sideUid = {};
    on('i', (v) => handlers.onInputs?.(v || {}));
    on('inG', (v) => legacyUid && v != null && handlers.onInputs?.({ [legacyUid]: v }));
    // v81: yan odalardaki 3. / 4. oyuncunun girdisi
    SIDE.forEach((n) =>
      offs.push(
        m.onValue(
          m.ref(db, `arcade/${gameId}/${sideKey(roomId, n)}/state`),
          (s) => {
            const v = s.val();
            if (sideUid[n] && v != null) handlers.onInputs?.({ [sideUid[n]]: Number(v) || 0 });
          },
          () => {}
        )
      )
    );
    offs.push(
      ...seatWatcher(m, db, base, (_list, { p, g, side }) => {
        if (g?.uid) legacyUid = g.uid;
        const all = { ...(p || {}) };
        if (g?.uid) all[LEGACY_SLOT] = g;
        SIDE.forEach((n) => {
          if (side?.[n]?.uid) {
            sideUid[n] = side[n].uid;
            all[`s${n}`] = side[n];
          }
        });
        handlers.onPlayers?.(all);
      })
    );
  } else on('state', (v) => v && handlers.onState?.(v));
  let lastIn = -1;
  let lastInAt = 0;
  // v81: yolda en fazla 2 durum paketi — yavaş bağlantıda paketler kuyrukta birikip
  // gecikme zamanla büyümesin (yeni kare zaten eskisinin yerine geçer)
  let inflight = 0;
  let legacyIn = mySlot === LEGACY_SLOT;
  return {
    sendState: (json, force = false) => {
      if (!force && inflight >= 2) return;
      inflight += 1;
      m.set(m.ref(db, `${base}/state`), json)
        .catch(() => {})
        .finally(() => {
          inflight = Math.max(0, inflight - 1);
        });
    },
    // girdi + gönderim anı tek sayıda → ev sahibi zamanı geri yansıtır (state._e),
    // konuk gecikmeyi ölçer. değer = zaman(ms)·64 + bitler
    sendInput: (bits) => {
      if (role !== 'guest' || !myUid) return;
      const now = performance.now();
      if (bits === lastIn && now - lastInAt < 400) return;
      lastIn = bits;
      lastInAt = now;
      const v = Math.round(now) * 64 + (bits & IN_MASK);
      if (isSideSlot(mySlot)) m.set(m.ref(db, `arcade/${gameId}/${sideKey(roomId, sideNum(mySlot))}/state`), String(v)).catch(() => {});
      else if (legacyIn) m.set(m.ref(db, `${base}/inG`), v).catch(() => {});
      else
        m.set(m.ref(db, `${base}/i/${myUid}`), v).catch((e) => {
          if (isPerm(e)) legacyIn = true; // kurallar eski → eski girdi yolu
        });
    },
    setStatus: (status, extra = {}) => m.update(m.ref(db, `${base}/meta`), { status, ...extra }).catch(() => {}),
    leave: async (slot) => {
      offs.forEach((f) => f());
      try {
        if (role === 'host') await m.remove(m.ref(db, base));
        else if (isSideSlot(slot)) {
          const side = m.ref(db, `arcade/${gameId}/${sideKey(roomId, sideNum(slot))}`);
          await m.onDisconnect(side).cancel();
          await m.remove(side);
        } else if (slot) {
          await m.set(m.ref(db, seatPath(base, slot)), true);
          await m.onDisconnect(m.ref(db, seatPath(base, slot))).cancel();
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
