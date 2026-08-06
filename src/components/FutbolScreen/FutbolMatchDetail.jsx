import { useEffect, useMemo, useRef, useState } from 'react';
import FutbolCrest from './FutbolCrest';
import './FutbolMatchDetail.css';

// Tüm maç (90 simüle dakika) bu sürede oynatılır. Gerçek oyuncu ekranında
// bu, matchStartAt/revealAt (18:00→19:00) arasındaki GERÇEK zamana göre
// hesaplanacak — şimdilik sadece admin önizlemesi olduğu için, ekran her
// açıldığında baştan hızlı oynatılıyor (test etmek için 1 saat beklemek
// gerekmesin diye).
const PLAYBACK_MS = 60000;
const TICK_MS = 250;

function interpolatePossession(checkpoints, minute) {
  if (!checkpoints || checkpoints.length === 0) return { home: 50, away: 50 };
  if (minute <= 0) return checkpoints[0];
  if (minute >= 90) return checkpoints[checkpoints.length - 1];
  const idx = Math.min(Math.floor(minute / 10), checkpoints.length - 2);
  const a = checkpoints[idx];
  const b = checkpoints[idx + 1] || a;
  const t = (minute - a.minute) / (b.minute - a.minute || 10);
  const home = Math.round(a.home + (b.home - a.home) * t);
  return { home, away: 100 - home };
}

const EVENT_ICON = { goal: '⚽', shot_on: '🎯', shot_off: '🚫' };

export default function FutbolMatchDetail({ match, homeName, awayName, homeLogo, awayLogo, onClose }) {
  const [elapsedMinute, setElapsedMinute] = useState(0);
  const [pulse, setPulse] = useState(null);
  const lastRevealedCountRef = useRef(0);

  const timeline = match?.timeline || [];
  const possessionCheckpoints = match?.possessionCheckpoints || [];
  const notStartedYet = !match || match.status !== 'finished';

  useEffect(() => {
    if (notStartedYet) return undefined;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / PLAYBACK_MS);
      setElapsedMinute(progress * 90);
      if (progress >= 1) clearInterval(interval);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [notStartedYet, match?.id]);

  const revealedEvents = useMemo(
    () => timeline.filter((e) => e.minute <= elapsedMinute),
    [timeline, elapsedMinute]
  );

  useEffect(() => {
    if (revealedEvents.length > lastRevealedCountRef.current) {
      const newest = revealedEvents[revealedEvents.length - 1];
      lastRevealedCountRef.current = revealedEvents.length;
      setPulse({ ...newest, key: `${newest.minute}-${revealedEvents.length}` });
      const t = setTimeout(() => setPulse(null), 1300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [revealedEvents]);

  const liveHomeScore = revealedEvents.filter((e) => e.type === 'goal' && e.team === 'home').length;
  const liveAwayScore = revealedEvents.filter((e) => e.type === 'goal' && e.team === 'away').length;

  const stats = useMemo(() => {
    const forTeam = (team) => {
      const events = revealedEvents.filter((e) => e.team === team);
      const onTarget = events.filter((e) => e.type === 'goal' || e.type === 'shot_on').length;
      return { total: events.length, onTarget };
    };
    return { home: forTeam('home'), away: forTeam('away') };
  }, [revealedEvents]);

  const possession = interpolatePossession(possessionCheckpoints, elapsedMinute);
  const matchOver = elapsedMinute >= 90;

  if (notStartedYet) {
    return (
      <div className="futbol-match-backdrop" onClick={onClose}>
        <div className="futbol-match-detail" onClick={(e) => e.stopPropagation()}>
          <button className="futbol-match-close" onClick={onClose}>✕</button>
          <p className="futbol-placeholder" style={{ textAlign: 'center', padding: '40px 0' }}>
            {homeName} — {awayName}
            <br />
            Bu maç henüz oynanmadı, 18:00&apos;de başlayacak.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="futbol-match-backdrop" onClick={onClose}>
      <div className="futbol-match-detail" onClick={(e) => e.stopPropagation()}>
        <button className="futbol-match-close" onClick={onClose}>✕</button>

        <div className="futbol-match-scoreboard">
          <span className="futbol-match-team-name">
            <FutbolCrest logo={homeLogo} initials={homeName?.[0]} size={22} />
            {homeName}
          </span>
          <span className="futbol-match-score-big">
            {liveHomeScore} - {liveAwayScore}
          </span>
          <span className="futbol-match-team-name">
            {awayName}
            <FutbolCrest logo={awayLogo} initials={awayName?.[0]} size={22} />
          </span>
        </div>
        <p className="futbol-match-minute">
          {matchOver ? 'MAÇ SONU' : `${Math.floor(elapsedMinute)}'`}
        </p>

        <div className="futbol-pitch">
          <div className="futbol-pitch-halfline" />
          <div className="futbol-pitch-circle" />
          <div className="futbol-pitch-goal futbol-pitch-goal-left" />
          <div className="futbol-pitch-goal futbol-pitch-goal-right" />
          {pulse && (
            <div
              key={pulse.key}
              className={`futbol-pitch-ball ${pulse.team === 'home' ? 'to-right' : 'to-left'} ${
                pulse.type === 'goal' ? 'is-goal' : ''
              }`}
            />
          )}
        </div>

        <div className="futbol-possession-bar">
          <div className="futbol-possession-home" style={{ width: `${possession.home}%` }}>
            {possession.home}%
          </div>
          <div className="futbol-possession-away" style={{ width: `${possession.away}%` }}>
            {possession.away}%
          </div>
        </div>
        <p className="futbol-possession-label">Topla Oynama</p>

        <div className="futbol-shot-stats">
          <div className="futbol-shot-stats-col">
            <strong>{stats.home.total}</strong> şut ({stats.home.onTarget} isabetli)
          </div>
          <div className="futbol-shot-stats-col right">
            <strong>{stats.away.total}</strong> şut ({stats.away.onTarget} isabetli)
          </div>
        </div>

        <div className="futbol-commentary-feed">
          {revealedEvents
            .slice()
            .reverse()
            .map((e, i) => (
              <div key={`${e.minute}-${e.team}-${e.label}-${i}`} className={`futbol-commentary-row ${e.type}`}>
                <span className="futbol-commentary-minute">{e.minute}&apos;</span>
                <span className="futbol-commentary-icon">{EVENT_ICON[e.type]}</span>
                <span className="futbol-commentary-text">
                  {e.team === 'home' ? homeName : awayName} — {e.label}
                  {e.type === 'goal' ? ' — GOL!' : ''}
                </span>
              </div>
            ))}
          {revealedEvents.length === 0 && <p className="futbol-placeholder">Maç başlıyor...</p>}
        </div>
      </div>
    </div>
  );
}
