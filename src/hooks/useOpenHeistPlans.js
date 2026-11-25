import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { armStallWatchdog } from './useFirestoreResume';

/**
 * useOpenHeistPlans — belirli bir hedef için status='open' olan
 * heistPlans dokümanlarını canlı dinler (ekip soygun panosu).
 *
 * v204 MALİYET: eskiden sadece target ile sorgulanıp 'open' süzgeci cihazda
 * yapılıyordu → o hedefe ait HİÇ SİLİNMEYEN tüm eski planlar (bitti/iptal)
 * her açılışta okunuyordu (oyuncu okumalarının ~%15'i). Artık status=='open'
 * de sorguda. İki EŞİTLİK filtresi Firestore'da tek alanlı indekslerin
 * birleştirilmesiyle çalışır; bileşik indeks gerekmez (orderBy/aralık yok).
 * Cihazdaki 'open' süzgeci güvenlik için duruyor.
 */
export function useOpenHeistPlans(target) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'heistPlans'), where('target', '==', target), where('status', '==', 'open'));
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
