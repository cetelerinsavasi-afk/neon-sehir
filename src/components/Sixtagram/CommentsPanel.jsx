import { useState } from 'react';
import { X } from 'lucide-react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { useSixtagramComments } from '../../hooks/useSixtagramComments';
import { createSixtagramComment } from '../../services/gameActions';
import ReportBlockSheet, { MoreButton } from '../ReportBlockSheet/ReportBlockSheet';
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

function CommentRow({ comment, onReply, myUid, onReport }) {
  return (
    <div className="six-comment-row">
      <div className="six-comment-avatar">
        <AvatarSvg avatar={comment.authorAvatar} size={28} rounded />
      </div>
      <div className="six-comment-body">
        <p className="six-comment-head">
          <span className="six-comment-author">{comment.authorName}</span>
          <span className="six-comment-time">{timeAgo(comment.createdAtMs)}</span>
          {comment.uid !== myUid && <MoreButton onClick={() => onReport(comment)} label="Şikâyet et / Engelle" />}
        </p>
        <p className="six-comment-text">{comment.text}</p>
        <button className="six-comment-reply-btn" onClick={() => onReply(comment)}>
          Yanıtla
        </button>

        {comment.replies?.length > 0 && (
          <div className="six-comment-replies">
            {comment.replies.map((r) => (
              <div key={r.id} className="six-comment-row six-comment-reply-row">
                <div className="six-comment-avatar">
                  <AvatarSvg avatar={r.authorAvatar} size={24} rounded />
                </div>
                <div className="six-comment-body">
                  <p className="six-comment-head">
                    <span className="six-comment-author">{r.authorName}</span>
                    <span className="six-comment-time">{timeAgo(r.createdAtMs)}</span>
                    {r.uid !== myUid && <MoreButton onClick={() => onReport(r)} label="Şikâyet et / Engelle" />}
                  </p>
                  <p className="six-comment-text">{r.text}</p>
                </div>
              </div>
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
            <CommentRow key={c.id} comment={c} onReply={(cm) => setReplyTo(cm)} myUid={user?.uid} onReport={setReportTarget} />
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
      {reportTarget && (
        <ReportBlockSheet
          targetUid={reportTarget.uid}
          targetName={reportTarget.authorName || 'Oyuncu'}
          items={[
            { label: 'Yorumu şikâyet et', targetType: 'sixtagramComment', targetPath: `sixtagramPosts/${postId}/comments/${reportTarget.id}`, preview: reportTarget.text },
            { label: 'Oyuncuyu / adını şikâyet et', targetType: 'user', targetPath: `users/${reportTarget.uid}` },
          ]}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
