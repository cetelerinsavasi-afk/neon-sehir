import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { midnightDayKey } from '../../functions/businessCatalogData.js';

// v92 — Stadyum › Maçlar: günün maç sohbeti (matchChats/{gün}/msgs).
// Gün İstanbul 00:00'da değişir → yeni günün maçlarıyla yeni sohbet açılır.
export function useMatchChat(max = 80) {
  const [day, setDay] = useState(() => midnightDayKey(Date.now()));
  const [list, setList] = useState([]);
  // gece yarısı geçince yeni güne geç
  useEffect(() => {
    const iv = setInterval(() => {
      const d = midnightDayKey(Date.now());
      setDay((cur) => (cur === d ? cur : d));
    }, 30_000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    setList([]);
    return onSnapshot(
      query(collection(db, 'matchChats', day, 'msgs'), orderBy('createdAtMs', 'desc'), limit(max)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
      () => setList([])
    );
  }, [day, max]);
  return { day, list };
}
