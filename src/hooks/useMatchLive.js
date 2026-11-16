import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { istanbulDateKey, isFutbolLineupLockedIstanbul } from '../lib/istanbulTime';

// =============================================================================
// v163 — "MAÇ BAŞLADI" hatırlatması için: şu an maç oynanıyor mu?
//   • Maçlar her gün 18:00–19:00 (İstanbul) arasında oynanır — saat 18 değilse hiç okuma yok.
//   • O gün maç var mı (lig / kupa günü mü, yoksa sezon sonu kutlama günü mü)?
//     futbolSeasonState/current TEK SEFER okunur ve gün boyu cihazda saklanır
//     → oyuncu başına günde EN FAZLA 1 Firestore okuması (dinleyici yok).
//   • Okuma başarısız olursa maç var sayılır (neredeyse her gün maç var).
// =============================================================================
const KEY = 'ns_match_day_v1';
const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};
const writeCache = (v) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* depolama kapalı */
  }
};

let job = null;
async function loadMatchDay(day) {
  const c = readCache();
  if (c && c.day === day && typeof c.on === 'boolean') return c.on;
  if (job) return job;
  job = (async () => {
    try {
      const s = await getDoc(doc(db, 'futbolSeasonState', 'current'));
      const on = !s.exists() || s.data()?.status !== 'CELEBRATION_DAY';
      writeCache({ day, on });
      return on;
    } catch {
      return true;
    }
  })().finally(() => {
    job = null;
  });
  return job;
}

const isMatchHour = () => (import.meta.env?.DEV && globalThis.__stadiumForceHour) || isFutbolLineupLockedIstanbul();

export function useMatchLive(enabled = true) {
  const [hour, setHour] = useState(() => isMatchHour());
  const [live, setLive] = useState(false);
  useEffect(() => {
    const iv = setInterval(() => setHour(isMatchHour()), 30_000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (!enabled || !hour) {
      setLive(false);
      return undefined;
    }
    let alive = true;
    loadMatchDay(istanbulDateKey()).then((on) => alive && setLive(on));
    return () => {
      alive = false;
    };
  }, [enabled, hour]);
  return live;
}
