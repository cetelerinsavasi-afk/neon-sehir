import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_PRICES = { diamondPrice: 1000, cryptoPrice: 100000 };

/**
 * useInvestmentPrices — investments/current dokümanını canlı dinler.
 * Fiyatlar artık günde 1 kez değil, hourlyInvestmentUpdate Cloud Function'ı
 * tarafından SAATTE 1 kez güncelleniyor. Gerçek alım/satım fiyatı her
 * zaman sunucuda otoriter şekilde hesaplanır, burası sadece önizleme.
 */
export function useInvestmentPrices() {
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'investments', 'current');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setPrices(snap.exists() ? snap.data() : DEFAULT_PRICES);
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
