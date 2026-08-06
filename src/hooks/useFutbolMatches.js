import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// Bir lig için GÜNCEL SEZONUN tüm maçlarını çeker. `season` verilmezse
// (henüz lig verisi yüklenmediyse) boş döner — eski sezonların maçlarıyla
// karışıp "güncel tur" hesaplamalarını (ve iddaa ekranını) bozmasın diye
// sezon filtresi bilerek sorgunun bir parçası (backend zaten eski
// sezonu sildiği için bu ikinci bir güvenlik katmanı).
export function useFutbolMatches(leagueId, season) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId || !season) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'futbolMatches'),
      where('leagueId', '==', leagueId),
      where('season', '==', season)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => a.round - b.round);
        setMatches(list);
        setLoading(false);
      },
      (err) => {
        console.error('useFutbolMatches dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [leagueId, season]);

  return { matches, loading };
}
