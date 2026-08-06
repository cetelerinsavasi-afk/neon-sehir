import { useMemo, useState } from 'react';
import { useFutbolLeagues } from '../../hooks/useFutbolLeagues';
import { useFutbolTeams } from '../../hooks/useFutbolTeams';
import { useFutbolMatches } from '../../hooks/useFutbolMatches';
import { seedFutbolWorld, resetFutbolWorld, resolveFutbolMatchdayManual } from '../../services/gameActions';
import FutbolMatchDetail from './FutbolMatchDetail';
import FutbolCrest from './FutbolCrest';
import FutbolIddaa from './FutbolIddaa';
import FutbolKulupler from './FutbolKulupler';
import './FutbolLigler.css';

const SUB_TABS = [
  { id: 'maclar', label: 'Maçlar' },
  { id: 'puan', label: 'Puan Tablosu' },
  { id: 'fikstur', label: 'Maç Fikstürü' },
  { id: 'kulupler', label: 'Kulüpler' },
  { id: 'iddaa', label: 'İddaa Bayii' },
];

export default function FutbolLigler() {
  const { leagues, loading: leaguesLoading } = useFutbolLeagues();
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const [subTab, setSubTab] = useState('puan');
  const [busy, setBusy] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);

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

  // "Bugünün maçları" için gerçek gün/saat motoru henüz yok (Faz 3) —
  // şimdilik ilk oynanmamış günü "güncel gün" olarak gösteriyoruz.
  const currentRound = useMemo(() => {
    const unplayed = matches.find((m) => m.status !== 'finished');
    return unplayed ? unplayed.round : 1;
  }, [matches]);

  const runSeed = async () => {
    setBusy(true);
    try {
      await seedFutbolWorld();
    } finally {
      setBusy(false);
    }
  };

  const runReset = async () => {
    if (!window.confirm('Tüm futbol verisi silinecek, emin misin?')) return;
    setBusy(true);
    try {
      await resetFutbolWorld();
    } finally {
      setBusy(false);
    }
  };

  // Turu oynattıktan sonra, canlı anlatımı test edebilmen için o günün
  // ilk maçını otomatik açıyoruz — aramana gerek kalmasın diye.
  const runManualMatchday = async () => {
    setBusy(true);
    try {
      await resolveFutbolMatchdayManual();
      setTimeout(() => {
        const finishedToday = (roundsGrouped[currentRound] || []).find((m) => m.status === 'finished');
        if (finishedToday) setSelectedMatch(finishedToday);
      }, 1500);
    } finally {
      setBusy(false);
    }
  };

  if (leaguesLoading) {
    return <p className="futbol-placeholder">Yükleniyor...</p>;
  }

  if (leagues.length === 0) {
    return (
      <div className="futbol-placeholder futbol-ligler-empty">
        <p>Futbol dünyası henüz oluşturulmadı (2 lig × 8 bot takım + tam fikstür).</p>
        <button className="futbol-admin-submit" disabled={busy} onClick={runSeed}>
          {busy ? '...' : 'Dünyayı Oluştur'}
        </button>
      </div>
    );
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

      {subTab === 'puan' && <StandingsTable teams={teams} />}

      {subTab === 'maclar' && (
        <MatchList
          title={`${currentRound}. Gün`}
          matches={roundsGrouped[currentRound] || []}
          teamNameById={teamNameById}
          teamById={teamById}
          onSelectMatch={setSelectedMatch}
        />
      )}

      {subTab === 'fikstur' && (
        <div className="futbol-fixture-list">
          {Object.keys(roundsGrouped)
            .map(Number)
            .sort((a, b) => a - b)
            .map((round) => (
              <MatchList
                key={round}
                title={`${round}. Gün`}
                matches={roundsGrouped[round]}
                teamNameById={teamNameById}
                teamById={teamById}
                onSelectMatch={setSelectedMatch}
                compact
              />
            ))}
        </div>
      )}

      {subTab === 'kulupler' && <FutbolKulupler leagueId={activeLeagueId} />}

      {subTab === 'iddaa' && (
        <FutbolIddaa
          leagueId={activeLeagueId}
          matches={roundsGrouped[currentRound] || []}
          teamNameById={teamNameById}
          teamById={teamById}
        />
      )}

      <button className="futbol-admin-reset" disabled={busy} onClick={runReset}>
        {busy ? '...' : 'Futbol Verisini Sıfırla (admin)'}
      </button>
      <button className="futbol-admin-submit" disabled={busy} onClick={runManualMatchday}>
        {busy ? '...' : 'Güncel Günü Şimdi Oynat (admin, 18:00 beklemeden test)'}
      </button>

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
    </div>
  );
}

function StandingsTable({ teams }) {
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
            <tr key={t.id} className={rowClass}>
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

function MatchList({ title, matches, teamNameById, teamById, compact, onSelectMatch }) {
  return (
    <div className={`futbol-match-round ${compact ? 'compact' : ''}`}>
      <p className="futbol-match-round-title">{title}</p>
      {matches.map((m) => (
        <div
          key={m.id}
          className="futbol-match-row futbol-match-row-clickable"
          onClick={() => onSelectMatch?.(m)}
        >
          <span className="futbol-match-team">
            {teamNameById[m.homeTeamId] || '—'}
            <FutbolCrest logo={teamById[m.homeTeamId]?.logo} initials={teamNameById[m.homeTeamId]?.[0]} size={18} />
          </span>
          <span className="futbol-match-score">
            {m.status === 'finished' ? `${m.homeScore} - ${m.awayScore}` : 'vs'}
          </span>
          <span className="futbol-match-team futbol-match-team-away">
            <FutbolCrest logo={teamById[m.awayTeamId]?.logo} initials={teamNameById[m.awayTeamId]?.[0]} size={18} />
            {teamNameById[m.awayTeamId] || '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
