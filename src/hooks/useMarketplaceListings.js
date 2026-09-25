import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useMarketplaceListings — sold=false olan tüm ilanları dinler. Tek eşitlik
 * filtresi kullanıldığı için composite index gerekmiyor.
 */
export function useMarketplaceListings() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'marketplaceListings'), where('sold', '==', false));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        // v38: kaldırılan yasaklı madde makinesi ilanları gösterilmez
        setListings(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((l) => !(l.itemType === 'machine' && l.machineType === 'yasakliMadde'))
        );
        setLoading(false);
      },
      (err) => {
        console.error('useMarketplaceListings dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { listings, loading };
}
