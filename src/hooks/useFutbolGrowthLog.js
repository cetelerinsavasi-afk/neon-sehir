import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// useFutbolGrowthLog — takımın "Gelişimler" ekranı için son gelişim
// kayıtlarını (maç/antrenmanda güç kazanan oyuncular) canlı dinler.
export function useFutbolGrowthLog(teamId, active) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId || !active) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'futbolGrowthLogs'),
      where('teamId', '==', teamId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useFutbolGrowthLog dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [teamId, active]);

  return { entries, loading };
}
