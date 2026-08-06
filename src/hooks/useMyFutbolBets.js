import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export function useMyFutbolBets(leagueId) {
  const { user } = useAuth();
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !leagueId) {
      setBets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'futbolBets'),
      where('uid', '==', user.uid),
      where('leagueId', '==', leagueId)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => b.round - a.round);
        setBets(list);
        setLoading(false);
      },
      (err) => {
        console.error('useMyFutbolBets dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user, leagueId]);

  return { bets, loading };
}
