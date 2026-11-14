import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMessages } from '../../hooks/useMessages';
import { useGlobalChat } from '../../hooks/useGlobalChat';
import { useBlocks } from '../../contexts/BlocksContext';
import { useSocial } from '../../contexts/SocialContext';
import { isDmOpen, openDmWith } from '../../lib/chatsappNav';
import { notificationsHeld, onNotificationHold } from '../../lib/notifHold'; // v160.7
import './TopNotificationBanner.css';

// TopNotificationBanner — SMS'e ya da ChatsApp'a yeni bir mesaj
// geldiğinde, hangi ekranda olursan ol, üstten kısa süreliğine bir
// bildirim şeridi kayar. İlk yüklemede MEVCUT mesajlar için tetiklenmez,
// sadece bundan SONRA gelenler için (SMS: oturum başlangıç zamanı,
// ChatsApp: undefined sentinel ile ayırt edilir).
export default function TopNotificationBanner({ onOpenPhone }) {
  const { user } = useAuth();
  const { messages } = useMessages({ max: 1 }); // v90.1: şerit sadece en yeni SMS'e bakar
  const { messages: chatMessages } = useGlobalChat({ max: 1 });
  const { isBlocked } = useBlocks();
  const [toast, setRawToast] = useState(null);
  // v160.7: soygun videosu oynarken gelen bildirim bekletilir, video bitince gösterilir
  const [held, setHeld] = useState(notificationsHeld);
  const pendingRef = useRef(null);
  useEffect(() => onNotificationHold(setHeld), []);
  const setToast = (t) => {
    if (t && notificationsHeld()) {
      pendingRef.current = t;
      return;
    }
    setRawToast(t);
  };
  useEffect(() => {
    if (held) {
      // şerit o an açıksa da gizle; video bitince yeniden gösterilir
      setRawToast((cur) => {
        if (cur) pendingRef.current = cur;
        return null;
      });
      return undefined;
    }
    if (!pendingRef.current) return undefined;
    const t = setTimeout(() => {
      if (notificationsHeld()) return;
      setRawToast(pendingRef.current);
      pendingRef.current = null;
    }, 500);
    return () => clearTimeout(t);
  }, [held]);
  const lastSmsIdRef = useRef(null);
  // SMS oturumu: hangi kullanıcı için, hangi andan itibaren gelen SMS'ler
  // "yeni" sayılır. Kullanıcı değişince (sayfa açılışında auth null →
  // uid, ya da misafirken giriş) sıfırlanır.
  const smsSessionRef = useRef({ uid: undefined, sinceMs: 0 });
  const lastChatIdRef = useRef(undefined);

  // DÜZELTME (v43): useMessages listesi EN YENİDEN EN ESKİYE sıralı
  // (orderBy createdAt desc) — en yeni mesaj messages[0]. Eskiden
  // messages[messages.length - 1] (en ESKİ mesaj) okunuyordu: yeni SMS'te
  // şerit hiç çıkmıyor, buna karşılık her açılışta en eski SMS şeritte
  // görünüyordu. Ayrıca auth ilk anda null geldiği için "ilk yükleme"
  // işareti boş listeyle kuruluyor ve mevcut mesajlar yeni sanılıyordu;
  // bu yüzden artık sadece bu oturum başladıktan SONRA oluşturulmuş
  // (createdAt) mesajlar için şerit gösteriliyor.
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (smsSessionRef.current.uid !== uid) {
      smsSessionRef.current = { uid, sinceMs: Date.now() };
      lastSmsIdRef.current = null;
    }
    const latest = messages[0];
    if (!latest || latest.id === lastSmsIdRef.current) return;
    lastSmsIdRef.current = latest.id;
    // SMS'leri sadece sunucu yazar (createdAt = serverTimestamp). Zaman
    // okunamazsa (beklenmez) mesaj yeni kabul edilir.
    const createdMs = latest.createdAt?.toMillis?.();
    if (typeof createdMs === 'number' && createdMs < smsSessionRef.current.sinceMs) return;
    setToast({ type: 'sms', text: latest.text || 'Yeni bir mesajın var.' });
  }, [messages, user]);

  useEffect(() => {
    const latest = chatMessages[chatMessages.length - 1];
    if (lastChatIdRef.current === undefined) {
      lastChatIdRef.current = latest?.id ?? null;
      return;
    }
    if (latest && latest.id !== lastChatIdRef.current) {
      lastChatIdRef.current = latest.id;
      // UGC D2: engellenen/gizlenen mesaj için şerit gösterilmez
      if (latest.uid !== user?.uid && !latest.hidden && !isBlocked(latest.uid)) {
        setToast({ type: 'chat', text: `${latest.displayName}: ${latest.text}` });
      }
    }
  }, [chatMessages, user, isBlocked]);

  // v146 — özel mesajlar (ChatsApp DM) da üstten bildirim olarak gelir. Mevcut
  // dinleyici (SocialContext dmChats) kullanılır; ilk görüntü "yeni" sayılmaz.
  const { chats, ready: socialReady } = useSocial();
  const dmSeenRef = useRef(undefined); // chatId → lastAtMs
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (!socialReady) return; // ilk gerçek liste gelmeden "yeni" sayma
    if (dmSeenRef.current === undefined || dmSeenRef.current.uid !== uid) {
      dmSeenRef.current = { uid, since: Date.now() - 5000, map: new Map((chats || []).map((c) => [c.id, Number(c.lastAtMs || 0)])) };
      return;
    }
    const seen = dmSeenRef.current.map;
    let fresh = null;
    for (const c of chats || []) {
      const at = Number(c.lastAtMs || 0);
      const prev = seen.get(c.id);
      seen.set(c.id, at);
      if ((prev !== undefined && at <= prev) || at <= dmSeenRef.current.since) continue; // oturumdan önceki mesajlar yeni sayılmaz
      if (!uid || c.lastSenderUid === uid || !(c.myUnread > 0) || isBlocked(c.otherUid) || isDmOpen(c.otherUid)) continue;
      if (!fresh || at > Number(fresh.lastAtMs || 0)) fresh = c;
    }
    if (fresh) setToast({ type: 'dm', uid: fresh.otherUid, name: fresh.otherName, avatar: fresh.otherAvatar, text: `${fresh.otherName || 'Arkadaşın'}: ${fresh.lastText || 'Yeni mesaj'}` });
  }, [chats, user, isBlocked, socialReady]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setRawToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <button
      className="top-notif-banner"
      onClick={() => {
        setRawToast(null);
        if (toast.type === 'dm') openDmWith(toast.uid, toast.name, toast.avatar);
        else onOpenPhone(toast.type);
      }}
    >
      <span className="top-notif-icon">{toast.type === 'sms' ? '✉️' : toast.type === 'dm' ? '📩' : '💬'}</span>
      <span className="top-notif-text">{toast.text}</span>
    </button>
  );
}
