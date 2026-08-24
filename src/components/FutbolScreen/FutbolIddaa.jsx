import { useMemo, useState } from 'react';
import { placeFutbolBet } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './FutbolIddaa.css';

// STATUS_LABELS/PICK_LABELS/betSelections — dışa açık: KULLANICI İSTEĞİ
// ("kupa maçlarının kuponları da lig maçlarının kuponlarından bağımsız bi
// panelde duruyor bu da çok saçma") üzerine kupon GEÇMİŞİ artık burada
// DEĞİL, FutbolLigler.jsx'te lig + kupa kuponlarını TEK bir listede
// birleştiren ortak bir bölümde gösteriliyor — o birleştirme kodu bu
// sabit/fonksiyonları (kupa tarafının cupBetSelections'ıyla AYNI mantık)
// tekrar yazmasın diye buradan import ediyor.
export const STATUS_LABELS = { pending: 'Beklemede', won: 'Kazandı', lost: 'Kaybetti' };
export const PICK_LABELS = { home: 'Ev Sahibi', draw: 'Beraberlik', away: 'Deplasman' };
const STAKE_QUICK_AMOUNTS = [10, 100, 1000, 10000];

// betSelections — bir kupon dokümanının seçim listesini normalize eder.
// KULLANICI REVİZESİ (Çoklu Maç Kuponu): kupon artık İSTEĞE BAĞLI olarak
// birden fazla maç içerebiliyor (bet.selections dizisi, her biri {matchId,
// pick, odds}). Öncesindeki "TEK maça bahis" döneminden kalan eski kupon
// dokümanları hâlâ tekil bet.matchId/bet.pick/bet.odds alanlarına sahip —
// geçmiş listesi bozulmasın diye bunları da tek elemanlı bir seçim
// dizisine çeviriyoruz.
export function betSelections(bet) {
  if (Array.isArray(bet.selections) && bet.selections.length > 0) return bet.selections;
  if (bet.matchId) return [{ matchId: bet.matchId, pick: bet.pick, odds: bet.odds }];
  return [];
}

// FutbolIddaa — KULLANICI REVİZESİ (Çoklu Maç Kuponu): oyuncu artık
// istediği TEK bir maça da bahis yapabilir, istediği kadar (hatta günün
// TÜM) maçını da aynı kupona ekleyebilir. Her maçın 1/X/2 seçeneğinin
// kendi (o gece 00:00'da hesaplanıp dondurulmuş) gerçek oranı var — bkz.
// m.oddsHome/oddsDraw/oddsAway. Kupona eklenen her maçın oranı birbiriyle
// ÇARPILIR: ne kadar çok maç eklenirse kupon oranı o kadar yükselir. Kupon
// tutması için SEÇİLEN TÜM maçların tahmini doğru çıkmalı — tek bir maç
// bile yanlış çıkarsa kupon tamamen yanar (klasik "kombine kupon" mantığı).
// KULLANICI İSTEĞİ: "kupa maçlarının kuponları da lig maçlarının
// kuponlarından bağımsız bi panelde duruyor bu da çok saçma" — bu bileşen
// artık SADECE kupon YAPMA panelini basıyor (geçmiş burada YOK); lig VE
// kupa kuponlarının geçmişi FutbolLigler.jsx'te TEK bir birleşik listede
// gösteriliyor, iki ayrı "Kupon Geçmişin" kutusu göstermek yerine.
export default function FutbolIddaa({ matches, allMatches, teamNameById, teamById }) {
  const [selections, setSelections] = useState([]); // [{ matchId, pick, odds }]
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

  const pickForMatch = (matchId) => selections.find((s) => s.matchId === matchId)?.pick || null;

  const selectPick = (match, pick) => {
    const odds = pick === 'home' ? match.oddsHome : pick === 'away' ? match.oddsAway : match.oddsDraw;
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

  const combinedOdds = useMemo(
    () => selections.reduce((acc, s) => acc * s.odds, 1),
    [selections]
  );
  const potentialPayout = selections.length > 0 && stake > 0 ? Math.round(stake * combinedOdds) : 0;

  const handleSubmit = async () => {
    if (selections.length === 0 || stake <= 0) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await placeFutbolBet(
        selections.map(({ matchId, pick }) => ({ matchId, pick })),
        stake
      );
      const finalOdds = res?.data?.odds ?? combinedOdds;
      const finalPayout = res?.data?.potentialPayout ?? potentialPayout;
      setSuccess(
        `Kuponun oynandı! ${selections.length} maçlık kupon, oran ${Number(finalOdds).toFixed(2)} — tutarsa ${finalPayout.toLocaleString('tr-TR')} altın kazanırsın. İyi şanslar!`
      );
      setSelections([]);
      setStake(0);
    } catch (err) {
      setError(err?.message || 'Kupon oynanamadı.');
    } finally {
      setBusy(false);
    }
  };

  // KULLANICI İSTEĞİ: "kupon yapma panelini en üstte alıp ... yazısını
  // kaldırmamız gerekiyor" — bahis açık olmadığında (maç yok / oranlar
  // henüz hesaplanmadı) eskiden burada "yarın tekrar gel" gibi ölü bir
  // metin duruyordu; artık bahis açık değilse bu bileşen hiçbir şey
  // basmıyor (FutbolCupBetting'teki AYNI kural).
  if (bettableMatches.length === 0) return null;

  return (
    <div className="futbol-iddaa">
      <p className="futbol-placeholder">
            🎟️ İstediğin maça (1 tanesine ya da hepsine) bahis yap — kupona kaç maç eklersen oran o
            kadar yükselir, çünkü seçtiğin maçların oranları birbiriyle çarpılır. Oranlar her gece
            00:00'da belirlenir ve gün boyunca değişmez. Kuponun tutması için EKLEDİĞİN TÜM maçların
            tahmini doğru çıkmalı; tutarsa <strong>yatırdığın altın × toplam oran</strong> kadar
            kazanırsın, tutmazsa yatırdığın altın gider.
          </p>
          <div className="futbol-iddaa-matches">
            {bettableMatches.map((m) => {
              const homeName = teamNameById[m.homeTeamId] || '—';
              const awayName = teamNameById[m.awayTeamId] || '—';
              const activePick = pickForMatch(m.id);
              return (
                <div key={m.id} className="futbol-iddaa-triple">
                  <button
                    className={`futbol-iddaa-side ${activePick === 'home' ? 'active' : ''}`}
                    onClick={() => selectPick(m, 'home')}
                  >
                    <FutbolCrest logo={teamById[m.homeTeamId]?.logo} initials={homeName[0]} size={26} />
                    <span>{homeName}</span>
                    <span className="futbol-iddaa-odds">{m.oddsHome.toFixed(1)}</span>
                  </button>
                  <button
                    className={`futbol-iddaa-draw ${activePick === 'draw' ? 'active' : ''}`}
                    onClick={() => selectPick(m, 'draw')}
                  >
                    <span>X</span>
                    <span className="futbol-iddaa-odds">{(m.oddsDraw || 2.5).toFixed(1)}</span>
                  </button>
                  <button
                    className={`futbol-iddaa-side ${activePick === 'away' ? 'active' : ''}`}
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
                  const m = matchById[s.matchId];
                  const homeName = m ? teamNameById[m.homeTeamId] || '—' : '—';
                  const awayName = m ? teamNameById[m.awayTeamId] || '—' : '—';
                  return (
                    <div key={s.matchId} className="futbol-iddaa-coupon-row">
                      <span className="futbol-iddaa-coupon-teams">
                        {homeName} - {awayName}
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
    </div>
  );
}
