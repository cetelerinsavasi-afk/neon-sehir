// v137 — ortak saat senkronu (bkz. serverClock.js): açılışta + uygulamaya geri dönünce
// (en fazla 10 dakikada bir) sunucu saatini sorar. Tek, çok hafif çağrı.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { syncServerClock } from './serverClock';

const call = httpsCallable(functions, 'serverTime');
const run = (force) => syncServerClock(() => call({}), { force });

export function startServerClockSync() {
  run(true);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') run(false);
    });
  }
  if (typeof window !== 'undefined') window.addEventListener('online', () => run(true));
}
