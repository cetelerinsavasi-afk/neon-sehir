import { useState } from 'react';
import { X } from 'lucide-react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { useSixtagramComments } from '../../hooks/useSixtagramComments';
import { createSixtagramComment } from '../../services/gameActions';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import PlayerCard from '../PlayerCard/PlayerCard';
import ActionMenu from '../ActionMenu/ActionMenu';
import { copyText, useLongPress } from '../ActionMenu/actionMenuUtils';
import { useAuth } from '../../contexts/AuthContext';
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
function ReplyRow({ r, onProfile, onMenu }) {
  const press = useLongPress(() => onMenu(r));
  return (
    <div className="six-comment-row six-comment-reply-row">
      <button type="button" className="six-comment-avatar pc-trigger" onClick={() => onProfile(r)} aria-label={`${r.authorName || 'Oyuncu'} profilini gör`}>
        <AvatarSvg avatar={r.authorAvatar} size={24} rounded />
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

function CommentRow({ comment, onReply, onProfile, onMenu }) {
  const press = useLongPress(() => onMenu(comment));
  return (
    <div className="six-comment-row">
      <button type="button" className="six-comment-avatar pc-trigger" onClick={() => onProfile(comment)} aria-label={`${comment.authorName || 'Oyuncu'} profilini gör`}>
        <AvatarSvg avatar={comment.authorAvatar} size={28} rounded />
      </button>
      <div className="six-comment-body">
        <div {...press}>
          <p className="six-comment-head">
            <button type="button" className="six-comment-author pc-trigger" onClick={() => onProfile(comment)}>
              {comment.authorName}
            </button>
            <span className="six-comment-time">{timeAgo(comment.createdAtMs)}</span>
          </p>
          <p className="six-comment-text">{comment.text}</p>
        </div>
        <button className="six-comment-reply-btn" onClick={() => onReply(comment)}>
          Yanıtla
        </button>

        {comment.replies?.length > 0 && (
          <div className="six-comment-replies">
            {comment.replies.map((r) => (
              <ReplyRow key={r.id} r={r} onProfile={onProfile} onMenu={onMenu} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommentsPanel({ postId, onClose }) {
  const { comments: allComments, loading } = useSixtagramComments(postId);
  const { user } = useAuth();
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
      <div className="six-comments-panel" onClick={(e) => e.stopPropagation()}>
        <div className="six-comments-head">
          <p className="six-comments-title">Yorumlar</p>
          <button className="six-comments-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="six-comments-list">
          {loading && <p className="six-comments-hint">Yükleniyor…</p>}
          {!loading && comments.length === 0 && (
            <p className="six-comments-hint">Henüz yorum yok — ilk yorumu sen yaz!</p>
          )}
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} onReply={(cm) => setReplyTo(cm)} onProfile={setProfileOf} onMenu={setMenuFor} />
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

        <div className="six-comments-compose">
          <input
            className="six-comments-input"
            placeholder={replyTo ? 'Yanıt yaz…' : 'Yorum yaz…'}
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
            {posting ? '…' : 'Gönder'}
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
