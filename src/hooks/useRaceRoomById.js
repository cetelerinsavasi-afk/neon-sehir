import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useRaceRoomById — belirli bir roomId'yi doğrudan dinler. Bu sayede bir
 * odaya bir kez girdikten sonra (kurma/katılma/devam eden aktif oda), o
 * odanın canlı halini array-contains sorgusunun sıralama/zamanlama
 * belirsizliklerinden bağımsız şekilde takip edebiliyoruz.
 */
export function useRaceRoomById(roomId) {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(Boolean(roomId));

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'raceRooms', roomId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setRoom(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.error('useRaceRoomById dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [roomId]);

  return { room, loading };
}
