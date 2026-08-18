import { useMemo, useState } from 'react';
import { useMyFutbolBets } from '../../hooks/useMyFutbolBets';
import { placeFutbolBet } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './FutbolIddaa.css';

const STATUS_LABELS = { pending: 'Beklemede', won: 'Kazandı', lost: 'Kaybetti' };
const PICK_LABELS = { home: 'Ev Sahibi', draw: 'Beraberlik', away: 'Deplasman' };
const STAKE_QUICK_AMOUNTS = [10, 100, 1000, 10000];

export default function FutbolIddaa({ leagueId, matches, allMatches, teamNameById, teamById }) {
  const { bets } = useMyFutbolBets(leagueId);
  const [picks, setPicks] = useState({});
  const [stake, setStake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const bettingOpen = matches.length === 4 && matches.every((m) => m.status === 'scheduled');

  const matchById = useMemo(() => {
    const map = {};
    (allMatches || matches || []).forEach((m) => (map[m.id] = m));
    return map;
  }, [allMatches, matches]);

  const setPick = (matchId, pick) => {
    setPicks((prev) => ({ ...prev, [matchId]: pick }));
  };

  const allPicked = matches.length === 4 && matches.every((m) => picks[m.id]);

  const handleSubmit = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const predictions = matches.map((m) => ({ matchId: m.id, pick: picks[m.id] }));
      await placeFutbolBet(leagueId, stake, predictions);
      setSuccess('Kuponun oynandı, iyi şanslar!');
      setPicks({});
      setStake(0);
    } catch (err) {
      setError(err?.message || 'Kupon oynanamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="futbol-iddaa">
      {!bettingOpen && (
        <p className="futbol-placeholder">
          {matches.length !== 4
            ? 'Bu ligde güncel günde 4 maç yok.'
            : "Bugünün maçları başladı — kupon yapmak için yarın 18:00'den önce tekrar gel."}
        </p>
      )}

      {bettingOpen && (
        <>
          <p className="futbol-placeholder">
            Günün 4 maçının tamamını doğru tahmin edersen yatırdığın miktarın{' '}
            <strong>10 katını</strong> kazanırsın. Tek bir tahmin bile yanlışsa
            yatırdığın altın gider. Aynı gün için istediğin kadar kupon oynayabilirsin.
          </p>
          <div className="futbol-iddaa-matches">
            {matches.map((m) => {
              const homeName = teamNameById[m.homeTeamId] || '—';
              const awayName = teamNameById[m.awayTeamId] || '—';
              const pick = picks[m.id];
              return (
                <div key={m.id} className="futbol-iddaa-triple">
                  <button
                    className={`futbol-iddaa-side ${pick === 'home' ? 'active' : ''}`}
                    onClick={() => setPick(m.id, 'home')}
                  >
                    <FutbolCrest logo={teamById[m.homeTeamId]?.logo} initials={homeName[0]} size={26} />
                    <span>{homeName}</span>
                  </button>
                  <button
                    className={`futbol-iddaa-draw ${pick === 'draw' ? 'active' : ''}`}
                    onClick={() => setPick(m.id, 'draw')}
                  >
                    X
                  </button>
                  <button
                    className={`futbol-iddaa-side ${pick === 'away' ? 'active' : ''}`}
                    onClick={() => setPick(m.id, 'away')}
                  >
                    <FutbolCrest logo={teamById[m.awayTeamId]?.logo} initials={awayName[0]} size={26} />
                    <span>{awayName}</span>
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

      {bets.length > 0 && (
        <div className="futbol-iddaa-history">
          <p className="futbol-kadro-section-title">Kupon Geçmişin</p>
          {bets.map((b) => (
            <div key={b.id} className={`futbol-iddaa-history-card status-${b.status}`}>
              <div className="futbol-iddaa-history-row">
                <span>{b.round}. Gün</span>
                <span>{b.stake.toLocaleString('tr-TR')} altın</span>
                <span>{STATUS_LABELS[b.status]}</span>
                {b.status === 'won' && <span>+{b.payout.toLocaleString('tr-TR')}</span>}
              </div>
              <div className="futbol-iddaa-history-picks">
                {(b.predictions || []).map((p) => {
                  const match = matchById[p.matchId];
                  const homeName = match ? teamNameById[match.homeTeamId] || '—' : '—';
                  const awayName = match ? teamNameById[match.awayTeamId] || '—' : '—';
                  const correct = match && match.status === 'finished'
                    ? (match.homeScore > match.awayScore
                        ? 'home'
                        : match.homeScore < match.awayScore
                          ? 'away'
                          : 'draw') === p.pick
                    : null;
                  return (
                    <div
                      key={p.matchId}
                      className={`futbol-iddaa-history-pick ${correct === true ? 'correct' : correct === false ? 'wrong' : ''}`}
                    >
                      <span className="futbol-iddaa-history-teams">
                        {homeName} - {awayName}
                      </span>
                      <span className="futbol-iddaa-history-pick-label">{PICK_LABELS[p.pick]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
