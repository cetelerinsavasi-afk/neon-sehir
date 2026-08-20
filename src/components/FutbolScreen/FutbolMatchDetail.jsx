import { useEffect, useMemo, useRef, useState } from 'react';
import FutbolCrest from './FutbolCrest';
import { useNowTick, computeLiveMatchState } from './futbolLiveMatch';
import './FutbolMatchDetail.css';

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

// Bir maç GERÇEKTEN 18:00'de başlayıp 19:00'da biter (tam 1 saat). Bu
// ekran, o gerçek zamana göre ilerler — hızlandırma YOK. Zaten bitmiş
// (status:'finished') bir maça girersen tüm olaylar ve nihai skor
// anında görünür (bekleme suresi olmadan).
export default function FutbolMatchDetail({
  match,
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  homeSponsorName,
  onClose,
}) {
  const now = useNowTick(5000);
  const [pulse, setPulse] = useState(null);
  const lastRevealedCountRef = useRef(0);

  const state = computeLiveMatchState(match, now);
  const possessionCheckpoints = match?.possessionCheckpoints || [];
  const revealedEvents = state.events || [];

  useEffect(() => {
    if (state.phase !== 'live') return undefined;
    if (revealedEvents.length > lastRevealedCountRef.current) {
      const newest = revealedEvents[revealedEvents.length - 1];
      lastRevealedCountRef.current = revealedEvents.length;
      setPulse({ ...newest, key: `${newest.minute}-${revealedEvents.length}` });
      const t = setTimeout(() => setPulse(null), 1300);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedEvents.length, state.phase]);

  const stats = useMemo(() => {
    const forTeam = (team) => {
      const events = revealedEvents.filter((e) => e.team === team);
      const onTarget = events.filter((e) => e.type === 'goal' || e.type === 'shot_on').length;
      return { total: events.length, onTarget };
    };
    return { home: forTeam('home'), away: forTeam('away') };
  }, [revealedEvents]);

  if (state.phase === 'scheduled') {
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

  const elapsedMinute = state.elapsedMinute ?? 0;
  const matchOver = state.phase === 'finished' || elapsedMinute >= 90;
  const possession = interpolatePossession(possessionCheckpoints, elapsedMinute);

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
            {state.homeScore} - {state.awayScore}
          </span>
          <span className="futbol-match-team-name">
            {awayName}
            <FutbolCrest logo={awayLogo} initials={awayName?.[0]} size={22} />
          </span>
        </div>
        <p className="futbol-match-minute">
          {matchOver ? 'MAÇ SONU' : `${Math.floor(elapsedMinute)}'`}
        </p>

        {matchOver && match?.penalty && (
          <p className="futbol-match-penalty-result">
            Penaltılar: {match.penalty.homeScore} - {match.penalty.awayScore}
            {match.winnerTeamId && (
              <>
                {' '}— Kazanan: {match.winnerTeamId === match.homeTeamId ? homeName : awayName}
              </>
            )}
          </p>
        )}

        <div className="futbol-pitch">
          {homeSponsorName && (
            <div className="futbol-pitch-ad-banner">🤝 Sponsor: {homeSponsorName}</div>
          )}
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
