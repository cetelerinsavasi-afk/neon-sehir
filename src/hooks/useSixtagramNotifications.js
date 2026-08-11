import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useSixtagramNotifications — users/{uid}/sixtagramNotifications
 * alt koleksiyonunu canlı dinler ("beğenildim/yorum aldım/yanıt aldım").
 * Tek alanda (createdAtMs) sıralama olduğu için composite index
 * gerekmiyor.
 */
export function useSixtagramNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return undefined;
    }
    const q = query(
      collection(db, 'users', user.uid, 'sixtagramNotifications'),
      orderBy('createdAtMs', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error('useSixtagramNotifications dinleme hatası:', err);
      }
    );
    return unsubscribe;
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount };
}
