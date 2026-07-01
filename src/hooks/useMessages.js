import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

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
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
