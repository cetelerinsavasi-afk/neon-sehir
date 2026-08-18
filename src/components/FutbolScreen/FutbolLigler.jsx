import { useEffect, useMemo, useRef, useState } from 'react';
import { useFutbolLeagues } from '../../hooks/useFutbolLeagues';
import { useFutbolTeams } from '../../hooks/useFutbolTeams';
import { useFutbolMatches } from '../../hooks/useFutbolMatches';
import { useFutbolSeasonState } from '../../hooks/useFutbolSeasonState';
import { seedFutbolWorld } from '../../services/gameActions';
import { useNowTick, computeLiveMatchState, pickFutbolDisplayRound } from './futbolLiveMatch';
import FutbolMatchDetail from './FutbolMatchDetail';
import FutbolCrest from './FutbolCrest';
import FutbolIddaa from './FutbolIddaa';
import FutbolKulupler from './FutbolKulupler';
import FutbolTeamDetail from './FutbolTeamDetail';
import FutbolKupa from './FutbolKupa';
import FutbolSeasonCelebration from './FutbolSeasonCelebration';
import './FutbolLigler.css';

const SUB_TABS = [
  { id: 'maclar', label: 'Maçlar' },
  { id: 'puan', label: 'Puan Tablosu' },
  { id: 'fikstur', label: 'Maç Fikstürü' },
  { id: 'kulupler', label: 'Kulüpler' },
  { id: 'iddaa', label: 'İddaa Bayii' },
  { id: 'kupa', label: 'Kupa' },
];

