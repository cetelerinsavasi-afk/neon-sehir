import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { futbolDayKey } from '../../functions/businessCatalogData.js';

// v77 Faz 4 — futbolcu profili (güç, mevki, takım)
export function useFootballer(uid) {
  const [fb, setFb] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) {
      setFb(null);
      setLoading(false);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'footballers', uid),
      (s) => {
        setFb(s.exists() ? { id: s.id, ...s.data() } : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [uid]);
  return { fb, loading };
}

// Açık üyeliğim (varsa) + bugünkü (futbol günü) üyeliğim
export function useMyGymMembership() {
  const { user } = useAuth();
  const [active, setActive] = useState(null);
  const [today, setToday] = useState(null);
  const dayKey = futbolDayKey(Date.now());
  useEffect(() => {
    if (!user) return undefined;
    const u1 = onSnapshot(
      query(collection(db, 'gymMemberships'), where('uid', '==', user.uid), where('status', '==', 'active'), limit(5)),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => Number(m.expiresAtMs) > Date.now());
        setActive(list[0] || null);
      },
      () => setActive(null)
    );
    const u2 = onSnapshot(
      doc(db, 'gymMemberships', `${user.uid}_${dayKey}`),
      (s) => setToday(s.exists() ? { id: s.id, ...s.data() } : null),
      () => setToday(null)
    );
    return () => {
      u1();
      u2();
    };
  }, [user, dayKey]);
  return { active, today, dayKey };
}
