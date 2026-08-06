import { useState } from 'react';
import { useMyFutbolBets } from '../../hooks/useMyFutbolBets';
import { placeFutbolBet } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import './FutbolIddaa.css';

const STATUS_LABELS = { pending: 'Beklemede', won: 'Kazandı', lost: 'Kaybetti' };

export default function FutbolIddaa({ leagueId, matches, teamNameById, teamById }) {
  const { bets } = useMyFutbolBets(leagueId);
  const [picks, setPicks] = useState({});
  const [stake, setStake] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const bettingOpen = matches.length === 4 && matches.every((m) => m.status === 'scheduled');
  const currentRound = matches[0]?.round;
  const alreadyBet = bets.some((b) => b.round === currentRound);

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
      await placeFutbolBet(leagueId, Number(stake), predictions);
      setSuccess('Kuponun oynandı, iyi şanslar!');
      setPicks({});
      setStake('');
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

      {bettingOpen && alreadyBet && (
        <p className="futbol-placeholder">Bugün için zaten bir kuponun var — aşağıda görebilirsin.</p>
      )}

      {bettingOpen && !alreadyBet && (
        <>
          <p className="futbol-placeholder">
            Günün 4 maçının tamamını doğru tahmin edersen yatırdığın miktarın{' '}
            <strong>10 katını</strong> kazanırsın. Tek bir tahmin bile yanlışsa
            yatırdığın altın gider.
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
            <input
              type="number"
              className="futbol-admin-input"
              placeholder="Yatıracağın altın"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
            />
            <button
              className="futbol-admin-submit"
              disabled={busy || !allPicked || !stake || Number(stake) <= 0}
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
            <div key={b.id} className={`futbol-iddaa-history-row status-${b.status}`}>
              <span>{b.round}. Gün</span>
              <span>{b.stake.toLocaleString('tr-TR')} altın</span>
              <span>{STATUS_LABELS[b.status]}</span>
              {b.status === 'won' && <span>+{b.payout.toLocaleString('tr-TR')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
