import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

const FETCH_LIMIT = 150;

/**
 * useSixtagramFeed — Anasayfa akışı. Son FETCH_LIMIT postu (en yeni önce)
 * çeker, süresi dolmuş (expiresAtMs geçmiş) olanları istemcide eler, kalanı
 * en çok beğeniye göre sıralar. Sunucuda ayrı bir "expiresAtMs > now"
 * sorgusu YAPMIYORUZ çünkü Firestore'da o zaman likeCount'a göre
 * sıralayabilmek için composite index gerekirdi — bunun yerine son
 * postları çekip istemcide filtrelemek, bu oyunun ölçeğinde çok daha
 * basit ve yeterince hızlı.
 */
export function useSixtagramFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'sixtagramPosts'),
      orderBy('createdAtMs', 'desc'),
      limit(FETCH_LIMIT)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => (p.expiresAtMs ?? 0) > now);
        list.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
        setPosts(list);
        setLoading(false);
      },
      (err) => {
        console.error('useSixtagramFeed dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { posts, loading };
}
