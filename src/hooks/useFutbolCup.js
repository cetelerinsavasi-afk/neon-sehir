import { useEffect, useMemo, useState } from 'react';
import { useFutbolSmartQuery } from '../lib/futbolSmartQuery';
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

  useEffect(() => {
    if (!season) {
      setCup(null);
      return undefined;
    }
    const g = group === 'all' ? 1 : Number(group) || 1;
    const cupRef = doc(db, 'futbolCups', g > 1 ? `${season}_${g}` : String(season));
    const unsubCup = onSnapshot(
      cupRef,
      (snap) => setCup(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => console.error('useFutbolCup (cup) dinleme hatası:', err)
    );

    return () => {
      unsubCup();
    };
  }, [season, group]);

  // v205 MALİYET: kupa maçları maç saati dışında cihazdaki önbellekten (bkz. lib/futbolSmartQuery.js)
  const { docs: allMatches, loading: mLoading } = useFutbolSmartQuery(season ? `fcm:${season}` : null, () =>
    query(collection(db, 'futbolCupMatches'), where('cupSeason', '==', season))
  );
  const g = group === 'all' ? 1 : Number(group) || 1;
  const matches = useMemo(() => (group === 'all' ? allMatches : allMatches.filter((m) => (m.cupGroup || 1) === g)), [allMatches, group, g]);

  return { cup, matches, loading: Boolean(season) && mLoading };
}
