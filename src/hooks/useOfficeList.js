import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { usePolledPresence } from './usePolledPresence';
import { useYesterdayVisits } from './useYesterdayVisits';

// v100 — Evler › Ofisler: ücretli mobilyası olan evler (kind 'ofis'). Göç bitene
// kadar eski home ofisler (bizType mescit/sinema/stüdyo) da listelenir.
// Sıra: içerideki kişi sayısı, eşitlikte dünün ziyaret sayısı, sonra önce açılan.
const PRESENCE_STALE_MS = 60_000;
const LEGACY = ['mescit', 'sinema', 'studyo'];

export function useOfficeList({ enabled = true } = {}) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [legacy, setLegacy] = useState([]);
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
    const err = (e) => {
      console.error('useOfficeList:', e);
      setLoading(false);
    };
    const u1 = onSnapshot(
      query(collection(db, 'houses'), where('kind', '==', 'ofis'), limit(200)),
      (s) => {
        setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      err
    );
    const u2 = onSnapshot(query(collection(db, 'houses'), where('bizType', 'in', LEGACY), limit(100)), (s) => setLegacy(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err);
    return () => {
      u1();
      u2();
    };
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
