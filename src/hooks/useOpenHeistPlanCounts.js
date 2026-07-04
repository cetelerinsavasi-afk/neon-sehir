import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useOpenHeistPlanCounts — status='open' olan tüm ekip soygun planlarını
 * dinler ve hedefe göre sayar ({ banka: 1, fabrika: 2, ... }). Soygun
 * ekranında hedef kartlarının yanında "aktif ekip var" göstergesi için
 * kullanılır.
 */
export function useOpenHeistPlanCounts() {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const q = query(collection(db, 'heistPlans'), where('status', '==', 'open'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = {};
        snap.forEach((doc) => {
          const target = doc.data().target;
          if (target) next[target] = (next[target] || 0) + 1;
        });
        setCounts(next);
      },
      (err) => console.error('useOpenHeistPlanCounts dinleme hatası:', err)
    );
    return unsubscribe;
  }, []);

  return counts;
}
