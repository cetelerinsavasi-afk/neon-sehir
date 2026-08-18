import { useMemo, useState } from 'react';
import { useFutbolCup } from '../../hooks/useFutbolCup';
import { useMyFutbolCupBets } from '../../hooks/useMyFutbolCupBets';
import { useAuth } from '../../contexts/AuthContext';
import { placeFutbolCupBet } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import FutbolMatchDetail from './FutbolMatchDetail';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './FutbolLigler.css';
import './FutbolIddaa.css';

const ROUND_ORDER = ['ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'];
const ROUND_LABELS = {
  ROUND_OF_16: 'Son 16',
  QUARTER_FINAL: 'Çeyrek Final',
  SEMI_FINAL: 'Yarı Final',
  FINAL: 'Final',
};
const ROUND_MULTIPLIERS = { ROUND_OF_16: 50, QUARTER_FINAL: 10, SEMI_FINAL: 3, FINAL: 1.5 };
const STAKE_QUICK_AMOUNTS = [10, 100, 1000, 10000];

function CupMatchRow({ match, onSelect }) {
  const played = match.status === 'finished';
  const winnerIsHome = match.winnerTeamId === match.homeTeamId;
  return (
    <div className="futbol-cup-match-wrap">
      <div
        className="futbol-match-row futbol-match-row-clickable"
        onClick={() => onSelect(match)}
      >
        <span className={`futbol-match-team ${played && winnerIsHome ? 'futbol-cup-winner' : ''}`}>
          {match.homeTeamName}
          <FutbolCrest logo={match.homeLogo} initials={match.homeTeamName?.[0]} size={18} />
        </span>
        <span className="futbol-match-score">
          {played ? `${match.homeScore} - ${match.awayScore}` : match.status === 'live' ? '⏱' : 'vs'}
        </span>
        <span className={`futbol-match-team futbol-match-team-away ${played && !winnerIsHome ? 'futbol-cup-winner' : ''}`}>
          <FutbolCrest logo={match.awayLogo} initials={match.awayTeamName?.[0]} size={18} />
          {match.awayTeamName}
        </span>
      </div>
      {match.penalty && (
        <p className="futbol-cup-penalty-note">
          Penaltılar: {match.penalty.homeScore}-{match.penalty.awayScore}
        </p>
      )}
    </div>
  );
}

