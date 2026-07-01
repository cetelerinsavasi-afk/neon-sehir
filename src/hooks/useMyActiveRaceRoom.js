import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMyActiveRaceRoom — participantUids dizisinde kendi uid'im geçen ve
 * hâlâ 'waiting' ya da 'racing' durumundaki oda var mı diye bakar.
 * array-contains tek başına kullanıldığı için composite index gerektirmez;
 * status filtresi bilerek client tarafında uygulanıyor.
 */
export function useMyActiveRaceRoom() {
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoom(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'raceRooms'),
      where('participantUids', 'array-contains', user.uid)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const active = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .find((r) => r.status === 'waiting' || r.status === 'racing');
        setRoom(active || null);
        setLoading(false);
      },
      (err) => {
        console.error('useMyActiveRaceRoom dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { room, loading };
}
