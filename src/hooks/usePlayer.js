import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * usePlayer — users/{uid} dokümanını canlı dinler.
 * Faz 2 kapsamında: gold, suspicion, reputation, profession alanları.
 * (isPolice alanı bilerek buraya dahil edilmedi — Bölüm 14 gizlilik
 * kuralı gereği ayrı bir private alt koleksiyonda tutulacak, Faz 5.)
 */
export function usePlayer() {
  const { user } = useAuth();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPlayer(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setPlayer(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.error('usePlayer dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { player, loading };
}
