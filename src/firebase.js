import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// v138 MALİYET — Firestore YEREL ÖNBELLEĞİ (cihazda, IndexedDB). Bir ekrana (çete listesi,
// sohbet, ev listesi…) dönüldüğünde sorgu sıfırdan okunmaz: 30 dk içinde yeniden açılan
// sorgularda sadece DEĞİŞEN belgeler faturalanır, ekranlar da önbellekten anında açılır.
// IndexedDB yoksa (gizli sekme vb.) SDK kendiliğinden eski (bellek içi) moda döner.
// Acil kapatma: localStorage 'neon.noFsCache' = '1'.
function createDb() {
  let off = false;
  try {
    off = window.localStorage.getItem('neon.noFsCache') === '1';
  } catch {
    /* depolama kapalı */
  }
  if (!off) {
    try {
      return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch (err) {
      console.warn('Firestore önbelleği açılamadı, bellek içi devam:', err?.code || err);
    }
  }
  return getFirestore(app);
}
export const db = createDb();
export const functions = getFunctions(
  app,
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'europe-west1'
); // DİKKAT: Cloud Functions'ı deploy ederken kullandığın bölgeyle birebir aynı olmalı
export const googleProvider = new GoogleAuthProvider();
