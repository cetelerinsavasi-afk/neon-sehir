import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useInventory — users/{uid}/inventory alt koleksiyonunu canlı dinler.
 * Anahtarlar: depoUpgrade, vitesUpgrade, silahUpgrade (bkz. Bölüm 8.2/8.3).
 */
export function useInventory() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setInventory({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = collection(db, 'users', user.uid, 'inventory');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const next = {};
        snap.forEach((d) => {
          next[d.id] = d.data().quantity || 0;
        });
        setInventory(next);
        setLoading(false);
      },
      (err) => {
        console.error('useInventory dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { inventory, loading };
}
