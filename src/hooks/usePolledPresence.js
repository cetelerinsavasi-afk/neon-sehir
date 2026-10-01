import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';

// =============================================================================
// v73 — maliyet optimizasyonu: "mekanda/evde kaç kişi var" sayıları için canlı
// dinleyici YERİNE 30 sn'de bir tek seferlik sorgu. Canlı dinleyici, mekandaki
// her adımda (saniyede birkaç kez) TÜM izleyicilere okuma yazdırıyordu; sayı
// göstermek için buna gerek yok. Sorgu sadece son 60 sn'de aktif olanları
// okur (eski/terk edilmiş kayıtlar ücretlendirilmez). Sekme arka plandayken
// sorgu yapılmaz.
// =============================================================================
const POLL_MS = 30_000;
const ACTIVE_MS = 60_000;

export function usePolledPresence(collectionName, { enabled = true, max = 300 } = {}) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!enabled) {
      setList([]);
      return undefined;
    }
    let alive = true;
    let busy = false;
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const since = Timestamp.fromMillis(Date.now() - ACTIVE_MS);
        const snap = await getDocs(query(collection(db, collectionName), where('updatedAt', '>', since), limit(max)));
        if (alive) setList(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      } catch (err) {
        console.warn(`usePolledPresence ${collectionName}:`, err?.code || err);
      } finally {
        busy = false;
      }
    };
    load();
    const iv = setInterval(load, POLL_MS);
    const onVis = () => !document.hidden && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [collectionName, enabled, max]);
  return list;
}
