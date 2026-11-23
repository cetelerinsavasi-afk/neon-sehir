import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { app, db } from '../firebase';
import { withLive, BORSA_RTDB_PATH } from '../../functions/borsa.js';

// =============================================================================
// Neon Borsa piyasası.
// v176: borsa/piyasa tek belge, ekran açıkken onSnapshot ile dinleniyordu → herhangi bir oyuncunun
//   her işleminde ekranı açık HER oyuncuya 1 Firestore okuması.
// v189: canlı fiyat (her mekânın satılmış birimi S) Realtime Database'ten (borsaFiyat — sunucu her
//   işlemden sonra yazar). Firestore piyasa belgesi (grafik, gelir geçmişi, birikmiş gelir sayacı)
//   ekran açılınca BİR KEZ okunur (son 10 dk içinde okunduysa hiç okunmaz) ve açık kaldıkça saat başı
//   (dağıtım/grafik saatin 1. dakikasında) yenilenir. Kendi işleminin sonucu da hemen yansır (setLiveU).
// enabled=false iken (ör. hissesi olmayan oyuncunun banka ana sayfası) hiçbir şey okunmaz.
// =============================================================================
const DB_URL = (import.meta.env || {}).VITE_FIREBASE_DATABASE_URL;
const FRESH_MS = 10 * 60 * 1000;
const cache = { data: null, at: 0, ready: false, loading: null };
const live = { val: null, subs: new Set(), off: null, timer: 0 };

async function loadDoc(force = false) {
  if (!force && cache.ready && Date.now() - cache.at < FRESH_MS) return cache.data;
  if (cache.loading) return cache.loading;
  cache.loading = getDoc(doc(db, 'borsa', 'piyasa'))
    .then((s) => {
      cache.data = s.exists() ? s.data() : null;
      cache.at = Date.now();
      cache.ready = true;
      return cache.data;
    })
    .catch(() => {
      cache.ready = true;
      return cache.data;
    })
    .finally(() => {
      cache.loading = null;
    });
  return cache.loading;
}

const emitLive = () => live.subs.forEach((f) => f(live.val));
function subLive(fn) {
  live.subs.add(fn);
  clearTimeout(live.timer);
  if (!live.off && DB_URL) {
    let unsub = () => {};
    let alive = true;
    live.off = () => {
      alive = false;
      unsub();
    };
    import('firebase/database')
      .then((m) => {
        if (!alive) return;
        unsub = m.onValue(
          m.ref(m.getDatabase(app, DB_URL), BORSA_RTDB_PATH),
          (s) => {
            live.val = { ...(live.val || {}), ...(s.val() || {}) };
            emitLive();
          },
          () => {}
        );
      })
      .catch(() => {});
  }
  fn(live.val);
  return () => {
    live.subs.delete(fn);
    if (!live.subs.size)
      live.timer = setTimeout(() => {
        if (live.subs.size || !live.off) return;
        live.off();
        live.off = null;
      }, 60_000);
  };
}
// Kendi işleminin sunucu cevabı (yeni S) — RTDB'den gelmesini beklemeden
export function setLiveU(co, u) {
  if (!Number.isSafeInteger(u)) return;
  live.val = { ...(live.val || {}), [co]: u };
  emitLive();
}

export function useBorsaMarket(enabled = true) {
  const [doc0, setDoc0] = useState(() => ({ data: cache.data, ready: cache.ready }));
  const [lv, setLv] = useState(live.val);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const pull = (force) => loadDoc(force).then((d) => alive && setDoc0({ data: d, ready: true }));
    pull(false);
    // saat başı yenile (borsaHourly saatin 1. dakikasında çalışır → 2. dakikada oku)
    let t = 0;
    const plan = () => {
      const now = new Date();
      const next = new Date(now);
      next.setMinutes(2, 0, 0);
      if (next <= now) next.setHours(next.getHours() + 1);
      t = setTimeout(() => {
        if (!document.hidden) pull(true);
        plan();
      }, next - now);
    };
    plan();
    const offLive = subLive((v) => alive && setLv(v));
    return () => {
      alive = false;
      clearTimeout(t);
      offLive();
    };
  }, [enabled]);
  const data = useMemo(() => (doc0.data || lv ? withLive(doc0.data, lv) : null), [doc0.data, lv]);
  return { data, ready: doc0.ready };
}
