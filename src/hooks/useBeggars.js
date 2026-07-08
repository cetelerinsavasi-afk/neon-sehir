import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * useBeggars — bugünkü dilencileri canlı dinler. Koleksiyon günün
 * tarihine göre ayrı tutulduğu için gece yarısı otomatik olarak
 * "sıfırlanmış" olur (yeni gün = yeni, boş koleksiyon).
 */
export function useBeggars() {
  const [beggars, setBeggars] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dateKey = istanbulDateKey();
    const q = query(
      collection(db, 'beggars', dateKey, 'entries'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setBeggars(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useBeggars dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { beggars, loading };
}
