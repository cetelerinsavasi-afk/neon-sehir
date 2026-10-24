import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

function istanbulDateKey(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

// v124 Faz 6: oyuncu gazinosunun piyangosu casinoLottery/{ev}_{gün}
const lotteryPath = (casinoId, dateKey) => (casinoId && casinoId !== 'game' ? ['casinoLottery', `${casinoId}_${dateKey}`] : ['lottery', dateKey]);

function useLotteryDoc(dateKey, casinoId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const ref = doc(db, ...lotteryPath(casinoId, dateKey));
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
  }, [dateKey, casinoId]);

  return { data, loading };
}

/**
 * useLottery — bugünün canlı jackpot/bilet durumunu, dünün kazananını ve
 * kendi bugünkü bilet sayımı birlikte döner.
 */
export function useLottery(casinoId = 'game') {
  const { user } = useAuth();
  const today = useLotteryDoc(istanbulDateKey(0), casinoId);
  const yesterday = useLotteryDoc(istanbulDateKey(-1), casinoId);
  const [myTickets, setMyTickets] = useState(0);

  useEffect(() => {
    if (!user) {
      setMyTickets(0);
      return;
    }
    const ref = doc(db, ...lotteryPath(casinoId, istanbulDateKey(0)), 'tickets', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => setMyTickets(snap.exists() ? snap.data().count || 0 : 0),
      (err) => console.error('myTickets dinleme hatası:', err)
    );
    return unsubscribe;
  }, [user, casinoId]);

  return { today: today.data, yesterday: yesterday.data, myTickets, loading: today.loading };
}
