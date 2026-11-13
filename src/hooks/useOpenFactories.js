import { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { readWithKick } from './useFirestoreResume';

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
  const snap = await readWithKick(() => getDocs(collection(db, 'factories', id, 'machines')));
  const list = snap.docs.map((md) => ({ id: md.id, ...md.data() }));
  machineCache.set(id, { at: Date.now(), list });
  return list;
}

// v160.3 — "Fabrikalar yüklenmesi çok uzun sürüyor": liste, TÜM fabrikaların makineleri tek tek
// okunmadan boş görünüyordu (aktiflik makinelerden hesaplanıyor). Artık:
//   • son liste cihazda saklanır → ekran ANINDA dolu açılır, arkada sessizce yenilenir
//   • makineler 8'erli gruplar hâlinde okunur, geldikçe liste dolar (hepsini beklemez)
//   • okuma sayısı aynı (yenileme yine 90 sn'de bir, açık kaldıkça)
const LS_KEY = 'ns_factories_v1';
let memo = null; // { factories, machines }
function loadSaved() {
  if (memo) return memo;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) memo = JSON.parse(raw);
  } catch {
    memo = null;
  }
  return memo;
}
function save(factories, machines) {
  memo = { factories, machines };
  try {
    const raw = JSON.stringify(memo);
    if (raw.length < 600_000) localStorage.setItem(LS_KEY, raw);
  } catch {
    /* depolama dolu / kapalı */
  }
}
// Firestore Timestamp → { seconds } (JSON'a girsin, factoryLastActivityKey okuyabilsin)
const plain = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    out[k] = v && typeof v === 'object' && typeof v.toMillis === 'function' ? { seconds: Math.floor(v.toMillis() / 1000) } : v;
  }
  return out;
};

export function useOpenFactories() {
  const saved = loadSaved();
  const [factories, setFactories] = useState(() => saved?.factories || {});
  const [machinesByFactory, setMachinesByFactory] = useState(() => saved?.machines || {});
  const [loading, setLoading] = useState(!saved);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (busyRef.current || document.hidden) return;
      busyRef.current = true;
      try {
        const snap = await readWithKick(() => getDocs(collection(db, 'factories'))); // v136: durağan bağlantıda takılmasın
        if (!alive) return;
        const next = {};
        snap.forEach((d) => {
          next[d.id] = { id: d.id, ...plain(d.data()) };
        });
        setFactories(next);
        setLoading(false);
        const ids = Object.keys(next);
        const m = {};
        const prev = memo?.machines || {};
        // önce bilinen en aktifler (önceki listeden), sonra diğerleri
        ids.sort((a, b) => (prev[b]?.length || 0) - (prev[a]?.length || 0));
        for (let i = 0; i < ids.length; i += 8) {
          const part = ids.slice(i, i + 8);
          const res = await Promise.all(part.map((id) => machinesOf(id).catch(() => null)));
          if (!alive) return;
          part.forEach((id, j) => {
            if (res[j]) m[id] = res[j].map(plain);
          });
          setMachinesByFactory({ ...prev, ...m });
        }
        // silinmiş fabrikalar listeden düşsün
        const clean = Object.fromEntries(Object.entries(m).filter(([id]) => next[id]));
        setMachinesByFactory(clean);
        save(next, clean);
      } catch (err) {
        console.error('useOpenFactories:', err);
        if (alive) setLoading(false);
      } finally {
        busyRef.current = false;
        if (alive) setMachinesLoading(false);
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

  return { factories: list, loading, machinesLoading };
}

export { MACHINE_LABELS };
