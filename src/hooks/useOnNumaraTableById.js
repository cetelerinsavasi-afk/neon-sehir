import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const msOf = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : Number(v || 0));

// v97 — canlı dinleyici + sunucu cevabı: hamle fonksiyonları masanın güncel hâlini
// döndürür (functions/index.js onNumaraState). Dinleyici takılsa bile ekran,
// ikisinden hangisi daha yeniyse (updatedAt) onu gösterir.
export function useOnNumaraTableById(tableId) {
  const [live, setLive] = useState(null);
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(Boolean(tableId));

  useEffect(() => {
    setServer(null);
    if (!tableId) {
      setLive(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const ref = doc(db, 'onNumaraTables', tableId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setLive(snap.exists() ? { id: snap.id, ...snap.data(), updatedAtMs: msOf(snap.data().updatedAt) } : null);
        setLoading(false);
      },
      (err) => {
        console.error('useOnNumaraTableById dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [tableId]);

  const applyServer = useCallback(
    (t) => {
      if (t && t.id === tableId) setServer(t);
    },
    [tableId]
  );

  const table = server && (!live || Number(server.updatedAtMs || 0) > Number(live.updatedAtMs || 0)) ? server : live;
  return { table, loading, applyServer, lastUpdateMs: Math.max(Number(live?.updatedAtMs || 0), Number(server?.updatedAtMs || 0)) };
}
