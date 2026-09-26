import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMessages } from '../../hooks/useMessages';
import { useGlobalChat } from '../../hooks/useGlobalChat';
import { useBlocks } from '../../contexts/BlocksContext';
import './TopNotificationBanner.css';

// TopNotificationBanner — SMS'e ya da ChatsApp'a yeni bir mesaj
// geldiğinde, hangi ekranda olursan ol, üstten kısa süreliğine bir
// bildirim şeridi kayar. İlk yüklemede MEVCUT mesajlar için tetiklenmez,
// sadece bundan SONRA gelenler için (SMS: oturum başlangıç zamanı,
// ChatsApp: undefined sentinel ile ayırt edilir).
export default function TopNotificationBanner({ onOpenPhone }) {
  const { user } = useAuth();
  const { messages } = useMessages();
  const { messages: chatMessages } = useGlobalChat();
  const { isBlocked } = useBlocks();
  const [toast, setToast] = useState(null);
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <button
      className="top-notif-banner"
      onClick={() => {
        setToast(null);
        onOpenPhone(toast.type);
      }}
    >
      <span className="top-notif-icon">{toast.type === 'sms' ? '✉️' : '💬'}</span>
      <span className="top-notif-text">{toast.text}</span>
    </button>
  );
}
