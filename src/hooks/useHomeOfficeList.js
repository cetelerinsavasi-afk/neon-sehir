import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { usePolledPresence } from './usePolledPresence';
import { useYesterdayVisits } from './useYesterdayVisits';
import { HOME_OFFICE_KEYS } from '../../functions/businessCatalogData.js';

// v93 — Evler › Home Ofisler: açık home ofisler (mescit / sinema / müzik stüdyosu).
// Sıra Mekanlar › Ziyaret › Popüler ile aynı: önce içerideki kişi sayısı, eşitlikte
// dünün ziyaret sayısı, sonra önce açılan.
const PRESENCE_STALE_MS = 60_000;

export function useHomeOfficeList({ enabled = true } = {}) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const on = enabled && Boolean(user);
  const presence = usePolledPresence('housePresence', { enabled: on, max: 400 });
  const yVisits = useYesterdayVisits(on);

  useEffect(() => {
    if (!on) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return onSnapshot(
      query(collection(db, 'houses'), where('bizType', 'in', HOME_OFFICE_KEYS), limit(200)),
      (s) => {
        setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        console.error('useHomeOfficeList:', e);
        setLoading(false);
      }
    );
  }, [on]);

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
    const list = rows
      .filter((h) => !(Number(h.kicked?.[uid] || 0) > now))
      .map((h) => ({ ...h, people: counts[h.id] || 0, yv: yv[h.id] || 0, mine: h.ownerUid === uid }))
      .sort((a, b) => b.people - a.people || b.yv - a.yv || (a.biz?.openedAtMs || 0) - (b.biz?.openedAtMs || 0));
    return { loading, list };
  }, [rows, presence, yVisits, user?.uid, loading]);
}
