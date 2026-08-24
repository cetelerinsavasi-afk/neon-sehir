import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { placeFutbolCupBet } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import { computeLiveMatchState } from './futbolLiveMatch';
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

// FUTBOL_CUP_ROUND_MATCH_COUNTS — her turun kaç maçtan oluştuğu (16 takımlık
// SABİT tek eleme braketi: 8 → 4 → 2 → 1, bkz. functions/index.js
// createFutbolCupForSeason — "1. ve 2. Lig'in TÜM takımlarını (8+8=16)").
// Bir sonraki tur henüz oluşturulmamışken bile (bir önceki tur bitmedi)
// "Maç Fikstürü" sekmesinde doğru sayıda "?" yer tutucu maç gösterebilmek
// için kullanılıyor — bkz. FutbolLigler.jsx.
export const FUTBOL_CUP_ROUND_MATCH_COUNTS = {
  ROUND_OF_16: 8,
  QUARTER_FINAL: 4,
  SEMI_FINAL: 2,
  FINAL: 1,
};

// FUTBOL_CUP_TRIGGER_AFTER_ROUND — functions/index.js'teki AYNI isimli
// sabitin istemci tarafı ikizi: 1. Lig'in round'u hangi değere ULAŞTIĞINDA
// (o günün ERTESİ günü) bir kupa turu oynanıyor. KULLANICI İSTEĞİ: "kupa
// maçları fikstürün doğru yerinde olsun en altta değil" — "Maç Fikstürü"
// sekmesinde kupa turlarını, onu tetikleyen lig gününün HEMEN ALTINA
// (bir sonraki lig gününden önce) yerleştirmek için kullanılıyor. Sunucudaki
// sabit değişirse burası da elle güncellenmeli.
export const FUTBOL_CUP_TRIGGER_AFTER_ROUND = {
  3: 'ROUND_OF_16',
  6: 'QUARTER_FINAL',
  9: 'SEMI_FINAL',
  12: 'FINAL',
};

const STAKE_QUICK_AMOUNTS = [10, 100, 1000, 10000];
export const PICK_LABELS = { home: 'Ev Sahibi', away: 'Deplasman' };

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
// KULLANICI İSTEĞİ: "lig maçlarının yanında 'izle' butonu var kupa
// maçlarında yok" — MatchList'teki (FutbolLigler.jsx) lig maçı satırı İLE
// AYNI "İzle" butonu artık burada da var; satırın tamamı zaten tıklanabilir
// olsa da (onClick), görsel olarak lig maçlarıyla tutarlı olması için
// eklendi. e.stopPropagation() gereksiz çift tetiklemeyi önlüyor (satırın
// kendi onClick'i zaten aynı işi yapıyor).
//
// KULLANICI İSTEĞİ ("kupa maçlarında saat emojisi var, maçı izlemeden
// sonucu göremiyoruz ... kupa maçıyla alakalı her şeyi neden lig
// maçlarından farklı yapmak zorunda hissediyorsun"): kupa maçı dokümanı
// (futbolCupMatches) lig maçıyla (futbolMatches) BİREBİR AYNI canlı
// simülasyon alanlarını taşıyor (status/matchStartAt/revealAt/timeline —
// bkz. functions/index.js computeFutbolCupMatchLive), yani computeLiveMatchState
// (futbolLiveMatch.js) kupa maçında da AYNI şekilde çalışır. Eskiden burada
// bu hesap YAPILMIYORDU, canlıyken sadece sabit bir '⏱' basılıyordu —
// MatchList (lig maçı satırı) İLE AYNI mantığa geçildi: `now` prop'u
// (bkz. useNowTick) parent'tan geliyor, skor canlı ilerliyor.
export function CupMatchRow({ match, onSelect, now }) {
  const state = computeLiveMatchState(match, now);
  const played = state.phase === 'finished';
  const isLive = state.phase === 'live';
  const winnerIsHome = match.winnerTeamId === match.homeTeamId;
  let scoreText = 'vs';
  if (played) {
    scoreText = `${match.homeScore} - ${match.awayScore}`;
  } else if (isLive) {
    scoreText = `${state.homeScore} - ${state.awayScore}`;
  }
  return (
    <div className="futbol-cup-match-wrap">
      <div className="futbol-match-row futbol-match-row-clickable" onClick={() => onSelect?.(match)}>
        <span className={`futbol-match-team ${played && winnerIsHome ? 'futbol-cup-winner' : ''}`}>
          {match.homeTeamName}
          <FutbolCrest logo={match.homeLogo} initials={match.homeTeamName?.[0]} size={18} />
        </span>
        <span className={`futbol-match-score ${isLive ? 'live' : ''}`}>
          {isLive && <span className="futbol-live-dot" />}
          {scoreText}
        </span>
        <span className={`futbol-match-team futbol-match-team-away ${played && !winnerIsHome ? 'futbol-cup-winner' : ''}`}>
          <FutbolCrest logo={match.awayLogo} initials={match.awayTeamName?.[0]} size={18} />
          {match.awayTeamName}
        </span>
        <button
          type="button"
          className="futbol-match-watch-btn"
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(match);
          }}
        >
          {isLive ? '🔴 İzle' : 'İzle'}
        </button>
      </div>
      {match.penalty && (
        <p className="futbol-cup-penalty-note">
          Penaltılar: {match.penalty.homeScore}-{match.penalty.awayScore}
        </p>
      )}
    </div>
  );
}

