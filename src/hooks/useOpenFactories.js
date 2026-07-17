import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const MACHINE_LABELS = {
  mining: 'Mining Makinesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi Makinesi',
  depoUpgrade: 'Depo Geliştirme Malzemesi Makinesi',
  vitesUpgrade: 'Vites Geliştirme Malzemesi Makinesi',
  yasakliMadde: 'Yasaklı Madde Üretim Makinesi',
  tamirMalzemesi: 'Tamir Malzemesi Makinesi',
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
export function useOpenFactories() {
  const [factories, setFactories] = useState({});
  const [machinesByFactory, setMachinesByFactory] = useState({});
  const [loading, setLoading] = useState(true);
  const machineUnsubsRef = useRef({});

  useEffect(() => {
    const unsubFactories = onSnapshot(
      collection(db, 'factories'),
      (snap) => {
        const next = {};
        const ids = new Set();
        snap.forEach((d) => {
          next[d.id] = { id: d.id, ...d.data() };
          ids.add(d.id);
        });
        setFactories(next);
        setLoading(false);

        // Yeni görülen fabrikalar için makine dinleyicisi başlat.
        ids.forEach((id) => {
          if (machineUnsubsRef.current[id]) return;
          machineUnsubsRef.current[id] = onSnapshot(
            collection(db, 'factories', id, 'machines'),
            (msnap) => {
              setMachinesByFactory((prev) => ({
                ...prev,
                [id]: msnap.docs.map((md) => ({ id: md.id, ...md.data() })),
              }));
            },
            (err) => console.error(`useOpenFactories (machines:${id}) dinleme hatası:`, err)
          );
        });

        // Artık var olmayan fabrikaların dinleyicilerini temizle.
        Object.keys(machineUnsubsRef.current).forEach((id) => {
          if (ids.has(id)) return;
          machineUnsubsRef.current[id]();
          delete machineUnsubsRef.current[id];
          setMachinesByFactory((prev) => {
            if (!(id in prev)) return prev;
            const next2 = { ...prev };
            delete next2[id];
            return next2;
          });
        });
      },
      (err) => {
        console.error('useOpenFactories (factories) dinleme hatası:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubFactories();
      Object.values(machineUnsubsRef.current).forEach((unsub) => unsub());
      machineUnsubsRef.current = {};
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
