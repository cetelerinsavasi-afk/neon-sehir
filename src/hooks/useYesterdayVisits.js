import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { midnightDayKey, prevDayKey } from '../../functions/businessCatalogData.js';

// Dünün ziyaret sayıları (venueVisits; 5 dk'da bir yenilenir). Satır: { key, houseId?, count }
// (Mekanlar › Ziyaret ve v93 Evler › Home Ofisler sıralaması)
export function useYesterdayVisits(enabled) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const day = prevDayKey(midnightDayKey(Date.now()));
        const snap = await getDocs(query(collection(db, 'venueVisits'), where('dayKey', '==', day), orderBy('count', 'desc'), limit(60)));
        if (alive) setRows(snap.docs.map((d) => d.data()));
      } catch (err) {
        console.warn('venueVisits:', err?.code || err);
      }
    };
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [enabled]);
  return rows;
}
