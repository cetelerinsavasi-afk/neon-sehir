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
    // v73 — maliyet: eskiden oyuncunun GİRDİĞİ TÜM odalar (bitmişler dahil, hiç
    // silinmiyor) her açılışta okunuyordu. Artık sadece bitmemiş odalar
    // (firestore.indexes.json: participantUids + status). İndeks henüz hazır
    // değilse (yayın sırası) eski sorguya düşer — oyun bozulmaz.
    const ACTIVE = ['waiting', 'ready', 'racing'];
    const onSnap = (snap) => {
      const hit = snap.docs.find((d) => ACTIVE.includes(d.data().status));
      // v77 performans: kök bileşen sadece oda kimliği/durumu değişince yeniden çizilsin
      // (yarış sırasında oda belgesi her hamlede değişir; tam belgeyi RaceTrackScreen ayrıca dinler)
      const next = hit ? { id: hit.id, status: hit.data().status } : null;
      setRoom((prev) => (prev?.id === next?.id && prev?.status === next?.status ? prev : next));
      setLoading(false);
    };
    let unsub = () => {};
    let alive = true;
    const legacy = () =>
      onSnapshot(query(collection(db, 'raceRooms'), where('participantUids', 'array-contains', user.uid)), onSnap, (err) => {
        console.error('useMyActiveRaceRoom dinleme hatası:', err);
        setLoading(false);
      });
    unsub = onSnapshot(
      query(collection(db, 'raceRooms'), where('participantUids', 'array-contains', user.uid), where('status', 'in', ACTIVE)),
      onSnap,
      (err) => {
        if (!alive) return;
        console.warn('useMyActiveRaceRoom: indeks hazır değil, eski sorgu kullanılıyor', err?.code);
        unsub = legacy();
      }
    );
    return () => {
      alive = false;
      unsub();
    };
  }, [user]);

  return { room, loading };
}
