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
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { streamAction } from '../../services/gameActions';
import { db, app } from '../../firebase';

export const STREAM_STALE_MS = 90_000;
export const DONATION_AMOUNTS = [10, 100, 1000];
export const DONATION_DAILY_CAP = 10_000;
export const STREAM_CHAIRS = ['gamer'];
export const STREAM_PCS = ['pc']; // v81: sadece Oyuncu Bilgisayarı
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
// v81: canlı sürüm (Cloudflare Pages) .env'i okumaz; panelde VITE_FIREBASE_DATABASE_URL
// tanımlı değilse yayın kanalı sessizce KAPALI kalıyordu (oyun/yarış yayına gitmiyordu).
// Adres gizli değildir (Firebase istemci ayarı) → yoksa projenin RTDB adresi kullanılır.
const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://neon-sehir-default-rtdb.europe-west1.firebasedatabase.app';
export const STREAM_RT = Boolean(DB_URL);
let modP = null;
const rt = () => {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
};
const safe = (s) => String(s || '').replace(/[.#$[\]/]/g, '_').slice(0, 128);
export const streamDiag = { watchErr: null, gameErr: null, lastOkAt: 0 };

// =============================================================================
// v81 — İZLEYİCİ SAYISI SUNUCUDA: izleyici streamAction({op:'watch'}) ile katılır,
// ~30 sn'de bir nabız atar, çıkınca ayrılır. Sayı streams/{id}.viewers alanına
// yazılır; yayıncı, izleyiciler ve liste oradan okur. (v80'de RTDB'deki
// streamWatch yolu kullanılıyordu; sunucuda RTDB kuralları güncel değilse yazma
// reddediliyor ve sayı hep 0 görünüyordu.)
// =============================================================================
const WATCH_BEAT_MS = 30_000;
export function joinViewers(streamId, uid) {
  if (!streamId || !uid) return () => {};
  let alive = true;
  const beat = (on = true) => streamAction({ op: 'watch', streamId, on }).catch(() => {});
  beat(true);
  const iv = setInterval(() => !document.hidden && alive && beat(true), WATCH_BEAT_MS);
  const vis = () => !document.hidden && alive && beat(true);
  document.addEventListener('visibilitychange', vis);
  return () => {
    alive = false;
    clearInterval(iv);
    document.removeEventListener('visibilitychange', vis);
    beat(false);
  };
}
// İzleyici sayısını dinle: cb({ count, uids }) — yayın belgesinden
export function watchViewers(streamId, cb) {
  if (!streamId) return () => {};
  return onSnapshot(
    doc(db, 'streams', streamId),
    (d) => cb({ count: Number(d.data()?.viewers || 0), seen: Number(d.data()?.seen || 0), uids: [] }),
    () => cb({ count: 0, uids: [], error: true })
  );
}
export async function readViewerCounts(ids) {
  if (!ids.length) return {};
  const out = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const d = await getDoc(doc(db, 'streams', id));
        out[id] = Number(d.data()?.viewers || 0);
      } catch {
        out[id] = 0;
      }
    })
  );
  return out;
}

// =============================================================================
// v81 — YAYIN KANALI (RTDB) — iki yol, hangisi çalışırsa:
//   A) streamGame/{uid} · streamThumb/{uid}         (v80 kuralları gerekir)
//   B) arcade/yayin/{uid}/state · …/meta/img         (oyun salonunun v75'ten beri
//      sunucuda yüklü olan kurallarıyla çalışır)
// Yayıncı önce A'yı dener; izin hatası alırsa B'ye geçer. İzleyici ikisini de
// dinler, en son gelen kareyi kullanır. Böylece database.rules.json yeniden
// yüklenmemiş olsa bile oyun/yarış yayına yansır.
// =============================================================================
const LEG_GAME = 'yayin';
let chan = 'A'; // A | B
let legacyReadyFor = null; // B yolunda meta yazılmış yayıncı uid'i
const isPerm = (e) => /permission|PERMISSION_DENIED/i.test(String(e?.code || e?.message || e));
const legRoom = (uid) => `arcade/${LEG_GAME}/${safe(uid)}`;
async function ensureLegacyRoom(m, d, uid) {
  if (legacyReadyFor === uid) return;
  const room = m.ref(d, legRoom(uid));
  await m.set(m.child(room, 'meta'), { game: LEG_GAME, hostUid: uid, hostName: 'Canlı yayın', status: 'playing', createdAt: m.serverTimestamp() });
  m.onDisconnect(room).remove().catch(() => {});
  legacyReadyFor = uid;
}

