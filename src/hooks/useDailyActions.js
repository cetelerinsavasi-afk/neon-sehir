import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

function todayKey() {
  // Sunucu saatine göre değil ama en azından tutarlı bir YYYY-MM-DD anahtarı.
  // Gerçek "gün" sınırı Cloud Functions'taki dailyReset job'ı tarafından
  // sunucu tarafında (00:00) belirlenir; bu sadece istemcinin hangi
  // dokümana bakacağını bulması için.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

  useEffect(() => {
    if (!user) {
      setActions({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'dailyActions', `${user.uid}_${todayKey()}`);
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
  }, [user]);

  return { actions, loading };
}
