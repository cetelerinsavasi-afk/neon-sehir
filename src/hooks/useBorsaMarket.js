import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// v176 — Neon Borsa piyasa belgesi (borsa/piyasa, tek belge). SADECE ekran açıkken dinlenir.
// v185: bankaya taşındı; enabled=false iken (ör. hissesi olmayan oyuncunun banka ana sayfası) hiç okunmaz.
let shared = { data: null, ready: false };
export function useBorsaMarket(enabled = true) {
  const [snap, setSnap] = useState(shared);
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      doc(db, 'borsa', 'piyasa'),
      (s) => {
        shared = { data: s.exists() ? s.data() : null, ready: true };
        setSnap(shared);
      },
      () => setSnap({ data: shared.data, ready: true })
    );
  }, [enabled]);
  return snap;
}
