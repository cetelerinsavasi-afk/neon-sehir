import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useNewspaperBulletin — newspaperBulletin/current dokümanını canlı dinler.
 * Bu doküman investments/current'ın aksine SAATLİK değişmez; sadece
 * dailyReset (her gece 00:00, Europe/Istanbul) tarafından bir kez
 * güncellenir — Gazete > Borsa Bülteni bu yüzden gün boyunca sabit kalır.
 */
export function useNewspaperBulletin() {
  const [bulletin, setBulletin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'newspaperBulletin', 'current');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setBulletin(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('useNewspaperBulletin dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { bulletin, loading };
}
