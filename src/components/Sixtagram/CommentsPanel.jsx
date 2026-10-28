import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { useSixtagramComments } from '../../hooks/useSixtagramComments';
import { createSixtagramComment } from '../../services/gameActions';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import PlayerCard from '../PlayerCard/PlayerCard';
import ActionMenu from '../ActionMenu/ActionMenu';
import { copyText, useLongPress } from '../ActionMenu/actionMenuUtils';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useBlocks } from '../../contexts/BlocksContext';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import './CommentsPanel.css';

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

// v53: avatar/ada dokununca Oyuncu Kartı; yoruma uzun basınca menü
function ReplyRow({ r, onProfile, onMenu, focusId }) {
  const press = useLongPress(() => onMenu(r));
  return (
    <div className={`six-comment-row six-comment-reply-row${focusId === r.id ? ' focused' : ''}`} data-comment-id={r.id}>
      <button type="button" className="six-comment-avatar pc-trigger" onClick={() => onProfile(r)} aria-label={`${r.authorName || 'Oyuncu'} profilini gör`}>
        <AvatarSvg avatar={r.authorAvatar} size={28} rounded />
      </button>
      <div className="six-comment-body" {...press}>
        <p className="six-comment-head">
          <button type="button" className="six-comment-author pc-trigger" onClick={() => onProfile(r)}>
            {r.authorName}
          </button>
          <span className="six-comment-time">{timeAgo(r.createdAtMs)}</span>
        </p>
        <p className="six-comment-text">{r.text}</p>
      </div>
    </div>
  );
}

