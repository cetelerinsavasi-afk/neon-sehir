import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

const HISTORY_LIMIT = 48; // son 48 saatlik hareket

/**
 * useInvestmentHistory — investmentHistory koleksiyonundaki son kayıtları
 * (en eski önce, grafik çizmeye uygun sırada) canlı dinler.
 */
export function useInvestmentHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'investmentHistory'),
      orderBy('createdAt', 'desc'),
      limit(HISTORY_LIMIT)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        setHistory(items);
        setLoading(false);
      },
      (err) => {
        console.error('useInvestmentHistory dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { history, loading };
}
