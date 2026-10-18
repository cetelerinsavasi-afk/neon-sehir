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
    setLoading(true);
    return onSnapshot(
      doc(db, 'footballers', uid),
      { includeMetadataChanges: true },
      (s) => {
        // v98: önbellekten gelen "kayıt yok" kesin değildir — sunucu cevabını bekle
        if (!s.exists() && s.metadata.fromCache) return;
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
  // v93 — gün 19:00'da değişir; açık kalan uygulamada da yeni güne geçilsin
  const [dayKey, setDayKey] = useState(() => futbolDayKey(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setDayKey((k) => {
      const n = futbolDayKey(Date.now());
      return n === k ? k : n;
    }), 30_000);
    return () => clearInterval(id);
  }, []);
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
    // v93 — belge okuma yerine sorgu: bugünün kaydı henüz yokken tek belge
    // okuması kurallarca reddedilip dinleyiciyi kapatıyordu → antrenman bitse
    // de hatırlatıcı sayfa yenilenene kadar kalıyordu.
    const u2 = onSnapshot(
      query(collection(db, 'gymMemberships'), where('uid', '==', user.uid), where('dayKey', '==', dayKey), limit(3)),
      (s) => {
        const docs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        setToday(docs.find((d) => d.id === `${user.uid}_${dayKey}`) || docs[0] || null);
      },
      () => setToday(null)
    );
    return () => {
      u1();
      u2();
    };
  }, [user, dayKey]);
  return { active, today, dayKey };
}
