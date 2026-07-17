import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

function istanbulDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * usePoliceClaimPool — bugünkü polis maaş havuzunu (dünkü rüşvetlerden
 * oluşan toplam tutar, polis başı pay, kimlerin hak sahibi olduğu) canlı
 * dinler. policeClaimPool/{bugununTarihi} dokümanı her gece dailyReset
 * tarafından oluşturuluyor.
 */
export function usePoliceClaimPool() {
  const [pool, setPool] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dateKey = istanbulDateKey();
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'policeClaimPool', dateKey),
      (snap) => {
        setPool(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('usePoliceClaimPool dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { pool, loading };
}