export async function publishThumb(uid, dataUrl) {
  if (!STREAM_RT || !uid || !dataUrl) return;
  try {
    const { m, db: d } = await rt();
    if (chan === 'A') {
      try {
        await m.set(m.ref(d, `streamThumb/${safe(uid)}`), { img: dataUrl, at: m.serverTimestamp() });
        return;
      } catch (e) {
        if (!isPerm(e)) return;
        chan = 'B';
      }
    }
    await ensureLegacyRoom(m, d, uid);
    await m.set(m.ref(d, `${legRoom(uid)}/meta/img`), dataUrl);
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
        try {
          const s = await m.get(m.ref(d, `streamThumb/${safe(u)}`));
          if (s.exists() && s.val()?.img) {
            out[u] = s.val().img;
            return;
          }
        } catch {
          /* B yoluna bak */
        }
        try {
          const s2 = await m.get(m.ref(d, `${legRoom(u)}/meta/img`));
          if (s2.exists()) out[u] = s2.val();
        } catch {
          /* yok */
        }
      })
    );
    return out;
  } catch {
    return {};
  }
}

// --- yayında oynanan oyun / yarış ---------------------------------------------------
// GameRunner / TimeAttackRace, aktif yayın varsa durumu buraya yollar; izleyici izler.
export const streamBroadcast = { uid: null, streamId: null };
let lastGamePub = 0;
let sending = false;
let sendingAt = 0;
const LIMIT_A = 7800;
const LIMIT_B = 5600; // arcade/state kuralı: < 6000 (tüm paket metin olarak)

