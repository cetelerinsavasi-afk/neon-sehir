import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

// useFactoryNotifications — Bölüm 16 (Bildirimler): fabrikanın çan
// panelindeki son bildirimleri canlı dinler. `useFutbolTeamNotifications`
// ile BİREBİR aynı desen — `active` false iken (panel kapalıyken) hiç
// dinlemez, sadece açılınca sorgu kurulur. Fabrika doküman ID'si sahibinin
// uid'si olduğu için `factoryId` = sahibin uid'si.
export function useFactoryNotifications(factoryId, active) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!factoryId || !active) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, 'factories', factoryId, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useFactoryNotifications dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [factoryId, active]);

  return { notifications, loading };
}
