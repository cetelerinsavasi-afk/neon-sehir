import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// useFutbolSeasonState — futbolSeasonState/current dokümanını dinler:
// bugün lig mi ('LEAGUE_DAY'), kupa mı ('CUP_DAY') yoksa şampiyonluk
// kutlaması mı ('CELEBRATION_DAY') oynanıyor. Doküman henüz oluşmadıysa
// (Cloud Functions ilk kez çalışmadan önceki çok kısa pencere) 'LEAGUE_DAY'
// varsayılır — mevcut ekranlar zaten bu duruma göre normal çalışır.
export function useFutbolSeasonState() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'futbolSeasonState', 'current');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setState(snap.exists() ? snap.data() : { status: 'LEAGUE_DAY' });
        setLoading(false);
      },
      (err) => {
        console.error('useFutbolSeasonState dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { state: state || { status: 'LEAGUE_DAY' }, loading };
}
