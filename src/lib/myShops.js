// =============================================================================
// v166 — "benim dükkânlarım" (galeri / silahçı / depo / gazino) — paylaşılan küçük depo
//   Oyunun Araba Galerisi / Silah Mağazası, alıcının KENDİ dükkânının fiyatını
//   göstermemeli: sunucu (functions/shop.js gameStoreBuy) kendi dükkânını zaten atlar,
//   ekranda kendi fiyatın görünürse "fiyat değişti" hatasıyla hiç alınamıyordu.
//   Liste ek okuma yapmadan useBizReminders'ın zaten açık olan dinleyicisinden
//   beslenir. O dinleyici yoksa (ör. giriş ekranından doğrudan mağaza) bir kez
//   okunur (en fazla 20 belge) ve oturum boyunca saklanır.
// =============================================================================
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';

let state = { uid: null, ids: null }; // ids: Set<houseId> | null (henüz bilinmiyor)
const subs = new Set();
let pending = null;

const emit = () => subs.forEach((f) => f(state));

// useBizReminders her güncellemede çağırır (canlı, ek okuma yok)
export function setMyShopIds(uid, ids) {
  state = { uid, ids: new Set(ids) };
  emit();
}

export function subscribeMyShops(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function myShopIdsFor(uid) {
  return state.uid === uid ? state.ids : null;
}

// Canlı dinleyici yoksa tek seferlik okuma
export function ensureMyShops(uid) {
  if (!uid || myShopIdsFor(uid)) return;
  if (pending?.uid === uid) return;
  const p = getDocs(query(collection(db, 'houses'), where('ownerUid', '==', uid), limit(20)))
    .then((s) => {
      if (myShopIdsFor(uid)) return; // bu arada canlı liste geldi
      setMyShopIds(uid, s.docs.map((d) => d.id));
    })
    .catch(() => {})
    .finally(() => {
      if (pending?.p === p) pending = null;
    });
  pending = { uid, p };
}
