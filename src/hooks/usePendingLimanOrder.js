import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * usePendingLimanOrder — limanOrders/{uid} dokümanını canlı dinler.
 * Gemi şehre her döndüğünde (dayInCycle=1) dailyReset tarafından teslim
 * edilip sıfırlanır (bkz. functions/index.js).
 */
export function usePendingLimanOrder() {
  const { user } = useAuth();
  const [order, setOrder] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrder({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'limanOrders', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setOrder(snap.exists() ? snap.data() : {});
        setLoading(false);
      },
      (err) => {
        console.error('usePendingLimanOrder dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { order, loading };
}
