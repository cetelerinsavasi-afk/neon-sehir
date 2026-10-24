import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { factoryDisplayName } from '../components/FactoryScreen/factoryHelpers';

// =============================================================================
// v125 — Mağaza'da satıcı adı yerine FABRİKA adı (yoksa silahçı / modifiye
// işletmesinin adı). Satıcı başına tek seferlik okuma (fabrika belgesi; yoksa
// evleri), oturum boyunca bellekte saklanır — canlı dinleyici yok.
// =============================================================================
const SHOP_BIZ = ['silahci', 'modifiye'];
const cache = new Map(); // uid → ad (null = bulunamadı)
const pending = new Map(); // uid → Promise

async function loadShopName(uid) {
  const fs = await getDoc(doc(db, 'factories', uid));
  if (fs.exists()) return `🏭 ${factoryDisplayName(fs.data())}`;
  const hs = await getDocs(query(collection(db, 'houses'), where('ownerUid', '==', uid), limit(20)));
  const biz = hs.docs.map((d) => d.data()).find((h) => SHOP_BIZ.includes(h.biz?.type || h.bizType));
  if (biz) return `${biz.biz?.type === 'modifiye' || biz.bizType === 'modifiye' ? '🔧' : '🔫'} ${biz.name || 'İşletme'}`;
  return null;
}

export function useSellerShopNames(sellerIds) {
  const key = [...new Set((sellerIds || []).filter((u) => u && u !== 'system'))].sort().join(',');
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    key.split(',').forEach((uid) => {
      if (cache.has(uid)) return;
      if (!pending.has(uid)) {
        pending.set(
          uid,
          loadShopName(uid)
            .catch(() => null)
            .then((name) => {
              cache.set(uid, name);
              pending.delete(uid);
            })
        );
      }
      pending.get(uid)?.then(() => alive && setTick((n) => n + 1));
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return (uid, fallback) => (uid && cache.get(uid)) || fallback;
}
