import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useHeistPlanParticipants(planId) {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) {
      setParticipants([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = collection(db, 'heistPlans', planId, 'participants');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setParticipants(snap.docs.map((d) => d.data()));
        setLoading(false);
      },
      (err) => {
        console.error('useHeistPlanParticipants dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [planId]);

  return { participants, loading };
}
