import { PREVIEW_UID } from './backend.js';
export function getAuth() {
  return {};
}
export class GoogleAuthProvider {}
export function onAuthStateChanged(auth, cb) {
  const t = setTimeout(() => cb({ uid: PREVIEW_UID, displayName: 'Önizleme Admin' }), 0);
  return () => clearTimeout(t);
}
export async function signInWithPopup() {}
export async function signOut() {}
