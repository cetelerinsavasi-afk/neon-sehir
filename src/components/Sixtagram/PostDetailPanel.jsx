import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import PostCard from './PostCard';
import CommentsPanel from './CommentsPanel';

// v103 — Bildirime (beğeni/yorum/yanıt) dokununca açılır: gönderinin kendisi
// en üstte, altında yorumları; bildirimi oluşturan yorum vurgulanır ve yanıt
// kutusu o yorumun dizisine hazır gelir. Gönderi akışta/profilde yüklü
// olmasa da doğrudan sixtagramPosts/{postId} canlı okunur.
export default function PostDetailPanel({ postId, focusCommentId, likedIds, onClose }) {
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const [post, setPost] = useState(undefined); // undefined: yükleniyor · null: yok

  useEffect(() => {
    setPost(undefined);
    const unsub = onSnapshot(
      doc(db, 'sixtagramPosts', postId),
      (snap) => setPost(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => {
        console.error('Gönderi okunamadı:', err);
        setPost(null);
      }
    );
    return unsub;
  }, [postId]);

  let header;
  if (post === undefined) header = <p className="six-post-detail-state">Gönderi yükleniyor…</p>;
  else if (post === null) header = <p className="six-post-detail-state">Bu gönderi artık yok (silinmiş ya da süresi dolmuş olabilir).</p>;
  else if (isHiddenForMe(post, post.uid, isBlocked)) header = <p className="six-post-detail-state">Bu gönderi gizlendi.</p>;
  else header = <PostCard post={post} liked={likedIds?.has(post.id)} isOwn={post.uid === user?.uid} commentsInline />;

  return <CommentsPanel postId={postId} onClose={onClose} title="Gönderi" header={header} focusCommentId={focusCommentId} />;
}
