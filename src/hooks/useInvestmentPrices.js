import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_PRICES = { diamondPrice: 1000, cryptoPrice: 100000 };

function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * useInvestmentPrices — investments/{bugünün-tarihi} dokümanını canlı dinler.
 * Fiyatlar dailyReset Cloud Function'ı tarafından her gün 00:00'da
 * güncellenir (Bölüm 13). Bugünkü doküman henüz oluşmadıysa (dailyReset
 * hiç çalışmadıysa) varsayılan fiyatlar gösterilir — gerçek alım/satım
 * fiyatı her zaman sunucuda (Cloud Function içinde) otoriter şekilde
 * hesaplanır, burası sadece önizleme.
 *
 * NOT: Daha önce "en son kaydı bul" için orderBy('__name__') sorgusu
 * kullanılıyordu; bu Firestore'da composite index istiyor ve index
 * yokken sorgu tamamen başarısız oluyordu. Bugünün tarih anahtarını
 * doğrudan hesaplayıp o dokümanı dinlemek hem daha basit hem index'e
 * hiç ihtiyaç duymuyor.
 */
export function useInvestmentPrices() {
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'investments', istanbulDateKey());
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
