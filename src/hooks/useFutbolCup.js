import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// useFutbolCup — GÜNCEL sezonun kupa ağacını dinler: futbolCups/{season}
// kök dokümanı + futbolCupMatches (o sezona ait, tüm turlar — henüz
// eşleşmemiş turlar boş gelir). `season` verilmezse (1. Lig henüz
// yüklenmediyse) boş döner. Kupa maçı dokümanları takım adı/logo/tier
// bilgisini ZATEN kendi üzerinde taşıdığı için ayrıca futbolTeams'e
// bakmaya gerek yok.
export function useFutbolCup(season) {
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
    const cupRef = doc(db, 'futbolCups', String(season));
    const unsubCup = onSnapshot(
      cupRef,
      (snap) => setCup(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => console.error('useFutbolCup (cup) dinleme hatası:', err)
    );

    const matchesQuery = query(collection(db, 'futbolCupMatches'), where('cupSeason', '==', season));
    const unsubMatches = onSnapshot(
      matchesQuery,
      (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
  }, [season]);

  return { cup, matches, loading };
}
