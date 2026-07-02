import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const RECENT_FINISH_WINDOW_MS = 2 * 60 * 1000; // sonuç ekranını 2 dk göster

/**
 * useMyActiveRaceRoom — participantUids dizisinde kendi uid'im geçen ve
 * hâlâ 'waiting'/'racing' durumunda OLAN ya da yakın zamanda (son 2 dk
 * içinde) 'finished' olmuş oda var mı diye bakar (sonuç ekranının
 * gösterilebilmesi için). array-contains tek başına kullanıldığı için
 * composite index gerektirmez; durum/tarih filtresi client-side.
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
        const now = Date.now();
        const active = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .find((r) => {
            if (r.status === 'waiting' || r.status === 'ready' || r.status === 'racing') return true;
            if (r.status === 'finished') {
              const finishedMs = r.finishedAt?.toMillis?.() ?? 0;
              return now - finishedMs < RECENT_FINISH_WINDOW_MS;
            }
            return false;
          });
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
