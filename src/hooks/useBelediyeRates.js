// v127 — Belediyenin belirlediği güncel vergi / maaş oranları (istemci).
// Tek paylaşımlı dinleyici: belediye/rates (herkes okur; günde ~1 değişir).
// Değer, sunucuyla AYNI çözümleme: resolveRates(belediye/rates, İstanbul bugünü)
// (functions/belediyeRates.js). Gün 00:00'da kendiliğinden yenilenir.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { resolveRates, rateDayKey, DEFAULT_RATES } from '../../functions/belediyeRates.js';

let ratesDoc = null; // son anlık görüntü (null = henüz gelmedi)
let unsub = null;
let refs = 0;
let stopTimer = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

function subscribe(cb) {
  subs.add(cb);
  refs += 1;
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (!unsub) {
    unsub = onSnapshot(
      doc(db, 'belediye', 'rates'),
      (snap) => {
        ratesDoc = snap.exists() ? snap.data() : {};
        emit();
      },
      (err) => console.warn('belediye/rates', err?.code || err)
    );
  }
  return () => {
    subs.delete(cb);
    refs -= 1;
    // ekranlar arası geçişte dinleyiciyi hemen kapatma (tekrar okuma olmasın)
    if (refs <= 0 && !stopTimer) {
      stopTimer = setTimeout(() => {
        stopTimer = null;
        if (refs <= 0 && unsub) {
          unsub();
          unsub = null;
        }
      }, 60_000);
    }
  };
}
const getSnap = () => ratesDoc;

// Gün değişince yeniden hesap (00:00)
function useDayKey() {
  const [day, setDay] = useState(() => rateDayKey());
  useEffect(() => {
    const now = Date.now();
    const next = Date.parse(`${rateDayKey(now + 86_400_000)}T00:00:00+03:00`);
    const t = setTimeout(() => setDay(rateDayKey()), Math.max(1000, next - now + 1500));
    return () => clearTimeout(t);
  }, [day]);
  return day;
}

/** Bugün geçerli tam oran seti. Belge gelene kadar varsayılanlar. */
export function useBelediyeRates() {
  const d = useSyncExternalStore(subscribe, getSnap);
  const day = useDayKey();
  return useMemo(() => (d ? resolveRates(d, day) : DEFAULT_RATES), [d, day]);
}

/** Ham belge + gün (Belediye ekranı: dünkü set ile karşılaştırma vb.) */
export function useBelediyeRatesDoc() {
  const d = useSyncExternalStore(subscribe, getSnap);
  const day = useDayKey();
  const rates = useMemo(() => (d ? resolveRates(d, day) : DEFAULT_RATES), [d, day]);
  return { doc: d, day, rates, loaded: d != null };
}
