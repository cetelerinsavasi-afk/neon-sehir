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
 * useNewspaper — bugünün (İstanbul saatine göre) newsEvents kayıtlarını
 * canlı dinler. Sunucu (bkz. functions/index.js logNewsEvent) her olay
 * gerçekleştiği anda buraya kimlik açıklamayan bir özet yazıyor — bu
 * yüzden gazete oyunun gidişatına göre KENDİLİĞİNDEN yenileniyor, ekstra
 * bir "yenile" aksiyonuna gerek yok.
 */
export function useNewspaper() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const todayKey = istanbulDateKey(0);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'newsEvents'),
      where('dateKey', '==', todayKey),
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
  }, [todayKey]);

  return { events, todayKey, loading };
}
