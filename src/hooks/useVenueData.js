import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { midnightDayKey } from '../../functions/businessCatalogData.js';

// v77 Faz 3 — internet kafe kredilerim (HUD halkası; mekân dışında da görünür)
export function useNetCredits() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!user) {
      setRows([]);
      return undefined;
    }
    return onSnapshot(
      query(collection(db, 'netSessions'), where('uid', '==', user.uid)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setRows([])
    );
  }, [user]);
  return rows;
}

// Bir internet kafedeki oturumlar (cihaz doluluğu)
export function useNetOccupancy(houseId, enabled = true) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!houseId || !enabled) {
      setRows([]);
      return undefined;
    }
    return onSnapshot(
      query(collection(db, 'netSessions'), where('houseId', '==', houseId)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setRows([])
    );
  }, [houseId, enabled]);
  return rows;
}

// Bu mekânda bugün ne kadar harcadım (cafe/bar 10.000 sınırı)
export function useBizSpend(houseId, enabled = true) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(0);
  const dayKey = midnightDayKey(Date.now());
  useEffect(() => {
    if (!user || !houseId || !enabled) return undefined;
    return onSnapshot(
      doc(db, 'bizSpend', `${houseId}_${user.uid}_${dayKey}`),
      (s) => setAmount(s.exists() ? Number(s.data().amount || 0) : 0),
      () => setAmount(0)
    );
  }, [user, houseId, enabled, dayKey]);
  return amount;
}

// v100 — bu mekânın ücretli mobilyalarına bugün ne kadar harcadım (10.000 sınırı)
export function useOfficeSpend(houseId, enabled = true) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(0);
  const dayKey = midnightDayKey(Date.now());
  useEffect(() => {
    if (!user || !houseId || !enabled) return undefined;
    return onSnapshot(
      doc(db, 'officeSpend', `${houseId}_${user.uid}_${dayKey}`),
      (s) => setAmount(s.exists() ? Number(s.data().amount || 0) : 0),
      () => setAmount(0)
    );
  }, [user, houseId, enabled, dayKey]);
  return amount;
}

// v100 — ofisin gizli günlük raporu (sadece sahibi okur)
export function useOfficeDaily(houseId, enabled = true) {
  const [days, setDays] = useState({ today: null, yesterday: null });
  const today = midnightDayKey(Date.now());
  const yesterday = midnightDayKey(Date.now() - 24 * 60 * 60 * 1000);
  useEffect(() => {
    if (!houseId || !enabled) return undefined;
    const u1 = onSnapshot(doc(db, 'officeDaily', `${houseId}_${today}`), (s) => setDays((d) => ({ ...d, today: s.exists() ? s.data() : null })), () => {});
    const u2 = onSnapshot(doc(db, 'officeDaily', `${houseId}_${yesterday}`), (s) => setDays((d) => ({ ...d, yesterday: s.exists() ? s.data() : null })), () => {});
    return () => {
      u1();
      u2();
    };
  }, [houseId, enabled, today, yesterday]);
  return days;
}
