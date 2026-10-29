import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { armStallWatchdog } from './useFirestoreResume';

/**
 * useOpenHeistPlans — belirli bir hedef için status='open' olan
 * heistPlans dokümanlarını canlı dinler (ekip soygun panosu).
 *
 * NOT: Sorguda sadece TEK bir eşitlik filtresi (target) kullanılıyor;
 * 'status' filtresi bilerek client tarafında uygulanıyor. Firestore'da
 * birden fazla alanla filtreleme bazen composite index istiyor ve index
 * yokken sorgu tamamen başarısız oluyor (daha önce orderBy('__name__')
 * ile yaşadığımız sorunun aynısı) — bu riski baştan ortadan kaldırıyoruz.
 */
export function useOpenHeistPlans(target) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'heistPlans'), where('target', '==', target));
    const done = armStallWatchdog(5000); // v136: ilk açılışta ekipler gelmezse bağlantıyı tazele
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.metadata.fromCache) done();
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPlans(all.filter((p) => p.status === 'open'));
        setLoading(false);
      },
      (err) => {
        done();
        console.error('useOpenHeistPlans dinleme hatası:', err);
        setLoading(false);
      }
    );
    return () => {
      done();
      unsubscribe();
    };
  }, [target]);

  return { plans, loading };
}
