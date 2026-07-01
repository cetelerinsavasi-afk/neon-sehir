import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export function useWeapons() {
  const { user } = useAuth();
  const [weapons, setWeapons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWeapons([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'weapons'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setWeapons(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useWeapons dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { weapons, loading };
}
