import { useEffect, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useUnreadSmsCount } from './useMessages';
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
  const { messages: chatMessages } = useGlobalChat({ max: 1 });
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

  // Sixtagram'da "yeni post var mı" — en son postun zamanını, Sixtagram'ın son
  // açılış zamanıyla karşılaştırır.
  // v90.1 maliyet: sunucu her yeni gönderide stats/sixtagram belgesine
  // { latestMs, latestUid } yazar; burada sadece o TEK belge dinlenir (yeni
  // gönderi olunca 1 okuma). Belge henüz yoksa (eski sunucu) eski yönteme
  // döner: 60 sn'de bir en yeni gönderiyi okur.
  useEffect(() => {
    if (!user) {
      setSixtagramNewPost(false);
      return undefined;
    }
    let alive = true;
    let latest = null; // { ms, uid }
    const apply = () => alive && latest && setSixtagramNewPost(latest.ms > getLastSeenSixtagram() && latest.uid !== user.uid);
    let iv = null;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const snap = await getDocs(query(collection(db, 'sixtagramPosts'), orderBy('createdAtMs', 'desc'), limit(1)));
        if (!alive) return;
        if (snap.empty) {
          setSixtagramNewPost(false);
          return;
        }
        const d = snap.docs[0].data();
        latest = { ms: d.createdAtMs || 0, uid: d.uid };
        apply();
      } catch (err) {
        console.warn('useUnreadNotifications (sixtagram):', err?.code || err);
      }
    };
    const startPoll = () => {
      if (iv) return;
      poll();
      iv = setInterval(poll, 60_000);
    };
    const stopPoll = () => {
      if (iv) clearInterval(iv);
      iv = null;
    };
    const unsub = onSnapshot(
      doc(db, 'stats', 'sixtagram'),
      (s) => {
        if (s.exists()) {
          stopPoll();
          latest = { ms: Number(s.data().latestMs || 0), uid: s.data().latestUid || null };
          apply();
        } else startPoll();
      },
      () => startPoll()
    );
    const onSeen = () => setSixtagramNewPost(false);
    window.addEventListener('neon-sixtagram-seen', onSeen);
    return () => {
      alive = false;
      unsub();
      stopPoll();
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
