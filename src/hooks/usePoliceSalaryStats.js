import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * usePoliceSalaryStats — son 10 günde maaş alan polislerin ortalama günlük
 * kazancını (pay + varsa bonus) canlı dinler. gameStats/policeSalaryAvg
 * dokümanı her gece dailyReset tarafından güncelleniyor.
 */
export function usePoliceSalaryStats() {
  const [avgDailyPayout, setAvgDailyPayout] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'gameStats', 'policeSalaryAvg'),
      (snap) => {
        setAvgDailyPayout(snap.exists() ? snap.data().avgDailyPayout ?? null : null);
        setLoading(false);
      },
      (err) => {
        console.error('usePoliceSalaryStats dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { avgDailyPayout, loading };
}
