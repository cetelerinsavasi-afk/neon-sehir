import { PREVIEW_UID } from './backend.js';
export function getAuth() {
  return {};
}
export class GoogleAuthProvider {}
export function onAuthStateChanged(auth, cb) {
  const q = new URLSearchParams(location.search).get('uid'); // önizleme: ikinci oyuncu için
  const t = setTimeout(() => cb({ uid: q || PREVIEW_UID, displayName: q ? `Oyuncu ${q}` : 'Önizleme Admin' }), 0);
  return () => clearTimeout(t);
}
export async function signInWithPopup() {}
export async function signOut() {}
