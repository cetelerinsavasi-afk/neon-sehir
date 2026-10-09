// =============================================================================
// v79 — Dünya mekânları (park, banka, karakol, cami, gazino, galeri, silahçı,
// modifiye) için ortak "akıllı presence yazıcı" + "canlı konum birleştirici".
// Ekranlar eskisi gibi updatePresence(uid, patch) çağırır; burada karar verilir:
//   • Sadece konum/poz değiştiyse (diğer alanlar son Firestore yazımıyla aynı)
//     ve son Firestore yazımından bu yana FS_REFRESH_MS geçmediyse → RTDB.
//   • Aksi halde (sohbet, eldeki ürün, emote, hareket, nabız) → Firestore
//     (+ konum alanları RTDB'ye de, iki kaynak senkron kalsın).
// =============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { liveReady, liveWrite, liveRemove, watchLive, mergeLive } from './liveNet';

export const FS_REFRESH_MS = 20_000;
const MOVE_KEYS = new Set(['x', 'y', 'z', 'facing', 'pose', 'seat', 'left']);
const same = (a, b) => a === b || (a == null && b == null) || JSON.stringify(a) === JSON.stringify(b);

export function createPresenceWriter(room, writeFirestore) {
  let lastFsAt = 0;
  let lastFs = {};
  return async (uid, patch) => {
    const now = Date.now();
    const onlyMove = Object.keys(patch).every((k) => MOVE_KEYS.has(k) || same(patch[k], lastFs[k]));
    const hasMove = Object.keys(patch).some((k) => MOVE_KEYS.has(k));
    if (onlyMove && hasMove && lastFsAt && now - lastFsAt < FS_REFRESH_MS && liveReady()) {
      if (await liveWrite(room, uid, patch)) return;
    }
    lastFsAt = now;
    lastFs = { ...lastFs, ...patch };
    if (hasMove) liveWrite(room, uid, patch);
    await writeFirestore(uid, patch);
  };
}

// others (Firestore'dan) + RTDB canlı konumları → birleşik liste
export function useLiveMerge(room, others, enabled = true) {
  const [live, setLive] = useState({});
  useEffect(() => {
    if (!enabled || !room) {
      setLive({});
      return undefined;
    }
    // v79.2 performans: her RTDB olayında ekranı yeniden çizdirme — en fazla
    // ~5 kez/sn toplu güncelle (diğer oyuncular zaten yumuşatılarak çizilir)
    let pending = null;
    let timer = 0;
    let lastAt = 0;
    const flush = () => {
      timer = 0;
      lastAt = Date.now();
      if (pending) setLive(pending);
      pending = null;
    };
    const off = watchLive(room, (v) => {
      pending = v;
      if (timer) return;
      const wait = Math.max(0, 200 - (Date.now() - lastAt));
      timer = setTimeout(flush, wait);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [room, enabled]);
  return useMemo(
    () =>
      others.map((o) => {
        const fsMs = o.updatedAt?.toMillis?.() ?? Number(o.updatedAt || 0);
        return mergeLive(o, live[o.uid], fsMs);
      }),
    [others, live]
  );
}

export function useLiveRoomCleanup(room, uid) {
  const r = useRef(room);
  r.current = room;
  useEffect(() => () => uid && r.current && liveRemove(r.current, uid), [uid]);
}
