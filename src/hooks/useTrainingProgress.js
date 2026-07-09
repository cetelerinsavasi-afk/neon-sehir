import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useTrainingProgress — antrenman modunda hangi seviyelerin açıldığını ve
 * hangi seviyelerde daha önce ödül alındığını (bir daha alınamaz) canlı
 * dinler.
 */
export function useTrainingProgress() {
  const { user } = useAuth();
  const [progress, setProgress] = useState({ unlockedLevel: 1, beatenLevels: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProgress({ unlockedLevel: 1, beatenLevels: {} });
      setLoading(false);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'trainingProgress', user.uid),
      (snap) => {
        setProgress(snap.exists() ? snap.data() : { unlockedLevel: 1, beatenLevels: {} });
        setLoading(false);
      },
      (err) => {
        console.error('useTrainingProgress dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { progress, loading };
}
