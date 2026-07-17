import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useEmployerFactory — bir işçinin çalıştığı fabrikayı (patron adı, maaş)
 * canlı dinler. WorkerView'da "Üretim Yap" panelinin üstünde maaş miktarı
 * ve işyeri adını göstermek için kullanılır.
 */
export function useEmployerFactory(factoryId) {
  const [factory, setFactory] = useState(null);
  const [loading, setLoading] = useState(!!factoryId);

  useEffect(() => {
    if (!factoryId) {
      setFactory(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'factories', factoryId),
      (snap) => {
        setFactory(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.error('useEmployerFactory dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [factoryId]);

  return { factory, loading };
}
