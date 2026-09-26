import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGlobalChat } from '../../hooks/useGlobalChat';
import { sendChatMessage } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ReportBlockSheet, { MoreButton } from '../ReportBlockSheet/ReportBlockSheet';
import { useBlocks } from '../../contexts/BlocksContext';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import './ChatsAppScreen.css';

function formatTime(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatsAppScreen() {
  const { user } = useAuth();
  const { messages: allMessages } = useGlobalChat();
  const { isBlocked } = useBlocks();
  // UGC D2: gizlenen (şikâyetle) ve engellenen oyuncuların mesajları gösterilmez
  const messages = allMessages.filter((m) => !isHiddenForMe(m, m.uid, isBlocked));
  const [reportTarget, setReportTarget] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!user) {
    return <SignInPrompt message="Sohbete katılmak için giriş yapmalısın." />;
  }

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await sendChatMessage(trimmed);
      setText('');
    } catch (err) {
      setError(err.message || 'Mesaj gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chatsapp-screen">
      <div className="chatsapp-messages">
        {messages.map((m) => (
          <div key={m.id} className={`chatsapp-row${m.uid === user.uid ? ' mine' : ''}`}>
            {m.uid !== user.uid && (
              <div className="chatsapp-avatar">
                <AvatarSvg avatar={m.avatar} size={28} rounded />
              </div>
            )}
            <div className={`chatsapp-bubble${m.uid === user.uid ? ' mine' : ''}`}>
              <span className="chatsapp-sender">
                {m.displayName}
                {m.uid !== user.uid && <MoreButton className="chatsapp-more" onClick={() => setReportTarget(m)} label="Şikâyet et / Engelle" />}
              </span>
              <span className="chatsapp-text">{m.text}</span>
              <span className="chatsapp-time">{formatTime(m.createdAt)}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chatsapp-input-row">
        <input
          type="text"
          placeholder="Mesaj yaz…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          maxLength={300}
          className="chatsapp-input"
        />
        <button className="chatsapp-send" disabled={busy || !text.trim()} onClick={handleSend}>
          Gönder
        </button>
      </div>
      {error && <p className="chatsapp-error">{error}</p>}
      {reportTarget && (
        <ReportBlockSheet
          targetUid={reportTarget.uid}
          targetName={reportTarget.displayName || 'Oyuncu'}
          items={[
            { label: 'Mesajı şikâyet et', targetType: 'globalChat', targetPath: `globalChat/${reportTarget.id}`, preview: reportTarget.text },
            { label: 'Oyuncuyu / adını şikâyet et', targetType: 'user', targetPath: `users/${reportTarget.uid}` },
          ]}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
