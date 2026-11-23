import { useEffect, useState } from 'react';
import { useUnreadSmsCount } from './useMessages';
import { useBadges } from '../lib/badgeFeed';
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
  // açık rozetler (telefon, harita kısayolu) hemen sönsün
  window.dispatchEvent(new Event('neon-chatsapp-seen'));
}

function getLastSeenSixtagram() {
  return Number(localStorage.getItem(SIXTAGRAM_SEEN_KEY) || 0);
}

/** Sixtagram (Anasayfa) açıldığında çağrılır — "yeni post" rozetini temizler. */
export function markSixtagramSeen() {
  localStorage.setItem(SIXTAGRAM_SEEN_KEY, String(Date.now()));
  window.dispatchEvent(new Event('neon-sixtagram-seen'));
}

/**
 * useUnreadNotifications — SMS'teki okunmamış mesaj sayısını, ChatsApp'ta
 * (son açılıştan sonra) yeni mesaj olup olmadığını VE Sixtagram'da yeni
 * post/bildirim olup olmadığını hesaplar. Telefon ikonunda ve uygulama
 * simgelerinde rozet göstermek için kullanılır.
 */
export function useUnreadNotifications() {
  const { user } = useAuth();
  // v188: son sohbet mesajı / son gönderi RTDB'den (badge) — Firestore okuması yok
  const badges = useBadges(Boolean(user));
  const { unreadCount: sixtagramUnreadNotifCount } = useSixtagramNotifications({ unreadOnly: true });
  const [chatsAppHasNew, setChatsAppHasNew] = useState(false);
  const [sixtagramNewPost, setSixtagramNewPost] = useState(false);

  const smsUnreadCount = useUnreadSmsCount();

  const [seenTick, setSeenTick] = useState(0);
  useEffect(() => {
    const on = () => setSeenTick((n) => n + 1);
    window.addEventListener('neon-chatsapp-seen', on);
    return () => window.removeEventListener('neon-chatsapp-seen', on);
  }, []);
  const lastChat = badges.chat;
  useEffect(() => {
    if (!user || !lastChat) {
      setChatsAppHasNew(false);
      return;
    }
    // Kendi gönderdiğin mesajlar "yeni bildirim" saydırmasın.
    setChatsAppHasNew(lastChat.at > getLastSeenChatsApp() && lastChat.uid !== user.uid);
  }, [lastChat, user, seenTick]);

  // Sixtagram'da "yeni post var mı" — en son postun zamanını, Sixtagram'ın son açılış
  // zamanıyla karşılaştırır. v188: sunucunun RTDB'ye yazdığı badge/six (eskiden Firestore
  // stats/sixtagram dinleyicisi + belge yoksa 60 sn'de bir sorgu).
  const lastSix = badges.six;
  const [sixSeenTick, setSixSeenTick] = useState(0);
  useEffect(() => {
    const on = () => setSixSeenTick((n) => n + 1);
    window.addEventListener('neon-sixtagram-seen', on);
    return () => window.removeEventListener('neon-sixtagram-seen', on);
  }, []);
  useEffect(() => {
    if (!user || !lastSix) {
      setSixtagramNewPost(false);
      return;
    }
    setSixtagramNewPost(lastSix.at > getLastSeenSixtagram() && lastSix.uid !== user.uid);
  }, [lastSix, user, sixSeenTick]);

  const sixtagramHasNew = sixtagramNewPost || sixtagramUnreadNotifCount > 0;

  return {
    smsUnreadCount,
    chatsAppHasNew,
    sixtagramHasNew,
    sixtagramUnreadNotifCount,
    totalBadge: smsUnreadCount + (chatsAppHasNew ? 1 : 0) + (sixtagramHasNew ? 1 : 0),
  };
}
