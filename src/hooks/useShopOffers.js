import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { shopAction } from '../services/gameActions';

// v132.1 — dizin hiç kurulmamışsa (ilk sürüm geçişi) sunucuya bir kez kurdurulur
const ensured = new Set();

// v132 — oyunun Silah Mağazası / Araba Galerisi fiyatları: stoğu olan oyuncu
// dükkânlarının en ucuzu (functions/shop.js shopOffers/{weapon|vehicle}, tek belge).
// Dönen: { katalogId: en ucuz fiyat } — oyunun fiyatından pahalı olan sayılmaz.
export function useShopOffers(kind, { enabled = true } = {}) {
  const [best, setBest] = useState({});
  useEffect(() => {
    if (!enabled || !kind) return undefined;
    return onSnapshot(
      doc(db, 'shopOffers', kind),
      (s) => {
        if ((!s.exists() || s.data()?.v !== 1) && !ensured.has(kind)) {
          ensured.add(kind);
          shopAction({ op: 'offersEnsure', kind }).catch(() => ensured.delete(kind));
        }
        const out = {};
        for (const [cid, m] of Object.entries(s.data()?.offers || {})) {
          for (const v of Object.values(m || {})) {
            const p = Math.floor(Number(v) || 0);
            if (p > 0 && (!out[cid] || p < out[cid])) out[cid] = p;
          }
        }
        setBest(out);
      },
      () => setBest({})
    );
  }, [kind, enabled]);
  return best;
}

// Katalog listesine güncel fiyatı uygula (oyunun fiyatı tavan)
export const withOfferPrices = (list, best) => list.map((c) => (best[String(c.id)] && best[String(c.id)] < c.price ? { ...c, price: best[String(c.id)] } : c));
