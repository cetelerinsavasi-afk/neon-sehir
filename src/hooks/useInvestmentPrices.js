import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_PRICES = { diamondPrice: 1000, cryptoPrice: 100000 };

/**
 * useInvestmentPrices — investments/{YYYY-MM-DD} koleksiyonundaki en güncel
 * (en son tarihli) dokümanı canlı dinler. Fiyatlar dailyReset Cloud
 * Function'ı tarafından her gün 00:00'da güncellenir (Bölüm 13).
 */
export function useInvestmentPrices() {
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'investments'), orderBy('__name__', 'desc'), limit(1));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          setPrices(snap.docs[0].data());
        }
        setLoading(false);
      },
      (err) => {
        console.error('useInvestmentPrices dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { prices, loading };
}
