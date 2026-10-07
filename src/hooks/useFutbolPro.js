import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// v77 Faz 5 — gerçek futbolcular: sözleşme, teklifler, serbest futbolcular,
// sezon istatistikleri. Hepsi okuma; yazma futbolProAction ile sunucuda.
export const PRO_MIN_POWER = 200;

function useDocData(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, path),
      (s) => {
        setData(s.exists() ? { id: s.id, ...s.data() } : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [path]);
  return { data, loading };
}

function useQueryDocs(key, build) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(Boolean(key));
  useEffect(() => {
    if (!key) {
      setDocs([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return onSnapshot(
      build(),
      (s) => {
        setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        console.error('useFutbolPro', key, e?.message || e);
        setLoading(false);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { docs, loading };
}

// Takımdaki sözleşmem (futbolPlayers/real_{uid})
export function useRealContract(uid) {
  return useDocData(uid ? `futbolPlayers/real_${uid}` : null);
}

// Bana gelen bekleyen teklifler (süresi geçenler istemcide de gizlenir)
export function useMyProOffers(uid) {
  const { docs, loading } = useQueryDocs(uid ? `po_${uid}` : null, () =>
    query(collection(db, 'futbolOffers'), where('uid', '==', uid), where('status', '==', 'pending'), limit(30))
  );
  const now = Date.now();
  return { offers: docs.filter((o) => Number(o.expiresAtMs) > now).sort((a, b) => b.salary - a.salary), loading };
}

// Takımın gönderdiği bekleyen teklifler
export function useTeamProOffers(teamId) {
  const { docs, loading } = useQueryDocs(teamId ? `to_${teamId}` : null, () =>
    query(collection(db, 'futbolOffers'), where('teamId', '==', teamId), where('status', '==', 'pending'), limit(50))
  );
  const now = Date.now();
  return { offers: docs.filter((o) => Number(o.expiresAtMs) > now), loading };
}

// Gücü 200+ tüm futbolcular (takımsız ya da başka takımda; ilanda olsun olmasın)
export function useProList(enabled = true) {
  const { docs, loading } = useQueryDocs(enabled ? 'pros' : null, () =>
    query(collection(db, 'footballers'), where('power', '>=', PRO_MIN_POWER), orderBy('power', 'desc'), limit(80))
  );
  return { pros: docs, loading };
}

// Takımdaki gerçek futbolcular (sözleşmeler)
export function useTeamContracts(teamId) {
  const { docs, loading } = useQueryDocs(teamId ? `tc_${teamId}` : null, () =>
    query(collection(db, 'futbolPlayers'), where('teamId', '==', teamId), where('real', '==', true), limit(30))
  );
  return { contracts: docs, loading };
}

// Güncel sezon (1. ligin sezonu)
export function useCurrentFutbolSeason() {
  const { docs } = useQueryDocs('season_t1', () => query(collection(db, 'futbolLeagues'), where('tier', '==', 1), limit(1)));
  return docs[0]?.season || null;
}

// Sezon istatistik sıralaması
export const STAT_BOARDS = {
  goals: { icon: '⚽', label: 'Gol Kralı', field: 'goals', unit: 'gol' },
  assists: { icon: '🎯', label: 'Asist', field: 'assists', unit: 'asist' },
  motm: { icon: '⭐', label: 'Yıldızlar', field: 'motm', unit: '⭐' },
  form: { icon: '📈', label: 'Form', field: 'ratingAvg', unit: 'puan', minApps: 5 },
  gk: { icon: '🧤', label: 'Kale Bekçisi', field: 'cleanSheets', unit: 'gol yemeden', position: 'GK' },
  def: { icon: '🛡️', label: 'Duvar', field: 'cleanSheets', unit: 'gol yemeden', position: 'DEF' },
};
export function useStatBoard(season, boardId, max = 50) {
  const b = STAT_BOARDS[boardId];
  const { docs, loading } = useQueryDocs(season && b ? `sb_${season}_${boardId}_${max}` : null, () => {
    const parts = [where('season', '==', season)];
    if (b.position) parts.push(where('position', '==', b.position));
    parts.push(orderBy(b.field, 'desc'), limit(b.minApps ? max * 2 : max));
    return query(collection(db, 'futbolPlayerStats'), ...parts);
  });
  const rows = docs.filter((d) => Number(d[b.field]) > 0 && (!b.minApps || Number(d.apps) >= b.minApps)).slice(0, max);
  return { rows, loading };
}
// Bir oyuncunun sezon satırı
export function usePlayerSeasonStats(season, playerId) {
  return useDocData(season && playerId ? `futbolPlayerStats/${season}_${playerId}` : null);
}
