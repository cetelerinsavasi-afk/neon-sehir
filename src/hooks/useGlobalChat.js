import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

const MESSAGE_LIMIT = 100;

/**
 * useGlobalChat — globalChat koleksiyonundaki son mesajları (en yeni son
 * sırada) canlı dinler. Tek alanda orderBy kullanıldığı için composite
 * index gerektirmez.
 */
export function useGlobalChat() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'globalChat'), orderBy('createdAt', 'desc'), limit(MESSAGE_LIMIT));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        setMessages(msgs);
        setLoading(false);
      },
      (err) => {
        console.error('useGlobalChat dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { messages, loading };
}
