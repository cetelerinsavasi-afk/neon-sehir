import { PREVIEW_UID } from './backend.js';
export function getAuth() {
  return {};
}
export class GoogleAuthProvider {}
export function onAuthStateChanged(auth, cb) {
  const q = new URLSearchParams(location.search).get('uid'); // önizleme: ikinci oyuncu için
  // v192: ?guest=1 → giriş yapmamış (misafir) oyuncu
  const guest = new URLSearchParams(location.search).get('guest') === '1';
  const t = setTimeout(() => cb(guest ? null : { uid: q || PREVIEW_UID, displayName: q ? `Oyuncu ${q}` : 'Önizleme Admin' }), 0);
  return () => clearTimeout(t);
}
export async function signInWithPopup() {}
export async function signOut() {}
// v148 — Android WebView yerel Google girişi (önizlemede etkisiz)
export async function signInWithCredential() {}
