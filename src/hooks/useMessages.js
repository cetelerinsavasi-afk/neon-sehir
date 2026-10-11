import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { IS_ANDROID_APP } from '../lib/platform';

// Android (Google Play TWA) içinde Altın Mağazası'nın gönderdiği satın
// alma SMS'leri (functions/index.js > creditGoldStorePackage,
// from: 'Altın Mağazası') arayüzde gösterilmez. Veri SİLİNMEZ ve okundu
// işaretlenmez — sadece bu hook'un döndürdüğü listeden düşülür. Bu hook'u
// kullanan her yer (SMS listesi, okunmamış rozetleri, üst bildirim
// şeridi) böylece tek noktadan temizlenir. Web'de liste birebir aynıdır.
const MESSAGES_LIMIT = 100;
const GOLD_STORE_SENDERS = ['Altın Mağazası', 'Zümrüt Mağazası'];
const isHiddenOnAndroid = (m) => GOLD_STORE_SENDERS.includes(m.from);

/**
 * useMessages — users/{uid}/messages alt koleksiyonunu (en yeni önce)
 * canlı dinler. Tek alanda orderBy kullanıldığı için composite index
 * gerektirmiyor.
 */
// v90.1 maliyet: rozet/şerit gibi her zaman açık yerler 100 SMS'in tamamını okumasın.
//   useMessages({ max: 1 })  → sadece en yeni SMS (üst bildirim şeridi)
//   useUnreadSmsCount()      → sadece OKUNMAMIŞ SMS'ler (rozet sayısı)
//   useMessages()            → SMS ekranı (son 100)
export function useMessages({ max = MESSAGES_LIMIT } = {}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'users', user.uid, 'messages'),
      orderBy('createdAt', 'desc'),
      // v73 — maliyet: eskiden alınan TÜM SMS'ler (hiç silinmiyor) her açılışta okunuyordu
      limit(max)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(IS_ANDROID_APP ? all.filter((m) => !isHiddenOnAndroid(m)) : all);
        setLoading(false);
      },
      (err) => {
        console.error('useMessages dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user, max]);

  return { messages, loading };
}

const UNREAD_MAX = 99;
export function useUnreadSmsCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) {
      setCount(0);
      return undefined;
    }
    // tek alanlı eşitlik sorgusu → otomatik indeks yeterli; okunmamış yoksa ~1 okuma
    const q = query(collection(db, 'users', user.uid, 'messages'), where('read', '==', false), limit(UNREAD_MAX));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data());
        setCount((IS_ANDROID_APP ? list.filter((m) => !isHiddenOnAndroid(m)) : list).length);
      },
      (err) => console.error('useUnreadSmsCount dinleme hatası:', err)
    );
  }, [user]);
  return count;
}
