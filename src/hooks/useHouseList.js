import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSocial } from '../contexts/SocialContext';
import { usePolledPresence } from './usePolledPresence';

// v66 — useHouseList: Ev listesi (kendi evlerim + girebileceğim evler) ve her
// evde şu an kaç kişi olduğu. Hem Ev ekranı (HouseHub) hem Mekanlar > Ziyaret
// sekmesi kullanır.
const PRESENCE_STALE_MS = 60_000;

const houseCache = new Map(); // id → { at, data }
async function cachedHouse(id) {
  const c = houseCache.get(id);
  if (c && Date.now() - c.at < 60_000) return c.data;
  const s = await getDoc(doc(db, 'houses', id));
  const data = s.exists() ? { id: s.id, ...s.data() } : null;
  houseCache.set(id, { at: Date.now(), data });
  return data;
}

// v73 — maliyet: evdeki kişi sayıları artık canlı dinlenmiyor (her evdeki her
// adım tüm liste izleyicilerine okuma yazdırıyordu) — usePolledPresence ile
// 30 sn'de bir sadece aktif kayıtlar okunur. onlyLive: Mekanlar > Ziyaret için;
// ev listeleri dinlenmez, sadece içinde kişi olan evlerin belgeleri okunur.
export function useHouseList({ enabled = true, onlyLive = false } = {}) {
  const { user } = useAuth();
  const social = useSocial();
  const [mine, setMine] = useState([]);
  const [open, setOpen] = useState([]);
  const [invited, setInvited] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const presence = usePolledPresence('housePresence', { enabled: enabled && Boolean(user), max: 400 });

  // onlyLive: içinde kişi olan evlerin belgeleri (önbellekli, 60 sn)
  const liveIds = useMemo(() => [...new Set(presence.map((p) => p.houseId).filter(Boolean))].sort().join(','), [presence]);
  useEffect(() => {
    if (!onlyLive || !enabled || !user) return undefined;
    let alive = true;
    const ids = liveIds ? liveIds.split(',').slice(0, 30) : [];
    Promise.all(ids.map((id) => cachedHouse(id)))
      .then((docs) => {
        if (!alive) return;
        const list = docs.filter(Boolean);
        setMine(list.filter((h) => h.ownerUid === user.uid));
        setOpen(list.filter((h) => h.ownerUid !== user.uid));
        setInvited([]);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [onlyLive, enabled, user, liveIds]);

  useEffect(() => {
    if (onlyLive) return undefined;
    if (!enabled || !user) {
      setLoading(false);
      return undefined;
    }
    const uid = user.uid;
    const err = (label) => (e) => console.error(`useHouseList ${label}:`, e);
    const unsubs = [
      onSnapshot(query(collection(db, 'houses'), where('ownerUid', '==', uid), limit(200)), (s) => {
        setMine(s.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, err('mine')),
      onSnapshot(query(collection(db, 'houses'), where('privacy', 'in', ['public', 'friends']), limit(200)), (s) => {
        setOpen(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, err('open')),
      onSnapshot(query(collection(db, 'houses'), where(`invites.${uid}`, '>', Date.now()), limit(50)), (s) => {
        setInvited(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, err('invited')),
    ];
    const t = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(t);
    };
  }, [enabled, user, onlyLive]);

  return useMemo(() => {
    void tick;
    const uid = user?.uid;
    const now = Date.now();
    const counts = {};
    presence.forEach((p) => {
      const ms = p.updatedAt?.toMillis?.() ?? Number(p.updatedAt || 0);
      if (!p.houseId || (ms && now - ms > PRESENCE_STALE_MS)) return;
      counts[p.houseId] = (counts[p.houseId] || 0) + 1;
    });
    const friends = social?.friendMap || {};
    const seen = new Set(mine.map((h) => h.id));
    const enterable = [];
    [...invited, ...open].forEach((h) => {
      if (seen.has(h.id) || h.ownerUid === uid) return;
      if (Number(h.kicked?.[uid] || 0) > now) return;
      const isInvited = Number(h.invites?.[uid] || 0) > now;
      const privacy = h.privacy || 'public';
      const ok = isInvited || privacy === 'public' || (privacy === 'friends' && friends[h.ownerUid]);
      if (!ok) return;
      seen.add(h.id);
      enterable.push({ ...h, invited: isInvited });
    });
    const withCount = (h) => ({ ...h, people: counts[h.id] || 0 });
    const sortFn = (a, b) => b.people - a.people || Number(b.invited) - Number(a.invited) || (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
    return {
      loading,
      mine: mine.map(withCount).sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)),
      enterable: enterable.map(withCount).sort(sortFn),
      counts,
    };
  }, [mine, open, invited, presence, social?.friendMap, user?.uid, loading, tick]);
}
