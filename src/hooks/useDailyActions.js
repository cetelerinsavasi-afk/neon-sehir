import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { istanbulDateKey } from '../lib/istanbulTime';

// v137: gün anahtarı İSTANBUL saatiyle (sunucunun dailyReset'i gibi) — eskiden telefonun
// saat dilimiyle hesaplanıyordu; yurtdışındaki oyuncu 00:00'dan sonra dünkü belgeye bakıyordu.
function todayKey() {
  return istanbulDateKey(new Date(Date.now()));
}
/**
 * useDailyActions — dailyActions/{uid}_{YYYY-MM-DD} dokümanını canlı dinler.
 * Doküman yoksa (o gün hiç aksiyon alınmamışsa) tüm haklar kullanılabilir
 * kabul edilir (boş obje döner).
 */
export function useDailyActions() {
  const { user } = useAuth();
  const [actions, setActions] = useState({});
  const [loading, setLoading] = useState(true);
  // v137: 00:00 (İstanbul) geçince yeni günün belgesine geç (ekran açık kalsa da)
  const [day, setDay] = useState(todayKey);
  useEffect(() => {
    const t = setInterval(() => setDay(todayKey()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) {
      setActions({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'dailyActions', `${user.uid}_${day}`);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setActions(snap.exists() ? snap.data() : {});
        setLoading(false);
      },
      (err) => {
        console.error('useDailyActions dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user, day]);

  return { actions, loading };
}
