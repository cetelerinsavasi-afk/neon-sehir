import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useFutbolSmartQuery } from '../lib/futbolSmartQuery';

// Bir ligin bir sezondaki tüm maçları (tura göre sıralı).
// v205 MALİYET: maç saati (17:55–19:30) dışında sunucuya gidilmez — liste bir kez okunur ve bir
// sonraki maç saatine kadar cihazdaki önbellekten açılır (bkz. lib/futbolSmartQuery.js).
// Maç saatinde eskisi gibi canlı dinlenir (skorlar anında).
export function useFutbolMatches(leagueId, season) {
  const key = leagueId && season ? `fm:${leagueId}:${season}` : null;
  const { docs, loading } = useFutbolSmartQuery(key, () =>
    query(collection(db, 'futbolMatches'), where('leagueId', '==', leagueId), where('season', '==', season))
  );
  const matches = useMemo(() => [...docs].sort((a, b) => a.round - b.round), [docs]);
  return { matches, loading };
}
