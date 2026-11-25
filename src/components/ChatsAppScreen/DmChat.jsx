import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, startAfter } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial, MESSAGE_TTL_MS } from '../../contexts/SocialContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { socialAction } from '../../services/gameActions';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import { setOpenDm } from '../../lib/chatsappNav';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PlayerCard from '../PlayerCard/PlayerCard';
import ActionMenu from '../ActionMenu/ActionMenu';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import { copyText, useLongPress } from '../ActionMenu/actionMenuUtils';
import { clockOf, dayLabelOf, sameDay } from './chatsappTime';
import { CHAT_REACTIONS, ChatInput, ReactionChips, ReplyBar, ReplyQuote, replyDraftOf } from './chatExtras';

// v60 — Arkadaşla birebir sohbet (WhatsApp benzeri). Mesajlar sunucudan
// geçer (socialAction → sendDm); 7 günden eski mesajlar gösterilmez ve silinir.
const MAX_LEN = 500;

// v204 MALİYET + HIZ: sohbet son 20 mesajla açılır (eskiden 150). Yukarı kaydırınca / "Önceki
// mesajlar"a basınca 30'ar eski mesaj TEK SEFERLİK okunur ve aynı oturumda cihazda kalır.
const DM_FIRST = 20;
const DM_OLDER = 30;
const dmOlder = new Map(); // chatId → { msgs: Map(id → mesaj), done: bool }

function useDmMessages(chatId, enabled) {
  const [live, setLive] = useState([]);
  const [olderRev, setOlderRev] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  useEffect(() => {
    if (!chatId || !enabled) {
      setLive([]);
      return undefined;
    }
    const q = query(collection(db, 'dmChats', chatId, 'dmMessages'), orderBy('createdAtMs', 'desc'), limit(DM_FIRST));
    return onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        // canlı pencereden düşen (yeni mesaj gelince) mesajlar ekranda kalsın
        setLive((prev) => {
          const keep = new Set(msgs.map((m) => m.id));
          const box = dmOlder.get(chatId) || { msgs: new Map(), done: false };
          let moved = false;
          for (const m of prev) {
            if (!keep.has(m.id) && m.createdAtMs && !box.msgs.has(m.id)) {
              box.msgs.set(m.id, m);
              moved = true;
            }
          }
          if (moved) {
            dmOlder.set(chatId, box);
            setOlderRev((r) => r + 1);
          }
          return msgs;
        });
      },
      (err) => {
        // sohbet silindiyse (arkadaşlıktan çıkarma) izin hatası beklenir
        console.warn('dmMessages dinleme:', err?.code || err);
        setLive([]);
      }
    );
  }, [chatId, enabled]);

  const box = chatId ? dmOlder.get(chatId) : null;
  const messages = useMemo(() => {
    const byId = new Map();
    if (box) for (const m of box.msgs.values()) byId.set(m.id, m);
    for (const m of live) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => (a.createdAtMs || Number.MAX_SAFE_INTEGER) - (b.createdAtMs || Number.MAX_SAFE_INTEGER));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, olderRev, chatId]);
  const hasMore = Boolean(chatId) && !(box?.done) && live.length >= DM_FIRST;

  const loadOlder = async () => {
    if (!chatId || loadingOlder || !hasMore) return 0;
    const oldest = messages.find((m) => m.createdAtMs);
    if (!oldest) return 0;
    setLoadingOlder(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'dmChats', chatId, 'dmMessages'), orderBy('createdAtMs', 'desc'), startAfter(oldest.createdAtMs), limit(DM_OLDER))
      );
      const b = dmOlder.get(chatId) || { msgs: new Map(), done: false };
      snap.docs.forEach((d) => b.msgs.set(d.id, { id: d.id, ...d.data() }));
      if (snap.size < DM_OLDER) b.done = true;
      dmOlder.set(chatId, b);
      setOlderRev((r) => r + 1);
      return snap.size;
    } catch (err) {
      console.warn('dmMessages eski mesajlar:', err?.code || err);
      return 0;
    } finally {
      setLoadingOlder(false);
    }
  };
  return { messages: chatId && enabled ? messages : [], loadOlder, loadingOlder, hasMore: Boolean(enabled) && hasMore };
}

