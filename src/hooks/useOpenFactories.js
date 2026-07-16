import { useEffect, useState } from 'react';
import { collection, collectionGroup, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const MACHINE_LABELS = {
  mining: 'Mining Makinesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi Makinesi',
  depoUpgrade: 'Depo Geliştirme Malzemesi Makinesi',
  vitesUpgrade: 'Vites Geliştirme Malzemesi Makinesi',
  yasakliMadde: 'Yasaklı Madde Üretim Makinesi',
};

/**
 * useOpenFactories — tüm oyuncu fabrikalarını, her birinin makine
 * özetiyle (toplam makine, boş işçi yeri) birlikte canlı dinler. İşçi
 * arayanlar (openSlots > 0) en üstte sıralanır.
 */
export function useOpenFactories() {
  const [factories, setFactories] = useState({});
  const [machinesByFactory, setMachinesByFactory] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubFactories = onSnapshot(
      collection(db, 'factories'),
      (snap) => {
        const next = {};
        snap.forEach((d) => {
          next[d.id] = { id: d.id, ...d.data() };
        });
        setFactories(next);
        setLoading(false);
      },
      (err) => {
        console.error('useOpenFactories (factories) dinleme hatası:', err);
        setLoading(false);
      }
    );
    const unsubMachines = onSnapshot(
      collectionGroup(db, 'machines'),
      (snap) => {
        const grouped = {};
        snap.forEach((d) => {
          const factoryId = d.ref.parent.parent.id;
          if (!grouped[factoryId]) grouped[factoryId] = [];
          grouped[factoryId].push({ id: d.id, ...d.data() });
        });
        setMachinesByFactory(grouped);
      },
      (err) => console.error('useOpenFactories (machines) dinleme hatası:', err)
    );
    return () => {
      unsubFactories();
      unsubMachines();
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
