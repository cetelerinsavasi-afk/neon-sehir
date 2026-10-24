import { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useVehicles } from './useVehicles';
import { useWeapons } from './useWeapons';
import { useFootballer, useMyGymMembership } from './useGym';
import { CASINO_MACHINES, CASINO_LOW_GOLD } from '../../functions/casino.js';
import { SLOT_MIN_STOCK } from '../../functions/casinoRules.js';

// =============================================================================
// v92 — Hatırlatıcı (📋) ek maddeleri
//   • Araba galerim var ama vitrinde hiç araba yok → "1 araba ekle"
//   • Silahçım var ama vitrinde silah / dükkânda tamir ya da silah geliştirme
//     malzemesi yok → her eksik için ayrı madde
//   • v124 Faz 6: gazinomda slotta 3 yasaklı / 10.000 altın yok, rulet / kart masasında
//     1.000 altından az var → "yasaklı madde ekle" / "altın ekle"
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
  const [stock, setStock] = useState(null); // v124: sahibin ORTAK malzeme envanteri (silahçısı varsa)

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
            .filter((h) => h.type === 'galeri' || h.type === 'silahci' || h.type === 'depo' || h.type === 'gazino')
        ),
      () => setShops([])
    );
  }, [uid]);

  // v124 — malzemeler fabrika + işletmelerin ORTAK envanterinde
  // (users/{uid}/inventory). Sadece silahçısı varsa dinlenir.
  const hasGunShop = shops.some((h) => h.type === 'silahci');
  useEffect(() => {
    if (!uid || !hasGunShop) {
      setStock(null);
      return undefined;
    }
    return onSnapshot(
      collection(db, 'users', uid, 'inventory'),
      (s) => {
        const m = {};
        s.forEach((d) => {
          m[d.id] = Number(d.data().quantity || 0);
        });
        setStock(m);
      },
      () => setStock(null)
    );
  }, [uid, hasGunShop]);

  // v124 — depolarım: herkese açık görünüm (stok + alabileceği adet) — depo başına 1 belge
  const [depoView, setDepoView] = useState({});
  const depoIds = shops.filter((h) => h.type === 'depo').map((h) => h.id).join(',');
  useEffect(() => {
    if (!depoIds) {
      setDepoView({});
      return undefined;
    }
    const offs = depoIds.split(',').map((id) =>
      onSnapshot(
        doc(db, 'depotView', id),
        (s) => setDepoView((m) => ({ ...m, [id]: s.exists() ? s.data() : { stock: 0, cap: 0 } })),
        () => {}
      )
    );
    return () => offs.forEach((f) => f());
  }, [depoIds]);

  // v124 Faz 6 — gazinolarım: makine kasaları (gazino başına 3 belge: slot, rulet, kart)
  const [casinoMc, setCasinoMc] = useState({});
  const casinoIds = shops.filter((h) => h.type === 'gazino').map((h) => h.id).join(',');
  useEffect(() => {
    if (!casinoIds) {
      setCasinoMc({});
      return undefined;
    }
    const offs = casinoIds.split(',').flatMap((id) =>
      CASINO_MACHINES.map((m) =>
        onSnapshot(
          doc(db, 'casinoMachines', `${id}_${m}`),
          (s) => setCasinoMc((x) => ({ ...x, [`${id}_${m}`]: s.exists() ? s.data() : { gold: 0, yasakliMadde: 0 } })),
          () => {}
        )
      )
    );
    return () => offs.forEach((f) => f());
  }, [casinoIds]);

  return useMemo(() => {
    const list = [];
    let gunMatsDone = false;
    for (const h of shops) {
      // aynı türden birden çok dükkân varsa hangisi olduğu yazılır
      const tag = shops.filter((x) => x.type === h.type).length > 1 && h.name ? ` (${h.name})` : '';
      if (h.type === 'galeri' && !vehicles.some((v) => v.shopHouseId === h.id)) {
        list.push({ id: `galeri-car-${h.id}`, emoji: '🚗', text: '1 araba galerinin envanterine ekle' + tag });
      }
      if (h.type === 'depo') {
        const v = depoView[h.id];
        if (v && !(Number(v.stock) > 0)) list.push({ id: `depo-mal-${h.id}`, emoji: '💊', text: 'Depona yasaklı madde ekle' + tag });
        if (v && !(Number(v.cap) > 0)) list.push({ id: `depo-altin-${h.id}`, emoji: '🪙', text: 'Deponun kasasına altın ekle (oyunculardan alım için)' + tag });
      }
      if (h.type === 'gazino') {
        const mc = (m) => casinoMc[`${h.id}_${m}`];
        const sl = mc('slot');
        if (sl && Number(sl.yasakliMadde || 0) < SLOT_MIN_STOCK.yasakliMadde) list.push({ id: `gz-slot-ym-${h.id}`, emoji: '💊', text: `Slot makinesine yasaklı madde ekle (en az ${SLOT_MIN_STOCK.yasakliMadde})` + tag });
        if (sl && Number(sl.gold || 0) < SLOT_MIN_STOCK.gold) list.push({ id: `gz-slot-g-${h.id}`, emoji: '🪙', text: `Slot makinesine altın ekle (en az ${SLOT_MIN_STOCK.gold.toLocaleString('tr-TR')})` + tag });
        if (mc('rulet') && Number(mc('rulet').gold || 0) < CASINO_LOW_GOLD) list.push({ id: `gz-rul-${h.id}`, emoji: '🎡', text: 'Rulet masasına altın ekle' + tag });
        if (mc('kart') && Number(mc('kart').gold || 0) < CASINO_LOW_GOLD) list.push({ id: `gz-kart-${h.id}`, emoji: '🃏', text: '10 Numara (kart masası) için altın ekle' + tag });
      }
      if (h.type === 'silahci') {
        if (!weapons.some((w) => w.shopHouseId === h.id)) list.push({ id: `silah-gun-${h.id}`, emoji: '🔫', text: 'Silahçının envanterine silah ekle' + tag });
        // ortak envanter tek — malzeme maddeleri bir kez yazılır
        if (stock && !gunMatsDone) {
          gunMatsDone = true;
          if (!(Number(stock.tamirMalzemesi) > 0)) list.push({ id: 'silah-tamir', emoji: '🔧', text: 'Envanterine tamir malzemesi ekle (Silahçı › Envanter › Mağaza)' });
          if (!(Number(stock.silahUpgrade) > 0)) list.push({ id: 'silah-upg', emoji: '🧰', text: 'Envanterine silah geliştirme malzemesi ekle (Silahçı › Envanter › Mağaza)' });
        }
      }
    }
    if (uid && !fbLoading && !fb?.teamId && gymToday?.status !== 'done') {
      list.push({ id: 'gym', emoji: '🏋️', text: 'Spor salonunda günlük antrenmanını yap' });
    }
    return list;
  }, [shops, stock, depoView, casinoMc, vehicles, weapons, uid, fb, fbLoading, gymToday]);
}
