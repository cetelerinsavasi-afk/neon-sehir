import { useContext, useState } from 'react';
import { Heart, MessageCircle, Trash2 } from 'lucide-react';
import { SixNavContext } from './sixNav';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PostAttachment from './PostAttachment';
import PlayerCard from '../PlayerCard/PlayerCard';
import ActionMenu from '../ActionMenu/ActionMenu';
import CommentsPanel from './CommentsPanel';
import ReportBlockSheet, { MoreButton } from '../ReportBlockSheet/ReportBlockSheet';
import { toggleSixtagramLike, deleteSixtagramPost } from '../../services/gameActions';
import './PostCard.css';
import { patchSixtagramFeedPost } from '../../hooks/useSixtagramFeed';

function timeAgo(createdAtMs) {
  if (!createdAtMs) return '';
  const diffMs = Date.now() - createdAtMs;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
}

// v103: commentsInline — gönderi, yorumları zaten altında açık bir görünümde
// (bildirimden açılan gönderi) gösteriliyorsa yorum düğmesi ikinci bir panel açmaz.
export default function PostCard({ post, liked, isOwn, commentsInline = false }) {
  const [busy, setBusy] = useState(false);
  const [optimisticLiked, setOptimisticLiked] = useState(null);
  const [optimisticCount, setOptimisticCount] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const official = post.official === 'belediye'; // v127 — Belediye'nin resmî duyurusu
  // v135 — Sixtagram içinde avatara dokununca oyuncunun Sixtagram profili açılır
  const nav = useContext(SixNavContext);
  const openProfile = () => {
    if (official) return;
    if (nav?.openProfile) nav.openProfile({ uid: post.uid, name: post.authorName, avatar: post.authorAvatar });
    else setPanelOpen(true);
  };

  const effectiveLiked = optimisticLiked ?? liked;
  const effectiveCount = optimisticCount ?? post.likeCount ?? 0;

  const handleLike = async () => {
    if (busy || isOwn) return;
    setBusy(true);
    const nextLiked = !effectiveLiked;
    setOptimisticLiked(nextLiked);
    setOptimisticCount(effectiveCount + (nextLiked ? 1 : -1));
    try {
      await toggleSixtagramLike(post.id);
      patchSixtagramFeedPost(post.id, { likeCount: effectiveCount + (nextLiked ? 1 : -1) });
    } catch (err) {
      console.error('Beğeni hatası:', err);
      // Başarısız olursa iyimser güncellemeyi geri al.
      setOptimisticLiked(effectiveLiked);
      setOptimisticCount(effectiveCount);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteSixtagramPost(post.id);
      patchSixtagramFeedPost(post.id, null);
      setHidden(true);
    } catch (err) {
      console.error('Gönderi silme hatası:', err);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  if (hidden) return null;

  return (
    <div className="six-post">
      <div className="six-post-head">
        <button className="six-post-authorbtn" onClick={openProfile}>
          <div className="six-post-avatar">
            {official ? <span className="six-official-badge" aria-hidden="true">🏛️</span> : <AvatarSvg avatar={post.authorAvatar} size={36} rounded />}
          </div>
          <div className="six-post-headinfo">
            <p className="six-post-author">
              {post.authorName} <span className="six-post-time">· {timeAgo(post.createdAtMs)}</span>
            </p>
          </div>
        </button>

        {isOwn && (
          <button
            className={`six-post-delete-btn ${confirmingDelete ? 'confirming' : ''}`}
            onClick={handleDelete}
            disabled={deleting}
            title="Gönderiyi sil"
          >
            <Trash2 size={14} />
            {confirmingDelete && <span>Emin misin?</span>}
          </button>
        )}
        {!isOwn && <MoreButton onClick={() => setMenuOpen(true)} label="Seçenekler" />}
      </div>

      {post.text && !post.attachment && (
        <p className="six-post-text big" style={official ? { whiteSpace: 'pre-line' } : undefined}>
          {post.text}
        </p>
      )}
      <PostAttachment attachment={post.attachment} post={post} />

      <div className="six-post-actions">
        {isOwn ? (
          <span className="six-like-static">
            <Heart size={16} fill={effectiveCount > 0 ? 'currentColor' : 'none'} />
            <span>{effectiveCount}</span>
          </span>
        ) : (
          <button
            className={`six-like-btn ${effectiveLiked ? 'liked' : ''}`}
            onClick={handleLike}
            disabled={busy}
          >
            <Heart size={16} fill={effectiveLiked ? 'currentColor' : 'none'} />
            <span>{effectiveCount}</span>
          </button>
        )}

        <button className="six-comment-btn" onClick={() => !commentsInline && setCommentsOpen(true)}>
          <MessageCircle size={16} />
          <span>{post.commentCount || 0}</span>
        </button>
      </div>
      {post.text && post.attachment && (
        <p className="six-post-text">
          <b onClick={openProfile}>{post.authorName}</b> {post.text}
        </p>
      )}

      {/* v53: ⋯ → önce olumlu seçenekler, "Bildir" en altta ve soluk */}
      {menuOpen && (
        <ActionMenu
          title={post.authorName || 'Oyuncu'}
          onClose={() => setMenuOpen(false)}
          actions={[
            ...(official ? [] : [{ key: 'profile', icon: '👤', label: 'Profili gör', onClick: openProfile }, { key: 'card', icon: '🪪', label: 'Oyuncu kartı', onClick: () => setPanelOpen(true) }]),
            ...(commentsInline ? [] : [{ key: 'comments', icon: '💬', label: 'Yorumlar', onClick: () => setCommentsOpen(true) }]),
            { key: 'report', icon: '⚑', label: 'Bildir', subtle: true, onClick: () => setReportOpen(true) },
          ]}
        />
      )}
      {reportOpen && (
        <ReportBlockSheet
          targetUid={post.uid}
          targetName={post.authorName || 'Oyuncu'}
          canBlock={false}
          items={[{ label: 'Gönderiyi bildir', targetType: 'sixtagramPost', targetPath: `sixtagramPosts/${post.id}`, preview: post.text }]}
          onClose={() => setReportOpen(false)}
        />
      )}

      {panelOpen && !official && (
        <PlayerCard
          uid={post.uid}
          name={post.authorName}
          avatar={post.authorAvatar}
          reportItems={[{ label: 'Bu gönderiyi bildir', targetType: 'sixtagramPost', targetPath: `sixtagramPosts/${post.id}`, preview: post.text }]}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {commentsOpen && <CommentsPanel postId={post.id} onClose={() => setCommentsOpen(false)} />}
    </div>
  );
}