export default function FutbolKupa({ season }) {
  const { user } = useAuth();
  const { cup, matches, loading } = useFutbolCup(season);
  const { bets: myBets } = useMyFutbolCupBets(season);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [picks, setPicks] = useState({});
  const [stake, setStake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const matchesByRound = useMemo(() => {
    const map = {};
    matches.forEach((m) => {
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => (a.slot || 0) - (b.slot || 0)));
    return map;
  }, [matches]);

  const championInfo = useMemo(() => {
    if (!cup || cup.status !== 'DONE') return null;
    const finalMatch = matchesByRound.FINAL?.[0];
    if (!finalMatch) return null;
    const isHomeChampion = finalMatch.homeTeamId === cup.championTeamId;
    return {
      name: isHomeChampion ? finalMatch.homeTeamName : finalMatch.awayTeamName,
      logo: isHomeChampion ? finalMatch.homeLogo : finalMatch.awayLogo,
      finalMatch,
    };
  }, [cup, matchesByRound]);

  if (loading) return <p className="futbol-placeholder">Yükleniyor...</p>;

  if (!cup) {
    return (
      <p className="futbol-placeholder">
        Bu sezon için Neon Kupası henüz oluşturulmadı — kupa, bir sonraki sezon başlangıcından itibaren
        devreye girecek.
      </p>
    );
  }

  const currentRoundMatches = cup.status !== 'DONE' ? matchesByRound[cup.status] || [] : [];
  const bettingRound = currentRoundMatches.length > 0 && currentRoundMatches.every((m) => m.status === 'scheduled')
    ? cup.status
    : null;
  const expectedCount = bettingRound ? currentRoundMatches.length : 0;
  const allPicked = Boolean(bettingRound) && currentRoundMatches.every((m) => picks[m.id]);

  const handlePick = (matchId, teamId) => {
    setPicks((prev) => ({ ...prev, [matchId]: teamId }));
  };

  const handleSubmit = async () => {
    if (!bettingRound) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const predictions = currentRoundMatches.map((m) => ({ matchId: m.id, teamId: picks[m.id] }));
      await placeFutbolCupBet(season, bettingRound, stake, predictions);
      setSuccess('Kupa kuponun oynandı, iyi şanslar!');
      setPicks({});
      setStake(0);
    } catch (err) {
      setError(err?.message || 'Kupon oynanamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="futbol-kupa">
      {cup.status === 'DONE' ? (
        <div className="futbol-cup-champion-banner">
          <p className="futbol-cup-champion-title">🏆 NEON KUPASI ŞAMPİYONU</p>
          {championInfo && (
            <div className="futbol-cup-champion-team">
              <FutbolCrest logo={championInfo.logo} initials={championInfo.name?.[0]} size={48} />
              <span>{championInfo.name}</span>
            </div>
          )}
          {championInfo?.finalMatch && (
            <p className="futbol-placeholder futbol-cup-final-score">
              Final: {championInfo.finalMatch.homeTeamName} {championInfo.finalMatch.homeScore} -{' '}
              {championInfo.finalMatch.awayScore} {championInfo.finalMatch.awayTeamName}
              {championInfo.finalMatch.penalty && (
                <> (Penaltılar: {championInfo.finalMatch.penalty.homeScore}-{championInfo.finalMatch.penalty.awayScore})</>
              )}
            </p>
          )}
        </div>
      ) : (
        <p className="futbol-placeholder">
          🏆 Neon Kupası — güncel aşama: <strong>{ROUND_LABELS[cup.status] || cup.status}</strong>
        </p>
      )}

      {bettingRound && (
        <div className="futbol-iddaa futbol-cup-bet-box">
          <p className="futbol-placeholder">
            {ROUND_LABELS[bettingRound]} turunun {expectedCount} maçının TAMAMINI doğru tahmin edersen
            yatırdığın miktarın <strong>{ROUND_MULTIPLIERS[bettingRound]} katını</strong> kazanırsın. Tek
            bir tahmin bile yanlışsa yatırdığın altın gider.
          </p>
          {!user && <p className="futbol-placeholder">Kupon oynamak için giriş yapmalısın.</p>}
          {user && (
            <>
              <div className="futbol-iddaa-matches">
                {currentRoundMatches.map((m) => {
                  const pick = picks[m.id];
                  return (
                    <div key={m.id} className="futbol-iddaa-triple futbol-cup-iddaa-pair">
                      <button
                        className={`futbol-iddaa-side ${pick === m.homeTeamId ? 'active' : ''}`}
                        onClick={() => handlePick(m.id, m.homeTeamId)}
                      >
                        <FutbolCrest logo={m.homeLogo} initials={m.homeTeamName?.[0]} size={26} />
                        <span>{m.homeTeamName}</span>
                      </button>
                      <button
                        className={`futbol-iddaa-side ${pick === m.awayTeamId ? 'active' : ''}`}
                        onClick={() => handlePick(m.id, m.awayTeamId)}
                      >
                        <span>{m.awayTeamName}</span>
                        <FutbolCrest logo={m.awayLogo} initials={m.awayTeamName?.[0]} size={26} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="futbol-iddaa-stake-row">
                <QuantityStepper value={stake} onChange={setStake} quickAmounts={STAKE_QUICK_AMOUNTS} />
                <button
                  className="futbol-admin-submit"
                  disabled={busy || !allPicked || stake <= 0}
                  onClick={handleSubmit}
                >
                  {busy ? '...' : 'Kupon Oyna'}
                </button>
              </div>
              {error && <p className="futbol-admin-error">{error}</p>}
              {success && <p className="futbol-placeholder">{success}</p>}
            </>
          )}
        </div>
      )}

      {myBets.length > 0 && (
        <div className="futbol-iddaa-history">
          <p className="futbol-kadro-section-title">Kupa Kupon Geçmişin</p>
          {myBets.map((b) => (
            <div key={b.id} className={`futbol-iddaa-history-card status-${b.status}`}>
              <div className="futbol-iddaa-history-row">
                <span>{ROUND_LABELS[b.round] || b.round}</span>
                <span>{b.stake.toLocaleString('tr-TR')} altın</span>
                <span>{b.status === 'pending' ? 'Beklemede' : b.status === 'won' ? 'Kazandı' : 'Kaybetti'}</span>
                {b.status === 'won' && <span>+{b.payout.toLocaleString('tr-TR')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="futbol-cup-bracket">
        {ROUND_ORDER.map((round) => {
          const roundMatches = matchesByRound[round] || [];
          if (roundMatches.length === 0) return null;
          return (
            <div key={round} className="futbol-match-round">
              <p className="futbol-match-round-title">{ROUND_LABELS[round]}</p>
              {roundMatches.map((m) => (
                <CupMatchRow key={m.id} match={m} onSelect={setSelectedMatch} />
              ))}
            </div>
          );
        })}
      </div>

      {selectedMatch && (
        <FutbolMatchDetail
          match={selectedMatch}
          homeName={selectedMatch.homeTeamName}
          awayName={selectedMatch.awayTeamName}
          homeLogo={selectedMatch.homeLogo}
          awayLogo={selectedMatch.awayLogo}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  );
}
