import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useOpenRaceRooms — status='waiting' olan raceRooms dokümanlarını dinler.
 * Tek eşitlik filtresi (status) kullanılıyor, composite index riski yok.
 */
export function useOpenRaceRooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'raceRooms'), where('status', '==', 'waiting'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useOpenRaceRooms dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { rooms, loading };
}
