import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

// useFutbolTeamNotifications — Bölüm 16 (Bildirimler): bir takımın çan
// panelindeki son bildirimleri canlı dinler. `active` false iken (panel
// kapalıyken) hiç dinlemez — sadece açılınca sorgu kurulur.
export function useFutbolTeamNotifications(teamId, active) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId || !active) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(
      collection(db, 'futbolTeams', teamId, 'notifications'),
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
        console.error('useFutbolTeamNotifications dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [teamId, active]);

  return { notifications, loading };
}
