import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { placeFutbolCupBet } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './FutbolIddaa.css';

// FutbolCupBetting.jsx — KULLANICI İSTEĞİ: "kupa maçları sadece kupa
// sekmesine has bi şey olmasın" — kupa iddaası (çoklu maçlı kupon, bkz.
// functions/index.js placeFutbolCupBet) ile kupon geçmişi hem Kupa
// sekmesinde (FutbolKupa.jsx) HEM DE İddaa Bayii sekmesinde (FutbolLigler.jsx,
// bugün bir kupa günüyse) AYNI şekilde görünsün diye ortak bir bileşene
// çıkarıldı — iki yerde de kod tekrarı olmasın.

export const ROUND_ORDER = ['ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'];
export const ROUND_LABELS = {
  ROUND_OF_16: 'Son 16',
  QUARTER_FINAL: 'Çeyrek Final',
  SEMI_FINAL: 'Yarı Final',
  FINAL: 'Final',
};
const STAKE_QUICK_AMOUNTS = [10, 100, 1000, 10000];
const PICK_LABELS = { home: 'Ev Sahibi', away: 'Deplasman' };

// cupBetSelections — functions/index.js'teki futbolBetSelections İLE AYNI
// geriye dönük uyumluluk deseni: çoklu maçlı kupon (kullanıcı isteği)
// öncesi yapılmış eski kupa kuponlarında hâlâ tekil bet.matchId/pick/odds
// alanları var.
export function cupBetSelections(bet) {
  if (Array.isArray(bet.selections) && bet.selections.length > 0) return bet.selections;
  if (bet.matchId) return [{ matchId: bet.matchId, pick: bet.pick, odds: bet.odds }];
  return [];
}

