import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMySixtagramLikedPostIds — hangi postları beğendiğimi (kalp dolu mu
 * boş mu göstereceğimi) bilmek için TEK bir dokümanı
 * (sixtagramUserLikes/{uid}) dinler. Eskiden bir collectionGroup
 * sorgusuyla yapılıyordu ama bu, dağıtılmamış bir Firestore index'i
 * yüzünden sekmeler arası geçişte beğenilerin "kaybolmuş" gibi
 * görünmesine yol açıyordu — tek doküman dinlemek hem daha basit hem de
 * ekstra index gerektirmiyor.
 */
export function useMySixtagramLikedPostIds() {
  const { user } = useAuth();
  const [likedIds, setLikedIds] = useState(new Set());

  useEffect(() => {
    if (!user) {
      setLikedIds(new Set());
      return undefined;
    }
    const ref = doc(db, 'sixtagramUserLikes', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const postIds = snap.exists() ? snap.data().postIds || {} : {};
        setLikedIds(new Set(Object.keys(postIds).filter((id) => postIds[id])));
      },
      (err) => {
        console.error('useMySixtagramLikedPostIds dinleme hatası:', err);
      }
    );
    return unsubscribe;
  }, [user]);

  return likedIds;
}
