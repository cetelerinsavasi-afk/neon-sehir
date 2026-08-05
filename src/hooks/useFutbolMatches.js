import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// Bir lig için tüm sezon maçlarını (56 maç civarı, ucuz bir sorgu) çeker.
// Tur bazlı gruplama bilerek istemci tarafında yapılıyor — composite
// index gerektirmemesi için (bkz. firestore.indexes.json'daki minimal
// index yaklaşımı).
export function useFutbolMatches(leagueId) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'futbolMatches'), where('leagueId', '==', leagueId));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => a.round - b.round);
        setMatches(list);
        setLoading(false);
      },
      (err) => {
        console.error('useFutbolMatches dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [leagueId]);

  return { matches, loading };
}
