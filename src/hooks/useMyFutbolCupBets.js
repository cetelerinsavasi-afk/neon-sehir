import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// useMyFutbolCupBets — useMyFutbolBets ile aynı desen, futbolCupBets için.
export function useMyFutbolCupBets(season) {
  const { user } = useAuth();
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !season) {
      setBets([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(collection(db, 'futbolCupBets'), where('uid', '==', user.uid), where('season', '==', season));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setBets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useMyFutbolCupBets dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user, season]);

  return { bets, loading };
}
