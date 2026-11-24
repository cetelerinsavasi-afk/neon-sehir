import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { readWithKick } from './useFirestoreResume';

// v196 — Fabrikalar listesi: işçi sistemi kalktı. Sadece son 10 günlük ortalama geliri 0'dan
// BÜYÜK fabrikalar görünür (kullanıcı kuralı), en çok kazanan üstte. TEK sorgu + limit; makine
// alt koleksiyonları okunmaz (eskiden her fabrikanın makineleri 90 sn'de bir okunuyordu).
export const MACHINE_LABELS = { mining: 'Kripto Makinesi', elmas: 'Elmas Makinesi' };
const REFRESH_MS = 120_000;
const LIST_MAX = 40;
let memo = null;

export function useOpenFactories() {
  const [factories, setFactories] = useState(() => memo || []);
  const [loading, setLoading] = useState(!memo);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const q = query(collection(db, 'factories'), where('dailyIncomeAvg10', '>', 0), orderBy('dailyIncomeAvg10', 'desc'), limit(LIST_MAX));
        const snap = await readWithKick(() => getDocs(q));
        if (!alive) return;
        memo = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setFactories(memo);
      } catch (err) {
        console.error('useOpenFactories:', err);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  return { factories, loading, machinesLoading: false };
}
