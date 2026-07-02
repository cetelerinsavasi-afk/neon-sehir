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
 * useLottery — bugünün canlı jackpot/bilet durumunu, dünün kazananını ve
 * kendi bugünkü bilet sayımı birlikte döner.
 */
export function useLottery() {
  const { user } = useAuth();
  const today = useLotteryDoc(istanbulDateKey(0));
  const yesterday = useLotteryDoc(istanbulDateKey(-1));
  const [myTickets, setMyTickets] = useState(0);

  useEffect(() => {
    if (!user) {
      setMyTickets(0);
      return;
    }
    const ref = doc(db, 'lottery', istanbulDateKey(0), 'tickets', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => setMyTickets(snap.exists() ? snap.data().count || 0 : 0),
      (err) => console.error('myTickets dinleme hatası:', err)
    );
    return unsubscribe;
  }, [user]);

  return { today: today.data, yesterday: yesterday.data, myTickets, loading: today.loading };
}
