import { useEffect, useState } from 'react';
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMySixtagramLikedPostIds — hangi postları beğendiğimi (kalp dolu mu
 * boş mu göstereceğimi) bilmek için, TÜM sixtagramPosts/*\/likes alt
 * koleksiyonlarında kendi uid'imle eşleşen dokümanları bir
 * collectionGroup sorgusuyla çeker, üst post ID'lerinin kümesini döner.
 */
export function useMySixtagramLikedPostIds() {
  const { user } = useAuth();
  const [likedIds, setLikedIds] = useState(new Set());

  useEffect(() => {
    if (!user) {
      setLikedIds(new Set());
      return undefined;
    }
    const q = query(collectionGroup(db, 'likes'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const ids = new Set(snap.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean));
        setLikedIds(ids);
      },
      (err) => {
        console.error('useMySixtagramLikedPostIds dinleme hatası:', err);
      }
    );
    return unsubscribe;
  }, [user]);

  return likedIds;
}
