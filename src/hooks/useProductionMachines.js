import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useProductionMachines — users/{uid}/productionMachines alt koleksiyonunu
 * canlı dinler. Bölüm 8.2'deki 3 makine türü: depoUpgrade, vitesUpgrade,
 * silahUpgrade. (Yasaklı madde makinesi Faz 7/8.8 kapsamında ayrıca eklenecek.)
 */
export function useProductionMachines() {
  const { user } = useAuth();
  const [machines, setMachines] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMachines({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = collection(db, 'users', user.uid, 'productionMachines');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const next = {};
        snap.forEach((d) => {
          next[d.id] = d.data();
        });
        setMachines(next);
        setLoading(false);
      },
      (err) => {
        console.error('useProductionMachines dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { machines, loading };
}
