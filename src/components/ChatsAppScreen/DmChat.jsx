import { Fragment, useEffect, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial, MESSAGE_TTL_MS } from '../../contexts/SocialContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { socialAction } from '../../services/gameActions';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PlayerCard from '../PlayerCard/PlayerCard';
import ActionMenu from '../ActionMenu/ActionMenu';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import { copyText, useLongPress } from '../ActionMenu/actionMenuUtils';
import { clockOf, dayLabelOf, sameDay } from './chatsappTime';

// v60 — Arkadaşla birebir sohbet (WhatsApp benzeri). Mesajlar sunucudan
// geçer (socialAction → sendDm); 7 günden eski mesajlar gösterilmez ve silinir.
const MAX_LEN = 500;

function useDmMessages(chatId, enabled) {
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    if (!chatId || !enabled) {
      setMessages([]);
      return undefined;
    }
    const q = query(collection(db, 'dmChats', chatId, 'dmMessages'), orderBy('createdAtMs', 'desc'), limit(150));
    return onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
      (err) => {
        // sohbet silindiyse (arkadaşlıktan çıkarma) izin hatası beklenir
        console.warn('dmMessages dinleme:', err?.code || err);
        setMessages([]);
      }
    );
  }, [chatId, enabled]);
  return messages;
}

function Bubble({ m, mine, onMenu }) {
  const press = useLongPress(() => onMenu(m));
  return (
    <div className={`chatsapp-row${mine ? ' mine' : ''}`}>
      <div className={`chatsapp-bubble ca-dm-bubble${mine ? ' mine' : ''}`} {...press}>
        <span className="chatsapp-text">{m.text}</span>
        <span className="chatsapp-time">{clockOf(m.createdAtMs)}</span>
      </div>
    </div>
  );
}

export default function DmChat({ target, onBack }) {
  const { user } = useAuth();
  const { friendMap, chatWith } = useSocial();
  const { isBlocked } = useBlocks();
  const friend = friendMap[target.uid];
  const chat = chatWith(target.uid);
  const name = friend?.name || chat?.otherName || target.name || 'Oyuncu';
  const avatar = friend?.avatar ?? chat?.otherAvatar ?? target.avatar ?? null;
  const raw = useDmMessages(chat?.id, Boolean(chat && friend));
  const cutoff = Date.now() - MESSAGE_TTL_MS;
  const messages = raw.filter((m) => m.createdAtMs > cutoff && !isHiddenForMe(m, m.uid, isBlocked));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [reportOf, setReportOf] = useState(null);
  const [showCard, setShowCard] = useState(false);
  const bottomRef = useRef(null);
  const myUnread = chat?.myUnread || 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Sohbet açıkken gelen mesajlar okundu sayılır
  useEffect(() => {
    if (myUnread > 0 && friend) socialAction('markDmRead', { targetUid: target.uid }).catch(() => {});
  }, [myUnread, friend, target.uid]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await socialAction('sendDm', { targetUid: target.uid, text: t });
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
        <button className="ca-header-person" onClick={() => setShowCard(true)} aria-label={`${name} profilini gör`}>
          <AvatarSvg avatar={avatar} size={34} rounded />
          <span className="ca-header-text">
            <span className="ca-header-name">{name}</span>
            <span className="ca-header-sub">{friend ? 'profili görmek için dokun' : 'artık arkadaş değilsiniz'}</span>
          </span>
        </button>
      </div>
      <div className="chatsapp-messages ca-dm-messages">
        <p className="ca-dm-note">🔒 Yalnızca arkadaşlar yazışabilir · mesajlar 7 gün sonra silinir</p>
        {messages.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || !sameDay(messages[i - 1].createdAtMs, m.createdAtMs)) && <p className="ca-day">{dayLabelOf(m.createdAtMs)}</p>}
            <Bubble m={m} mine={m.uid === user.uid} onMenu={setMenuFor} />
          </Fragment>
        ))}
        {messages.length === 0 && friend && <p className="ca-empty">Henüz mesaj yok. İlk mesajı sen gönder! 👋</p>}
        <div ref={bottomRef} />
      </div>
      {friend ? (
        <div className="chatsapp-input-row">
          <input
            type="text"
            placeholder="Mesaj yaz…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            maxLength={MAX_LEN}
            className="chatsapp-input"
            aria-label={`${name} kişisine mesaj`}
          />
          <button className="chatsapp-send" disabled={busy || !text.trim()} onClick={send}>
            Gönder
          </button>
        </div>
      ) : (
        <p className="ca-empty">Bu oyuncuyla artık arkadaş değilsiniz; sohbet silindi.</p>
      )}
      {error && <p className="chatsapp-error">{error}</p>}
      {menuFor && (
        <ActionMenu
          title={`“${String(menuFor.text || '').slice(0, 60)}”`}
          onClose={() => setMenuFor(null)}
          actions={[
            { key: 'copy', icon: '📋', label: 'Kopyala', onClick: () => copyText(menuFor.text || '') },
            ...(menuFor.uid !== user.uid ? [{ key: 'report', icon: '⚑', label: 'Bildir', subtle: true, onClick: () => setReportOf(menuFor) }] : []),
          ]}
        />
      )}
      {reportOf && chat && (
        <ReportBlockSheet
          targetUid={target.uid}
          targetName={name}
          items={[{ label: 'Mesajı bildir', targetType: 'dmMessage', targetPath: `dmChats/${chat.id}/dmMessages/${reportOf.id}`, preview: reportOf.text }]}
          onClose={() => setReportOf(null)}
        />
      )}
      {showCard && <PlayerCard uid={target.uid} name={name} avatar={avatar} hideMessageButton onClose={() => setShowCard(false)} />}
    </div>
  );
}
