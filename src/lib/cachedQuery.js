// =============================================================================
// v130 — maliyet: sık açılan LİSTELER (evler, işletmeler, ofisler) artık canlı
// dinlenmiyor. Bir kez okunur, kısa bir süre (TTL) bellekte tutulur; aynı liste
// tekrar açılınca anında önbellekten gelir. Eskiden liste açıkken herhangi bir
// evde/işletmede yapılan her kayıt tüm liste izleyicilerine okuma yazdırıyordu.
// Kişi sayıları ayrıca (stats/presence) canlı gelir — onlar etkilenmez.
// Ev / işletme durumunu değiştiren işlemlerden sonra önbellek temizlenir.
// =============================================================================
import { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';

const cache = new Map(); // key → { at, docs, p }
const EMPTY = Object.freeze([]); // sabit referans (efekt döngüsü olmasın)
const subs = new Set();

export function invalidateCachedQueries(prefix = '') {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  subs.forEach((f) => f(prefix));
}

async function load(key, makeQuery) {
  const c = cache.get(key);
  if (c?.p) return c.p;
  const p = getDocs(makeQuery())
    .then((s) => {
      const docs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      cache.set(key, { at: Date.now(), docs });
      return docs;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });
  cache.set(key, { ...(c || {}), p });
  return p;
}

// key: önbellek anahtarı (sorguyu tanımlar) · makeQuery: () => Firestore sorgusu
export function useCachedQuery(key, makeQuery, { enabled = true, ttlMs = 120_000 } = {}) {
  const fresh = () => {
    const c = key ? cache.get(key) : null;
    return c?.docs && Date.now() - c.at < ttlMs ? c.docs : null;
  };
  // sonuç hangi anahtara ait — anahtar değişince eski liste bir an bile dönmesin
  const [state, setState] = useState(() => ({ key, docs: enabled ? fresh() : null }));
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const on = (prefix) => key && key.startsWith(prefix) && setRev((n) => n + 1);
    subs.add(on);
    return () => subs.delete(on);
  }, [key]);
  useEffect(() => {
    if (!enabled || !key) return undefined;
    let alive = true;
    const f = fresh();
    if (f) {
      setState({ key, docs: f });
      return undefined;
    }
    load(key, makeQuery)
      .then((d) => alive && setState({ key, docs: d }))
      .catch((err) => {
        console.error('useCachedQuery', key, err);
        if (alive) setState({ key, docs: EMPTY });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, rev]);
  const docs = state.key === key ? state.docs : null;
  return { docs: docs || EMPTY, loading: enabled && docs === null };
}
