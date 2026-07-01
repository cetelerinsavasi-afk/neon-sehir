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
        setListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
