import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// v64 — useHeldItem: oyuncunun elinde tuttuğu mekân ürünü (heldItems/{uid}).
// Sunucu yazar (satın alma / ısmarlama). Süresi (untilMs) dolunca otomatik
// null döner. Başkası ısmarladığında `gift` bir kez dolar (bildirim için).
export function useHeldItem(venue) {
  const { user } = useAuth();
  const [raw, setRaw] = useState(null);
  const [, setTick] = useState(0);
  const [gift, setGift] = useState(null);
  const lastGiftRef = useRef(0);

  useEffect(() => {
    if (!user) {
      setRaw(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'heldItems', user.uid),
      (s) => {
        const d = s.exists() ? s.data() : null;
        setRaw(d);
        if (d?.giftedAtMs && d.giftedAtMs !== lastGiftRef.current) {
          const fresh = lastGiftRef.current !== 0 || Date.now() - d.giftedAtMs < 15_000;
          lastGiftRef.current = d.giftedAtMs;
          if (fresh && d.venue === venue) setGift({ from: d.giftedByName || 'Bir oyuncu', itemId: d.itemId, at: d.giftedAtMs });
        }
      },
      () => setRaw(null)
    );
  }, [user, venue]);

  // süre dolunca yeniden çiz
  const untilMs = Number(raw?.untilMs || 0);
  useEffect(() => {
    const left = untilMs - Date.now();
    if (left <= 0) return undefined;
    const t = setTimeout(() => setTick((n) => n + 1), left + 50);
    return () => clearTimeout(t);
  }, [untilMs]);

  const live = raw && raw.venue === venue && untilMs > Date.now() ? raw : null;
  return { held: live ? { itemId: live.itemId, untilMs } : null, gift, clearGift: () => setGift(null) };
}
