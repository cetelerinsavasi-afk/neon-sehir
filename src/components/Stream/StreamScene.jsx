import { useEffect, useRef } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { createHouseEngine } from '../HouseScreen/houseEngine';
import { watchLive, mergeLive } from '../../lib/liveNet';
import { useBlocks } from '../../contexts/BlocksContext';
import { streamPose } from './streamShared';

// =============================================================================
// v80 — Yayın sahnesi (izleyici): evi, bilgisayarın üstündeki kameradan canlı
// yeniden kurar. Kişiler/avatarlar/hareketler: housePresence (Firestore) +
// live/house (RTDB, akıcı konum). Kameranın görüş alanına giren herkes görünür;
// "yayında görünme" diyenler (noStream) ve izleyicinin engelledikleri gizlenir.
// =============================================================================
const PRESENCE_STALE_MS = 60_000;

export default function StreamScene({ houseId, chairId, pcId, className = '' }) {
  const mountRef = useRef(null);
  const engRef = useRef(null);
  const fsRef = useRef([]);
  const liveRef = useRef({});
  const { isBlocked } = useBlocks();
  const blockedRef = useRef(isBlocked);
  blockedRef.current = isBlocked;

  useEffect(() => {
    if (!mountRef.current || !houseId) return undefined;
    const eng = createHouseEngine(mountRef.current, { canEdit: false, selfUid: '__viewer__', spectate: true });
    engRef.current = eng;
    const push = () => {
      const t = Date.now();
      const list = fsRef.current
        .filter((p) => !p.noStream && !blockedRef.current?.(p.uid))
        .filter((p) => {
          const ms = p.updatedAt?.toMillis?.() ?? Number(p.updatedAt || 0);
          return !ms || t - ms < PRESENCE_STALE_MS;
        })
        .map((p) => mergeLive({ ...p, holdingVisible: p.holding || null }, liveRef.current[p.uid], p.updatedAt?.toMillis?.() ?? 0));
      eng.setOthers(list);
    };
    const offHouse = onSnapshot(doc(db, 'houses', houseId), (s) => {
      if (!s.exists()) return;
      const h = s.data();
      eng.setDesign({ items: h.items || [], wall: h.wall, floor: h.floor }, { force: true });
      eng.setFixedCamera(streamPose(h.items, chairId, pcId));
    });
    const offPres = onSnapshot(query(collection(db, 'housePresence'), where('houseId', '==', houseId), limit(40)), (s) => {
      fsRef.current = s.docs.map((d) => ({ uid: d.id, ...d.data() }));
      push();
    });
    let timer = 0;
    const offLive = watchLive(`house/${houseId}`, (m) => {
      liveRef.current = m;
      if (!timer) timer = setTimeout(() => ((timer = 0), push()), 120);
    });
    return () => {
      offHouse();
      offPres();
      offLive();
      clearTimeout(timer);
      eng.dispose();
      engRef.current = null;
    };
  }, [houseId, chairId, pcId]);

  return <div ref={mountRef} className={`st-scene ${className}`} />;
}