// CupPlaceholderMatchRow — bir sonraki kupa turunun maçları henüz
// oluşturulmadıysa (bir önceki tur henüz bitmediyse) "Maç Fikstürü"
// sekmesinde kullanılan yer tutucu satır — KULLANICI İSTEĞİ: "bi sonraki
// turda '?' şeklinde karşılıklı ... takım bulunsun ... üst tura çıkanlar
// belli olduğunda '?' bunlar hangi takımsa ona dönüşsün". Gerçek maç
// oluşur oluşmaz (advanceFutbolCupToNextRound) bu satırın yerini otomatik
// olarak gerçek CupMatchRow alır — bkz. FutbolLigler.jsx'teki kullanım.
export function CupPlaceholderMatchRow() {
  return (
    <div className="futbol-cup-match-wrap">
      <div className="futbol-match-row futbol-cup-match-placeholder">
        <span className="futbol-match-team futbol-cup-placeholder-team">?</span>
        <span className="futbol-match-score">vs</span>
        <span className="futbol-match-team futbol-match-team-away futbol-cup-placeholder-team">?</span>
      </div>
    </div>
  );
}

// FutbolCupBetting — kupa iddaası (çoklu maç kuponu). KULLANICI İSTEĞİ:
// "kupa maçlarının kuponları da lig maçlarının kuponlarından bağımsız bi
// panelde duruyor bu da çok saçma" — bu bileşen artık SADECE kupon YAPMA
// panelini basıyor (geçmiş burada YOK, bkz. FutbolIddaa.jsx'teki AYNI
// gerekçe); lig VE kupa kuponlarının geçmişi FutbolLigler.jsx'te TEK bir
// birleşik listede gösteriliyor. `cup`/`matches` bkz. useFutbolCup.
export default function FutbolCupBetting({ cup, matches }) {
  const { user } = useAuth();
  const [selections, setSelections] = useState([]); // [{ matchId, pick, odds }]
  const [stake, setStake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!cup || cup.status === 'DONE') return null;

  const currentRoundMatches = matches.filter((m) => m.round === cup.status);
  const bettableMatches = currentRoundMatches.filter((m) => m.status === 'scheduled' && m.oddsHome && m.oddsAway);

  // KULLANICI İSTEĞİ: "iddaa kuponu yapma panelini en üstte alıp ... 'son 16
  // turunda istediğin...' yazısını ... kaldırmamız gerekiyor. yani lig
  // maçlarında nasıl kupon yapma paneli en üsteyse bunda da aynı olmalı" —
  // FutbolIddaa'daki (lig iddaası) İLE AYNI davranış: bahis açık değilken
  // (kupa turu henüz oynanacak günde değilken) hiçbir "yarın gel" tarzı ölü
  // metin göstermiyoruz, bileşen sadece bahis gerçekten açıkken (bettable
  // maç varsa) bir şey basıyor.
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
    </div>
  );
}
