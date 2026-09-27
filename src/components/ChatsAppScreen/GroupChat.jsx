import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGlobalChat } from '../../hooks/useGlobalChat';
import { markChatsAppSeen } from '../../hooks/useUnreadNotifications';
import { sendChatMessage } from '../../services/gameActions';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import PlayerCard from '../PlayerCard/PlayerCard';
import ActionMenu from '../ActionMenu/ActionMenu';
import { copyText, useLongPress } from '../ActionMenu/actionMenuUtils';
import { useBlocks } from '../../contexts/BlocksContext';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import { clockOf, tsMs } from './chatsappTime';

// v60 — "Neon Şehir" grubu: eski ChatsApp genel sohbeti (tüm oyuncular).
// Davranış v53 ile aynı; yalnızca üstte WhatsApp tarzı grup başlığı var.
function ChatRow({ m, mine, onProfile, onMenu }) {
  const press = useLongPress(() => onMenu(m));
  return (
    <div className={`chatsapp-row${mine ? ' mine' : ''}`}>
      {!mine && (
        <button type="button" className="chatsapp-avatar pc-trigger" onClick={() => onProfile(m)} aria-label={`${m.displayName || 'Oyuncu'} profilini gör`}>
          <AvatarSvg avatar={m.avatar} size={28} rounded />
        </button>
      )}
      <div className={`chatsapp-bubble${mine ? ' mine' : ''}`} {...press}>
        {mine ? (
          <span className="chatsapp-sender">{m.displayName}</span>
        ) : (
          <button type="button" className="chatsapp-sender pc-trigger" onClick={() => onProfile(m)}>
            {m.displayName}
          </button>
        )}
        <span className="chatsapp-text">{m.text}</span>
        <span className="chatsapp-time">{clockOf(tsMs(m.createdAt))}</span>
      </div>
    </div>
  );
}

export default function GroupChat({ onBack }) {
  const { user } = useAuth();
  const { messages: allMessages } = useGlobalChat();
  const { isBlocked } = useBlocks();
  // UGC D2: gizlenen (şikâyetle) ve engellenen oyuncuların mesajları gösterilmez
  const messages = allMessages.filter((m) => !isHiddenForMe(m, m.uid, isBlocked));
  const [reportTarget, setReportTarget] = useState(null);
  const [profileOf, setProfileOf] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  // Grup açıkken gelen mesajlar "görüldü" sayılır (liste ve harita rozeti söner)
  useEffect(() => {
    markChatsAppSeen();
  }, [allMessages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
      <div className="ca-header">
        <button className="ca-back" onClick={onBack} aria-label="Sohbetler">
          ‹
        </button>
        <span className="ca-group-avatar" aria-hidden="true">
          🌆
        </span>
        <div className="ca-header-text">
          <span className="ca-header-name">Neon Şehir</span>
          <span className="ca-header-sub">Tüm oyuncular</span>
        </div>
      </div>
      <div className="chatsapp-messages">
        {messages.map((m) => (
          <ChatRow key={m.id} m={m} mine={m.uid === user.uid} onProfile={setProfileOf} onMenu={setMenuFor} />
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
      {menuFor && (
        <ActionMenu
          title={`${menuFor.displayName || 'Oyuncu'}: “${String(menuFor.text || '').slice(0, 60)}”`}
          onClose={() => setMenuFor(null)}
          actions={[
            { key: 'copy', icon: '📋', label: 'Kopyala', onClick: () => copyText(menuFor.text || '') },
            ...(menuFor.uid !== user.uid
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
          name={profileOf.displayName}
          avatar={profileOf.avatar}
          reportItems={[{ label: 'Bu mesajı bildir', targetType: 'globalChat', targetPath: `globalChat/${profileOf.id}`, preview: profileOf.text }]}
          onClose={() => setProfileOf(null)}
        />
      )}
      {reportTarget && (
        <ReportBlockSheet
          targetUid={reportTarget.uid}
          targetName={reportTarget.displayName || 'Oyuncu'}
          canBlock={false}
          items={[{ label: 'Mesajı bildir', targetType: 'globalChat', targetPath: `globalChat/${reportTarget.id}`, preview: reportTarget.text }]}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