// CupMatchRow — kupa maçı satırı (bracket'te ve "Maçlar"/"Fikstür"
// sekmelerindeki bugünkü/geçmiş kupa maçı listelerinde kullanılıyor).
export function CupMatchRow({ match, onSelect }) {
  const played = match.status === 'finished';
  const winnerIsHome = match.winnerTeamId === match.homeTeamId;
  return (
    <div className="futbol-cup-match-wrap">
      <div className="futbol-match-row futbol-match-row-clickable" onClick={() => onSelect?.(match)}>
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

// FutbolCupBetting — kupa iddaası (çoklu maç kuponu) + kupon geçmişi.
// `cup`/`matches` bkz. useFutbolCup, `myBets` bkz. useMyFutbolCupBets.
export default function FutbolCupBetting({ cup, matches, myBets }) {
  const { user } = useAuth();
  const [selections, setSelections] = useState([]); // [{ matchId, pick, odds }]
  const [stake, setStake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!cup || cup.status === 'DONE') return null;

  const currentRoundMatches = matches.filter((m) => m.round === cup.status);
  const bettableMatches = currentRoundMatches.filter((m) => m.status === 'scheduled' && m.oddsHome && m.oddsAway);
  if (bettableMatches.length === 0) return null;

  const pickForMatch = (matchId) => selections.find((s) => s.matchId === matchId)?.pick || null;

  const selectPick = (match, pick) => {
    const odds = pick === 'home' ? match.oddsHome : match.oddsAway;
    if (!odds) return;
    setSelections((prev) => {
      const idx = prev.findIndex((s) => s.matchId === match.id);
      if (idx === -1) return [...prev, { matchId: match.id, pick, odds }];
      if (prev[idx].pick === pick) return prev.filter((_, i) => i !== idx); // aynı seçime tekrar basınca kupondan çıkar
      const next = [...prev];
      next[idx] = { matchId: match.id, pick, odds };
      return next;
    });
    setSuccess('');
    setError('');
  };

  const removeSelection = (matchId) => {
    setSelections((prev) => prev.filter((s) => s.matchId !== matchId));
  };

  const combinedOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  const potentialPayout = selections.length > 0 && stake > 0 ? Math.round(stake * combinedOdds) : 0;

  const handleSubmit = async () => {
    if (selections.length === 0 || stake <= 0) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await placeFutbolCupBet(
        selections.map(({ matchId, pick }) => ({ matchId, pick })),
        stake
      );
      const finalOdds = res?.data?.odds ?? combinedOdds;
      const finalPayout = res?.data?.potentialPayout ?? potentialPayout;
      setSuccess(
        `Kupa kuponun oynandı! ${selections.length} maçlık kupon, oran ${Number(finalOdds).toFixed(2)} — tutarsa ${finalPayout.toLocaleString('tr-TR')} altın kazanırsın. İyi şanslar!`
      );
      setSelections([]);
      setStake(0);
    } catch (err) {
      setError(err?.message || 'Kupon oynanamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="futbol-iddaa futbol-cup-bet-box">
      <p className="futbol-placeholder">
        🎟️ {ROUND_LABELS[cup.status]} turunda istediğin maça (1 tanesine ya da hepsine) bahis yap — kupada
        beraberlik (X) yok, sadece 1 / 2. Kupona kaç maç eklersen oran o kadar yükselir, çünkü seçtiğin
        maçların oranları birbiriyle çarpılır. Kuponun tutması için EKLEDİĞİN TÜM maçların tahmini doğru
        çıkmalı; tutarsa <strong>yatırdığın altın × toplam oran</strong> kadar kazanırsın.
      </p>
      {!user && <p className="futbol-placeholder">Kupon oynamak için giriş yapmalısın.</p>}
      {user && (
        <>
          <div className="futbol-iddaa-matches">
            {bettableMatches.map((m) => {
              const activePick = pickForMatch(m.id);
              return (
                <div key={m.id} className="futbol-iddaa-triple futbol-cup-iddaa-pair">
                  <button
                    className={`futbol-iddaa-side ${activePick === 'home' ? 'active' : ''}`}
                    onClick={() => selectPick(m, 'home')}
                  >
                    <FutbolCrest logo={m.homeLogo} initials={m.homeTeamName?.[0]} size={26} />
                    <span>{m.homeTeamName}</span>
                    <span className="futbol-iddaa-odds">{m.oddsHome.toFixed(1)}</span>
                  </button>
                  <button
                    className={`futbol-iddaa-side ${activePick === 'away' ? 'active' : ''}`}
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
          {selections.length > 0 && (
            <div className="futbol-iddaa-stake-row">
              <div className="futbol-iddaa-coupon">
                <div className="futbol-iddaa-coupon-header">
                  <span>Kuponum ({selections.length} maç)</span>
                  <button className="futbol-iddaa-coupon-clear" onClick={() => setSelections([])}>
                    Temizle
                  </button>
                </div>
                {selections.map((s) => {
                  const m = matches.find((mm) => mm.id === s.matchId);
                  return (
                    <div key={s.matchId} className="futbol-iddaa-coupon-row">
                      <span className="futbol-iddaa-coupon-teams">
                        {m ? `${m.homeTeamName} - ${m.awayTeamName}` : '—'}
                      </span>
                      <span className="futbol-iddaa-coupon-pick">
                        {PICK_LABELS[s.pick]} @ {s.odds.toFixed(1)}
                      </span>
                      <button
                        className="futbol-iddaa-coupon-remove"
                        onClick={() => removeSelection(s.matchId)}
                        aria-label="Kupondan çıkar"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              <QuantityStepper value={stake} onChange={setStake} quickAmounts={STAKE_QUICK_AMOUNTS} />
              {stake > 0 && (
                <p className="futbol-iddaa-potential">
                  Toplam oran <strong>{combinedOdds.toFixed(2)}</strong> · Tutarsa kazanacağın:{' '}
                  <strong>{potentialPayout.toLocaleString('tr-TR')} altın</strong>
                </p>
              )}
              <button className="futbol-admin-submit" disabled={busy || stake <= 0} onClick={handleSubmit}>
                {busy ? '...' : 'Kuponu Oyna'}
              </button>
            </div>
          )}
          {error && <p className="futbol-admin-error">{error}</p>}
          {success && <p className="futbol-placeholder">{success}</p>}
        </>
      )}

      {myBets.length > 0 && (
        <div className="futbol-iddaa-history">
          <p className="futbol-kadro-section-title">Kupa Kupon Geçmişin</p>
          {myBets.map((b) => {
            const picks = cupBetSelections(b);
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
                <div className="futbol-iddaa-history-picks">
                  {picks.map((p) => {
                    const match = matches.find((m) => m.id === p.matchId);
                    return (
                      <div key={p.matchId} className="futbol-iddaa-history-pick">
                        <span className="futbol-iddaa-history-teams">
                          {match ? `${match.homeTeamName} - ${match.awayTeamName}` : '—'}
                        </span>
                        <span className="futbol-iddaa-history-pick-label">
                          {PICK_LABELS[p.pick]} @ {p.odds != null ? Number(p.odds).toFixed(1) : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {picks.length > 1 && (
                  <p className="futbol-iddaa-history-combined">
                    Toplam oran: {b.odds != null ? Number(b.odds).toFixed(2) : '—'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
