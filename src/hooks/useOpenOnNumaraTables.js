import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useOpenOnNumaraTables — status='open' olan tüm masaları dinler (kapasite
 * dolu olsa da listede kalır, dolu olanlar client'ta filtrelenir — tek
 * eşitlik filtresi composite index gerektirmiyor).
 */
// v124 Faz 6: casinoId — oyuncu gazinosunda sadece o gazinonun masaları
// (casinoId + status eşitlik filtresi). Oyunun gazinosunda eski masalarda alan
// yok → casinoId'si olmayan / 'game' olanlar gösterilir.
export function useOpenOnNumaraTables(casinoId = 'game') {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const player = casinoId && casinoId !== 'game';
    const q = player
      ? query(collection(db, 'onNumaraTables'), where('casinoId', '==', casinoId), where('status', '==', 'open'))
      : query(collection(db, 'onNumaraTables'), where('status', '==', 'open'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTables(player ? rows : rows.filter((t) => !t.casinoId || t.casinoId === 'game'));
        setLoading(false);
      },
      (err) => {
        console.error('useOpenOnNumaraTables dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [casinoId]);

  return { tables, loading };
}
