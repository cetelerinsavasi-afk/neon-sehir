import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useSixtagramProfile — sixtagramProfiles/{uid} dokümanını canlı dinler.
 * HERKESE AÇIK bir doküman (bkz. firestore.rules) — bu yüzden başka bir
 * oyuncunun profil panelinde toplam beğeni sayısını göstermek için de
 * kullanılabilir. uid verilmezse dinlemez.
 */
export function useSixtagramProfile(uid) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const ref = doc(db, 'sixtagramProfiles', uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('useSixtagramProfile dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [uid]);

  return { profile, loading };
}
