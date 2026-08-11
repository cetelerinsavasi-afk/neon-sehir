import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useSixtagramComments — bir postun yorumlarını canlı dinler ve
 * ağaç yapısına (üst yorum + altındaki yanıtlar) dönüştürür. Sıralama
 * istemcide yapılıyor (composite index gerekmesin diye).
 */
export function useSixtagramComments(postId) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) {
      setComments([]);
      setLoading(false);
      return undefined;
    }
    const ref = collection(db, 'sixtagramPosts', postId, 'comments');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
        setComments(list);
        setLoading(false);
      },
      (err) => {
        console.error('useSixtagramComments dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [postId]);

  // Ağaç yapısı: her üst yorumun altına kendi yanıtları dizilir.
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = {};
  comments
    .filter((c) => c.parentCommentId)
    .forEach((c) => {
      if (!repliesByParent[c.parentCommentId]) repliesByParent[c.parentCommentId] = [];
      repliesByParent[c.parentCommentId].push(c);
    });
  const tree = topLevel.map((c) => ({ ...c, replies: repliesByParent[c.id] || [] }));

  return { comments: tree, count: comments.length, loading };
}
