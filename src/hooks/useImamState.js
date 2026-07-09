import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useImamState — oyundaki TEK imamın (varsa) bilgisini canlı dinler.
 * imamState/current dokümanı yoksa şu an imam yok demektir.
 */
export function useImamState() {
  const [imam, setImam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'imamState', 'current'),
      (snap) => {
        setImam(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('useImamState dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { imam, loading };
}