export default function FutbolLigler() {
  const { leagues, loading: leaguesLoading } = useFutbolLeagues();
  const { state: seasonState } = useFutbolSeasonState();
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const [subTab, setSubTab] = useState('puan');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const now = useNowTick(5000);
  const cupSeason = leagues.find((l) => l.tier === 1)?.season || null;

  // Futbol dünyası boşsa (ilk hiç kimse açmadıysa) sessizce, otomatik
  // olarak oluşturulur — admin/buton gerekmez, seedFutbolWorld idempotent.
  useEffect(() => {
    if (!leaguesLoading && leagues.length === 0) {
      seedFutbolWorld().catch(() => {});
    }
  }, [leaguesLoading, leagues.length]);

  const activeLeague = leagues.find((l) => l.id === selectedLeagueId) || leagues[0] || null;
  const activeLeagueId = activeLeague?.id || null;
  const { teams } = useFutbolTeams(activeLeagueId);
  const { matches } = useFutbolMatches(activeLeagueId, activeLeague?.season || 1);

  const teamNameById = useMemo(() => {
    const map = {};
    teams.forEach((t) => (map[t.id] = t.name));
    return map;
  }, [teams]);

  const teamById = useMemo(() => {
    const map = {};
    teams.forEach((t) => (map[t.id] = t));
    return map;
  }, [teams]);

  const roundsGrouped = useMemo(() => {
    const map = {};
    matches.forEach((m) => {
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    });
    return map;
  }, [matches]);

  // Hangi günün gösterileceği: 18:00-19:00 arası canlı oynanan gün,
  // 19:00-24:00 arası bugün biten günün sonucu, aksi halde henüz
  // oynanmamış (bekleyen) güncel gün.
  const display = useMemo(
    () => pickFutbolDisplayRound(matches, activeLeague?.currentRound || 1, now),
    [matches, activeLeague?.currentRound, now]
  );

  // Kullanıcı isteği: "Maç Fikstürü" sekmesine girildiğinde ilk turdan
  // değil, bugünün gününden başlanmalı — yukarı çekince eski maçlar,
  // aşağı çekince yeni maçlar görülebilmeli. Liste zaten 1'den 14'e sıralı
  // basılıyor (değiştirmiyoruz), sadece açılışta bugünün turuna kaydırıyoruz.
  const fixtureRoundRefs = useRef({});
  useEffect(() => {
    if (subTab !== 'fikstur') return;
    const target = fixtureRoundRefs.current[display.round];
    if (target) {
      // rAF: liste DOM'a yeni basıldıysa (sekme az önce açıldıysa) bir
      // çerçeve bekleyip öyle kaydırmak, ölçümün doğru alınmasını sağlıyor.
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'center' });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, display.round, activeLeagueId]);

  if (leaguesLoading || leagues.length === 0) {
    return <p className="futbol-placeholder">Yükleniyor...</p>;
  }

  return (
    <div className="futbol-ligler">
      <div className="futbol-league-tabs">
        {leagues.map((l) => (
          <button
            key={l.id}
            className={`futbol-league-tab ${activeLeagueId === l.id ? 'active' : ''}`}
            onClick={() => setSelectedLeagueId(l.id)}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className="futbol-subtabs futbol-subtabs-inner">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            className={`futbol-subtab-btn ${subTab === t.id ? 'active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'puan' && <StandingsTable teams={teams} onSelectTeam={setSelectedTeamId} />}

      {subTab === 'maclar' && seasonState.status === 'CELEBRATION_DAY' && <FutbolSeasonCelebration />}

      {subTab === 'maclar' && seasonState.status !== 'CELEBRATION_DAY' && (
        <>
          {seasonState.status === 'CUP_DAY' && (
            <p className="futbol-placeholder futbol-cup-day-banner">
              🏆 Bugün Neon Kupası günü — lig maçları yarın devam edecek. Kupa maçları için "Kupa"
              sekmesine bak.
            </p>
          )}
          <MatchList
            title={
              display.mode === 'live'
                ? `${display.round}. Gün — Canlı`
                : display.mode === 'finished'
                  ? `${display.round}. Gün — Sonuçlar`
                  : `${display.round}. Gün`
            }
            matches={roundsGrouped[display.round] || []}
            teamNameById={teamNameById}
            teamById={teamById}
            onSelectMatch={setSelectedMatch}
            now={now}
          />
        </>
      )}

      {subTab === 'fikstur' && (
        <div className="futbol-fixture-list">
          {Object.keys(roundsGrouped)
            .map(Number)
            .sort((a, b) => a - b)
            .map((round) => (
              <div key={round} ref={(el) => { fixtureRoundRefs.current[round] = el; }}>
                <MatchList
                  title={`${round}. Gün`}
                  matches={roundsGrouped[round]}
                  teamNameById={teamNameById}
                  teamById={teamById}
                  onSelectMatch={setSelectedMatch}
                  now={now}
                  compact
                />
              </div>
            ))}
        </div>
      )}

      {subTab === 'kulupler' && <FutbolKulupler leagueId={activeLeagueId} />}

      {subTab === 'iddaa' && (
        <FutbolIddaa
          leagueId={activeLeagueId}
          matches={roundsGrouped[activeLeague?.currentRound || 1] || []}
          allMatches={matches}
          teamNameById={teamNameById}
          teamById={teamById}
        />
      )}

      {subTab === 'kupa' && <FutbolKupa season={cupSeason} />}

      {selectedMatch && (
        <FutbolMatchDetail
          match={selectedMatch}
          homeName={teamNameById[selectedMatch.homeTeamId] || '—'}
          awayName={teamNameById[selectedMatch.awayTeamId] || '—'}
          homeLogo={teamById[selectedMatch.homeTeamId]?.logo}
          awayLogo={teamById[selectedMatch.awayTeamId]?.logo}
          onClose={() => setSelectedMatch(null)}
        />
      )}

      {selectedTeamId && (
        <FutbolTeamDetail teamId={selectedTeamId} onClose={() => setSelectedTeamId(null)} />
      )}
    </div>
  );
}

function StandingsTable({ teams, onSelectTeam }) {
  return (
    <table className="futbol-standings">
      <thead>
        <tr>
          <th>#</th>
          <th>Takım</th>
          <th>O</th>
          <th>G</th>
          <th>B</th>
          <th>M</th>
          <th>AV</th>
          <th>A</th>
          <th>Y</th>
          <th>P</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((t, i) => {
          const rank = i + 1;
          let rowClass = '';
          if (rank === 1) rowClass = 'rank-gold';
          else if (rank === 2) rowClass = 'rank-silver';
          else if (rank === 3) rowClass = 'rank-bronze';
          else if (rank >= teams.length - 1) rowClass = 'rank-relegation';
          const gd = t.stats.gf - t.stats.ga;
          return (
            <tr
              key={t.id}
              className={`${rowClass} futbol-standings-row-clickable`}
              onClick={() => onSelectTeam?.(t.id)}
            >
              <td>{rank}</td>
              <td className="futbol-standings-team">
                <FutbolCrest logo={t.logo} initials={t.name?.[0]} size={20} />
                {t.name}
              </td>
              <td>{t.stats.played}</td>
              <td>{t.stats.won}</td>
              <td>{t.stats.drawn}</td>
              <td>{t.stats.lost}</td>
              <td>{gd > 0 ? `+${gd}` : gd}</td>
              <td>{t.stats.gf}</td>
              <td>{t.stats.ga}</td>
              <td>
                <strong>{t.stats.points}</strong>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MatchList({ title, matches, teamNameById, teamById, compact, onSelectMatch, now }) {
  return (
    <div className={`futbol-match-round ${compact ? 'compact' : ''}`}>
      <p className="futbol-match-round-title">{title}</p>
      {matches.map((m) => {
        const state = computeLiveMatchState(m, now);
        let scoreText = 'vs';
        let isLive = false;
        if (state.phase === 'finished') {
          scoreText = `${state.homeScore} - ${state.awayScore}`;
        } else if (state.phase === 'live') {
          scoreText = `${state.homeScore} - ${state.awayScore}`;
          isLive = true;
        }
        return (
          <div
            key={m.id}
            className="futbol-match-row futbol-match-row-clickable"
            onClick={() => onSelectMatch?.(m)}
          >
            <span className="futbol-match-team">
              {teamNameById[m.homeTeamId] || '—'}
              <FutbolCrest logo={teamById[m.homeTeamId]?.logo} initials={teamNameById[m.homeTeamId]?.[0]} size={18} />
            </span>
            <span className={`futbol-match-score ${isLive ? 'live' : ''}`}>
              {isLive && <span className="futbol-live-dot" />}
              {scoreText}
            </span>
            <span className="futbol-match-team futbol-match-team-away">
              <FutbolCrest logo={teamById[m.awayTeamId]?.logo} initials={teamNameById[m.awayTeamId]?.[0]} size={18} />
              {teamNameById[m.awayTeamId] || '—'}
            </span>
            <button
              type="button"
              className="futbol-match-watch-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelectMatch?.(m);
              }}
            >
              {isLive ? '🔴 İzle' : 'İzle'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