function CommentRow({ comment, onReply, onProfile, onMenu, focusId }) {
  const press = useLongPress(() => onMenu(comment));
  return (
    <div className={`six-comment-row${focusId === comment.id ? ' focused' : ''}`} data-comment-id={comment.id}>
      <button type="button" className="six-comment-avatar pc-trigger" onClick={() => onProfile(comment)} aria-label={`${comment.authorName || 'Oyuncu'} profilini gör`}>
        <AvatarSvg avatar={comment.authorAvatar} size={34} rounded />
      </button>
      <div className="six-comment-body">
        <div {...press} className={comment.tip ? `six-tipcard${comment.tip >= 1000 ? ' big' : ''}` : undefined}>
          <p className="six-comment-head">
            <button type="button" className="six-comment-author pc-trigger" onClick={() => onProfile(comment)}>
              {comment.authorName}
            </button>
            {comment.tip ? (
              <span className="six-tip-amt">
                💛 {Number(comment.tip).toLocaleString('tr-TR')} <span className="gold-coin-icon" style={{ width: 11, height: 11 }} />
              </span>
            ) : null}
            <span className="six-comment-time">{timeAgo(comment.createdAtMs)}</span>
          </p>
          {comment.text ? <p className="six-comment-text">{comment.text}</p> : comment.tip ? <p className="six-comment-text six-tip-plain">destek oldu</p> : null}
        </div>
        <button className="six-comment-reply-btn" onClick={() => onReply(comment)}>
          Yanıtla
        </button>

        {comment.replies?.length > 0 && (
          <div className="six-comment-replies">
            {comment.replies.map((r) => (
              <ReplyRow key={r.id} r={r} onProfile={onProfile} onMenu={onMenu} focusId={focusId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// v103: `header` verilirse (bildirimden açılan gönderi) gönderi yorumların
// üstünde aynı kaydırmada gösterilir; `focusCommentId` o yorumu vurgular,
// ekrana kaydırır ve yanıt kutusunu o yorumun dizisine hazırlar.
export default function CommentsPanel({ postId, onClose, header = null, title = 'Yorumlar', focusCommentId = null }) {
  const { comments: allComments, loading } = useSixtagramComments(postId);
  const { user } = useAuth();
  const { player } = usePlayer();
  const { isBlocked } = useBlocks();
  const [reportTarget, setReportTarget] = useState(null);
  const [profileOf, setProfileOf] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const commentPath = (c) => `sixtagramPosts/${postId}/comments/${c.id}`;
  // UGC D2: gizlenen / engellenen oyuncuların yorum ve yanıtları gösterilmez
  const visible = (c) => !isHiddenForMe(c, c.uid, isBlocked);
  const comments = allComments.filter(visible).map((c) => ({ ...c, replies: (c.replies || []).filter(visible) }));
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null); // { id, authorName } | null
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const focusedOnceRef = useRef(false);

  useEffect(() => {
    if (!focusCommentId || loading || focusedOnceRef.current) return;
    const top = comments.find((c) => c.id === focusCommentId || c.replies.some((r) => r.id === focusCommentId));
    if (!top) return;
    focusedOnceRef.current = true;
    setReplyTo(top);
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-comment-id="${focusCommentId}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [focusCommentId, loading, comments]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setPosting(true);
    setError('');
    try {
      await createSixtagramComment(postId, text.trim(), replyTo?.id || null);
      setText('');
      setReplyTo(null);
    } catch (err) {
      console.error('Yorum gönderme hatası:', err);
      setError(err.message || 'Yorum gönderilemedi.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="six-comments-backdrop" onClick={onClose}>
      <div className={`six-comments-panel${header ? ' with-post' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="six-comments-grab" aria-hidden="true" />
        <div className="six-comments-head">
          <span className="six-comments-close" />
          <p className="six-comments-title">{title}</p>
          <button className="six-comments-close" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>

        <div className="six-comments-list" ref={listRef}>
          {header}
          {header && <p className="six-comments-subtitle">💬 Yorumlar</p>}
          {loading && <p className="six-comments-hint">Yükleniyor…</p>}
          {!loading && comments.length === 0 && (
            <div className="six-comments-empty">
              <b>Henüz yorum yok</b>
              <span>Sohbeti başlat.</span>
            </div>
          )}
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              focusId={focusCommentId}
              onReply={(cm) => {
                setReplyTo(cm);
                inputRef.current?.focus();
              }}
              onProfile={setProfileOf}
              onMenu={setMenuFor}
            />
          ))}
        </div>

        {error && <p className="six-comments-error">{error}</p>}

        {replyTo && (
          <div className="six-comments-replying-to">
            <span>{replyTo.authorName} kullanıcısına yanıt veriyorsun</span>
            <button onClick={() => setReplyTo(null)}>
              <X size={12} />
            </button>
          </div>
        )}

        <div className="six-comments-emojis">
          {['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'].map((em) => (
            <button key={em} onClick={() => setText((t) => (t + em).slice(0, 280))} aria-label={em}>
              {em}
            </button>
          ))}
        </div>
        <div className="six-comments-compose">
          <span className="six-comments-me">
            <AvatarSvg avatar={player?.avatar} size={34} rounded />
          </span>
          <input
            ref={inputRef}
            className="six-comments-input"
            placeholder={replyTo ? `${replyTo.authorName} kullanıcısına yanıt ver…` : 'Yorum ekle…'}
            value={text}
            maxLength={280}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button
            className="six-comments-send-btn"
            onClick={handleSubmit}
            disabled={posting || !text.trim()}
          >
            {posting ? '…' : 'Paylaş'}
          </button>
        </div>
      </div>
      {menuFor && (
        <ActionMenu
          title={`${menuFor.authorName || 'Oyuncu'}: “${String(menuFor.text || '').slice(0, 60)}”`}
          onClose={() => setMenuFor(null)}
          actions={[
            { key: 'copy', icon: '📋', label: 'Kopyala', onClick: () => copyText(menuFor.text || '') },
            ...(menuFor.uid !== user?.uid
              ? [
                  { key: 'profile', icon: '👤', label: 'Profili gör', onClick: () => setProfileOf(menuFor) },
                  { key: 'report', icon: '⚑', label: 'Bildir', subtle: true, onClick: () => setReportTarget(menuFor) },
                ]
              : []),
          ]}
        />
      )}
      {profileOf && (
        <PlayerCard
          uid={profileOf.uid}
          name={profileOf.authorName}
          avatar={profileOf.authorAvatar}
          reportItems={profileOf.uid !== user?.uid ? [{ label: 'Bu yorumu bildir', targetType: 'sixtagramComment', targetPath: commentPath(profileOf), preview: profileOf.text }] : []}
          onClose={() => setProfileOf(null)}
        />
      )}
      {reportTarget && (
        <ReportBlockSheet
          targetUid={reportTarget.uid}
          targetName={reportTarget.authorName || 'Oyuncu'}
          canBlock={false}
          items={[{ label: 'Yorumu bildir', targetType: 'sixtagramComment', targetPath: commentPath(reportTarget), preview: reportTarget.text }]}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
