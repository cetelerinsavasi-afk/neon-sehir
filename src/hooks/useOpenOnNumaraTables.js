import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useOpenOnNumaraTables — status='open' olan tüm masaları dinler (kapasite
 * dolu olsa da listede kalır, dolu olanlar client'ta filtrelenir — tek
 * eşitlik filtresi composite index gerektirmiyor).
 */
export function useOpenOnNumaraTables() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'onNumaraTables'), where('status', '==', 'open'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useOpenOnNumaraTables dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { tables, loading };
}
