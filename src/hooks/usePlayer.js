import { useCallback, useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * usePlayer — users/{uid} dokümanını canlı dinler.
 * Faz 2 kapsamında: gold, suspicion, reputation, profession alanları.
 * (isPolice alanı bilerek buraya dahil edilmedi — Bölüm 14 gizlilik
 * kuralı gereği ayrı bir private alt koleksiyonda tutulacak, Faz 5.)
 *
 * v77 — performans: eskiden her usePlayer() çağrısı (40+ bileşen) KENDİ
 * onSnapshot dinleyicisini kuruyor, her altın değişiminde hepsi ayrı ayrı
 * belgeyi kopyalayıp state güncelliyordu. Artık uid başına TEK paylaşılan
 * dinleyici var (son abone ayrılınca kapanır); tüm bileşenler aynı nesneyi
 * görür. usePlayerSelect() ile sadece ihtiyaç duyulan alanlar değişince
 * yeniden çizim yapılabilir (ör. App kökü sadece altın/şüphe/itibar).
 */
const stores = new Map(); // uid → { player, loading, subs:Set, unsub, closeTimer }
const EMPTY = { player: null, loading: false };
const LOADING = { player: null, loading: true };

function storeFor(uid) {
  let st = stores.get(uid);
  if (!st) {
    st = { snap: LOADING, subs: new Set(), unsub: null, closeTimer: null };
    stores.set(uid, st);
  }
  return st;
}
function emit(st) {
  st.subs.forEach((fn) => fn());
}
function open(uid, st) {
  if (st.unsub) return;
  st.unsub = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      st.snap = { player: snap.exists() ? { id: snap.id, ...snap.data() } : null, loading: false };
      emit(st);
    },
    (err) => {
      console.error('usePlayer dinleme hatası:', err);
      st.snap = { player: st.snap.player, loading: false };
      emit(st);
    }
  );
}
function subscribe(uid, fn) {
  const st = storeFor(uid);
  st.subs.add(fn);
  if (st.closeTimer) {
    clearTimeout(st.closeTimer);
    st.closeTimer = null;
  }
  open(uid, st);
  return () => {
    st.subs.delete(fn);
    if (st.subs.size === 0) {
      // ekranlar arası geçişte dinleyici kapanıp yeniden açılmasın diye kısa gecikme
      st.closeTimer = setTimeout(() => {
        if (st.subs.size) return;
        st.unsub?.();
        st.unsub = null;
        stores.delete(uid);
      }, 5000);
    }
  };
}

export function usePlayer() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const sub = useCallback((fn) => (uid ? subscribe(uid, fn) : () => {}), [uid]);
  const get = useCallback(() => (uid ? storeFor(uid).snap : EMPTY), [uid]);
  return useSyncExternalStore(sub, get, get);
}

// Sadece seçilen alan(lar) değişince yeniden çizer. selector ilkel bir değer
// (sayı/metin) ya da sabit bir anahtar döndürmeli (ör. `${p.gold}|${p.suspicion}`).
export function usePlayerSelect(selector) {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const sub = useCallback((fn) => (uid ? subscribe(uid, fn) : () => {}), [uid]);
  const get = useCallback(() => selector(uid ? storeFor(uid).snap.player : null), [uid, selector]);
  return useSyncExternalStore(sub, get, get);
}
