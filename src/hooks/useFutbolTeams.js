import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// Puan tablosu sıralaması: puan → averaj → attığı gol → yediği gol
// (az olan önde) → takım adı (alfabetik). Bkz. kullanıcı promptu.
function compareStandings(a, b) {
  if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
  const gdA = a.stats.gf - a.stats.ga;
  const gdB = b.stats.gf - b.stats.ga;
  if (gdB !== gdA) return gdB - gdA;
  if (b.stats.gf !== a.stats.gf) return b.stats.gf - a.stats.gf;
  if (a.stats.ga !== b.stats.ga) return a.stats.ga - b.stats.ga;
  return a.name.localeCompare(b.name, 'tr');
}

export function useFutbolTeams(leagueId) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) {
      setTeams([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'futbolTeams'), where('leagueId', '==', leagueId));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort(compareStandings);
        setTeams(list);
        setLoading(false);
      },
      (err) => {
        console.error('useFutbolTeams dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [leagueId]);

  return { teams, loading };
}
