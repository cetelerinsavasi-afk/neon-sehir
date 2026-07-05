import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMessages } from '../../hooks/useMessages';
import { useGlobalChat } from '../../hooks/useGlobalChat';
import './TopNotificationBanner.css';

// TopNotificationBanner — SMS'e ya da ChatsApp'a yeni bir mesaj
// geldiğinde, hangi ekranda olursan ol, üstten kısa süreliğine bir
// bildirim şeridi kayar. İlk yüklemede MEVCUT mesajlar için tetiklenmez,
// sadece bundan SONRA gelenler için (undefined sentinel ile ayırt edilir).
export default function TopNotificationBanner({ onOpenPhone }) {
  const { user } = useAuth();
  const { messages } = useMessages();
  const { messages: chatMessages } = useGlobalChat();
  const [toast, setToast] = useState(null);
  const lastSmsIdRef = useRef(undefined);
  const lastChatIdRef = useRef(undefined);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (lastSmsIdRef.current === undefined) {
      lastSmsIdRef.current = latest?.id ?? null;
      return;
    }
    if (latest && latest.id !== lastSmsIdRef.current) {
      lastSmsIdRef.current = latest.id;
      setToast({ type: 'sms', text: latest.text || 'Yeni bir mesajın var.' });
    }
  }, [messages]);

  useEffect(() => {
    const latest = chatMessages[chatMessages.length - 1];
    if (lastChatIdRef.current === undefined) {
      lastChatIdRef.current = latest?.id ?? null;
      return;
    }
    if (latest && latest.id !== lastChatIdRef.current) {
      lastChatIdRef.current = latest.id;
      if (latest.uid !== user?.uid) {
        setToast({ type: 'chat', text: `${latest.displayName}: ${latest.text}` });
      }
    }
  }, [chatMessages, user]);

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