function Bubble({ m, mine, myUid, onMenu, onReact }) {
  const press = useLongPress(() => onMenu(m));
  return (
    <div id={`ca-msg-${m.id}`} className={`chatsapp-row${mine ? ' mine' : ''}`}>
      <div className={`chatsapp-bubble ca-dm-bubble${mine ? ' mine' : ''}`} {...press}>
        <ReplyQuote replyTo={m.replyTo} myUid={myUid} />
        <span className="chatsapp-text">{m.text}</span>
        <ReactionChips reactions={m.reactions} myUid={myUid} onReact={onReact ? (e) => onReact(m, e) : () => {}} />
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
  const { messages: raw, loadOlder, loadingOlder, hasMore } = useDmMessages(chat?.id, Boolean(chat && friend));
  const cutoff = Date.now() - MESSAGE_TTL_MS;
  const messages = raw.filter((m) => m.createdAtMs > cutoff && !isHiddenForMe(m, m.uid, isBlocked));
  const [error, setError] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [reportOf, setReportOf] = useState(null);
  const [showCard, setShowCard] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // v72 — yanıtlanan mesaj
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const keepPos = useRef(null);
  const lastIdRef = useRef(null);
  const myUnread = chat?.myUnread || 0;

  const react = async (m, emoji) => {
    setError(null);
    try {
      await socialAction('reactDm', { targetUid: target.uid, msgId: m.id, emoji });
    } catch (err) {
      setError(err.message || 'Tepki verilemedi.');
    }
  };

  // v204: sadece EN YENİ mesaj değişince en alta kay; eski mesajlar eklenince yer sabit kalsın
  const lastId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (!lastId || lastId === lastIdRef.current) return;
    const first = lastIdRef.current === null;
    lastIdRef.current = lastId;
    bottomRef.current?.scrollIntoView({ behavior: first ? 'auto' : 'smooth' });
  }, [lastId]);
  useLayoutEffect(() => {
    const el = listRef.current;
    const k = keepPos.current;
    if (!el || !k) return;
    el.scrollTop = el.scrollHeight - k.height + k.top;
    keepPos.current = null;
  }, [messages.length]);
  const showOlder = async () => {
    const el = listRef.current;
    if (!hasMore || loadingOlder) return;
    if (el) keepPos.current = { height: el.scrollHeight, top: el.scrollTop };
    const n = await loadOlder();
    if (!n) keepPos.current = null;
  };

  // v146: açık sohbet (üst bildirim şeridi bu kişi için çıkmasın)
  useEffect(() => {
    setOpenDm(target.uid);
    return () => setOpenDm(null);
  }, [target.uid]);

  // Sohbet açıkken gelen mesajlar okundu sayılır
  useEffect(() => {
    if (myUnread > 0 && friend) socialAction('markDmRead', { targetUid: target.uid }).catch(() => {});
  }, [myUnread, friend, target.uid]);

  const send = async (t) => {
    setError(null);
    try {
      await socialAction('sendDm', { targetUid: target.uid, text: t, ...(replyTo ? { replyToId: replyTo.id } : {}) });
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
        <button className="ca-header-person" onClick={() => setShowCard(true)} aria-label={`${name} profilini gör`}>
          <AvatarSvg avatar={avatar} size={34} rounded />
          <span className="ca-header-text">
            <span className="ca-header-name">{name}</span>
            <span className="ca-header-sub">{friend ? 'profili görmek için dokun' : 'artık arkadaş değilsiniz'}</span>
          </span>
        </button>
      </div>
      <div
        className="chatsapp-messages ca-dm-messages"
        ref={listRef}
        onScroll={(e) => {
          if (e.currentTarget.scrollTop < 40 && lastIdRef.current) showOlder();
        }}
      >
        <p className="ca-dm-note">🔒 Yalnızca arkadaşlar yazışabilir · mesajlar 7 gün sonra silinir</p>
        {hasMore && messages.length > 0 && (
          <button type="button" className="ca-load-older" onClick={showOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Yükleniyor…' : '↑ Önceki mesajlar'}
          </button>
        )}
        {messages.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || !sameDay(messages[i - 1].createdAtMs, m.createdAtMs)) && <p className="ca-day">{dayLabelOf(m.createdAtMs)}</p>}
            <Bubble m={m} mine={m.uid === user.uid} myUid={user.uid} onMenu={setMenuFor} onReact={friend ? react : null} />
          </Fragment>
        ))}
        {messages.length === 0 && friend && <p className="ca-empty">Henüz mesaj yok. İlk mesajı sen gönder! 👋</p>}
        <div ref={bottomRef} />
      </div>
      {friend && <ReplyBar replyTo={replyTo} myUid={user.uid} onCancel={() => setReplyTo(null)} />}
      {friend ? (
        <ChatInput onSend={send} maxLength={MAX_LEN} inputRef={inputRef} ariaLabel={`${name} kişisine mesaj`} />
      ) : (
        <p className="ca-empty">Bu oyuncuyla artık arkadaş değilsiniz; sohbet silindi.</p>
      )}
      {error && <p className="chatsapp-error">{error}</p>}
      {menuFor && (
        <ActionMenu
          title={`“${String(menuFor.text || '').slice(0, 60)}”`}
          onClose={() => setMenuFor(null)}
          emojis={friend ? CHAT_REACTIONS : null}
          selectedEmoji={menuFor.reactions?.[user.uid]}
          onEmoji={(e) => react(menuFor, e)}
          actions={[
            ...(friend
              ? [
                  {
                    key: 'reply',
                    icon: '↩️',
                    label: 'Yanıtla',
                    onClick: () => {
                      setReplyTo(replyDraftOf(menuFor, menuFor.uid === user.uid ? 'Sen' : name));
                      setTimeout(() => inputRef.current?.focus(), 50);
                    },
                  },
                ]
              : []),
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
