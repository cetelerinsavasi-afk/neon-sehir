import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

function istanbulDateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function useLotteryDoc(dateKey) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const ref = doc(db, 'lottery', dateKey);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('useLotteryDoc dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [dateKey]);

  return { data, loading };
}

/**
 * useLottery — bugünün canlı jackpot/bilet durumunu ve dünün kazananını
 * birlikte döner.
 */
export function useLottery() {
  const today = useLotteryDoc(istanbulDateKey(0));
  const yesterday = useLotteryDoc(istanbulDateKey(-1));
  return { today: today.data, yesterday: yesterday.data, loading: today.loading };
}
