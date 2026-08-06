import { useState } from 'react';
import { useMyFutbolBets } from '../../hooks/useMyFutbolBets';
import { placeFutbolBet } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import './FutbolIddaa.css';

const PICKS = [
  { id: 'home', label: '1 (Ev Sahibi)' },
  { id: 'draw', label: 'X (Beraberlik)' },
  { id: 'away', label: '2 (Deplasman)' },
];
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
            ? 'Bu ligde güncel turda 4 maç yok.'
            : "Bugünün maçları başladı — kupon yapmak için yarın 18:00'den önce tekrar gel."}
        </p>
      )}

      {bettingOpen && alreadyBet && (
        <p className="futbol-placeholder">Bu tur için zaten bir kuponun var — aşağıda görebilirsin.</p>
      )}

      {bettingOpen && !alreadyBet && (
        <>
          <p className="futbol-placeholder">
            Günün 4 maçının tamamını doğru tahmin edersen yatırdığın miktarın{' '}
            <strong>10 katını</strong> kazanırsın. Tek bir tahmin bile yanlışsa
            yatırdığın altın gider.
          </p>
          <div className="futbol-iddaa-matches">
            {matches.map((m) => (
              <div key={m.id} className="futbol-iddaa-match">
                <div className="futbol-iddaa-match-teams">
                  <span className="futbol-match-team">
                    {teamNameById[m.homeTeamId] || '—'}
                    <FutbolCrest logo={teamById[m.homeTeamId]?.logo} initials={teamNameById[m.homeTeamId]?.[0]} size={18} />
                  </span>
                  <span className="futbol-match-team futbol-match-team-away">
                    <FutbolCrest logo={teamById[m.awayTeamId]?.logo} initials={teamNameById[m.awayTeamId]?.[0]} size={18} />
                    {teamNameById[m.awayTeamId] || '—'}
                  </span>
                </div>
                <div className="futbol-kadro-chip-row">
                  {PICKS.map((p) => (
                    <button
                      key={p.id}
                      className={`futbol-kadro-chip ${picks[m.id] === p.id ? 'active' : ''}`}
                      onClick={() => setPick(m.id, p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
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
              <span>{b.round}. Tur</span>
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
