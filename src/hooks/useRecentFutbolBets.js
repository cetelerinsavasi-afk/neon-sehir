import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const RECENT_LIMIT = 10;

/**
 * useRecentFutbolBets — kullanıcının TÜM liglerdeki en son iddaa
 * kuponları (Sixtagram > "İddaa Kuponu" eki seçici için). leagueId
 * filtresi YOK (useMyFutbolBets'in aksine) — composite index gerekmesin
 * diye orderBy de yok, sıralama istemcide yapılıyor.
 */
export function useRecentFutbolBets() {
  const { user } = useAuth();
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBets([]);
      setLoading(false);
      return undefined;
    }
    const q = query(collection(db, 'futbolBets'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.placedAt?.toMillis?.() || 0) - (a.placedAt?.toMillis?.() || 0));
        setBets(list.slice(0, RECENT_LIMIT));
        setLoading(false);
      },
      (err) => {
        console.error('useRecentFutbolBets dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { bets, loading };
}
