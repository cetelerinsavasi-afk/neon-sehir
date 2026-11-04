import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { shopAction } from '../services/gameActions';
import { DEPO_OFFERS_KIND, depoMarketOf } from '../../functions/depo.js';

// v142 — yasaklı madde PİYASASI: içinde mal olan oyuncu depolarının en ucuzu
// (functions/depo.js shopOffers/depo, tek belge). Oyunun deposunun "Al" fiyatı budur.
// Dönen: { price, available, game } — mal olan depo yoksa oyunun fiyatı (2.250, sınırsız).
// exclude: bu depo sayılmaz (sahibin piyasa fiyatı) · excludeOwner: bu oyuncunun depoları (kendi deposundan alınmaz)
let ensured = false;
export function useDepoMarket({ enabled = true, exclude = null, excludeOwner = null } = {}) {
  const [offers, setOffers] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      doc(db, 'shopOffers', DEPO_OFFERS_KIND),
      (s) => {
        if ((!s.exists() || s.data()?.v !== 1) && !ensured) {
          ensured = true;
          shopAction({ op: 'depoOffersEnsure' }).catch(() => {
            ensured = false;
          });
        }
        setOffers(s.data()?.offers || {});
      },
      () => setOffers({})
    );
  }, [enabled]);
  if (!enabled || offers == null) return null;
  return depoMarketOf(offers, exclude, excludeOwner);
}
