import { useEffect, useMemo, useState } from 'react';
import { collection, doc, deleteDoc, limit, onSnapshot, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// useParkPresence.js ile BİREBİR aynı desen (bkz. o dosyadaki yorumlar) —
// tek fark, Banka/Karakol/Camii/Gazino'nun hepsi `locationId` alanıyla
// ayrılan TEK bir `interiorPresence` koleksiyonunu paylaşıyor (madde 17).
const STALE_MS = 45_000;
const MAX_PRESENCE_DOCS = 40;

/**
 * useInteriorPresence(locationId) — interiorPresence koleksiyonunu, SADECE
 * aynı mekandaki (locationId eşleşen) dokümanlarla filtrelenmiş şekilde
 * canlı dinler ve KENDİ dışındaki oyuncuları döner.
 */
export function useInteriorPresence(locationId) {
  const { user } = useAuth();
  const [others, setOthers] = useState([]);

  useEffect(() => {
    if (!user || !locationId) {
      setOthers([]);
      return undefined;
    }
    const ref = query(
      collection(db, 'interiorPresence'),
      where('locationId', '==', locationId),
      limit(MAX_PRESENCE_DOCS)
    );
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const now = Date.now();
        const list = [];
        snap.forEach((d) => {
          if (d.id === user.uid) return;
          const data = d.data();
          const ms = data.updatedAt?.toMillis?.() ?? 0;
          if (!ms || now - ms > STALE_MS) return;
          list.push({ uid: d.id, ...data });
        });
        setOthers(list);
      },
      (err) => {
        console.error('useInteriorPresence dinleme hatası:', err);
      }
    );
    return unsubscribe;
  }, [user, locationId]);

  const api = useMemo(
    () => ({
      updatePresence: async (uid, patch) => {
        try {
          await setDoc(
            doc(db, 'interiorPresence', uid),
            { ...patch, updatedAt: serverTimestamp() },
            { merge: true }
          );
        } catch (err) {
          console.error('Mekan konum güncelleme hatası:', err);
        }
      },
      clearPresence: async (uid) => {
        try {
          await deleteDoc(doc(db, 'interiorPresence', uid));
        } catch {
          // Sekme zaten kapanıyor olabilir — sessizce yut, sunucu tarafı
          // expireInteriorPresence zaten birkaç dakika içinde temizler.
        }
      },
    }),
    []
  );

  return { others, ...api };
}
