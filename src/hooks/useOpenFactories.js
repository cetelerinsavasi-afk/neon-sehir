import { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const MACHINE_LABELS = {
  mining: 'Mining Makinesi',
  tamirMalzemesi: 'Tamir Malzemesi Makinesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi Makinesi',
  arabaGelistirme: 'Araba Geliştirme Malzemesi Makinesi',
  yasakliMadde: 'Yasaklı Madde Üretim Makinesi',
};

/**
 * useOpenFactories — tüm oyuncu fabrikalarını, her birinin makine
 * özetiyle (toplam makine, boş işçi yeri) birlikte canlı dinler. İşçi
 * arayanlar (openSlots > 0) en üstte sıralanır.
 *
 * NOT: Önceden tüm fabrikaların makineleri tek bir collectionGroup
 * sorgusuyla çekiliyordu. Bu, üretim ortamında (kurallar/indeksler tam
 * senkron olmadığında) sessizce boş sonuç dönüp tüm fabrikaları "boş yer
 * yok" gösterebiliyordu. Bunun yerine, sahibinin kendi fabrikasını
 * görüntülerken kullandığı ve güvenilir şekilde çalışan yöntemle aynı
 * şekilde, her fabrika için ayrı ayrı alt koleksiyon dinleniyor.
 */
// v73 — maliyet: eskiden TÜM fabrikalar + her fabrikanın makineleri canlı
// dinleniyordu (oyundaki her üretim, listeyi açık tutan herkese okuma
// yazdırıyordu). Artık liste açılınca bir kez okunur, açık kaldıkça 90 sn'de
// bir yenilenir; makineler fabrika başına 90 sn önbelleklenir.
const REFRESH_MS = 90_000;
const machineCache = new Map(); // factoryId → { at, list }
async function machinesOf(id) {
  const c = machineCache.get(id);
  if (c && Date.now() - c.at < REFRESH_MS) return c.list;
  const snap = await getDocs(collection(db, 'factories', id, 'machines'));
  const list = snap.docs.map((md) => ({ id: md.id, ...md.data() }));
  machineCache.set(id, { at: Date.now(), list });
  return list;
}

export function useOpenFactories() {
  const [factories, setFactories] = useState({});
  const [machinesByFactory, setMachinesByFactory] = useState({});
  const [loading, setLoading] = useState(true);
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (busyRef.current || document.hidden) return;
      busyRef.current = true;
      try {
        const snap = await getDocs(collection(db, 'factories'));
        if (!alive) return;
        const next = {};
        snap.forEach((d) => {
          next[d.id] = { id: d.id, ...d.data() };
        });
        setFactories(next);
        setLoading(false);
        const ids = Object.keys(next);
        const results = await Promise.all(ids.map((id) => machinesOf(id).catch(() => null)));
        if (!alive) return;
        const m = {};
        ids.forEach((id, i) => {
          if (results[i]) m[id] = results[i];
        });
        setMachinesByFactory(m);
      } catch (err) {
        console.error('useOpenFactories:', err);
        if (alive) setLoading(false);
      } finally {
        busyRef.current = false;
      }
    };
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const list = Object.values(factories)
    .map((f) => {
      const machines = machinesByFactory[f.id] || [];
      const openSlots = machines.filter((m) => m.type !== 'mining' && !m.workerId).length;
      return { ...f, machines, machineCount: machines.length, openSlots };
    })
    .sort((a, b) => b.openSlots - a.openSlots);

  return { factories: list, loading };
}

export { MACHINE_LABELS };
