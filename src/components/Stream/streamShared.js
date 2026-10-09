// =============================================================================
// v80 — YAYINCILIK ortak parçalar (istemci)
//  • Kamera: bilgisayarın üstünde, koltuğa (yayıncıya) bakar; arka planı da görür.
//    İzleyici odayı bu açıdan canlı yeniden kurar ("canlı sahne senkronu"):
//    kişiler/avatarlar/hareketler housePresence (Firestore, seyrek) + live/house
//    (RTDB, akıcı) verisinden gelir — yayın için ek veri gönderilmez.
//  • RTDB: streamWatch/{yayın}/{uid} (izleyici sayısı), streamThumb/{yayıncı}
//    (listede küçük önizleme, 30 sn'de bir), streamGame/{yayıncı} (yayında oynanan
//    oyun salonu oyununun durumu, ~8 kez/sn).
//  • Firestore: stats/streams (canlı yayın listesi — sadece aç/kapa'da değişir),
//    streams/{id} (yayın), streams/{id}/chat.
// =============================================================================
import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, app } from '../../firebase';

export const STREAM_STALE_MS = 90_000;
export const DONATION_AMOUNTS = [10, 100, 1000];
export const DONATION_DAILY_CAP = 10_000;
export const STREAM_CHAIRS = ['gamer'];
export const STREAM_PCS = ['pc', 'pcstation'];
export const STREAM_SET_RANGE = 3.2;

// koltuğa en yakın yayın bilgisayarı (sunucudaki streamSetOf ile aynı)
export function streamSetOf(items, chairId) {
  const list = Array.isArray(items) ? items : [];
  const chair = list.find((it) => it?.i === chairId && it.p === 1 && STREAM_CHAIRS.includes(it.k));
  if (!chair) return null;
  let pc = null;
  let best = STREAM_SET_RANGE;
  list.forEach((it) => {
    if (it?.p !== 1 || !STREAM_PCS.includes(it.k)) return;
    const d = Math.hypot(Number(it.x) - Number(chair.x), Number(it.z) - Number(chair.z));
    if (d <= best) {
      best = d;
      pc = it;
    }
  });
  return pc ? { chair, pc } : null;
}

// Yayın kamerası: bilgisayarın üstü (monitör hizası) → koltuktaki yayıncı
const HOUSE_W = 18; // functions/houses.js HOUSE.W / HOUSE.D ile aynı
const HOUSE_D = 14;
export function streamPose(items, chairId, pcId) {
  const list = Array.isArray(items) ? items : [];
  const chair = list.find((it) => it?.i === chairId);
  const pc = list.find((it) => it?.i === pcId) || streamSetOf(list, chairId)?.pc;
  if (!chair || !pc) return null;
  const dx = Number(chair.x) - Number(pc.x);
  const dz = Number(chair.z) - Number(pc.z);
  const d = Math.hypot(dx, dz) || 1;
  const nx = dx / d;
  const nz = dz / d;
  // Kamera monitörün biraz arkasında ve üstünde (monitör kadraja girmez); oturan
  // yayıncı alt-ortada, arkasındaki oda ve oradakiler görünür. Ev sınırı içinde kalır.
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  return {
    px: clamp(Number(pc.x) - nx * 0.3, HOUSE_W / 2 - 0.15),
    py: 1.8,
    pz: clamp(Number(pc.z) - nz * 0.3, HOUSE_D / 2 - 0.15),
    tx: Number(chair.x) + nx * 2.5,
    ty: 0.82,
    tz: Number(chair.z) + nz * 2.5,
    fov: 72,
  };
}

