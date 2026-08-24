import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useFutbolLeagues } from '../../hooks/useFutbolLeagues';
import { useFutbolTeams } from '../../hooks/useFutbolTeams';
import { useFutbolMatches } from '../../hooks/useFutbolMatches';
import { useFutbolSeasonState } from '../../hooks/useFutbolSeasonState';
import { useFutbolCup } from '../../hooks/useFutbolCup';
import { useMyFutbolCupBets } from '../../hooks/useMyFutbolCupBets';
import { useMyFutbolBets } from '../../hooks/useMyFutbolBets';
import { seedFutbolWorld } from '../../services/gameActions';
import { useNowTick, computeLiveMatchState, pickFutbolDisplayRound, istanbulDateKey } from './futbolLiveMatch';
import FutbolMatchDetail from './FutbolMatchDetail';
import FutbolCrest from './FutbolCrest';
import FutbolIddaa, { betSelections, STATUS_LABELS, PICK_LABELS } from './FutbolIddaa';
import FutbolKulupler from './FutbolKulupler';
import FutbolTeamDetail from './FutbolTeamDetail';
import FutbolKupa from './FutbolKupa';
import FutbolCupBetting, {
  ROUND_LABELS,
  CupMatchRow,
  CupPlaceholderMatchRow,
  FUTBOL_CUP_ROUND_MATCH_COUNTS,
  FUTBOL_CUP_TRIGGER_AFTER_ROUND,
  cupBetSelections,
} from './FutbolCupBetting';
import FutbolSeasonCelebration from './FutbolSeasonCelebration';
import './FutbolLigler.css';

const SUB_TABS = [
  { id: 'maclar', label: 'Maçlar' },
  { id: 'puan', label: 'Puan Tablosu' },
  { id: 'fikstur', label: 'Maç Fikstürü' },
  { id: 'kulupler', label: 'Kulüpler' },
  { id: 'iddaa', label: 'İddaa Bayii' },
  { id: 'kupa', label: 'Kupa' },
];

