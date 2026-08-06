import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export function useFutbolTeamPlayers(teamId) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) {
      setPlayers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'futbolPlayers'), where('teamId', '==', teamId));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => b.power - a.power);
        setPlayers(list);
        setLoading(false);
      },
      (err) => {
        console.error('useFutbolTeamPlayers dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [teamId]);

  return { players, loading };
}