export const fmtDur = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};
export const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// --- RTDB --------------------------------------------------------------------------
const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
export const STREAM_RT = Boolean(DB_URL);
let modP = null;
const rt = () => {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
};
const safe = (s) => String(s || '').replace(/[.#$[\]/]/g, '_').slice(0, 128);

// İzleyici olarak katıl (bağlantı koparsa kendiliğinden düşer). Dönüş: ayrıl()
export function joinViewers(streamId, uid) {
  if (!STREAM_RT || !streamId || !uid) return () => {};
  let ref = null;
  let alive = true;
  rt()
    .then(({ m, db: d }) => {
      if (!alive) return;
      ref = m.ref(d, `streamWatch/${safe(streamId)}/${safe(uid)}`);
      m.onDisconnect(ref).remove().catch(() => {});
      m.set(ref, true).catch(() => {});
    })
    .catch(() => {});
  return () => {
    alive = false;
    if (ref) rt().then(({ m }) => m.remove(ref).catch(() => {}));
  };
}
// İzleyicileri dinle: cb({ count, uids })
export function watchViewers(streamId, cb) {
  if (!STREAM_RT || !streamId) return () => {};
  let off = () => {};
  let alive = true;
  rt()
    .then(({ m, db: d }) => {
      if (!alive) return;
      off = m.onValue(
        m.ref(d, `streamWatch/${safe(streamId)}`),
        (s) => {
          const v = s.val() || {};
          const uids = Object.keys(v);
          cb({ count: uids.length, uids });
        },
        () => cb({ count: 0, uids: [] })
      );
    })
    .catch(() => {});
  return () => {
    alive = false;
    off();
  };
}
export async function readViewerCounts(ids) {
  if (!STREAM_RT || !ids.length) return {};
  try {
    const { m, db: d } = await rt();
    const out = {};
    await Promise.all(
      ids.map(async (id) => {
        const s = await m.get(m.ref(d, `streamWatch/${safe(id)}`));
        out[id] = s.exists() ? Object.keys(s.val() || {}).length : 0;
      })
    );
    return out;
  } catch {
    return {};
  }
}
export async function publishThumb(uid, dataUrl) {
  if (!STREAM_RT || !uid || !dataUrl) return;
  try {
    const { m, db: d } = await rt();
    await m.set(m.ref(d, `streamThumb/${safe(uid)}`), { img: dataUrl, at: m.serverTimestamp() });
  } catch {
    /* önizleme olmazsa liste yine çalışır */
  }
}
export async function readThumbs(uids) {
  if (!STREAM_RT || !uids.length) return {};
  try {
    const { m, db: d } = await rt();
    const out = {};
    await Promise.all(
      uids.map(async (u) => {
        const s = await m.get(m.ref(d, `streamThumb/${safe(u)}`));
        if (s.exists()) out[u] = s.val()?.img || null;
      })
    );
    return out;
  } catch {
    return {};
  }
}

// --- yayında oynanan oyun salonu oyunu ---------------------------------------------
// GameRunner, aktif yayın varsa durumu buraya yollar (~8/sn); izleyici izler.
export const streamBroadcast = { uid: null, streamId: null };
let lastGamePub = 0;
let gameRef = null;
export function publishGameFrame(game, state, names, me) {
  if (!STREAM_RT || !streamBroadcast.uid) return;
  const t = performance.now();
  if (t - lastGamePub < 120) return;
  lastGamePub = t;
  let json;
  try {
    const { _lastIn, ...pub } = state || {};
    void _lastIn;
    json = JSON.stringify(pub);
  } catch {
    return;
  }
  if (json.length > 7800) return;
  rt()
    .then(({ m, db: d }) => {
      if (!gameRef) {
        gameRef = m.ref(d, `streamGame/${safe(streamBroadcast.uid)}`);
        m.onDisconnect(gameRef).remove().catch(() => {});
      }
      return m.set(gameRef, { g: game.id, s: json, n: names.slice(0, 4).map((x) => String(x).slice(0, 14)), me: me || 0, at: Date.now() });
    })
    .catch(() => {});
}
export function clearGameFrame() {
  if (!STREAM_RT || !streamBroadcast.uid) return;
  rt()
    .then(({ m, db: d }) => m.remove(m.ref(d, `streamGame/${safe(streamBroadcast.uid)}`)))
    .catch(() => {});
}
export function watchGameFrames(streamerUid, cb) {
  if (!STREAM_RT || !streamerUid) return () => {};
  let off = () => {};
  let alive = true;
  rt()
    .then(({ m, db: d }) => {
      if (!alive) return;
      off = m.onValue(
        m.ref(d, `streamGame/${safe(streamerUid)}`),
        (s) => cb(s.val() || null),
        () => cb(null)
      );
    })
    .catch(() => {});
  return () => {
    alive = false;
    off();
  };
}

// --- Firestore kancaları ---------------------------------------------------------------
// Canlı yayın listesi (tek belge, uygulama genelinde paylaşımlı dinleyici)
const listShared = { items: [], subs: new Set(), unsub: null };
export function useLiveStreams(enabled = true) {
  const [items, setItems] = useState(listShared.items);
  useEffect(() => {
    if (!enabled) return undefined;
    const fn = (v) => setItems(v);
    listShared.subs.add(fn);
    fn(listShared.items);
    if (!listShared.unsub) {
      listShared.unsub = onSnapshot(
        doc(db, 'stats', 'streams'),
        (s) => {
          listShared.items = (s.exists() ? s.data().items : null) || [];
          listShared.subs.forEach((f) => f(listShared.items));
        },
        () => {
          listShared.items = [];
          listShared.subs.forEach((f) => f([]));
        }
      );
    }
    return () => {
      listShared.subs.delete(fn);
      if (!listShared.subs.size && listShared.unsub) {
        listShared.unsub();
        listShared.unsub = null;
      }
    };
  }, [enabled]);
  return items;
}
export function useStreamDoc(id) {
  const [s, setS] = useState(null);
  useEffect(() => {
    if (!id) {
      setS(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'streams', id),
      (d) => setS(d.exists() ? { id: d.id, ...d.data() } : { id, status: 'ended', missing: true }),
      () => setS({ id, status: 'ended', missing: true })
    );
  }, [id]);
  return s;
}
export function useStreamChat(id, max = 40) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!id) {
      setList([]);
      return undefined;
    }
    return onSnapshot(
      query(collection(db, 'streams', id, 'chat'), orderBy('createdAtMs', 'desc'), limit(max)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
      () => setList([])
    );
  }, [id, max]);
  return list;
}
