import { useEffect, useState } from 'react';

// useNowTick — belirli aralıklarla yeniden render tetiklemek için
// "şu an" değerini döner. Canlı maç skorları Firestore'dan gelmiyor
// (18:00-19:00 arası maç dokümanı hiç değişmiyor, sadece zaman ilerliyor)
// — bu yüzden ekranın kendi kendine "tick" etmesi gerekiyor.
export function useNowTick(intervalMs = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'number') return ts;
  return Date.parse(ts);
}

// computeLiveMatchState — bir maç dokümanını + "şu an"ı alıp o anki
// GERÇEK ilerlemeyi hesaplar. status:'live' bir maç, matchStartAt'tan
// revealAt'e (tam 1 saat, gerçek zaman) kadar 0-90 simüle dakika arası
// ilerler; skor sadece o ana kadar "olmuş" gol olaylarından sayılır.
export function computeLiveMatchState(match, now = Date.now()) {
  if (!match) return { phase: 'unknown' };

  if (match.status === 'scheduled') {
    return { phase: 'scheduled' };
  }

  if (match.status === 'finished') {
    return {
      phase: 'finished',
      elapsedMinute: 90,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      events: match.timeline || [],
    };
  }

  // status === 'live'
  const start = toMillis(match.matchStartAt);
  const end = toMillis(match.revealAt) || (start ? start + 60 * 60 * 1000 : null);
  if (!start || !end) {
    return { phase: 'live', elapsedMinute: 0, homeScore: 0, awayScore: 0, events: [] };
  }
  const progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const elapsedMinute = progress * 90;
  const events = (match.timeline || []).filter((e) => e.minute <= elapsedMinute);
  const homeScore = events.filter((e) => e.type === 'goal' && e.team === 'home').length;
  const awayScore = events.filter((e) => e.type === 'goal' && e.team === 'away').length;
  return { phase: 'live', elapsedMinute, homeScore, awayScore, events, isOver: progress >= 1 };
}

// istanbulDateKey — bir Firestore Timestamp'in İstanbul takvim gününü
// 'YYYY-MM-DD' olarak döner. "Bugünün maçları" / "yarının fikstürü"
// ayrımı için (00:00'da gün değişimi).
export function istanbulDateKey(ts, fallbackNow = Date.now()) {
  const millis = toMillis(ts) ?? fallbackNow;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(millis));
}

// pickFutbolDisplayRound — "Maçlar" sekmesinde hangi turun gösterileceğini
// belirler:
//  - O ligde 'live' durumda maç varsa (18:00-19:00 arası) → o tur, canlı.
//  - Yoksa, bugün (İstanbul takvimi) 'finished' olmuş bir tur varsa
//    (19:00-24:00 arası) → o tur, sonuçlarıyla.
//  - Yoksa → league.currentRound (henüz oynanmamış, "vs").
export function pickFutbolDisplayRound(matches, currentRound, now = Date.now()) {
  const liveMatch = matches.find((m) => m.status === 'live');
  if (liveMatch) return { round: liveMatch.round, mode: 'live' };

  const todayKey = istanbulDateKey(null, now);
  const todayFinished = matches.find(
    (m) => m.status === 'finished' && m.playedAt && istanbulDateKey(m.playedAt, now) === todayKey
  );
  if (todayFinished) return { round: todayFinished.round, mode: 'finished' };

  return { round: currentRound, mode: 'upcoming' };
}
