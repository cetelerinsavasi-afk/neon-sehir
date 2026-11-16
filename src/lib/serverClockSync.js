// v137 — ortak saat senkronu (bkz. serverClock.js).
// v165 — fark öncelikle Realtime Database bağlantısından gelir (bkz. clockSync.js);
// `serverTime` fonksiyonu yalnızca güvenlik ağı. Sunucudaki fonksiyon eski
// istemciler için yerinde duruyor.
// Acil geri dönüş (tek cihaz): localStorage 'neon.clockViaFn' = '1' → eski yol.
import { httpsCallable } from 'firebase/functions';
import { app, functions } from '../firebase';
import { applyServerOffset, syncServerClock } from './serverClock';
import { createClockSync } from './clockSync';

const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
// Tüm oyuncularda eski yola dönmek için: false yap + yayınla (ya da geri-al.bat).
const CLOCK_VIA_RTDB = true;

const call = httpsCallable(functions, 'serverTime');

function flagViaFn() {
  try {
    return window.localStorage.getItem('neon.clockViaFn') === '1';
  } catch {
    return false;
  }
}

async function connectRtdb(cb) {
  const m = await import('firebase/database');
  const db = m.getDatabase(app, DB_URL);
  const offRef = m.ref(db, '.info/serverTimeOffset');
  m.onValue(m.ref(db, '.info/connected'), (s) => {
    if (s.val() !== true) {
      cb(false);
      return;
    }
    // el sıkışmadaki sunucu saati "bağlandı"dan ÖNCE işlenir → bu an güncel fark
    m.onValue(offRef, (o) => cb(true, o.val()), { onlyOnce: true });
  });
}

export function startServerClockSync() {
  const sync = createClockSync({
    useRtdb: CLOCK_VIA_RTDB && Boolean(DB_URL) && !flagViaFn(),
    connectRtdb,
    syncViaFn: (force) => syncServerClock(() => call({}), { force }),
    applyOffset: applyServerOffset,
  });
  // açılıştaki ilk çizimle yarışmasın: tarayıcı boşalınca (en geç 1,5 sn) başlar.
  // O ana kadar son bilinen fark (localStorage) zaten uygulanıyor.
  const go = () => sync.start();
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') window.requestIdleCallback(go, { timeout: 1500 });
  else setTimeout(go, 0);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sync.onVisible();
    });
  }
  if (typeof window !== 'undefined') window.addEventListener('online', () => sync.onOnline());
  return sync;
}
