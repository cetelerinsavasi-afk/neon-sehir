import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useBlocks } from '../contexts/BlocksContext';

/**
 * useSixtagramNotifications — users/{uid}/sixtagramNotifications
 * alt koleksiyonunu canlı dinler ("beğenildim/yorum aldım/yanıt aldım").
 * Tek alanda (createdAtMs) sıralama olduğu için composite index
 * gerekmiyor.
 */
// v90.1 maliyet: rozet için sadece OKUNMAMIŞLAR dinlenir (unreadOnly); liste ekranı son 50'yi okur.
export function useSixtagramNotifications({ unreadOnly = false } = {}) {
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const [all, setNotifications] = useState([]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return undefined;
    }
    const col = collection(db, 'users', user.uid, 'sixtagramNotifications');
    // v147.1 maliyet: rozet sadece "var mı" (nokta) gösterir → 50 değil 5 okunmamış okunur (engellenenler süzülse de yeter)
    const q = unreadOnly ? query(col, where('read', '==', false), limit(5)) : query(col, orderBy('createdAtMs', 'desc'), limit(50));
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
  }, [user, unreadOnly]);

  // UGC (kapanış): engellenen oyuncudan gelen bildirimler hem listede hem
  // okunmamış sayacında (Sixtagram rozeti) yok sayılır.
  const notifications = all.filter((n) => !isBlocked(n.fromUid));
  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount };
}
