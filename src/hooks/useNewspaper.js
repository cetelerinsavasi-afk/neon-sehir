import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

function istanbulDateKey(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

const EVENTS_LIMIT = 150;

/**
 * useNewspaper — GERÇEK bir gazete gibi çalışır: bugünün sayısı, DÜNÜN
 * olaylarını (maçlar 18:00'de oynanıp 19:00'da sonuçlanıyor, soygunlar
 * gün içinde herhangi bir saatte olabiliyor) anlatır — tıpkı piyango/
 * şampiyona kazananının da "gece 00:00'da açıklanan DÜNÜN çekilişi"
 * olması gibi (bkz. useLottery/useChampionshipDaily, onlar zaten aynı
 * mantıkla "yesterday" alanı döner). Yani gece 00:00'da gazete "basılır"
 * ve o andan itibaren gün boyu DÜNÜN özetini gösterir; bugün olan yeni
 * bir maç/soygun ancak YARININ gazetesinde çıkar.
 */
export function useNewspaper() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const editionDateKey = istanbulDateKey(-1); // dünün tarihi — gazetenin içeriği bu güne ait

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'newsEvents'),
      where('dateKey', '==', editionDateKey),
      orderBy('createdAt', 'desc'),
      limit(EVENTS_LIMIT)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useNewspaper dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionDateKey]);

  return { events, editionDateKey, loading };
}
