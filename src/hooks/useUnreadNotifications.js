import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useMessages } from './useMessages';
import { useGlobalChat } from './useGlobalChat';
import { useSixtagramNotifications } from './useSixtagramNotifications';
import { useAuth } from '../contexts/AuthContext';

const CHATSAPP_SEEN_KEY = 'neon-sehir-chatsapp-last-seen';
const SIXTAGRAM_SEEN_KEY = 'neon-sehir-sixtagram-last-seen';

function getLastSeenChatsApp() {
  return Number(localStorage.getItem(CHATSAPP_SEEN_KEY) || 0);
}

/** ChatsApp ekranı açıldığında çağrılır — "yeni mesaj" rozetini temizler. */
export function markChatsAppSeen() {
  localStorage.setItem(CHATSAPP_SEEN_KEY, String(Date.now()));
}

function getLastSeenSixtagram() {
  return Number(localStorage.getItem(SIXTAGRAM_SEEN_KEY) || 0);
}

/** Sixtagram (Anasayfa) açıldığında çağrılır — "yeni post" rozetini temizler. */
export function markSixtagramSeen() {
  localStorage.setItem(SIXTAGRAM_SEEN_KEY, String(Date.now()));
}

/**
 * useUnreadNotifications — SMS'teki okunmamış mesaj sayısını, ChatsApp'ta
 * (son açılıştan sonra) yeni mesaj olup olmadığını VE Sixtagram'da yeni
 * post/bildirim olup olmadığını hesaplar. Telefon ikonunda ve uygulama
 * simgelerinde rozet göstermek için kullanılır.
 */
export function useUnreadNotifications() {
  const { user } = useAuth();
  const { messages } = useMessages();
  const { messages: chatMessages } = useGlobalChat();
  const { unreadCount: sixtagramUnreadNotifCount } = useSixtagramNotifications();
  const [chatsAppHasNew, setChatsAppHasNew] = useState(false);
  const [sixtagramNewPost, setSixtagramNewPost] = useState(false);

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

  // Sixtagram'da "yeni post var mı" — en son postun createdAtMs'ini,
  // Sixtagram'ın son açılış zamanıyla karşılaştırır (ChatsApp'la aynı
  // desen). Sadece TEK bir dokümanı dinlediği için hafif.
  useEffect(() => {
    if (!user) {
      setSixtagramNewPost(false);
      return undefined;
    }
    const q = query(collection(db, 'sixtagramPosts'), orderBy('createdAtMs', 'desc'), limit(1));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setSixtagramNewPost(false);
          return;
        }
        const latest = snap.docs[0].data();
        const lastSeen = getLastSeenSixtagram();
        setSixtagramNewPost((latest.createdAtMs || 0) > lastSeen && latest.uid !== user.uid);
      },
      (err) => {
        console.error('useUnreadNotifications (sixtagram) dinleme hatası:', err);
      }
    );
    return unsubscribe;
  }, [user]);

  const sixtagramHasNew = sixtagramNewPost || sixtagramUnreadNotifCount > 0;

  return {
    smsUnreadCount,
    chatsAppHasNew,
    sixtagramHasNew,
    sixtagramUnreadNotifCount,
    totalBadge: smsUnreadCount + (chatsAppHasNew ? 1 : 0) + (sixtagramHasNew ? 1 : 0),
  };
}
