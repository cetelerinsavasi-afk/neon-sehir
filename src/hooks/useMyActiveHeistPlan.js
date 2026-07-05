import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMyActiveHeistPlans — kullanıcının hâlihazırda kurduğu ya da katıldığı,
 * hâlâ açık (status='open') TÜM ekip soygun planlarını döner (birden
 * fazla olabilir — kısıtlama HEDEFE ÖZELDİR: aynı anda farklı hedeflerde
 * ayrı ekiplerde olabilirsin, sadece aynı hedefte ikinci bir ekipte
 * olamazsın). Soygun ekranında "Ekip Soygunlarım" hızlı erişimi ve
 * "bu hedefte zaten bir ekibim var mı" kontrolü için kullanılır.
 */
export function useMyActiveHeistPlans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    if (!user) {
      setPlans([]);
      return;
    }
    const q = query(collection(db, 'heistPlans'), where('status', '==', 'open'));
    const unsubscribe = onSnapshot(q, async (snap) => {
      const mine = [];
      for (const d of snap.docs) {
        if (d.data().creatorUid === user.uid) {
          mine.push({ planId: d.id, target: d.data().target });
          continue;
        }
        try {
          const pSnap = await getDoc(doc(db, 'heistPlans', d.id, 'participants', user.uid));
          if (pSnap.exists()) {
            mine.push({ planId: d.id, target: d.data().target });
          }
        } catch {
          // yoksay, sıradaki plana bak
        }
      }
      setPlans(mine);
    });
    return unsubscribe;
  }, [user]);

  return plans;
}
