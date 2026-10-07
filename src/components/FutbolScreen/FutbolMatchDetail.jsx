import { useEffect, useMemo, useState } from 'react';
import FutbolCrest from './FutbolCrest';
import { useNowTick, computeLiveMatchState } from './futbolLiveMatch';
import FutbolLivePitch from './FutbolLivePitch';
import { shotVariant, VARIANT_ICON, MISS_LABEL } from './futbolPitchScript';
import './FutbolMatchDetail.css';

const toMs = (ts) => (ts?.toMillis ? ts.toMillis() : typeof ts === 'number' ? ts : ts ? Date.parse(ts) : null);
const REPLAY_SPEED = 6; // özet: saniyede 6 maç dakikası (~15 sn)

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
  const [replayAt, setReplayAt] = useState(null);
  const now = useNowTick(replayAt ? 250 : 5000);

  // özet tekrarı (bitmiş maçlarda): skor ve anlatım da tekrar dakikasına göre
  const replayMin = replayAt ? Math.min(90, ((now - replayAt) / 1000) * REPLAY_SPEED) : null;
  const liveState = computeLiveMatchState(match, now);
  const state =
    replayMin !== null
      ? (() => {
          const events = (match?.timeline || []).filter((e) => e.minute <= replayMin);
          return {
            phase: 'live',
            elapsedMinute: replayMin,
            events,
            homeScore: events.filter((e) => e.type === 'goal' && e.team === 'home').length,
            awayScore: events.filter((e) => e.type === 'goal' && e.team === 'away').length,
          };
        })()
      : liveState;
  useEffect(() => {
    if (replayMin !== null && replayMin >= 90) {
      const t = setTimeout(() => setReplayAt(null), 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [replayMin]);
  // saha her karede kendi dakikasını hesaplar (canlıda gerçek zaman, özette hızlı)
  const startMs = toMs(match?.matchStartAt);
  const endMs = toMs(match?.revealAt) || (startMs ? startMs + 3600000 : null);
  const getMinute = () => {
    if (replayAt) return Math.min(90, ((Date.now() - replayAt) / 1000) * REPLAY_SPEED);
    if (match?.status === 'finished' || !startMs) return 90;
    return Math.min(90, Math.max(0, ((Date.now() - startMs) / (endMs - startMs)) * 90));
  };
  const possessionCheckpoints = match?.possessionCheckpoints || [];
  const revealedEvents = state.events || [];


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

        <FutbolLivePitch
          timeline={match?.timeline || []}
          possessionCheckpoints={possessionCheckpoints}
          getMinute={getMinute}
          homeName={homeName}
          awayName={awayName}
          sponsorName={homeSponsorName}
        />
        {match?.status === 'finished' && (
          <button className={`futbol-replay-btn${replayAt ? ' on' : ''}`} onClick={() => setReplayAt(replayAt ? null : Date.now())}>
            {replayAt ? '⏹ Durdur' : '▶ Maç özetini izle'}
          </button>
        )}

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
              <div key={`${e.minute}-${e.team}-${e.label}-${i}`} className={`futbol-commentary-row ${e.type} ${shotVariant(e)}`}>
                <span className="futbol-commentary-minute">{e.minute}&apos;</span>
                <span className="futbol-commentary-icon">{e.type === 'shot_off' ? VARIANT_ICON[shotVariant(e)] : EVENT_ICON[e.type]}</span>
                <span className="futbol-commentary-text">
                  {e.team === 'home' ? homeName : awayName} — {e.type === 'shot_off' ? MISS_LABEL[shotVariant(e)] : e.label}
                  {e.type === 'goal' ? ' — GOL!' : ''}
                  {e.type === 'goal' && e.scorerName && (
                    <span className="futbol-commentary-scorer">
                      ⚽ <b>{e.scorerName}</b>
                      {e.assistName && <> · 🎯 {e.assistName}</>}
                    </span>
                  )}
                </span>
              </div>
            ))}
          {revealedEvents.length === 0 && <p className="futbol-placeholder">Maç başlıyor...</p>}
        </div>
      </div>
    </div>
  );
}
