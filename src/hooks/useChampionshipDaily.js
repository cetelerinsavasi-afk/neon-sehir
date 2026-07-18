import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

function istanbulDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function yesterdayKey(todayKey) {
  const [y, m, d] = todayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * useChampionshipDaily — her araç için BUGÜNKÜ (canlı lider) ve DÜNKÜ
 * (kazanan) championshipDaily/{catalogId}_{dateKey} dokümanlarını dinler.
 * Tek bir 'in' sorgusuyla (dateKey alanına göre) hem bugünü hem dünü
 * getirir — composite index gerekmez.
 */
export function useChampionshipDaily() {
  const [byCatalogId, setByCatalogId] = useState({});
  const [loading, setLoading] = useState(true);

  const todayKey = istanbulDateKey();
  const prevKey = yesterdayKey(todayKey);

  useEffect(() => {
    const q = query(
      collection(db, 'championshipDaily'),
      where('dateKey', 'in', [todayKey, prevKey])
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const key = String(data.catalogId);
          if (!next[key]) next[key] = {};
          if (data.dateKey === todayKey) next[key].today = data;
          else if (data.dateKey === prevKey) next[key].yesterday = data;
        });
        setByCatalogId(next);
        setLoading(false);
      },
      (err) => {
        console.error('useChampionshipDaily dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey, prevKey]);

  return { byCatalogId, todayKey, loading };
}
