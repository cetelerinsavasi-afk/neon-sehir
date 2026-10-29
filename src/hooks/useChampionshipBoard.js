import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function istanbulDateKey(date = new Date(Date.now())) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * v128 — useChampionshipBoard: günün şampiyona listesi (championshipBoard/{gün})
 * ve tüm zamanlar listesi (championshipBoard/allTime). Gün değişince (00:00)
 * yeni günün belgesine geçer.
 */
export function useChampionshipBoard() {
  const [todayKey, setTodayKey] = useState(() => istanbulDateKey());
  const [today, setToday] = useState(null);
  const [allTime, setAllTime] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      const k = istanbulDateKey();
      setTodayKey((prev) => (prev === k ? prev : k));
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'championshipBoard', todayKey),
      (s) => {
        setToday(s.exists() ? s.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('useChampionshipBoard (gün):', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [todayKey]);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'championshipBoard', 'allTime'),
      (s) => setAllTime(s.exists() ? s.data() : null),
      (err) => console.error('useChampionshipBoard (tüm zamanlar):', err)
    );
    return unsub;
  }, []);

  return { todayKey, today, allTime, loading };
}

// v128 — gazete: dünün şampiyona listesinin 1.'si
export function useChampionshipYesterdayWinner() {
  const [winner, setWinner] = useState(null);
  const todayKey = istanbulDateKey();
  useEffect(() => {
    const [y, m, d] = todayKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const prev = dt.toISOString().slice(0, 10);
    const unsub = onSnapshot(
      doc(db, 'championshipBoard', prev),
      (s) => {
        const entries = s.exists() ? s.data().entries || {} : {};
        let best = null;
        for (const [uid, e] of Object.entries(entries)) {
          if (!(Number(e?.timeMs) > 0)) continue;
          if (!best || e.timeMs < best.timeMs || (e.timeMs === best.timeMs && Number(e.at || 0) < Number(best.at || 0))) best = { ...e, uid };
        }
        setWinner(best);
      },
      () => setWinner(null)
    );
    return unsub;
  }, [todayKey]);
  return winner;
}
