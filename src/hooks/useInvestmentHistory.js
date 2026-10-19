import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { armStallWatchdog } from './useFirestoreResume';

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
    const done = armStallWatchdog(); // v102: veri gelmezse bağlantıyı tazele
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!snap.metadata.fromCache || snap.size) done();
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        setHistory(items);
        setLoading(false);
      },
      (err) => {
        done();
        console.error('useInvestmentHistory dinleme hatası:', err);
        setLoading(false);
      }
    );
    return () => {
      done();
      unsubscribe();
    };
  }, []);

  return { history, loading };
}
