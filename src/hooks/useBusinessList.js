import { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { usePolledPresence } from './usePolledPresence';
import { useCachedQuery } from '../lib/cachedQuery';

// v77 — useBusinessList: bir türdeki açık işletmeler (houses.bizType == type)
// ve içlerinde kaç kişi olduğu. Sıra: dünkü kazanç sırası (bizRank, sunucu
// gece yazar; kazanç tutarı istemciye hiç gelmez). Sırası henüz olmayan (bugün
// açılan) işletmeler en alta, açılış sırasıyla.
const PRESENCE_STALE_MS = 90_000; // v130

export function useBusinessList(type, { enabled = true, includeGame = false } = {}) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  // v91: satırlar hangi türe ait? Tür değişince eski türün satırları bir an
  // bile görünmesin; yeni tür yüklenene kadar "yükleniyor" sayılır.
  const [rowsType, setRowsType] = useState(null);
  const [loading, setLoading] = useState(true);
  const presence = usePolledPresence('housePresence', { enabled: enabled && Boolean(user) && Boolean(type), max: 400 });
  // oyunun dükkânının sırası (gameVenues/{tür}.bizRank) — o da kazancına göre yer alır
  const [gameRank, setGameRank] = useState(null);
  useEffect(() => {
    if (!enabled || !user || !type) return undefined;
    return onSnapshot(
      doc(db, 'gameVenues', type),
      (s) => setGameRank(s.exists() && Number.isFinite(s.data().bizRank) ? s.data().bizRank : null),
      () => setGameRank(null)
    );
  }, [enabled, user, type]);

  // v130 maliyet: liste canlı dinlenmez — önbellekli tek okuma (60 sn; işletme açılıp
  // kapanınca önbellek temizlenir). İçerideki kişi sayıları yine canlı (stats/presence).
  const q = useCachedQuery(type ? `houses:biz:${type}` : null, () => query(collection(db, 'houses'), where('bizType', '==', type), limit(200)), { enabled: enabled && Boolean(user) && Boolean(type), ttlMs: 60_000 });
  useEffect(() => {
    if (!enabled || !user || !type) {
      setLoading(false);
      return;
    }
    if (q.loading) {
      setLoading(true);
      return;
    }
    setRows(q.docs);
    setRowsType(type);
    setLoading(false);
  }, [enabled, user, type, q.docs, q.loading]);

  return useMemo(() => {
    const now = Date.now();
    const counts = {};
    presence.forEach((p) => {
      const ms = p.updatedAt?.toMillis?.() ?? Number(p.updatedAt || 0);
      if (!p.houseId || (ms && now - ms > PRESENCE_STALE_MS)) return;
      counts[p.houseId] = (counts[p.houseId] || 0) + 1;
    });
    const uid = user?.uid;
    const list = rows
      .filter((h) => (includeGame || !h.bizGame) && !(Number(h.kicked?.[uid] || 0) > now))
      .map((h) => ({ ...h, people: counts[h.id] || 0, mine: h.ownerUid === uid }));
    const rank = (h) => (Number.isFinite(h.bizRank) && h.bizRank > 0 ? h.bizRank : Infinity);
    list.sort((a, b) => rank(a) - rank(b) || (a.biz?.openedAtMs || 0) - (b.biz?.openedAtMs || 0));
    const stale = enabled && Boolean(user) && Boolean(type) && rowsType !== type;
    return { loading: loading || stale, list: stale ? [] : list, gameRank, gamePeople: counts[`game_${type}`] || 0 };
  }, [rows, rowsType, presence, user, enabled, loading, gameRank, type, includeGame]);
}
