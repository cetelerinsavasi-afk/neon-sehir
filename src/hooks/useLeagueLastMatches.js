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
 * useLeagueLastMatches — Sixtagram "Son Oynanan Maçlar" ek seçiciসinde,
 * seçilen BELİRLİ bir ligin son sonuçlarını getirir (bkz.
 * useTodayFootballMatches — aynı "bugün yoksa dün" mantığı, ama burada
 * ek olarak leagueId'ye göre de filtreleniyor). leagueId verilmezse
 * hiçbir şey dinlemez.
 */
export function useLeagueLastMatches(leagueId) {
  const [todayMatches, setTodayMatches] = useState([]);
  const [yesterdayMatches, setYesterdayMatches] = useState([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [yesterdayLoading, setYesterdayLoading] = useState(true);
  const dateKey = istanbulDateKey(0);
  const yesterdayKey = istanbulDateKey(-1);

  useEffect(() => {
    if (!leagueId) {
      setTodayMatches([]);
      setTodayLoading(false);
      return undefined;
    }
    const q = query(
      collection(db, 'newsEvents'),
      where('dateKey', '==', dateKey),
      where('type', '==', 'football_match'),
      where('leagueId', '==', leagueId)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setTodayMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 4));
        setTodayLoading(false);
      },
      (err) => {
        console.error('useLeagueLastMatches (bugün) dinleme hatası:', err);
        setTodayLoading(false);
      }
    );
    return unsubscribe;
  }, [leagueId, dateKey]);

  useEffect(() => {
    if (!leagueId) {
      setYesterdayMatches([]);
      setYesterdayLoading(false);
      return undefined;
    }
    const q = query(
      collection(db, 'newsEvents'),
      where('dateKey', '==', yesterdayKey),
      where('type', '==', 'football_match'),
      where('leagueId', '==', leagueId)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setYesterdayMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 4));
        setYesterdayLoading(false);
      },
      (err) => {
        console.error('useLeagueLastMatches (dün) dinleme hatası:', err);
        setYesterdayLoading(false);
      }
    );
    return unsubscribe;
  }, [leagueId, yesterdayKey]);

  const matches = todayMatches.length > 0 ? todayMatches : yesterdayMatches;
  const loading = leagueId ? todayLoading || yesterdayLoading : false;

  return { matches, loading };
}