// oyunun durumu çok büyükse büyük dizileri kırpmayı dener
function shrinkState(pub, limit) {
  let json = JSON.stringify(pub);
  if (json.length <= limit) return json;
  const out = { ...pub };
  const keys = Object.keys(out).sort((a, b) => JSON.stringify(out[b] ?? null).length - JSON.stringify(out[a] ?? null).length);
  for (const k of keys) {
    if (json.length <= limit) break;
    const v = out[k];
    if (Array.isArray(v) && v.length > 40) out[k] = v.slice(-40);
    else if (typeof v === 'string' && v.length > 2000) delete out[k];
    json = JSON.stringify(out);
  }
  return json.length <= limit ? json : null;
}
function sendFrame(g, json, names, me) {
  // önceki kare hâlâ yoldaysa bunu atla (yavaş bağlantıda birikmesin); 3 sn'den uzun
  // süren gönderim takılmış sayılır
  if (sending && performance.now() - sendingAt < 3000) return;
  const uid = streamBroadcast.uid;
  if (!uid) return;
  sending = true;
  sendingAt = performance.now();
  const payload = { g, s: json, n: (names || []).slice(0, 4).map((x) => String(x).slice(0, 14)), me: me || 0, at: Date.now() };
  rt()
    .then(async ({ m, db: d }) => {
      if (chan === 'A') {
        try {
          const ref = m.ref(d, `streamGame/${safe(uid)}`);
          await m.set(ref, payload);
          m.onDisconnect(ref).remove().catch(() => {});
          streamDiag.gameErr = null;
          streamDiag.lastOkAt = Date.now();
          return;
        } catch (e) {
          if (!isPerm(e)) throw e;
          console.info('[yayın] streamGame izinli değil → oyun salonu kanalına geçiliyor (arcade/yayin)');
          chan = 'B';
        }
      }
      const txt = JSON.stringify(payload);
      if (txt.length >= 6000) return;
      await ensureLegacyRoom(m, d, uid);
      await m.set(m.ref(d, `${legRoom(uid)}/state`), txt);
      streamDiag.gameErr = null;
      streamDiag.lastOkAt = Date.now();
    })
    .catch((e) => {
      if (!streamDiag.gameErr) console.warn('[yayın] oyun karesi gönderilemedi:', e?.message || e);
      streamDiag.gameErr = String(e?.code || e?.message || 'hata');
    })
    .finally(() => {
      sending = false;
    });
}
// Yayıncı için: oyun karesi izleyicilere gidiyor mu? 'ok' | 'err' | 'idle'
export function useStreamGameHealth(active = true) {
  const [st, setSt] = useState('idle');
  useEffect(() => {
    if (!active) return undefined;
    const iv = setInterval(() => setSt(!STREAM_RT || streamDiag.gameErr ? 'err' : streamDiag.lastOkAt && Date.now() - streamDiag.lastOkAt < 4000 ? 'ok' : 'idle'), 1000);
    return () => clearInterval(iv);
  }, [active]);
  return st;
}
export function publishGameFrame(game, state, names, me) {
  if (!STREAM_RT || !streamBroadcast.uid) return;
  const t = performance.now();
  if (t - lastGamePub < 110) return;
  lastGamePub = t;
  let json;
  try {
    const { _lastIn, _in, _e, ...pub } = state || {};
    void _lastIn;
    void _in;
    void _e;
    json = shrinkState(pub, chan === 'A' ? LIMIT_A : LIMIT_B);
  } catch {
    return;
  }
  if (json) sendFrame(game.id, json, names, me);
}
// v81 — yarış (şampiyona / bahisli / antrenman): g='race'
export function publishRaceFrame(payload) {
  if (!STREAM_RT || !streamBroadcast.uid || !payload) return;
  const t = performance.now();
  if (t - lastGamePub < 95) return;
  lastGamePub = t;
  let json;
  try {
    json = JSON.stringify(payload);
  } catch {
    return;
  }
  if (json.length < LIMIT_B) sendFrame('race', json, [], 0);
}
// v82.2 — kart oyunu (10 Numara): sadece masa kimliği gider (~1/sn); izleyici masayı
// kendisi dinler ve salt-izleme kipinde çizer (masa kaydı zaten herkese açık)
export function publishCardsFrame(tableId) {
  if (!STREAM_RT || !streamBroadcast.uid || !tableId) return;
  sendFrame('onnumara', JSON.stringify({ t: String(tableId).slice(0, 128) }), [], 0);
}
export function clearGameFrame() {
  const uid = streamBroadcast.uid;
  if (!STREAM_RT || !uid) return;
  rt()
    .then(({ m, db: d }) => {
      m.remove(m.ref(d, `streamGame/${safe(uid)}`)).catch(() => {});
      if (legacyReadyFor === uid) m.remove(m.ref(d, `${legRoom(uid)}/state`)).catch(() => {});
    })
    .catch(() => {});
}
// Yayın bitince B yolundaki oda da silinsin
export function closeStreamChannel(uid) {
  if (!STREAM_RT || !uid) return;
  rt()
    .then(({ m, db: d }) => {
      m.remove(m.ref(d, `streamGame/${safe(uid)}`)).catch(() => {});
      if (legacyReadyFor === uid) {
        legacyReadyFor = null;
        m.remove(m.ref(d, legRoom(uid))).catch(() => {});
      }
    })
    .catch(() => {});
}
export function watchGameFrames(streamerUid, cb) {
  if (!STREAM_RT || !streamerUid) return () => {};
  const offs = [];
  let alive = true;
  let lastAt = 0;
  const take = (f) => {
    if (!f) {
      cb(null);
      return;
    }
    if (Number(f.at || 0) < lastAt) return; // iki kanaldan eski kare gelirse yoksay
    lastAt = Number(f.at || 0);
    cb(f);
  };
  rt()
    .then(({ m, db: d }) => {
      if (!alive) return;
      offs.push(
        m.onValue(
          m.ref(d, `streamGame/${safe(streamerUid)}`),
          (s) => s.exists() && take(s.val()),
          () => {}
        )
      );
      offs.push(
        m.onValue(
          m.ref(d, `${legRoom(streamerUid)}/state`),
          (s) => {
            if (!s.exists()) return;
            try {
              take(JSON.parse(s.val()));
            } catch {
              /* bozuk kare */
            }
          },
          () => {}
        )
      );
    })
    .catch(() => {});
  return () => {
    alive = false;
    offs.forEach((f) => f());
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
