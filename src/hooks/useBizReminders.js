import { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useVehicles } from './useVehicles';
import { useWeapons } from './useWeapons';
import { useFootballer, useMyGymMembership } from './useGym';

// =============================================================================
// v92 — Hatırlatıcı (📋) ek maddeleri
//   • Araba galerim var ama vitrinde hiç araba yok → "1 araba ekle"
//   • Silahçım var ama vitrinde silah / dükkânda tamir ya da silah geliştirme
//     malzemesi yok → her eksik için ayrı madde
//   • Bugünkü (19:00 → 19:00) spor salonu antrenmanı bitmedi → "Spor salonuna
//     git" (futbol takımındaysa gösterilmez; takımdaki oyuncu bireysel
//     antrenman yapamaz, takımla çalışır)
// =============================================================================
export function useBizReminders() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const { vehicles } = useVehicles();
  const { weapons } = useWeapons();
  const { fb, loading: fbLoading } = useFootballer(uid);
  const { today: gymToday } = useMyGymMembership();
  const [shops, setShops] = useState([]); // galeri + silahçı işletmelerim
  const [stock, setStock] = useState({}); // houseId → materials

  useEffect(() => {
    if (!uid) {
      setShops([]);
      return undefined;
    }
    return onSnapshot(
      query(collection(db, 'houses'), where('ownerUid', '==', uid), limit(20)),
      (s) =>
        setShops(
          s.docs
            .map((d) => ({ id: d.id, type: d.data().biz?.type || null, name: d.data().name || '' }))
            .filter((h) => h.type === 'galeri' || h.type === 'silahci')
        ),
      () => setShops([])
    );
  }, [uid]);

  // Yalnızca silahçıların malzeme stoğu dinlenir
  const gunShopIds = shops.filter((h) => h.type === 'silahci').map((h) => h.id).join(',');
  useEffect(() => {
    if (!gunShopIds) {
      setStock({});
      return undefined;
    }
    const offs = gunShopIds.split(',').map((id) =>
      onSnapshot(
        doc(db, 'businessInventories', id),
        (s) => setStock((m) => ({ ...m, [id]: s.exists() ? s.data().materials || {} : {} })),
        () => {}
      )
    );
    return () => offs.forEach((f) => f());
  }, [gunShopIds]);

  return useMemo(() => {
    const list = [];
    for (const h of shops) {
      // aynı türden birden çok dükkân varsa hangisi olduğu yazılır
      const tag = shops.filter((x) => x.type === h.type).length > 1 && h.name ? ` (${h.name})` : '';
      if (h.type === 'galeri' && !vehicles.some((v) => v.shopHouseId === h.id)) {
        list.push({ id: `galeri-car-${h.id}`, emoji: '🚗', text: '1 araba galerinin envanterine ekle' + tag });
      }
      if (h.type === 'silahci') {
        const mats = stock[h.id];
        if (!weapons.some((w) => w.shopHouseId === h.id)) list.push({ id: `silah-gun-${h.id}`, emoji: '🔫', text: 'Silahçının envanterine silah ekle' + tag });
        if (mats && !(Number(mats.tamirMalzemesi) > 0)) list.push({ id: `silah-tamir-${h.id}`, emoji: '🔧', text: 'Silahçının envanterine tamir malzemesi ekle' + tag });
        if (mats && !(Number(mats.silahUpgrade) > 0)) list.push({ id: `silah-upg-${h.id}`, emoji: '🧰', text: 'Silahçının envanterine silah geliştirme malzemesi ekle' + tag });
      }
    }
    if (uid && !fbLoading && !fb?.teamId && gymToday?.status !== 'done') {
      list.push({ id: 'gym', emoji: '🏋️', text: 'Spor salonunda günlük antrenmanını yap' });
    }
    return list;
  }, [shops, stock, vehicles, weapons, uid, fb, fbLoading, gymToday]);
}
