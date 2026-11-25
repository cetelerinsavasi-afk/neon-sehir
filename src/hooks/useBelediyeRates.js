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

// v202 — GÜNLÜK ÖNBELLEK (Firestore okuması artmasın): belediye/rates gün içinde değişmez (gece devri
// 00:00'da yazılır). Bugün (00:20'den sonra) okunmuş kopya cihazda varsa dinleyici hiç açılmaz; gün
// değişince ya da kopya yoksa eskisi gibi bir kez okunur. Sunucu her işlemde oranı kendisi hesaplar —
// kopya bayatsa en kötü ihtimalle "fiyat değişti" uyarısı çıkar, yanlış tahsilat olmaz.
const CACHE_KEY = 'neon-rates-day-v1';
const SAFE_AFTER_MS = 20 * 60_000; // gece devrinin yazılması için pay
let cachedDay = null; // ratesDoc önbellekten geldiyse onun günü
const dayStartMs = (day) => Date.parse(`${day}T00:00:00+03:00`);
function readCache(day) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.day === day && Number(c.at) >= dayStartMs(day) + SAFE_AFTER_MS && c.doc && typeof c.doc === 'object') return c.doc;
  } catch {
    /* depolama kapalı */
  }
  return null;
}
function writeCache(d) {
  try {
    const day = rateDayKey();
    if (Date.now() >= dayStartMs(day) + SAFE_AFTER_MS) localStorage.setItem(CACHE_KEY, JSON.stringify({ day, at: Date.now(), doc: d }));
  } catch {
    /* depolama dolu / kapalı */
  }
}
function listen() {
  if (unsub) return;
  cachedDay = null;
  unsub = onSnapshot(
    doc(db, 'belediye', 'rates'),
    (snap) => {
      ratesDoc = snap.exists() ? snap.data() : {};
      writeCache(ratesDoc);
      emit();
    },
    (err) => console.warn('belediye/rates', err?.code || err)
  );
}
// gün değiştiyse ve elimizdeki önbellekten gelen kopyaysa yeniden oku
function ensureFresh(day) {
  if (unsub || !refs) return;
  if (cachedDay && cachedDay === day) return;
  const c = readCache(day);
  if (c) {
    ratesDoc = c;
    cachedDay = day;
    emit();
    return;
  }
  listen();
}

function subscribe(cb) {
  subs.add(cb);
  refs += 1;
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (!unsub) {
    const day = rateDayKey();
    const c = cachedDay === day ? ratesDoc : readCache(day);
    if (c) {
      ratesDoc = c;
      cachedDay = day;
    } else listen();
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
  useEffect(() => ensureFresh(day), [day]); // v202
  return useMemo(() => (d ? resolveRates(d, day) : DEFAULT_RATES), [d, day]);
}

/** Ham belge + gün (Belediye ekranı: dünkü set ile karşılaştırma vb.) */
export function useBelediyeRatesDoc() {
  const d = useSyncExternalStore(subscribe, getSnap);
  const day = useDayKey();
  useEffect(() => ensureFresh(day), [day]); // v202
  const rates = useMemo(() => (d ? resolveRates(d, day) : DEFAULT_RATES), [d, day]);
  return { doc: d, day, rates, loaded: d != null };
}