export default function FutbolLigler() {
  const { leagues, loading: leaguesLoading } = useFutbolLeagues();
  const { state: seasonState } = useFutbolSeasonState();
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const [subTab, setSubTab] = useState('puan');
  const [selectedMatch, setSelectedMatch] = useState(null);
  // selectedCupMatch — CupMatchRow'dan (Maçlar/Fikstür sekmelerindeki
  // bugünkü/geçmiş kupa maçları) tıklanan kupa maçının detayını FutbolKupa.jsx
  // İLE AYNI FutbolMatchDetail bileşeninde açmak için AYRI bir state — lig
  // maçlarındaki selectedMatch'ten farklı, çünkü kupa maçı dokümanı takım
  // adını/logosunu zaten kendi üzerinde taşıyor (teamNameById lookup gerekmiyor).
  const [selectedCupMatch, setSelectedCupMatch] = useState(null);
  // selectedCupMatchHomeSponsor — KULLANICI İSTEĞİ: "kupa maçıyla alakalı
  // her şeyi neden lig maçlarından farklı yapmak zorunda hissediyorsun" —
  // lig maçı detayında (aşağıda) sponsor reklam banner'ı zaten aktif
  // ligin `teamById`'ından geliyor; kupa maçının ev sahibi takımı FARKLI
  // bir ligden (tier 1/2) olabileceği için `teamById`'da olmayabilir —
  // FutbolKupa.jsx'teki (Kupa sekmesi) AYNI tek seferlik getDoc deseniyle
  // burada da (Maçlar/Fikstür sekmelerinden açılan kupa maçı detayında)
  // sponsor bilgisi ayrıca çekiliyor.
  const [selectedCupMatchHomeSponsor, setSelectedCupMatchHomeSponsor] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const now = useNowTick(5000);
  const cupSeason = leagues.find((l) => l.tier === 1)?.season || null;
  // cup/cupMatches/myCupBets — KULLANICI İSTEĞİ: "kupa maçları sadece kupa
  // sekmesine has bi şey olmasın" — "Maçlar"/"Maç Fikstürü"/"İddaa Bayii"
  // sekmelerinde de kupa maçlarını gösterebilmek için kupa verisi artık
  // burada (Kupa sekmesine girmeden) da dinleniyor.
  const { cup, matches: cupMatches } = useFutbolCup(cupSeason);
  const { bets: myCupBets } = useMyFutbolCupBets(cupSeason);

  const activeLeague = leagues.find((l) => l.id === selectedLeagueId) || leagues[0] || null;
  const activeLeagueId = activeLeague?.id || null;
  const { teams } = useFutbolTeams(activeLeagueId);
  const { matches } = useFutbolMatches(activeLeagueId, activeLeague?.season || 1);
  // myBets — KULLANICI İSTEĞİ: "kupa maçlarının kuponları da lig
  // maçlarının kuponlarından bağımsız bi panelde duruyor bu da çok saçma"
  // — lig kuponu geçmişi eskiden FutbolIddaa.jsx İÇİNDE tutuluyordu (kendi
  // "Kupon Geçmişin" kutusu); artık burada (ebeveynde) okunuyor ki aşağıda
  // kupa kuponlarıyla TEK bir birleşik listede gösterilebilsin.
  const { bets: myBets } = useMyFutbolBets(activeLeagueId);

  // Futbol dünyası boşsa (ilk hiç kimse açmadıysa) sessizce, otomatik
  // olarak oluşturulur — admin/buton gerekmez, seedFutbolWorld idempotent.
  useEffect(() => {
    if (!leaguesLoading && leagues.length === 0) {
      seedFutbolWorld().catch(() => {});
    }
  }, [leaguesLoading, leagues.length]);

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

  // matchById — FutbolIddaa.jsx'in İÇİNDE aynı isimle tuttuğu haritanın
  // AYNISI, birleşik kupon geçmişini (aşağıda combinedBetHistory) kurarken
  // lig kuponundaki maç seçimlerini (matchId → takım adı/skor) çözmek için.
  const matchById = useMemo(() => {
    const map = {};
    matches.forEach((m) => (map[m.id] = m));
    return map;
  }, [matches]);

  // combinedBetHistory — KULLANICI İSTEĞİ: "kupa maçlarının kuponları da
  // lig maçlarının kuponlarından bağımsız bi panelde duruyor bu da çok
  // saçma" — lig kuponları (myBets) ile kupa kuponları (myCupBets) ARTIK
  // burada TEK bir listeye birleştirilip (en yeni üstte) TEK bir "Kupon
  // Geçmişin" kutusunda gösteriliyor; iki ayrı "Kupon Geçmişin"/"Kupa
  // Kupon Geçmişin" kutusu YOK. Her girdi normalize edilmiş bir şekle
  // dönüştürülüyor (roundLabel/picks) ki tek bir render kodu ikisini de
  // basabilsin.
  const combinedBetHistory = useMemo(() => {
    const leagueEntries = myBets.map((b) => ({
      id: `league-${b.id}`,
      roundLabel: `${b.round}. Gün`,
      stake: b.stake,
      status: b.status,
      payout: b.payout || 0,
      potentialPayout: b.potentialPayout,
      odds: b.odds,
      placedAt: b.placedAt,
      picks: betSelections(b).map((p) => {
        const match = matchById[p.matchId];
        const homeName = match ? teamNameById[match.homeTeamId] || '—' : '—';
        const awayName = match ? teamNameById[match.awayTeamId] || '—' : '—';
        let correctness = '';
        if (match?.status === 'finished' && match.homeScore != null && match.awayScore != null) {
          const actual =
            match.homeScore === match.awayScore ? 'draw' : match.homeScore > match.awayScore ? 'home' : 'away';
          correctness = actual === p.pick ? 'correct' : 'wrong';
        }
        return { homeName, awayName, pickLabel: PICK_LABELS[p.pick] || p.pick, odds: p.odds, correctness };
      }),
    }));
    const cupEntries = myCupBets.map((b) => ({
      id: `cup-${b.id}`,
      roundLabel: `🏆 ${ROUND_LABELS[b.round] || b.round}`,
      stake: b.stake,
      status: b.status,
      payout: b.payout || 0,
      potentialPayout: b.potentialPayout,
      odds: b.odds,
      placedAt: b.placedAt,
      // Kupa maçında beraberlik yok — eşitlik penaltılara gidip
      // winnerTeamId'yi belirliyor (bkz. functions/index.js
      // futbolCupMatchOutcome), skor karşılaştırması değil bu kullanılıyor.
      picks: cupBetSelections(b).map((p) => {
        const match = cupMatches.find((m) => m.id === p.matchId);
        let correctness = '';
        if (match?.status === 'finished' && match.winnerTeamId) {
          const outcome = match.winnerTeamId === match.homeTeamId ? 'home' : 'away';
          correctness = outcome === p.pick ? 'correct' : 'wrong';
        }
        return {
          homeName: match?.homeTeamName || '—',
          awayName: match?.awayTeamName || '—',
          pickLabel: PICK_LABELS[p.pick] || p.pick,
          odds: p.odds,
          correctness,
        };
      }),
    }));
    return [...leagueEntries, ...cupEntries].sort(
      (a, b) => (b.placedAt?.toMillis?.() || 0) - (a.placedAt?.toMillis?.() || 0)
    );
  }, [myBets, myCupBets, matchById, teamNameById, cupMatches]);

  // cupRoundsGrouped/todaysCupMatches — KULLANICI İSTEĞİ: kupa maçları
  // "Maçlar"/"Maç Fikstürü" sekmelerinde de görünsün. cupMatches TÜM kupa
  // sezonunu içeriyor (bkz. useFutbolCup) — tura göre gruplanır, "bugünkü"
  // kupa maçları ise sezon durumunun (futbolSeasonState) bekleyen turu
  // (pendingCupRound) ile belirlenir.
  const cupRoundsGrouped = useMemo(() => {
    const map = {};
    cupMatches.forEach((m) => {
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => (a.slot || 0) - (b.slot || 0)));
    return map;
  }, [cupMatches]);
  const todaysCupMatches =
    seasonState.status === 'CUP_DAY' && seasonState.pendingCupRound
      ? cupRoundsGrouped[seasonState.pendingCupRound] || []
      : [];

  // todaysFinishedCupMatches — KULLANICI İSTEĞİ: "kupa maçları biter
  // bitmez maçlar sekmesinde bi sonraki günün lig maçları sergilenmeye
  // başladı, normal lig maçlarında 00:00'a kadar sonuçlar sergileniyor,
  // kupada da böyle olsun" — BUG: 19:00'da kupa turu resmileşince
  // (resolveFutbolMatchdayReveal) sezon durumu ANINDA 'LEAGUE_DAY'e
  // dönüyor (bkz. functions/index.js), yani seasonState.status === 'CUP_DAY'
  // kontrolüne dayanan yukarıdaki todaysCupMatches o an boşalıyor ve
  // "Maçlar" sekmesi hemen ertesi günün (henüz oynanmamış) lig maçlarına
  // düşüyor. Lig maçlarında bu sorun YOK çünkü pickFutbolDisplayRound
  // (futbolLiveMatch.js) sezon durumuna değil, "bugün İstanbul takviminde
  // biten bir maç var mı"ya bakıyor — gece yarısına kadar sonucu göstermeye
  // devam ediyor. Kupa tarafına da AYNI mantık: sezon durumu ne olursa
  // olsun, bugün (İstanbul takvim günü) sonuçlanmış bir kupa maçı varsa
  // gece yarısına kadar onu göstermeye devam ediyoruz.
  const todaysFinishedCupMatches = useMemo(() => {
    const todayKey = istanbulDateKey(null, now);
    return cupMatches.filter(
      (m) => m.status === 'finished' && m.playedAt && istanbulDateKey(m.playedAt, now) === todayKey
    );
  }, [cupMatches, now]);
  // showCupDayPanel — "Maçlar" sekmesinde kupa panelinin basılıp
  // basılmayacağı: kupa turu O AN canlı/oynanacaksa (CUP_DAY, eskisi gibi
  // — maç yoksa bile "Bugüne ait kupa maçı yok." mesajı için panel basılır)
  // YA DA sezon durumu zaten 'LEAGUE_DAY'e dönmüş olsa da bugün (İstanbul
  // takviminde) sonuçlanmış bir kupa turu varsa (todaysFinishedCupMatches —
  // yukarıdaki BUG notu). Aşağıdaki lig MatchList'i bunun TERSİ koşulda
  // basılıyor.
  const showCupDayPanel = seasonState.status === 'CUP_DAY' || todaysFinishedCupMatches.length > 0;
  const cupDayPanelIsLive = seasonState.status === 'CUP_DAY';
  const cupDayPanelMatches = cupDayPanelIsLive ? todaysCupMatches : todaysFinishedCupMatches;
  const cupDayPanelRound = cupDayPanelIsLive ? seasonState.pendingCupRound : todaysFinishedCupMatches[0]?.round;

  // Hangi günün gösterileceği: 18:00-19:00 arası canlı oynanan gün,
  // 19:00-24:00 arası bugün biten günün sonucu, aksi halde henüz
  // oynanmamış (bekleyen) güncel gün.
  const display = useMemo(
    () => pickFutbolDisplayRound(matches, activeLeague?.currentRound || 1, now),
    [matches, activeLeague?.currentRound, now]
  );

  // KULLANICI İSTEĞİ: "maç fikstürüne tıkladığımızda ... kupa maçlarına
  // göre bu ayarlanmadığı için şu an kupa maçından sonraki gün karşımıza
  // çıkıyor" — BUG: display.round SADECE lig turlarını bilir
  // (pickFutbolDisplayRound). Bir kupa gününde league.currentRound zaten
  // BİR GÜN ÖNCEDEN (dünkü 19:00 reveal'inde) bir sonraki lig turuna
  // artırılmış oluyor (çünkü lig turu artırma İLE kupa tetikleme AYNI
  // reveal'de, ama BAĞIMSIZ çalışıyor — bkz. functions/index.js
  // resolveFutbolMatchdayReveal) — yani kupa gününün KENDİSİNDE
  // display.round zaten "yarının" (kupadan SONRAKİ) lig turunu gösteriyor.
  // Düzeltme: bugün kupa günüyse, hedefi o kupa turunu tetikleyen lig
  // gününe (FUTBOL_CUP_TRIGGER_AFTER_ROUND'da pendingCupRound'a karşılık
  // gelen anahtar) çekiyoruz — o günün ref'i zaten hemen altında kupa
  // turunu da içeriyor (bkz. aşağıdaki fikstür render'ı).
  const cupDayFixtureAnchorRound = useMemo(() => {
    if (seasonState.status !== 'CUP_DAY' || !seasonState.pendingCupRound) return null;
    const entry = Object.entries(FUTBOL_CUP_TRIGGER_AFTER_ROUND).find(
      ([, cupRound]) => cupRound === seasonState.pendingCupRound
    );
    return entry ? Number(entry[0]) : null;
  }, [seasonState.status, seasonState.pendingCupRound]);

  // Kullanıcı isteği: "Maç Fikstürü" sekmesine girildiğinde ilk turdan
  // değil, bugünün gününden başlanmalı — yukarı çekince eski maçlar,
  // aşağı çekince yeni maçlar görülebilmeli. Liste zaten 1'den 14'e sıralı
  // basılıyor (değiştirmiyoruz), sadece açılışta bugünün turuna kaydırıyoruz.
  const fixtureRoundRefs = useRef({});
  useEffect(() => {
    if (subTab !== 'fikstur') return;
    const targetRound = cupDayFixtureAnchorRound ?? display.round;
    const target = fixtureRoundRefs.current[targetRound];
    if (target) {
      // rAF: liste DOM'a yeni basıldıysa (sekme az önce açıldıysa) bir
      // çerçeve bekleyip öyle kaydırmak, ölçümün doğru alınmasını sağlıyor.
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'center' });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, display.round, cupDayFixtureAnchorRound, activeLeagueId]);

  useEffect(() => {
    if (!selectedCupMatch?.homeTeamId) {
      setSelectedCupMatchHomeSponsor(null);
      return undefined;
    }
    let cancelled = false;
    getDoc(doc(db, 'futbolTeams', selectedCupMatch.homeTeamId))
      .then((snap) => {
        if (!cancelled) setSelectedCupMatchHomeSponsor(snap.exists() ? snap.data().sponsorFactoryName || null : null);
      })
      .catch(() => {
        if (!cancelled) setSelectedCupMatchHomeSponsor(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCupMatch?.homeTeamId]);

  if (leaguesLoading || leagues.length === 0) {
    return <p className="futbol-placeholder">Yükleniyor...</p>;
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

      {subTab === 'puan' && <StandingsTable teams={teams} onSelectTeam={setSelectedTeamId} />}

      {subTab === 'maclar' && seasonState.status === 'CELEBRATION_DAY' && <FutbolSeasonCelebration />}

      {/* KULLANICI İSTEĞİ: "bugün kupa maçı varsa maçlar sekmesinde kupa
          maçları gözüksün" — eskiden burada sadece "Kupa sekmesine bak"
          diyen bir banner vardı, lig maçları da (henüz oynanmamış halde)
          altında gösteriliyordu; artık CUP_DAY'de lig yerine DOĞRUDAN
          bugünün kupa maçları listeleniyor.
          KULLANICI İSTEĞİ (devamı): "kupa maçları biter bitmez maçlar
          sekmesinde bi sonraki günün lig maçları sergilenmeye başladı,
          normal lig maçlarında 00:00'a kadar sonuçlar sergileniyor, kupada
          da böyle olsun" — bu panel artık SADECE canlı/oynanacak kupa
          gününde (CUP_DAY) değil, sezon durumu 19:00'da 'LEAGUE_DAY'e
          dönmüş olsa bile bugün (İstanbul takviminde) sonuçlanmış bir kupa
          turu varsa da (todaysFinishedCupMatches) basılıyor — lig
          maçlarındaki "gece yarısına kadar sonuç göster" davranışıyla
          birebir aynı. */}
      {subTab === 'maclar' && showCupDayPanel && (
        <div className="futbol-match-round">
          <p className="futbol-match-round-title">
            {cupDayPanelIsLive ? '🏆 Bugün Neon Kupası Günü — ' : '🏆 Neon Kupası Sonuçları — '}
            {ROUND_LABELS[cupDayPanelRound] || cupDayPanelRound}
          </p>
          {cupDayPanelMatches.length === 0 && <p className="futbol-placeholder">Bugüne ait kupa maçı yok.</p>}
          {cupDayPanelMatches.map((m) => (
            <CupMatchRow key={m.id} match={m} onSelect={setSelectedCupMatch} now={now} />
          ))}
          <p className="futbol-placeholder futbol-cup-day-banner">
            Lig maçları yarın kaldığı yerden devam edecek. Kupa eşleşme ağacı için "Kupa" sekmesine bak.
          </p>
        </div>
      )}

      {subTab === 'maclar' && seasonState.status !== 'CELEBRATION_DAY' && !showCupDayPanel && (
        <MatchList
          title={
            display.mode === 'live'
              ? `${display.round}. Gün — Canlı`
              : display.mode === 'finished'
                ? `${display.round}. Gün — Sonuçlar`
                : `${display.round}. Gün`
          }
          matches={roundsGrouped[display.round] || []}
          teamNameById={teamNameById}
          teamById={teamById}
          onSelectMatch={setSelectedMatch}
          now={now}
        />
      )}

      {subTab === 'fikstur' && (
        <div className="futbol-fixture-list">
          {Object.keys(roundsGrouped)
            .map(Number)
            .sort((a, b) => a - b)
            .map((round) => {
              // KULLANICI İSTEĞİ: "kupa maçları fikstürün doğru yerinde
              // olsun en altta değil ... mesela ilk 16 takım 3. ve 4. günün
              // arasında bulunsun". Kupa turu, onu tetikleyen lig gününün
              // (bkz. functions/index.js FUTBOL_CUP_TRIGGER_AFTER_ROUND)
              // HEMEN ALTINA, bir sonraki lig gününden ÖNCE yerleştiriliyor.
              const cupRoundAfterThis = FUTBOL_CUP_TRIGGER_AFTER_ROUND[round];
              const cupRoundMatches = cupRoundAfterThis ? cupRoundsGrouped[cupRoundAfterThis] || [] : [];
              return (
                <div key={round} ref={(el) => { fixtureRoundRefs.current[round] = el; }}>
                  <MatchList
                    title={`${round}. Gün`}
                    matches={roundsGrouped[round]}
                    teamNameById={teamNameById}
                    teamById={teamById}
                    onSelectMatch={setSelectedMatch}
                    now={now}
                    compact
                  />
                  {/* `cup` yoksa (bu sezon için kupa hiç kurulmadıysa) hiçbir
                      şey gösterilmez. Kupa varsa ama bu turun maçları henüz
                      OLUŞTURULMADIYSA (bir önceki tur bitmedi) — KULLANICI
                      İSTEĞİ: "bi sonraki turda '?' şeklinde karşılıklı ...
                      takım bulunsun, üst tura çıkanlar belli olduğunda '?'
                      bunlar hangi takımsa ona dönüşsün" — doğru sayıda (bkz.
                      FUTBOL_CUP_ROUND_MATCH_COUNTS) yer tutucu "?" satırı
                      basılır; gerçek maçlar oluşunca (advanceFutbolCupToNextRound)
                      cupRoundsGrouped dolar ve yer tutucuların yerini otomatik
                      olarak gerçek CupMatchRow'lar alır. */}
                  {cup && cupRoundAfterThis && (
                    <div className="futbol-match-round compact futbol-cup-fixture-round">
                      <p className="futbol-match-round-title futbol-cup-fixture-title">
                        🏆 {ROUND_LABELS[cupRoundAfterThis]}
                      </p>
                      {cupRoundMatches.length > 0
                        ? cupRoundMatches.map((m) => (
                            <CupMatchRow key={m.id} match={m} onSelect={setSelectedCupMatch} now={now} />
                          ))
                        : Array.from({ length: FUTBOL_CUP_ROUND_MATCH_COUNTS[cupRoundAfterThis] || 0 }).map(
                            (_, i) => <CupPlaceholderMatchRow key={i} />
                          )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {subTab === 'kulupler' && <FutbolKulupler leagueId={activeLeagueId} />}

      {subTab === 'iddaa' && (
        <>
          {/* KULLANICI İSTEĞİ: "kupon yapma paneli en üstte olmalı, geçmiş
              kuponlar altta" + "kupa maçlarının kuponları da lig
              maçlarının kuponlarından bağımsız bi panelde duruyor bu da çok
              saçma" — o an bahis açık olan taraf (ör. bugün kupa günüyse
              kupa paneli, tam tersiyse lig paneli — ikisi AYNI anda hiç
              açık olmuyor, bkz. FutbolIddaa/FutbolCupBetting'teki bettable
              kontrolü) tek başına en üstte gösteriliyor; diğeri o an
              bettable maçı yoksa hiçbir şey basmıyor. Kupon GEÇMİŞİ ise
              (aşağıda, combinedBetHistory) lig ve kupa AYRIMI olmadan TEK
              bir listede, en altta. */}
          <FutbolIddaa
            matches={roundsGrouped[activeLeague?.currentRound || 1] || []}
            allMatches={matches}
            teamNameById={teamNameById}
            teamById={teamById}
          />
          <FutbolCupBetting cup={cup} matches={cupMatches} />

          {combinedBetHistory.length > 0 && (
            <div className="futbol-iddaa">
              <div className="futbol-iddaa-history">
                <p className="futbol-kadro-section-title">Kupon Geçmişin</p>
                {combinedBetHistory.map((b) => (
                  <div key={b.id} className={`futbol-iddaa-history-card status-${b.status}`}>
                    <div className="futbol-iddaa-history-row">
                      <span>{b.roundLabel}</span>
                      <span>{(b.stake || 0).toLocaleString('tr-TR')} altın</span>
                      <span>{STATUS_LABELS[b.status] || b.status}</span>
                      {b.status === 'won' && <span>+{(b.payout || 0).toLocaleString('tr-TR')}</span>}
                      {b.status === 'pending' && b.potentialPayout != null && (
                        <span>→ {b.potentialPayout.toLocaleString('tr-TR')}</span>
                      )}
                    </div>
                    <div className="futbol-iddaa-history-picks">
                      {b.picks.map((p, i) => (
                        <div key={i} className={`futbol-iddaa-history-pick ${p.correctness}`}>
                          <span className="futbol-iddaa-history-teams">
                            {p.homeName} - {p.awayName}
                          </span>
                          <span className="futbol-iddaa-history-pick-label">
                            {p.pickLabel} @ {p.odds != null ? Number(p.odds).toFixed(1) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {b.picks.length > 1 && (
                      <p className="futbol-iddaa-history-combined">
                        Toplam oran: {b.odds != null ? Number(b.odds).toFixed(2) : '—'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {subTab === 'kupa' && <FutbolKupa season={cupSeason} />}

      {selectedMatch && (
        <FutbolMatchDetail
          match={selectedMatch}
          homeName={teamNameById[selectedMatch.homeTeamId] || '—'}
          awayName={teamNameById[selectedMatch.awayTeamId] || '—'}
          homeLogo={teamById[selectedMatch.homeTeamId]?.logo}
          awayLogo={teamById[selectedMatch.awayTeamId]?.logo}
          homeSponsorName={teamById[selectedMatch.homeTeamId]?.sponsorFactoryName}
          onClose={() => setSelectedMatch(null)}
        />
      )}

      {selectedCupMatch && (
        <FutbolMatchDetail
          match={selectedCupMatch}
          homeName={selectedCupMatch.homeTeamName}
          awayName={selectedCupMatch.awayTeamName}
          homeLogo={selectedCupMatch.homeLogo}
          awayLogo={selectedCupMatch.awayLogo}
          homeSponsorName={selectedCupMatchHomeSponsor}
          onClose={() => setSelectedCupMatch(null)}
        />
      )}

      {selectedTeamId && (
        <FutbolTeamDetail teamId={selectedTeamId} onClose={() => setSelectedTeamId(null)} />
      )}
    </div>
  );
}

function StandingsTable({ teams, onSelectTeam }) {
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
            <tr
              key={t.id}
              className={`${rowClass} futbol-standings-row-clickable`}
              onClick={() => onSelectTeam?.(t.id)}
            >
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

function MatchList({ title, matches, teamNameById, teamById, compact, onSelectMatch, now }) {
  return (
    <div className={`futbol-match-round ${compact ? 'compact' : ''}`}>
      <p className="futbol-match-round-title">{title}</p>
      {matches.map((m) => {
        const state = computeLiveMatchState(m, now);
        let scoreText = 'vs';
        let isLive = false;
        if (state.phase === 'finished') {
          scoreText = `${state.homeScore} - ${state.awayScore}`;
        } else if (state.phase === 'live') {
          scoreText = `${state.homeScore} - ${state.awayScore}`;
          isLive = true;
        }
        return (
          <div
            key={m.id}
            className="futbol-match-row futbol-match-row-clickable"
            onClick={() => onSelectMatch?.(m)}
          >
            <span className="futbol-match-team">
              {teamNameById[m.homeTeamId] || '—'}
              <FutbolCrest logo={teamById[m.homeTeamId]?.logo} initials={teamNameById[m.homeTeamId]?.[0]} size={18} />
            </span>
            <span className={`futbol-match-score ${isLive ? 'live' : ''}`}>
              {isLive && <span className="futbol-live-dot" />}
              {scoreText}
            </span>
            <span className="futbol-match-team futbol-match-team-away">
              <FutbolCrest logo={teamById[m.awayTeamId]?.logo} initials={teamNameById[m.awayTeamId]?.[0]} size={18} />
              {teamNameById[m.awayTeamId] || '—'}
            </span>
            <button
              type="button"
              className="futbol-match-watch-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelectMatch?.(m);
              }}
            >
              {isLive ? '🔴 İzle' : 'İzle'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
