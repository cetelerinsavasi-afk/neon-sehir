import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMyActiveRaceRoom — participantUids dizisinde kendi uid'im geçen ve
 * hâlâ 'waiting'/'ready'/'racing' durumunda olan oda var mı diye bakar.
 * Sadece HENÜZ BİTMEMİŞ odaları döner — bitmiş bir yarışın sonuç ekranını
 * göstermek RaceTrackScreen'de roomId bazlı ayrı bir takiple yapılıyor
 * (bkz. useRaceRoomById), bu sayede eski bitmiş bir oda burada asla tekrar
 * "yakalanıp" kullanıcıyı istemeden sonuç ekranına döndürmüyor.
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
          .find((r) => r.status === 'waiting' || r.status === 'ready' || r.status === 'racing');
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
