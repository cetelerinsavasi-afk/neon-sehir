import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export function useMyFutbolTeam() {
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTeam(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'futbolTeams'), where('ownerUid', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setTeam(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
        setLoading(false);
      },
      (err) => {
        console.error('useMyFutbolTeam dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { team, loading };
}
