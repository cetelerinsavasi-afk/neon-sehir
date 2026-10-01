import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
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
  const { messages } = useMessages();
  const { messages: chatMessages } = useGlobalChat({ max: 1 });
  const { unreadCount: sixtagramUnreadNotifCount } = useSixtagramNotifications();
  const [chatsAppHasNew, setChatsAppHasNew] = useState(false);
  const [sixtagramNewPost, setSixtagramNewPost] = useState(false);

  const smsUnreadCount = messages.filter((m) => !m.read).length;

  const [seenTick, setSeenTick] = useState(0);
  useEffect(() => {
    const on = () => setSeenTick((n) => n + 1);
    window.addEventListener('neon-chatsapp-seen', on);
    return () => window.removeEventListener('neon-chatsapp-seen', on);
  }, []);
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
  }, [chatMessages, user, seenTick]);

  // Sixtagram'da "yeni post var mı" — en son postun createdAtMs'ini,
  // Sixtagram'ın son açılış zamanıyla karşılaştırır (ChatsApp'la aynı
  // desen). Sadece TEK bir dokümanı dinlediği için hafif.
  useEffect(() => {
    if (!user) {
      setSixtagramNewPost(false);
      return undefined;
    }
    // v73 — maliyet: canlı dinleyici yerine 60 sn'de bir tek okuma. En yeni
    // gönderiye gelen HER beğeni/yorum, çevrimiçi TÜM oyunculara okuma
    // yazdırıyordu; rozet için 1 dakikalık gecikme yeterli.
    let alive = true;
    const check = async () => {
      if (document.hidden) return;
      try {
        const snap = await getDocs(query(collection(db, 'sixtagramPosts'), orderBy('createdAtMs', 'desc'), limit(1)));
        if (!alive) return;
        if (snap.empty) {
          setSixtagramNewPost(false);
          return;
        }
        const latest = snap.docs[0].data();
        setSixtagramNewPost((latest.createdAtMs || 0) > getLastSeenSixtagram() && latest.uid !== user.uid);
      } catch (err) {
        console.warn('useUnreadNotifications (sixtagram):', err?.code || err);
      }
    };
    check();
    const iv = setInterval(check, 60_000);
    const onSeen = () => setSixtagramNewPost(false);
    window.addEventListener('neon-sixtagram-seen', onSeen);
    const onVis = () => !document.hidden && check();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('neon-sixtagram-seen', onSeen);
    };
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
