import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * useTodayFootballMatches — BUGÜN sonuçlanan maçlar (useNewspaper'ın
 * aksine DÜNÜN değil, bugünün tarihine bakar — maçlar 18:00'de oynanıp
 * 19:00'da sonuçlandığı için). Sixtagram'daki "Günün Maç Sonuçları" eki
 * için önizleme amaçlı; sunucu, gerçek postu oluştururken AYNI sorguyu
 * kendisi tekrar çalıştırır (bkz. functions/index.js
 * buildSixtagramAttachment), bu yüzden burası sadece önizleme.
 */
export function useTodayFootballMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const dateKey = istanbulDateKey();

  useEffect(() => {
    const q = query(
      collection(db, 'newsEvents'),
      where('dateKey', '==', dateKey),
      where('type', '==', 'football_match')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 4));
        setLoading(false);
      },
      (err) => {
        console.error('useTodayFootballMatches dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  return { matches, loading };
}
