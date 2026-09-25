import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// useFutbolCup — GÜNCEL sezonun kupa ağacını dinler: futbolCups/{season}
// kök dokümanı + futbolCupMatches (o sezona ait, tüm turlar — henüz
// eşleşmemiş turlar boş gelir). `season` verilmezse (1. Lig henüz
// yüklenmediyse) boş döner. Kupa maçı dokümanları takım adı/logo/tier
// bilgisini ZATEN kendi üzerinde taşıdığı için ayrıca futbolTeams'e
// bakmaya gerek yok.
// v38: `group` — kupa grubu (1: 1-2. Lig, 2: 3-4. Lig …). 'all' verilirse
// kök doküman 1. grubun, maçlar TÜM grupların (bugünkü kupa maçları listesi
// ve iddaa için). Eski maçlarda cupGroup alanı yok → 1. grup sayılır.
export function useFutbolCup(season, group = 1) {
  const [cup, setCup] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!season) {
      setCup(null);
      setMatches([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const g = group === 'all' ? 1 : Number(group) || 1;
    const cupRef = doc(db, 'futbolCups', g > 1 ? `${season}_${g}` : String(season));
    const unsubCup = onSnapshot(
      cupRef,
      (snap) => setCup(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => console.error('useFutbolCup (cup) dinleme hatası:', err)
    );

    const matchesQuery = query(collection(db, 'futbolCupMatches'), where('cupSeason', '==', season));
    const unsubMatches = onSnapshot(
      matchesQuery,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMatches(group === 'all' ? all : all.filter((m) => (m.cupGroup || 1) === g));
        setLoading(false);
      },
      (err) => {
        console.error('useFutbolCup (matches) dinleme hatası:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubCup();
      unsubMatches();
    };
  }, [season, group]);

  return { cup, matches, loading };
}
