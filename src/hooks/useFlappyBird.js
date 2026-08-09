import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useFlappyLeaderboard — flappyScores koleksiyonundaki (her oyuncunun
 * SADECE kişisel en iyi skorunu tutan) en yüksek 10 skoru canlı dinler.
 */
export function useFlappyLeaderboard() {
  const [top10, setTop10] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'flappyScores'), orderBy('score', 'desc'), limit(10));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setTop10(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useFlappyLeaderboard dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { top10, loading };
}

/**
 * useMyFlappyBest — kendi flappyScores/{uid} dokümanımı (kişisel rekor)
 * canlı dinler.
 */
export function useMyFlappyBest() {
  const { user } = useAuth();
  const [best, setBest] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBest(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'flappyScores', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setBest(snap.exists() ? snap.data().score || 0 : 0);
        setLoading(false);
      },
      (err) => {
        console.error('useMyFlappyBest dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { best, loading };
}
