// =============================================================================
// v138 — "MEKÂNDA KAÇ KİŞİ VAR" — Realtime Database ile, oyuncunun cihazında.
//
// Eskiden: mekâna giriş/çıkışta Cloud Function tetiklenir, sunucu tüm aktif presence
// kayıtlarını Firestore'dan okuyup sayar, stats/presence belgesine yazardı (fonksiyon
// süresi + okuma + her izleyiciye okuma). Uygulaması kapanan oyuncu ~1,5–10 dk
// "içeride" görünürdü.
//
// Şimdi: mekâna giren oyuncu RTDB'de   occ/{yer}/{uid} = zaman   kaydı açar; bu kayıt
// RTDB sunucusunda onDisconnect ile bağlanmıştır → uygulama kapanınca / bağlantı
// koparsa / sekme gizlenince KENDİLİĞİNDEN silinir. Sayılar listeyi açan oyuncunun
// cihazında occ ağacından sayılır: anında ve doğru, Firestore okuması ve fonksiyon
// çağrısı yok (RTDB okuma başına değil, indirilen veri başına ücretlendirilir; bu ağaç
// birkaç KB).
//   yer: 'park' · 'i~{mekân}' (banka, karakol…) · 'h~{evId}'
// Her kategoride (park / iç mekân / ev) oyuncunun en fazla 1 kaydı olur — Firestore'daki
// parkPresence / interiorPresence / housePresence belgeleriyle birebir aynı anlam.
// RTDB'ye ulaşılamazsa hiçbir şey bozulmaz: sayımlar eski yola (stats/presence) döner.
// Kurallar: database.rules.json › occ
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { app, auth } from '../firebase';
import { serverNow } from './presenceClock';

const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
let modP = null;
const rt = () => {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
};
const safe = (s) => String(s || '').replace(/[.#$[\]/]/g, '_').slice(0, 120);
const keyPart = (s, n) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, n); // kurallardaki desenle aynı

export const occKey = {
  park: () => 'park',
  interior: (locationId) => `i~${keyPart(locationId, 60)}`,
  house: (houseId) => `h~${keyPart(houseId, 120)}`,
};

// --- yazan taraf -------------------------------------------------------------------
const mine = new Map(); // kategori -> { key, n }  (aynı yere iki bileşen girerse sayaçla)
let hidden = typeof document !== 'undefined' && document.hidden;
let broken = !DB_URL;

// Bağlantı koparsa onDisconnect kayıtları siler; geri gelince açık kayıtlar yeniden yazılır.
let watchingConn = false;
function watchConnection(m, db) {
  if (watchingConn) return;
  watchingConn = true;
  let first = true;
  m.onValue(m.ref(db, '.info/connected'), (s) => {
    if (s.val() !== true) return;
    if (first) {
      first = false;
      return;
    }
    if (!hidden) mine.forEach(({ key }) => put(key, true));
  });
}

async function put(key, on) {
  const uid = auth.currentUser?.uid;
  if (broken || !uid || !key) return;
  try {
    const { m, db } = await rt();
    watchConnection(m, db);
    const r = m.ref(db, `occ/${key}/${safe(uid)}`);
    if (on) {
      await m.onDisconnect(r).remove();
      await m.set(r, m.serverTimestamp());
    } else {
      await m.remove(r);
      m.onDisconnect(r).cancel().catch(() => {});
    }
  } catch {
    /* tek bir kaydın reddi diğerlerini durdurmaz; sayım eski yola düşmez, sadece bu kişi sayılmaz */
  }
}

// Mekâna girişte çağır; dönen fonksiyon çıkışta çağrılır.
export function occEnter(category, key) {
  if (!key) return () => {};
  const cur = mine.get(category);
  if (cur && cur.key === key) {
    cur.n += 1;
  } else {
    if (cur && !hidden) put(cur.key, false);
    mine.set(category, { key, n: 1 });
    if (!hidden) put(key, true);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const c = mine.get(category);
    if (!c || c.key !== key) return;
    c.n -= 1;
    if (c.n <= 0) {
      mine.delete(category);
      if (!hidden) put(key, false);
    }
  };
}

// Uygulama arka plana alınınca oyuncu sayılmaz (Firestore nabzı da durur); geri gelince tekrar.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const h = document.hidden;
    if (h === hidden) return;
    hidden = h;
    mine.forEach(({ key }) => put(key, !h));
  });
}

