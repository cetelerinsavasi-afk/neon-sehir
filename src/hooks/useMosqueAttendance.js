import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Backend'deki istanbulPrayerWindow() ile birebir aynı mantık: günü 5
// vakite böler — 1: 00-12, 2: 12-15, 3: 15-18, 4: 18-21, 5: 21-24.
export function currentPrayerWindow() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      hour12: false,
    }).format(new Date())
  );
  if (hour < 12) return 1;
  if (hour < 15) return 2;
  if (hour < 18) return 3;
  if (hour < 21) return 4;
  return 5;
}

/**
 * useMosqueAttendance — o anki vakitte ibadet edenlerin listesini
 * ("X. Vakitteki Cemaat") canlı dinler. Vakit değiştiğinde (örn. ekran
 * uzun süre açık kalırsa) otomatik olarak doğru vakte geçer.
 */
export function useMosqueAttendance() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [win, setWin] = useState(currentPrayerWindow());

  // Vakit geçişini yakalamak için dakikada bir kontrol et.
  useEffect(() => {
    const id = setInterval(() => setWin(currentPrayerWindow()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const dateKey = istanbulDateKey();
    const q = query(
      collection(db, 'mosqueAttendance', `${dateKey}_w${win}`, 'members'),
      orderBy('prayedAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useMosqueAttendance dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [win]);

  return { members, loading, window: win };
}
