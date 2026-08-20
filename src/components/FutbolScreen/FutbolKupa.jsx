import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
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
  const [selectedMatchHomeSponsor, setSelectedMatchHomeSponsor] = useState(null);
  const [selection, setSelection] = useState(null); // { matchId, pick, odds }
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

  // Kupa maçı dokümanları sponsor bilgisini kendi üstünde taşımıyor (bu
  // bilgi futbolTeams/{id} dokümanında yaşıyor, bkz. useFutbolCup.js) —
  // maç detayı açıldığında ev sahibi takımın güncel sponsorunu tek
  // seferlik (getDoc) çekiyoruz, canlı dinlemeye gerek yok.
  useEffect(() => {
    if (!selectedMatch?.homeTeamId) {
      setSelectedMatchHomeSponsor(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'futbolTeams', selectedMatch.homeTeamId))
      .then((snap) => {
        if (!cancelled) setSelectedMatchHomeSponsor(snap.exists() ? snap.data().sponsorFactoryName || null : null);
      })
      .catch(() => {
        if (!cancelled) setSelectedMatchHomeSponsor(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMatch?.homeTeamId]);

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
  const bettableMatches = currentRoundMatches.filter(
    (m) => m.status === 'scheduled' && m.oddsHome && m.oddsAway
  );

  const selectPick = (match, pick) => {
    const odds = pick === 'home' ? match.oddsHome : match.oddsAway;
    if (!odds) return;
    setSelection({ matchId: match.id, pick, odds });
    setSuccess('');
    setError('');
  };

  const potentialPayout = selection && stake > 0 ? Math.round(stake * selection.odds) : 0;

  const handleSubmit = async () => {
    if (!selection || stake <= 0) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await placeFutbolCupBet(selection.matchId, selection.pick, stake);
      setSuccess(
        `Kupa kuponun oynandı! Oran ${res?.data?.odds ?? selection.odds} — tutarsa ${(res?.data?.potentialPayout ?? potentialPayout).toLocaleString('tr-TR')} altın kazanırsın. İyi şanslar!`
      );
      setSelection(null);
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

      {bettableMatches.length > 0 && (
        <div className="futbol-iddaa futbol-cup-bet-box">
          <p className="futbol-placeholder">
            🎟️ {ROUND_LABELS[cup.status]} turunda TEK bir maça, TEK bir sonuca (kupada beraberlik yok,
            sadece 1 / 2) bahis yap. Tuttuysa <strong>yatırdığın altın × oran</strong> kadar kazanırsın.
          </p>
          {!user && <p className="futbol-placeholder">Kupon oynamak için giriş yapmalısın.</p>}
          {user && (
            <>
              <div className="futbol-iddaa-matches">
                {bettableMatches.map((m) => {
                  const isSelectedMatch = selection?.matchId === m.id;
                  return (
                    <div key={m.id} className="futbol-iddaa-triple futbol-cup-iddaa-pair">
                      <button
                        className={`futbol-iddaa-side ${isSelectedMatch && selection.pick === 'home' ? 'active' : ''}`}
                        onClick={() => selectPick(m, 'home')}
                      >
                        <FutbolCrest logo={m.homeLogo} initials={m.homeTeamName?.[0]} size={26} />
                        <span>{m.homeTeamName}</span>
                        <span className="futbol-iddaa-odds">{m.oddsHome.toFixed(1)}</span>
                      </button>
                      <button
                        className={`futbol-iddaa-side ${isSelectedMatch && selection.pick === 'away' ? 'active' : ''}`}
                        onClick={() => selectPick(m, 'away')}
                      >
                        <span>{m.awayTeamName}</span>
                        <FutbolCrest logo={m.awayLogo} initials={m.awayTeamName?.[0]} size={26} />
                        <span className="futbol-iddaa-odds">{m.oddsAway.toFixed(1)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {selection && (
                <div className="futbol-iddaa-stake-row">
                  <QuantityStepper value={stake} onChange={setStake} quickAmounts={STAKE_QUICK_AMOUNTS} />
                  {stake > 0 && (
                    <p className="futbol-iddaa-potential">
                      Oran <strong>{selection.odds.toFixed(1)}</strong> · Tutarsa kazanacağın:{' '}
                      <strong>{potentialPayout.toLocaleString('tr-TR')} altın</strong>
                    </p>
                  )}
                  <button className="futbol-admin-submit" disabled={busy || stake <= 0} onClick={handleSubmit}>
                    {busy ? '...' : 'Kupon Oyna'}
                  </button>
                </div>
              )}
              {error && <p className="futbol-admin-error">{error}</p>}
              {success && <p className="futbol-placeholder">{success}</p>}
            </>
          )}
        </div>
      )}

      {myBets.length > 0 && (
        <div className="futbol-iddaa-history">
          <p className="futbol-kadro-section-title">Kupa Kupon Geçmişin</p>
          {myBets.map((b) => {
            const match = matches.find((m) => m.id === b.matchId);
            return (
              <div key={b.id} className={`futbol-iddaa-history-card status-${b.status}`}>
                <div className="futbol-iddaa-history-row">
                  <span>{ROUND_LABELS[b.round] || b.round}</span>
                  <span>{(b.stake || 0).toLocaleString('tr-TR')} altın</span>
                  <span>{b.status === 'pending' ? 'Beklemede' : b.status === 'won' ? 'Kazandı' : 'Kaybetti'}</span>
                  {b.status === 'won' && <span>+{(b.payout || 0).toLocaleString('tr-TR')}</span>}
                  {b.status === 'pending' && b.potentialPayout != null && (
                    <span>→ {b.potentialPayout.toLocaleString('tr-TR')}</span>
                  )}
                </div>
                {match && (
                  <div className="futbol-iddaa-history-picks">
                    <div className="futbol-iddaa-history-pick">
                      <span className="futbol-iddaa-history-teams">
                        {match.homeTeamName} - {match.awayTeamName}
                      </span>
                      <span className="futbol-iddaa-history-pick-label">
                        {b.pick === 'home' ? 'Ev Sahibi' : 'Deplasman'} @{' '}
                        {b.odds != null ? Number(b.odds).toFixed(1) : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
          homeSponsorName={selectedMatchHomeSponsor}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  );
}
