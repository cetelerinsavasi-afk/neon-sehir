import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { IS_ANDROID_APP } from '../lib/platform';

// Android (Google Play TWA) içinde Altın Mağazası'nın gönderdiği satın
// alma SMS'leri (functions/index.js > creditGoldStorePackage,
// from: 'Altın Mağazası') arayüzde gösterilmez. Veri SİLİNMEZ ve okundu
// işaretlenmez — sadece bu hook'un döndürdüğü listeden düşülür. Bu hook'u
// kullanan her yer (SMS listesi, okunmamış rozetleri, üst bildirim
// şeridi) böylece tek noktadan temizlenir. Web'de liste birebir aynıdır.
const GOLD_STORE_SENDER = 'Altın Mağazası';
const isHiddenOnAndroid = (m) => m.from === GOLD_STORE_SENDER;

/**
 * useMessages — users/{uid}/messages alt koleksiyonunu (en yeni önce)
 * canlı dinler. Tek alanda orderBy kullanıldığı için composite index
 * gerektirmiyor.
 */
export function useMessages() {
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
      orderBy('createdAt', 'desc')
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
  }, [user]);

  return { messages, loading };
}
