import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMyActiveHeistPlan — kullanıcının hâlihazırda kurduğu ya da katıldığı,
 * hâlâ açık (status='open') bir ekip soygun planı var mı diye bakar.
 * Soygun ekranında "Ekip Soygunlarım" hızlı erişim butonu için kullanılır.
 */
export function useMyActiveHeistPlan() {
  const { user } = useAuth();
  const [planInfo, setPlanInfo] = useState(null);

  useEffect(() => {
    if (!user) {
      setPlanInfo(null);
      return;
    }
    const q = query(collection(db, 'heistPlans'), where('status', '==', 'open'));
    const unsubscribe = onSnapshot(q, async (snap) => {
      const created = snap.docs.find((d) => d.data().creatorUid === user.uid);
      if (created) {
        setPlanInfo({ planId: created.id, target: created.data().target });
        return;
      }
      for (const d of snap.docs) {
        try {
          const pSnap = await getDoc(doc(db, 'heistPlans', d.id, 'participants', user.uid));
          if (pSnap.exists()) {
            setPlanInfo({ planId: d.id, target: d.data().target });
            return;
          }
        } catch {
          // yoksay, sıradaki plana bak
        }
      }
      setPlanInfo(null);
    });
    return unsubscribe;
  }, [user]);

  return planInfo;
}
