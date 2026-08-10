import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

function istanbulDateKey(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

/**
 * useTodayFootballMatches — "Son Oynanan Maçlar" eki için: maçlar her gün
 * 18:00'de oynanıp 19:00'da sonuçlanıyor. Sadece BUGÜNÜN tarihine
 * baksaydık, gece 00:00'dan o günün 19:00'ına kadar ~19 saat boyunca
 * gösterilecek hiçbir şey olmazdı (bugünün maçları henüz oynanmamış,
 * "bugün" tarihi de az önce değişmiş olurdu). Bunun yerine: bugünün
 * maçları varsa onları, yoksa (yani henüz 19:00 olmadıysa) DÜNÜN
 * maçlarını gösteriyoruz — böylece bir maç sonuçlandığı andan bir
 * sonraki günün maçları sonuçlanana kadar (tam 24 saat) hep bir şey
 * gösterilir, asla boş kalmaz. Sunucu, gerçek postu oluştururken AYNI
 * mantığı kendisi tekrar çalıştırır (bkz. functions/index.js
 * buildSixtagramAttachment), bu yüzden burası sadece önizleme.
 */
export function useTodayFootballMatches() {
  const [todayMatches, setTodayMatches] = useState([]);
  const [yesterdayMatches, setYesterdayMatches] = useState([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [yesterdayLoading, setYesterdayLoading] = useState(true);
  const dateKey = istanbulDateKey(0);
  const yesterdayKey = istanbulDateKey(-1);

  useEffect(() => {
    const qToday = query(
      collection(db, 'newsEvents'),
      where('dateKey', '==', dateKey),
      where('type', '==', 'football_match')
    );
    const unsubToday = onSnapshot(
      qToday,
      (snap) => {
        setTodayMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 4));
        setTodayLoading(false);
      },
      (err) => {
        console.error('useTodayFootballMatches (bugün) dinleme hatası:', err);
        setTodayLoading(false);
      }
    );
    return unsubToday;
  }, [dateKey]);

  useEffect(() => {
    const qYesterday = query(
      collection(db, 'newsEvents'),
      where('dateKey', '==', yesterdayKey),
      where('type', '==', 'football_match')
    );
    const unsubYesterday = onSnapshot(
      qYesterday,
      (snap) => {
        setYesterdayMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 4));
        setYesterdayLoading(false);
      },
      (err) => {
        console.error('useTodayFootballMatches (dün) dinleme hatası:', err);
        setYesterdayLoading(false);
      }
    );
    return unsubYesterday;
  }, [yesterdayKey]);

  const matches = todayMatches.length > 0 ? todayMatches : yesterdayMatches;
  const loading = todayLoading || yesterdayLoading;

  return { matches, loading };
}
