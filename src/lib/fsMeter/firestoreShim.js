// =============================================================================
// v165 — GEÇİCİ ÖLÇÜM: 'firebase/firestore' yerine bu dosya yüklenir (vite.config.js alias).
// Her şey AYNEN '@firebase/firestore'dan gelir; yalnızca okuma yapan birkaç fonksiyon,
// örneklenen oturumlarda gelen sonuçları saymak için sarılır. Örneklenmeyen oturumlarda
// doğrudan orijinal fonksiyon çağrılır. Kaldırmak için alias satırını silmek yeter.
// =============================================================================
import {
  onSnapshot as fsOnSnapshot,
  getDocs as fsGetDocs,
  getDoc as fsGetDoc,
  getDocsFromServer as fsGetDocsFromServer,
  getDocFromServer as fsGetDocFromServer,
  disableNetwork as fsDisableNetwork,
  enableNetwork as fsEnableNetwork,
} from '@firebase/firestore';
import { meter } from './runtime.js';
import { wrapListenerArgs } from './meter.js';

export * from '@firebase/firestore';

// onSnapshot(ref, [options], onNext | observer, [onError], [onCompletion])
export function onSnapshot(ref, ...rest) {
  if (!meter) return fsOnSnapshot(ref, ...rest);
  let rec = null;
  try {
    rec = meter.listen(ref);
  } catch {
    rec = null;
  }
  if (!rec) return fsOnSnapshot(ref, ...rest);
  const args = wrapListenerArgs(rest, (snap) => rec.snap(snap));
  let unsub;
  try {
    unsub = fsOnSnapshot(ref, ...args);
  } catch (err) {
    rec.close();
    throw err;
  }
  return () => {
    rec.close();
    return unsub();
  };
}

function wrapGet(orig) {
  return (ref, ...rest) => {
    const p = orig(ref, ...rest);
    if (!meter) return p;
    return p.then((snap) => {
      meter.got(ref, snap);
      return snap;
    });
  };
}
export const getDocs = wrapGet(fsGetDocs);
export const getDoc = wrapGet(fsGetDoc);
export const getDocsFromServer = wrapGet(fsGetDocsFromServer);
export const getDocFromServer = wrapGet(fsGetDocFromServer);

export function disableNetwork(db) {
  if (meter) meter.networkOff();
  return fsDisableNetwork(db);
}
export function enableNetwork(db) {
  if (meter) meter.networkOn();
  return fsEnableNetwork(db);
}
