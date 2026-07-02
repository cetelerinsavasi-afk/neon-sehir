import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useOnNumaraTableById(tableId) {
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(Boolean(tableId));

  useEffect(() => {
    if (!tableId) {
      setTable(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'onNumaraTables', tableId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setTable(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.error('useOnNumaraTableById dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [tableId]);

  return { table, loading };
}
