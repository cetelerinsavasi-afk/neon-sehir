import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { shopAction } from '../services/gameActions';
import { useAuth } from '../contexts/AuthContext';
import { ensureMyShops, myShopIdsFor, subscribeMyShops } from '../lib/myShops';

// v132.1 — dizin hiç kurulmamışsa (ilk sürüm geçişi) sunucuya bir kez kurdurulur
const ensured = new Set();

// v132 — oyunun Silah Mağazası / Araba Galerisi fiyatları: stoğu olan oyuncu
// dükkânlarının en ucuzu (functions/shop.js shopOffers/{weapon|vehicle}, tek belge).
// Dönen: { katalogId: en ucuz fiyat } — oyunun fiyatından pahalı olan sayılmaz.
// exclude: bu dükkân sayılmaz (v134: sahibin "piyasa değeri" — diğer dükkânların en ucuzu)
// v166 excludeMine: alıcının KENDİ dükkânları sayılmaz (oyunun mağazası — sunucu da onları atlar)
export function useShopOffers(kind, { enabled = true, exclude = null, excludeMine = false } = {}) {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [raw, setRaw] = useState(null); // shopOffers belgesinin offers alanı
  const [mine, setMine] = useState(() => (excludeMine ? myShopIdsFor(uid) : null));
  useEffect(() => {
    if (!excludeMine || !uid) {
      setMine(null);
      return undefined;
    }
    setMine(myShopIdsFor(uid));
    ensureMyShops(uid);
    return subscribeMyShops(() => setMine(myShopIdsFor(uid)));
  }, [excludeMine, uid]);
  useEffect(() => {
    if (!enabled || !kind) return undefined;
    return onSnapshot(
      doc(db, 'shopOffers', kind),
      (s) => {
        if ((!s.exists() || s.data()?.v !== 1) && !ensured.has(kind)) {
          ensured.add(kind);
          shopAction({ op: 'offersEnsure', kind }).catch(() => ensured.delete(kind));
        }
        setRaw(s.data()?.offers || {});
      },
      () => setRaw({})
    );
  }, [kind, enabled]);
  return useMemo(() => {
    const out = {};
    if (!enabled) return out;
    for (const [cid, m] of Object.entries(raw || {})) {
      for (const [hid, v] of Object.entries(m || {})) {
        if (exclude && hid === exclude) continue;
        if (mine && mine.has(hid)) continue;
        const p = Math.floor(Number(v) || 0);
        if (p > 0 && (!out[cid] || p < out[cid])) out[cid] = p;
      }
    }
    return out;
  }, [raw, exclude, mine, enabled]);
}

// Katalog listesine güncel fiyatı uygula (oyunun fiyatı tavan)
export const withOfferPrices = (list, best) => list.map((c) => (best[String(c.id)] && best[String(c.id)] < c.price ? { ...c, price: best[String(c.id)] } : c));