// --- okuyan taraf (paylaşımlı tek abonelik) -----------------------------------------
const shared = { state: broken ? 'off' : 'loading', counts: null, rooms: null, subs: new Set(), off: null, timer: 0 };
function emit() {
  shared.subs.forEach((f) => f(shared));
}
function start() {
  if (broken || shared.off) return;
  let alive = true;
  let unsub = () => {};
  shared.off = () => {
    alive = false;
    unsub();
  };
  rt()
    .then(({ m, db }) => {
      if (!alive) return;
      unsub = m.onValue(
        m.ref(db, 'occ'),
        (snap) => {
          const v = snap.val() || {};
          const counts = {};
          const rooms = {};
          for (const [key, people] of Object.entries(v)) {
            const ids = Object.keys(people || {});
            if (!ids.length) continue;
            counts[key] = ids.length;
            rooms[key] = new Set(ids);
          }
          shared.state = 'ok';
          shared.counts = counts;
          shared.rooms = rooms;
          emit();
        },
        () => {
          shared.state = 'off';
          emit();
        }
      );
    })
    .catch(() => {
      shared.state = 'off';
      emit();
    });
}
export function subscribeOcc(fn) {
  shared.subs.add(fn);
  clearTimeout(shared.timer);
  start();
  fn(shared);
  return () => {
    shared.subs.delete(fn);
    if (!shared.subs.size) {
      // ekranlar arası geçişte aboneliği hemen kapatma (yeniden indirmesin)
      shared.timer = setTimeout(() => {
        if (shared.subs.size || !shared.off) return;
        shared.off();
        shared.off = null;
        shared.state = broken ? 'off' : 'loading';
        shared.counts = null;
        shared.rooms = null;
      }, 60_000);
    }
  };
}

// --- React yardımcıları ----------------------------------------------------------------
const EMPTY_SET = new Set();
const fsMsOf = (o) => o?.updatedAt?.toMillis?.() ?? Number(o?.updatedAt || 0);

// Mekân içindeki "diğer oyuncular" listesinden hayaletleri ayıklar: RTDB'de o mekânda kaydı
// OLMAYAN ve Firestore nabzı graceMs'den eski oyuncu gösterilmez (uygulaması kapanan oyuncu
// ~1 dk içinde kaybolur; eskiden 1,5 dk). RTDB yoksa liste aynen döner.
// graceMs: occ yazmayan eski sürüm istemciler (30 sn nabız) görünmeye devam etsin diye.
export function useOccFilter(key, list, graceMs = 70_000) {
  const [room, setRoom] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!key) return undefined;
    return subscribeOcc((s) => setRoom(s.state === 'ok' ? s.rooms?.[key] || EMPTY_SET : null));
  }, [key]);
  const on = room !== null;
  useEffect(() => {
    if (!on) return undefined;
    const iv = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(iv);
  }, [on]);
  return useMemo(() => {
    if (!room) return list;
    const now = serverNow();
    return list.filter((o) => room.has(safe(o.uid)) || now - fsMsOf(o) <= graceMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, list, tick, graceMs]);
}

// Bileşen bağlıyken oyuncuyu bu yerde sayar.
export function useOccEnter(category, key, enabled = true) {
  useEffect(() => (enabled && key ? occEnter(category, key) : undefined), [category, key, enabled]);
}

// Tüm yerlerin anlık sayıları: { park: 3, 'i~banka': 2, 'h~ev123': 1 } — RTDB yoksa null.
export function useOccCounts(enabled = true) {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let got = false;
    const off = subscribeOcc((s) => {
      if (s.state !== 'loading') got = true;
      setCounts(s.state === 'ok' ? s.counts || {} : s.state === 'off' ? null : undefined);
    });
    // RTDB 6 sn'de cevap vermezse eski yola (stats/presence) düş
    const t = setTimeout(() => !got && setCounts(null), 6000);
    return () => {
      clearTimeout(t);
      off();
    };
  }, [enabled]);
  return counts; // undefined: yükleniyor · null: RTDB yok (eski yol) · {}: sayılar
}
