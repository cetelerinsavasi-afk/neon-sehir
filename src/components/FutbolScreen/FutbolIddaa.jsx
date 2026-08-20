import { useMemo, useState } from 'react';
import { useMyFutbolBets } from '../../hooks/useMyFutbolBets';
import { placeFutbolBet } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './FutbolIddaa.css';

const STATUS_LABELS = { pending: 'Beklemede', won: 'Kazandı', lost: 'Kaybetti' };
const PICK_LABELS = { home: 'Ev Sahibi', draw: 'Beraberlik', away: 'Deplasman' };
const STAKE_QUICK_AMOUNTS = [10, 100, 1000, 10000];

// FutbolIddaa — KULLANICI REVİZESİ (İddaa Oran Sistemi): artık oyuncu
// günün turundaki TÜM maçları oynamak zorunda değil, TEK bir maça bahis
// yapabiliyor. Her maçın 1/X/2 seçeneğinin kendi (o gece 00:00'da
// hesaplanıp dondurulmuş) gerçek oranı var — bkz. m.oddsHome/oddsDraw/
// oddsAway. Aynı anda sadece TEK bir maç + TEK bir seçim aktif olabilir
// (kupon = tek maç).
export default function FutbolIddaa({ leagueId, matches, allMatches, teamNameById, teamById }) {
  const { bets } = useMyFutbolBets(leagueId);
  const [selection, setSelection] = useState(null); // { matchId, pick, odds }
  const [stake, setStake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const matchById = useMemo(() => {
    const map = {};
    (allMatches || matches || []).forEach((m) => (map[m.id] = m));
    return map;
  }, [allMatches, matches]);

  const bettableMatches = matches.filter((m) => m.status === 'scheduled' && m.oddsHome && m.oddsAway);

  const selectPick = (match, pick) => {
    const odds = pick === 'home' ? match.oddsHome : pick === 'away' ? match.oddsAway : match.oddsDraw;
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
      const res = await placeFutbolBet(selection.matchId, selection.pick, stake);
      setSuccess(
        `Kuponun oynandı! Oran ${res?.data?.odds ?? selection.odds} — tutarsa ${(res?.data?.potentialPayout ?? potentialPayout).toLocaleString('tr-TR')} altın kazanırsın. İyi şanslar!`
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
    <div className="futbol-iddaa">
      {matches.length === 0 && <p className="futbol-placeholder">Bu ligde güncel günde maç yok.</p>}

      {matches.length > 0 && bettableMatches.length === 0 && (
        <p className="futbol-placeholder">
          Bugünün maçları başladı ya da oranlar henüz hesaplanmadı — kupon için yarın 00:00'dan sonra
          tekrar gel.
        </p>
      )}

      {bettableMatches.length > 0 && (
        <>
          <p className="futbol-placeholder">
            🎟️ İstediğin TEK bir maça, TEK bir sonuca (1 / X / 2) bahis yap. Oranlar her gece 00:00'da
            belirlenir ve gün boyunca değişmez. Tuttuysa <strong>yatırdığın altın × oran</strong> kadar
            kazanırsın, tutmazsa yatırdığın altın gider.
          </p>
          <div className="futbol-iddaa-matches">
            {bettableMatches.map((m) => {
              const homeName = teamNameById[m.homeTeamId] || '—';
              const awayName = teamNameById[m.awayTeamId] || '—';
              const isSelectedMatch = selection?.matchId === m.id;
              return (
                <div key={m.id} className="futbol-iddaa-triple">
                  <button
                    className={`futbol-iddaa-side ${isSelectedMatch && selection.pick === 'home' ? 'active' : ''}`}
                    onClick={() => selectPick(m, 'home')}
                  >
                    <FutbolCrest logo={teamById[m.homeTeamId]?.logo} initials={homeName[0]} size={26} />
                    <span>{homeName}</span>
                    <span className="futbol-iddaa-odds">{m.oddsHome.toFixed(1)}</span>
                  </button>
                  <button
                    className={`futbol-iddaa-draw ${isSelectedMatch && selection.pick === 'draw' ? 'active' : ''}`}
                    onClick={() => selectPick(m, 'draw')}
                  >
                    <span>X</span>
                    <span className="futbol-iddaa-odds">{(m.oddsDraw || 2).toFixed(1)}</span>
                  </button>
                  <button
                    className={`futbol-iddaa-side ${isSelectedMatch && selection.pick === 'away' ? 'active' : ''}`}
                    onClick={() => selectPick(m, 'away')}
                  >
                    <FutbolCrest logo={teamById[m.awayTeamId]?.logo} initials={awayName[0]} size={26} />
                    <span>{awayName}</span>
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

      {bets.length > 0 && (
        <div className="futbol-iddaa-history">
          <p className="futbol-kadro-section-title">Kupon Geçmişin</p>
          {bets.map((b) => {
            const match = matchById[b.matchId];
            const homeName = match ? teamNameById[match.homeTeamId] || '—' : '—';
            const awayName = match ? teamNameById[match.awayTeamId] || '—' : '—';
            return (
              <div key={b.id} className={`futbol-iddaa-history-card status-${b.status}`}>
                <div className="futbol-iddaa-history-row">
                  <span>{b.round}. Gün</span>
                  <span>{(b.stake || 0).toLocaleString('tr-TR')} altın</span>
                  <span>{STATUS_LABELS[b.status]}</span>
                  {b.status === 'won' && <span>+{(b.payout || 0).toLocaleString('tr-TR')}</span>}
                  {b.status === 'pending' && b.potentialPayout != null && (
                    <span>→ {b.potentialPayout.toLocaleString('tr-TR')}</span>
                  )}
                </div>
                <div className="futbol-iddaa-history-picks">
                  <div className="futbol-iddaa-history-pick">
                    <span className="futbol-iddaa-history-teams">
                      {homeName} - {awayName}
                    </span>
                    <span className="futbol-iddaa-history-pick-label">
                      {PICK_LABELS[b.pick]} @ {b.odds != null ? Number(b.odds).toFixed(1) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
