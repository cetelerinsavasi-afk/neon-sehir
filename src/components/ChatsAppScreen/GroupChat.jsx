import { useEffect, useRef, useState } from 'react';
import { useStickyChat } from './useStickyChat';
import { useAuth } from '../../contexts/AuthContext';
import { useGlobalChat } from '../../hooks/useGlobalChat';
import { markChatsAppSeen } from '../../hooks/useUnreadNotifications';
import { reactChatMessage, sendChatMessage } from '../../services/gameActions';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import PlayerCard from '../PlayerCard/PlayerCard';
import ActionMenu from '../ActionMenu/ActionMenu';
import { copyText, useLongPress } from '../ActionMenu/actionMenuUtils';
import { useBlocks } from '../../contexts/BlocksContext';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import { clockOf, tsMs } from './chatsappTime';
import { CHAT_REACTIONS, ChatInput, ReactionChips, ReplyBar, ReplyQuote, replyDraftOf } from './chatExtras';

// v60 — "Neon Şehir" grubu: eski ChatsApp genel sohbeti (tüm oyuncular).
// Davranış v53 ile aynı; yalnızca üstte WhatsApp tarzı grup başlığı var.
function ChatRow({ m, mine, myUid, onProfile, onMenu, onReact, isBlocked }) {
  const press = useLongPress(() => onMenu(m));
  return (
    <div id={`ca-msg-${m.id}`} className={`chatsapp-row${mine ? ' mine' : ''}`}>
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
        <ReplyQuote replyTo={m.replyTo} myUid={myUid} hidden={m.replyTo && isBlocked(m.replyTo.uid)} />
        <span className="chatsapp-text">{m.text}</span>
        <ReactionChips reactions={m.reactions} myUid={myUid} onReact={(e) => onReact(m, e)} />
        <span className="chatsapp-time">{clockOf(tsMs(m.createdAt))}</span>
      </div>
    </div>
  );
}

export default function GroupChat({ onBack }) {
  const { user } = useAuth();
  // v204: son 10 mesajla açılır; yukarı kaydırınca 20'şer eski mesaj gelir (bkz. useGlobalChat)
  const { messages: allMessages, loadOlder, loadingOlder, hasMore } = useGlobalChat();
  const { isBlocked } = useBlocks();
  // UGC D2: gizlenen (şikâyetle) ve engellenen oyuncuların mesajları gösterilmez
  const messages = allMessages.filter((m) => !isHiddenForMe(m, m.uid, isBlocked));
  const [reportTarget, setReportTarget] = useState(null);
  const [profileOf, setProfileOf] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [error, setError] = useState(null);
  const [replyTo, setReplyTo] = useState(null); // v72 — yanıtlanan mesaj
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const innerRef = useRef(null);

  const react = async (m, emoji) => {
    setError(null);
    try {
      await reactChatMessage(m.id, emoji);
    } catch (err) {
      setError(err.message || 'Tepki verilemedi.');
    }
  };

  // Grup açıkken gelen mesajlar "görüldü" sayılır (liste ve harita rozeti söner)
  useEffect(() => {
    markChatsAppSeen();
  }, [allMessages.length]);

  // v217: sohbet en alttan açılır ve yeni mesajda altta kalır (bkz. useStickyChat)
  const lastMsg = messages.length ? messages[messages.length - 1] : null;
  const sticky = useStickyChat({ listRef, innerRef, lastId: lastMsg?.id || null, lastMine: Boolean(lastMsg && lastMsg.uid === user?.uid), count: messages.length, onNearTop: () => showOlder() });
  const showOlder = async () => {
    if (!hasMore || loadingOlder) return;
    sticky.rememberPos();
    const n = await loadOlder();
    if (!n) sticky.forgetPos();
    else requestAnimationFrame(sticky.forgetPos);
  };

  const handleSend = async (trimmed) => {
    setError(null);
    try {
      await sendChatMessage(trimmed, replyTo?.id || null);
      setReplyTo(null);
      return true;
    } catch (err) {
      setError(err.message || 'Mesaj gönderilemedi.');
      return false;
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
      <div className="chatsapp-messages" ref={listRef} onScroll={sticky.onScroll}>
        <div className="ca-msgs-inner" ref={innerRef}>
        {hasMore && messages.length > 0 && (
          <button type="button" className="ca-load-older" onClick={showOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Yükleniyor…' : '↑ Önceki mesajlar'}
          </button>
        )}
        {messages.map((m) => (
          <ChatRow key={m.id} m={m} mine={m.uid === user.uid} myUid={user.uid} onProfile={setProfileOf} onMenu={setMenuFor} onReact={react} isBlocked={isBlocked} />
        ))}
        </div>
      </div>
      <ReplyBar replyTo={replyTo} myUid={user.uid} onCancel={() => setReplyTo(null)} />
      <ChatInput onSend={handleSend} maxLength={300} inputRef={inputRef} />
      {error && <p className="chatsapp-error">{error}</p>}
      {menuFor && (
        <ActionMenu
          title={`${menuFor.displayName || 'Oyuncu'}: “${String(menuFor.text || '').slice(0, 60)}”`}
          onClose={() => setMenuFor(null)}
          emojis={CHAT_REACTIONS}
          selectedEmoji={menuFor.reactions?.[user.uid]}
          onEmoji={(e) => react(menuFor, e)}
          actions={[
            {
              key: 'reply',
              icon: '↩️',
              label: 'Yanıtla',
              onClick: () => {
                setReplyTo(replyDraftOf(menuFor, menuFor.displayName || 'Oyuncu'));
                setTimeout(() => inputRef.current?.focus(), 50);
              },
            },
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
