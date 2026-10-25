import { useEffect, useMemo, useState } from 'react';
import { collection, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { usePolledPresence } from './usePolledPresence';
import { useCachedQuery } from '../lib/cachedQuery';
import { useYesterdayVisits } from './useYesterdayVisits';

// v100 — Evler › Ofisler: ücretli mobilyası olan evler (kind 'ofis'). Göç bitene
// kadar eski home ofisler (bizType mescit/sinema/stüdyo) da listelenir.
// Sıra: içerideki kişi sayısı, eşitlikte dünün ziyaret sayısı, sonra önce açılan.
const PRESENCE_STALE_MS = 90_000; // v130
const LEGACY = ['mescit', 'sinema', 'studyo'];

export function useOfficeList({ enabled = true } = {}) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [legacy, setLegacy] = useState([]);
  const [loading, setLoading] = useState(true);
  const on = enabled && Boolean(user);
  const presence = usePolledPresence('housePresence', { enabled: on, max: 400 });
  const yVisits = useYesterdayVisits(on);

  // v130 maliyet: ofis listesi canlı dinlenmez — önbellekli tek okuma (2 dk)
  const q1 = useCachedQuery('houses:ofis', () => query(collection(db, 'houses'), where('kind', '==', 'ofis'), limit(200)), { enabled: on, ttlMs: 120_000 });
  const q2 = useCachedQuery('houses:ofisLegacy', () => query(collection(db, 'houses'), where('bizType', 'in', LEGACY), limit(100)), { enabled: on, ttlMs: 120_000 });
  useEffect(() => {
    if (!on) {
      setLoading(false);
      return;
    }
    setRows(q1.docs);
    setLegacy(q2.docs);
    setLoading(q1.loading);
  }, [on, q1.docs, q2.docs, q1.loading]);

  return useMemo(() => {
    const now = Date.now();
    const counts = {};
    presence.forEach((p) => {
      const ms = p.updatedAt?.toMillis?.() ?? Number(p.updatedAt || 0);
      if (!p.houseId || (ms && now - ms > PRESENCE_STALE_MS)) return;
      counts[p.houseId] = (counts[p.houseId] || 0) + 1;
    });
    const yv = {};
    yVisits.forEach((r) => {
      if (r.houseId) yv[r.houseId] = Number(r.count || 0);
    });
    const uid = user?.uid;
    const seen = new Set();
    const list = [...rows, ...legacy]
      .filter((h) => {
        if (seen.has(h.id)) return false;
        seen.add(h.id);
        return !(Number(h.kicked?.[uid] || 0) > now);
      })
      .map((h) => ({ ...h, people: counts[h.id] || 0, yv: yv[h.id] || 0, mine: h.ownerUid === uid }))
      .sort((a, b) => b.people - a.people || b.yv - a.yv || (a.office?.sinceMs || a.biz?.openedAtMs || 0) - (b.office?.sinceMs || b.biz?.openedAtMs || 0));
    return { loading, list };
  }, [rows, legacy, presence, yVisits, user?.uid, loading]);
}
