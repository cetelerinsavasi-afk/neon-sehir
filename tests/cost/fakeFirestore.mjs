// test için sahte @firebase/firestore: çağrıları kaydeder
export const calls = [];
export function onSnapshot(ref, ...args) {
  calls.push({ fn: 'onSnapshot', ref, args });
  const unsub = () => calls.push({ fn: 'unsub', ref });
  unsub.args = args;
  return unsub;
}
export async function getDocs(ref) { calls.push({ fn: 'getDocs', ref }); return { metadata: { fromCache: false }, size: 3, docChanges: () => [1, 2, 3], tag: 'S' }; }
export async function getDoc(ref) { calls.push({ fn: 'getDoc', ref }); return { metadata: { fromCache: false }, exists: () => true, tag: 'D' }; }
export const getDocsFromServer = getDocs;
export const getDocFromServer = getDoc;
export async function disableNetwork() { calls.push({ fn: 'disableNetwork' }); return 'off'; }
export async function enableNetwork() { calls.push({ fn: 'enableNetwork' }); return 'on'; }
export const where = () => {};
