import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// useLatestFutbolNewsEvent — belirli bir `type`teki EN SON newsEvents
// dokümanını döner. Bilerek orderBy KULLANMIYOR (yeni bir composite index
// gerektirmesin diye) — bu tipteki olaylar çok seyrek oluştuğu için
// (ör. football_season_end sezonda sadece 1 kez) sadece `type` eşitliğiyle
// çekip en güncelini createdAt'e göre İSTEMCİDE seçmek yeterli ve ucuz.
export function useLatestFutbolNewsEvent(type) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!type) {
      setEvent(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(collection(db, 'newsEvents'), where('type', '==', type));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        let latest = null;
        snap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() };
          const millis = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0;
          if (!latest || millis > latest.__millis) {
            latest = { ...data, __millis: millis };
          }
        });
        setEvent(latest);
        setLoading(false);
      },
      (err) => {
        console.error('useLatestFutbolNewsEvent dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [type]);

  return { event, loading };
}
