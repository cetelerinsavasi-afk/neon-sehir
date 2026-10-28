import { useContext, useRef, useState } from 'react';
import { SixNavContext } from './sixNav';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PostAttachment from './PostAttachment';
import PlayerCard from '../PlayerCard/PlayerCard';
import ActionMenu from '../ActionMenu/ActionMenu';
import CommentsPanel from './CommentsPanel';
import ConfirmSheet from './ConfirmSheet';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import { IgIcon } from './igIcons';
import { toggleSixtagramLike, deleteSixtagramPost } from '../../services/gameActions';
import { useAuth } from '../../contexts/AuthContext';
import { setFollow, useSixtagramSocial } from '../../hooks/useSixtagramSocial';
import './PostCard.css';
import { patchSixtagramFeedPost } from '../../hooks/useSixtagramFeed';

// v135 — Instagram'ın yeni gönderi kartı: başlıkta "• Takip et", çift dokunuşla
// beğeni (kalp animasyonu), sayılar ikonların yanında, açıklama + "yorumların
// tümünü gör" + zaman altta; silme onaylı.
export function timeAgoLong(createdAtMs) {
  if (!createdAtMs) return '';
  const mins = Math.floor((Date.now() - createdAtMs) / 60000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dakika önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}
const fmt = (n) => Math.max(0, Number(n) || 0).toLocaleString('tr-TR');

// v103: commentsInline — gönderi, yorumları zaten altında açık bir görünümde
// (bildirimden açılan gönderi) gösteriliyorsa yorum düğmesi ikinci bir panel açmaz.
export default function PostCard({ post, liked, isOwn, commentsInline = false }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [optimisticLiked, setOptimisticLiked] = useState(null);
  const [optimisticCount, setOptimisticCount] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const [pop, setPop] = useState(false);
  const lastTap = useRef(0);
  const official = post.official === 'belediye'; // v127 — Belediye'nin resmî duyurusu
  const nav = useContext(SixNavContext);
  const { isFollowing } = useSixtagramSocial();
  const following = isFollowing(post.uid);
  const [followBusy, setFollowBusy] = useState(false);
  const story = !official && nav?.storyOf?.(post.uid);
  const openProfile = () => {
    if (official) return;
    if (nav?.openProfile) nav.openProfile({ uid: post.uid, name: post.authorName, avatar: post.authorAvatar });
    else setPanelOpen(true);
  };
  const onAvatar = () => (story ? nav.openStory(post.uid) : openProfile());

  const effectiveLiked = optimisticLiked ?? liked;
  const effectiveCount = optimisticCount ?? post.likeCount ?? 0;

  const handleLike = async (force = null) => {
    if (busy || isOwn || !user) return;
    const nextLiked = force ?? !effectiveLiked;
    if (nextLiked === effectiveLiked) return;
    setBusy(true);
    setOptimisticLiked(nextLiked);
    setOptimisticCount(effectiveCount + (nextLiked ? 1 : -1));
    if (nextLiked) {
      setPop(true);
      setTimeout(() => setPop(false), 380);
    }
    try {
      await toggleSixtagramLike(post.id);
      patchSixtagramFeedPost(post.id, { likeCount: effectiveCount + (nextLiked ? 1 : -1) });
    } catch (err) {
      console.error('Beğeni hatası:', err);
      setOptimisticLiked(effectiveLiked);
      setOptimisticCount(effectiveCount);
    } finally {
      setBusy(false);
    }
  };
  // çift dokunuş: beğen + büyük kalp
  const onMediaTap = () => {
    const t = Date.now();
    if (t - lastTap.current < 320) {
      lastTap.current = 0;
      setBurst((n) => n + 1);
      handleLike(true);
    } else lastTap.current = t;
  };
  const doDelete = async () => {
    await deleteSixtagramPost(post.id);
    patchSixtagramFeedPost(post.id, null);
    setHidden(true);
  };
  const follow = async () => {
    setFollowBusy(true);
    try {
      await setFollow(post.uid, true, post.authorName);
    } catch {
      /* yoksay */
    } finally {
      setFollowBusy(false);
    }
  };

  if (hidden) return null;
  const textOnly = Boolean(post.text && !post.attachment);

  return (
    <article className="six-post">
      <header className="six-post-head">
        <button className={`six-post-av${story ? (story.seen ? ' ring seen' : ' ring') : ''}`} onClick={onAvatar} aria-label={`${post.authorName} hikâyesi`}>
          <span className="six-post-av-in">{official ? <span className="six-official-badge" aria-hidden="true">🏛️</span> : <AvatarSvg avatar={post.authorAvatar} size={32} rounded />}</span>
        </button>
        <div className="six-post-who">
          <button className="six-post-name" onClick={openProfile}>
            {post.authorName}
          </button>
          {!isOwn && !official && user && !following && (
            <>
              <span className="six-dot">•</span>
              <button className="six-post-follow" disabled={followBusy} onClick={follow}>
                Takip et
              </button>
            </>
          )}
        </div>
        <button className="six-post-more" onClick={() => setMenuOpen(true)} aria-label="Seçenekler">
          <IgIcon n="more" />
        </button>
      </header>

      <div className="six-post-media" onClick={onMediaTap}>
        {textOnly ? (
          <p className="six-post-text big" style={official ? { whiteSpace: 'pre-line' } : undefined}>
            {post.text}
          </p>
        ) : (
          <PostAttachment attachment={post.attachment} post={post} />
        )}
        {burst > 0 && (
          <span key={burst} className="six-burst" aria-hidden="true">
            <IgIcon n="heart" size={92} fill stroke={0} />
          </span>
        )}
      </div>

      <div className="six-post-actions">
        <button className={`six-act like${effectiveLiked ? ' on' : ''}${pop ? ' pop' : ''}`} onClick={() => handleLike()} disabled={isOwn} aria-label="Beğen">
          <IgIcon n="heart" size={25} fill={Boolean(effectiveLiked)} />
          {effectiveCount > 0 && <span>{fmt(effectiveCount)}</span>}
        </button>
        <button className="six-act" onClick={() => !commentsInline && setCommentsOpen(true)} aria-label="Yorum yap">
          <IgIcon n="comment" size={24} />
          {post.commentCount > 0 && <span>{fmt(post.commentCount)}</span>}
        </button>
      </div>
      {post.text && !textOnly && (
        <p className="six-post-text">
          <b onClick={openProfile}>{post.authorName}</b> {post.text}
        </p>
      )}
      {post.commentCount > 0 && !commentsInline && (
        <button className="six-post-allc" onClick={() => setCommentsOpen(true)}>
          {post.commentCount === 1 ? '1 yorumu gör' : `${fmt(post.commentCount)} yorumun tümünü gör`}
        </button>
      )}
      <p className="six-post-time">{timeAgoLong(post.createdAtMs)}</p>

      {menuOpen && (
        <ActionMenu
          title={post.authorName || 'Oyuncu'}
          onClose={() => setMenuOpen(false)}
          actions={
            isOwn
              ? [
                  ...(commentsInline ? [] : [{ key: 'comments', icon: '💬', label: 'Yorumlar', onClick: () => setCommentsOpen(true) }]),
                  { key: 'delete', icon: '🗑️', label: 'Sil', onClick: () => setAskDelete(true) },
                ]
              : [
                  ...(official ? [] : [{ key: 'profile', icon: '👤', label: 'Profili gör', onClick: openProfile }, { key: 'card', icon: '🪪', label: 'Oyuncu kartı', onClick: () => setPanelOpen(true) }]),
                  ...(commentsInline ? [] : [{ key: 'comments', icon: '💬', label: 'Yorumlar', onClick: () => setCommentsOpen(true) }]),
                  { key: 'report', icon: '⚑', label: 'Bildir', subtle: true, onClick: () => setReportOpen(true) },
                ]
          }
        />
      )}
      {askDelete && <ConfirmSheet title="Gönderi silinsin mi?" text="Bu gönderi kalıcı olarak silinecek." onConfirm={doDelete} onClose={() => setAskDelete(false)} />}
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
    </article>
  );
}
