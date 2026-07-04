import { useEffect, useState } from 'react';
import { useMessages } from './useMessages';
import { useGlobalChat } from './useGlobalChat';
import { useAuth } from '../contexts/AuthContext';

const CHATSAPP_SEEN_KEY = 'neon-sehir-chatsapp-last-seen';

function getLastSeenChatsApp() {
  return Number(localStorage.getItem(CHATSAPP_SEEN_KEY) || 0);
}

/** ChatsApp ekranı açıldığında çağrılır — "yeni mesaj" rozetini temizler. */
export function markChatsAppSeen() {
  localStorage.setItem(CHATSAPP_SEEN_KEY, String(Date.now()));
}

/**
 * useUnreadNotifications — SMS'teki okunmamış mesaj sayısını ve
 * ChatsApp'ta (son açılıştan sonra) yeni mesaj olup olmadığını hesaplar.
 * Telefon ikonunda ve uygulama simgelerinde rozet göstermek için kullanılır.
 */
export function useUnreadNotifications() {
  const { user } = useAuth();
  const { messages } = useMessages();
  const { messages: chatMessages } = useGlobalChat();
  const [chatsAppHasNew, setChatsAppHasNew] = useState(false);

  const smsUnreadCount = messages.filter((m) => !m.read).length;

  useEffect(() => {
    if (!user || chatMessages.length === 0) {
      setChatsAppHasNew(false);
      return;
    }
    const lastSeen = getLastSeenChatsApp();
    const latest = chatMessages[chatMessages.length - 1];
    const latestMs = latest?.createdAt?.toMillis?.() ?? 0;
    // Kendi gönderdiğin mesajlar "yeni bildirim" saydırmasın.
    setChatsAppHasNew(latestMs > lastSeen && latest?.uid !== user.uid);
  }, [chatMessages, user]);

  return {
    smsUnreadCount,
    chatsAppHasNew,
    totalBadge: smsUnreadCount + (chatsAppHasNew ? 1 : 0),
  };
}
