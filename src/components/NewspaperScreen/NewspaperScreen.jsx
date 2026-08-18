import { useMemo } from 'react';
import { useNewspaper } from '../../hooks/useNewspaper';
import { useLottery } from '../../hooks/useLottery';
import { useChampionshipDaily } from '../../hooks/useChampionshipDaily';
import { useNewspaperBulletin } from '../../hooks/useNewspaperBulletin';
import { useFutbolLeagues } from '../../hooks/useFutbolLeagues';
import { useFutbolTeams } from '../../hooks/useFutbolTeams';
import FutbolCrest from '../FutbolScreen/FutbolCrest';
import './NewspaperScreen.css';

const UST_CABRIO_CATALOG_ID = 10;

const HEIST_TARGET_LABELS = {
  banka: 'Banka',
  casino: 'Casino',
  araba_galerisi: 'Araba Galerisi',
  modifiye_garaji: 'Modifiye Garajı',
  fabrika: 'Fabrika',
  seyyar_satici_1: 'Bir Seyyar Satıcı',
  seyyar_satici_2: 'Bir Seyyar Satıcı',
  seyyar_satici_3: 'Bir Seyyar Satıcı',
  seyyar_satici_4: 'Bir Seyyar Satıcı',
};

const CUP_ROUND_LABELS = {
  ROUND_OF_16: 'Kupa — Son 16',
  QUARTER_FINAL: 'Kupa — Çeyrek Final',
  SEMI_FINAL: 'Kupa — Yarı Final',
  FINAL: 'Kupa — Final',
};

function todayLongDate() {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

// Basit, deterministik bir "sözde-rastgele" seçici — aynı maç için sayfa
// her yeniden çizildiğinde AYNI yorum çıksın diye Math.random yerine
// maçın kendi verisinden (isim+skor) türetilen bir sayı kullanılıyor.
function stableIndex(seed, length) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % length;
}

// footballComment — maç sonucuna göre temel yorum. `context` (opsiyonel):
// { winnerRank, loserRank, teamCount } — VERİLDİYSE (yani gerçek puan
// tablosu sırası biliniyorsa) zirve yarışı / düşme hattı / büyük sürpriz
// gibi ek cümleler de eklenir. Hiçbir veri UYDURULMUYOR — sadece mevcut
// skor ve (varsa) gerçek lig sıralaması kullanılıyor.
function footballComment(homeName, awayName, homeScore, awayScore, context) {
  const diff = Math.abs(homeScore - awayScore);
  const seed = `${homeName}${awayName}${homeScore}${awayScore}`;
  if (homeScore === awayScore) {
    const opts =
      homeScore === 0
        ? ['Golsüz geçen mücadelede iki takım da bir puanla yetindi.', 'Kaleler bu maçta gol görmedi, taraflar sahadan berabere ayrıldı.']
        : ['Golcü bir mücadelede taraflar puanları paylaştı.', 'Karşılıklı gollerle geçen maç berabere sonuçlandı.'];
    return opts[stableIndex(seed, opts.length)];
  }
  const winner = homeScore > awayScore ? homeName : awayName;
  const loser = homeScore > awayScore ? awayName : homeName;

  // Gerçek sıralama bilgisi varsa: alt sıradaki takım üst sıradaki
  // favoriyi yendiyse bu her zaman "beklenmedik sonuç" olarak işlenir —
  // kullanıcı promptu madde 27/36 (büyük sürprizler ayrı ele alınmalı).
  if (context?.winnerRank && context?.loserRank && context.winnerRank - context.loserRank >= 4) {
    const opts = [
      `Ligin favorilerinden ${loser}, alt sıralardaki ${winner} karşısında aldığı mağlubiyetle sürpriz bir sonuca imza attı.`,
      `${winner}, sıralamada kendisinden çok daha üstteki ${loser}'yı deviren gecenin sürpriz sonucuna imza attı.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }

  if (diff >= 3) {
    const opts = [
      `${winner}, ${loser} karşısında farklı skorla güldü.`,
      `${winner} rakibine göz açtırmadı, sahadan net bir galibiyetle ayrıldı.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }

  if (context?.winnerRank && context.winnerRank <= 3) {
    const opts = [
      `${winner}, çekişmeli geçen maçtan aldığı 3 puanla zirve yarışındaki iddiasını sürdürdü.`,
      `${winner}'nın galibiyeti zirve yarışında önemli bir adım oldu.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }
  if (context?.loserRank && context?.teamCount && context.loserRank >= context.teamCount - 1) {
    const opts = [
      `${loser} aldığı bu mağlubiyetle düşme hattında daha zor bir konuma düştü.`,
      `${winner}, düşme hattındaki ${loser} deplasmanından/sahasından 3 puanla ayrıldı.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }

  const opts = [
    `${winner}, çekişmeli geçen maçtan 3 puanla ayrıldı.`,
    `${winner}, ${loser} deplasmanında/sahasında mücadeleyi kazanmayı bildi.`,
    `Denk bir mücadelede ${winner} son sözü söyledi.`,
  ];
  return opts[stableIndex(seed, opts.length)];
}

// cupMatchComment — kupa maçları için ayrı, kupaya özgü yorum (round +
// penaltı + alt lig sürprizi bilgisi kullanılıyor, hepsi gerçek veri).
function cupMatchComment(event) {
  const { homeName, awayName, homeScore, awayScore, homeTier, awayTier, winnerIsHome, penalty, round } = event;
  const winner = winnerIsHome ? homeName : awayName;
  const loser = winnerIsHome ? awayName : homeName;
  const winnerTier = winnerIsHome ? homeTier : awayTier;
  const loserTier = winnerIsHome ? awayTier : homeTier;
  const seed = `${homeName}${awayName}${homeScore}${awayScore}${round}`;

  if (penalty) {
    const opts = [
      `90 dakikanın ardından eşitlik bozulmadı (${homeScore}-${awayScore}). Kupa mücadelesinde kazananı penaltılar belirledi (${penalty.homeScore}-${penalty.awayScore}) ve ${winner} bir üst tura yükseldi.`,
      `Normal sürede ${homeScore}-${awayScore} biten mücadelede penaltı atışlarında soğukkanlılığını koruyan ${winner}, ${penalty.homeScore}-${penalty.awayScore}'lik penaltı skoruyla turu geçti.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }
  if (winnerTier && loserTier && winnerTier > loserTier) {
    const opts = [
      `${loserTier}. Lig temsilcisi ${loser}, ${winnerTier}. Lig'in güçlü ekiplerinden olmasına rağmen ${winnerTier}. Lig'in alt sıralarındaki değil, tam tersine ${winnerTier}. Lig'den ${winner} karşısında elenerek kupaya erken veda etti.`,
      `Kupada büyük sürpriz: ${winnerTier}. Lig temsilcisi ${winner}, ${loserTier}. Lig'in güçlü ekiplerinden ${loser}'yı ${homeScore}-${awayScore} mağlup ederek bir üst tura yükseldi.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }
  const opts = [
    `${winner}, Neon Kupası'nda ${loser} karşısında aldığı ${homeScore}-${awayScore}'lik sonuçla bir üst tura yükseldi.`,
    `Kupa mücadelesinde ${winner}, ${loser}'yı ${homeScore}-${awayScore} geçerek turu geçmeyi başardı.`,
  ];
  return opts[stableIndex(seed, opts.length)];
}

function PriceRow({ label, unit, prev, current }) {
  if (!prev || !current) return null;
  const diff = current - prev;
  const pct = prev > 0 ? (diff / prev) * 100 : 0;
  const positive = diff >= 0;
  return (
    <div className="news-price-row">
      <span className="news-price-label">{label}</span>
      <span className="news-price-values">
        {prev.toLocaleString('tr-TR')} → {current.toLocaleString('tr-TR')} {unit}
      </span>
      <span className={`news-price-change ${positive ? 'up' : 'down'}`}>
        {positive ? '▲' : '▼'} {positive ? '+' : ''}
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

export default function NewspaperScreen() {
  const { events, loading, editionDateKey } = useNewspaper();
  const { yesterday: lotteryYesterday } = useLottery();
  const { byCatalogId } = useChampionshipDaily();
  const { bulletin } = useNewspaperBulletin();
  const { leagues } = useFutbolLeagues();

  const cabrioYesterday = byCatalogId[String(UST_CABRIO_CATALOG_ID)]?.yesterday;

  const topTierLeague = leagues.find((l) => l.tier === 1) || null;
  const { teams: topTierTeams } = useFutbolTeams(topTierLeague?.id);

  const rankByTeamName = useMemo(() => {
    const map = {};
    topTierTeams.forEach((t, i) => {
      map[t.name] = i + 1;
    });
    return map;
  }, [topTierTeams]);

  const heistEvents = events.filter((e) => e.type === 'heist_success');
  const biggestHeist = heistEvents.length
    ? heistEvents.reduce((max, e) => ((e.amount || 0) > (max.amount || 0) ? e : max))
    : null;
  const stoppedCount = events.filter((e) => e.type === 'heist_stopped_by_police').length;
  const arrestEvents = events.filter((e) => e.type === 'arrest');
  const arrestCount = arrestEvents.reduce((sum, e) => sum + (e.count || 0), 0);
  const arrestFine = arrestEvents.reduce((sum, e) => sum + (e.totalFine || 0), 0);

  const matchEvents = events
    .filter((e) => e.type === 'football_match' && (!topTierLeague || e.leagueId === topTierLeague.id))
    .slice(0, 10);
  const cupMatchEvents = events.filter((e) => e.type === 'football_cup_match');
  const seasonEndEvent = events.find((e) => e.type === 'football_season_end');
  const cupFinalEvent = events.find((e) => e.type === 'football_cup_final');
  const newSeasonEvent = events.find((e) => e.type === 'football_new_season');

  // Köşe yazısı — sadece gerçek puan tablosu farkından üretilir, sezon
  // sonu/kupa finali gibi zaten manşet olan bir gün varsa gösterilmez
  // (aynı gün iki büyük başlık çakışmasın).
  const columnPiece = useMemo(() => {
    if (seasonEndEvent || cupFinalEvent) return null;
    if (topTierTeams.length < 4) return null;
    const leader = topTierTeams[0];
    const second = topTierTeams[1];
    const bottom = topTierTeams[topTierTeams.length - 1];
    const secondBottom = topTierTeams[topTierTeams.length - 2];
    const titleRaceGap = (leader?.stats?.points || 0) - (second?.stats?.points || 0);
    const relegationGap = (secondBottom?.stats?.points || 0) - (bottom?.stats?.points || 0);
    const seed = `${editionDateKey}${leader?.name}${bottom?.name}`;
    if (titleRaceGap <= 3) {
      return {
        title: 'Zirvede Dengeler Değişiyor',
        body: [
          `${leader?.name} zirveyi ${second?.name}'a karşı sadece ${titleRaceGap} puan farkla koruyor. Önümüzdeki haftalar şampiyonluk yarışını yeniden şekillendirebilir.`,
          `Zirvede fark kapandı: ${leader?.name} ile ${second?.name} arasında yalnızca ${titleRaceGap} puan var. Sezonun geri kalanı gerilime devam edecek gibi görünüyor.`,
        ][stableIndex(seed, 2)],
      };
    }
    if (relegationGap <= 2) {
      return {
        title: 'Alt Sıralarda Alarm Zilleri',
        body: [
          `Düşme hattında ${secondBottom?.name} ile ${bottom?.name} arasında yalnızca ${relegationGap} puan var. Önümüzdeki maçlar bu iki ekip için kritik olacak.`,
          `Küme düşme hattındaki puan farkı daralıyor — ${bottom?.name}, güvenli bölgeye ${relegationGap} puan uzaklıkta.`,
        ][stableIndex(seed, 2)],
      };
    }
    return null;
  }, [topTierTeams, seasonEndEvent, cupFinalEvent, editionDateKey]);

  return (
    <div className="newspaper">
      <div className="newspaper-masthead">
        <p className="newspaper-title">NEON ŞEHİR GAZETESİ</p>
        <p className="newspaper-date">{todayLongDate()}</p>
        <div className="newspaper-rule" />
      </div>

      {loading && <p className="newspaper-loading">Baskıya hazırlanıyor...</p>}

      {seasonEndEvent && (
        <section className="newspaper-section newspaper-headline">
          <h2 className="newspaper-headline-title">🏆 ŞAMPİYON BELLİ OLDU!</h2>
          <div className="newspaper-headline-body">
            {seasonEndEvent.topThree?.length > 0 && (
              <p>
                1. Lig'de şampiyon{' '}
                <strong>{seasonEndEvent.topThree.find((t) => t.rank === 1)?.teamName}</strong> oldu.{' '}
                {seasonEndEvent.topThree.find((t) => t.rank === 2) && (
                  <>
                    2.'liği <strong>{seasonEndEvent.topThree.find((t) => t.rank === 2)?.teamName}</strong>,
                  </>
                )}{' '}
                {seasonEndEvent.topThree.find((t) => t.rank === 3) && (
                  <>
                    3.'lüğü <strong>{seasonEndEvent.topThree.find((t) => t.rank === 3)?.teamName}</strong> aldı.
                  </>
                )}
              </p>
            )}
            {seasonEndEvent.promotions?.length > 0 && (
              <p>
                🔼 Üst lige yükselenler:{' '}
                {seasonEndEvent.promotions.map((p) => p.teamName).join(', ')}.
              </p>
            )}
            {seasonEndEvent.relegations?.length > 0 && (
              <p>
                🔽 Alt lige düşenler:{' '}
                {seasonEndEvent.relegations.map((p) => p.teamName).join(', ')}.
              </p>
            )}
            {seasonEndEvent.cup?.championTeamName && (
              <p>
                🏆 Neon Kupası'nın sahibi <strong>{seasonEndEvent.cup.championTeamName}</strong> oldu.
              </p>
            )}
            {seasonEndEvent.topScorerTeam && (
              <p>
                ⚽ Sezonun en golcü takımı: <strong>{seasonEndEvent.topScorerTeam.teamName}</strong> (
                {seasonEndEvent.topScorerTeam.goals} gol)
              </p>
            )}
            {seasonEndEvent.bestDefenseTeam && (
              <p>
                🛡️ En az gol yiyen takım: <strong>{seasonEndEvent.bestDefenseTeam.teamName}</strong> (
                {seasonEndEvent.bestDefenseTeam.conceded} gol yedi)
              </p>
            )}
            {seasonEndEvent.bestPlayer && (
              <p>
                ⭐ Sezonun en iyi oyuncusu: <strong>{seasonEndEvent.bestPlayer.playerName}</strong> (
                {seasonEndEvent.bestPlayer.teamName}, Güç: {seasonEndEvent.bestPlayer.power})
              </p>
            )}
          </div>
        </section>
      )}

      {!seasonEndEvent && cupFinalEvent && (
        <section className="newspaper-section newspaper-headline">
          <h2 className="newspaper-headline-title">🏆 KUPA SAHİBİNİ BULDU!</h2>
          <div className="newspaper-headline-body">
            <p>
              <strong>{cupFinalEvent.championTeamName}</strong>, finalde{' '}
              <strong>{cupFinalEvent.finalistTeamName}</strong>'yı{' '}
              {cupFinalEvent.homeScore} - {cupFinalEvent.awayScore}
              {cupFinalEvent.penalty && (
                <> (Penaltılar: {cupFinalEvent.penalty.homeScore}-{cupFinalEvent.penalty.awayScore})</>
              )}{' '}
              mağlup ederek Neon Kupası'nın sahibi oldu.
            </p>
          </div>
        </section>
      )}

      {!seasonEndEvent && !cupFinalEvent && newSeasonEvent && (
        <section className="newspaper-section newspaper-headline">
          <h2 className="newspaper-headline-title">🆕 YENİ SEZON BAŞLADI!</h2>
          <div className="newspaper-headline-body">
            <p>
              Şehrin takımları yeniden sahada.
              {newSeasonEvent.previousChampionTeamName && (
                <> Geçen sezonun şampiyonu <strong>{newSeasonEvent.previousChampionTeamName}</strong> oldu.</>
              )}
              {newSeasonEvent.previousCupChampionTeamName && (
                <> Neon Kupası'nın sahibi <strong>{newSeasonEvent.previousCupChampionTeamName}</strong> olmuştu.</>
              )}
            </p>
          </div>
        </section>
      )}

      <div className="newspaper-stack">
        <section className="newspaper-section">
          <h3 className="newspaper-section-title">🚨 Asayiş</h3>
          {biggestHeist ? (
            <p className="newspaper-body">
              <strong>
                {(HEIST_TARGET_LABELS[biggestHeist.target] || biggestHeist.target).toUpperCase()}{' '}
                SOYULDU
              </strong>
              . Dün gerçekleşen soygunda{' '}
              <strong>{(biggestHeist.amount || 0).toLocaleString('tr-TR')}</strong> altınlık kayıp
              yaşandı. Failler hâlâ aranıyor.
              {heistEvents.length > 1 &&
                ` Şehirde dün toplam ${heistEvents.length} soygun bildirildi.`}
            </p>
          ) : (
            <p className="newspaper-body newspaper-muted">
              Dün şehirde bildirilen bir soygun haberi yok.
            </p>
          )}
          {stoppedCount > 0 && (
            <p className="newspaper-body">
              👮 Polis dün {stoppedCount} soygun girişimini örgüt içine sızarak durdurdu.
            </p>
          )}
          {arrestCount > 0 && (
            <p className="newspaper-body">
              ⚖️ Şüphe üzerine yapılan denetimlerde dün {arrestCount} kişiye toplam{' '}
              {arrestFine.toLocaleString('tr-TR')} altın ceza yazıldı.
            </p>
          )}
          {!biggestHeist && stoppedCount === 0 && arrestCount === 0 && (
            <p className="newspaper-muted newspaper-small">Şehir dün sakindi.</p>
          )}
        </section>

        <section className="newspaper-section newspaper-football">
          <h3 className="newspaper-section-title">⚽ Futbol — 1. Lig</h3>
          {matchEvents.length === 0 && cupMatchEvents.length === 0 && (
            <p className="newspaper-body newspaper-muted">Dün 1. Lig'de oynanan maç yok.</p>
          )}
          <div className="newspaper-match-list">
            {matchEvents.map((m) => {
              const winnerRank = m.homeScore === m.awayScore ? null : rankByTeamName[m.homeScore > m.awayScore ? m.homeName : m.awayName];
              const loserRank = m.homeScore === m.awayScore ? null : rankByTeamName[m.homeScore > m.awayScore ? m.awayName : m.homeName];
              return (
                <div key={m.id} className="newspaper-match-row">
                  <div className="newspaper-match-score-line">
                    <FutbolCrest logo={m.homeLogo} initials={m.homeName?.[0]} size={26} />
                    <span className="newspaper-match-team">{m.homeName}</span>
                    <span className="newspaper-match-score">
                      {m.homeScore} - {m.awayScore}
                    </span>
                    <span className="newspaper-match-team">{m.awayName}</span>
                    <FutbolCrest logo={m.awayLogo} initials={m.awayName?.[0]} size={26} />
                  </div>
                  <p className="newspaper-match-comment">
                    {footballComment(m.homeName, m.awayName, m.homeScore, m.awayScore, {
                      winnerRank,
                      loserRank,
                      teamCount: topTierTeams.length,
                    })}
                  </p>
                </div>
              );
            })}
          </div>

          {cupMatchEvents.length > 0 && (
            <>
              <p className="newspaper-section-title" style={{ marginTop: 12 }}>
                🏆 Neon Kupası
              </p>
              <div className="newspaper-match-list">
                {cupMatchEvents.map((m) => (
                  <div key={m.id} className="newspaper-match-row">
                    <p className="newspaper-body newspaper-muted" style={{ margin: '0 0 2px', fontSize: 11 }}>
                      {CUP_ROUND_LABELS[m.round] || m.round}
                    </p>
                    <div className="newspaper-match-score-line">
                      <FutbolCrest logo={m.homeLogo} initials={m.homeName?.[0]} size={26} />
                      <span className="newspaper-match-team">{m.homeName}</span>
                      <span className="newspaper-match-score">
                        {m.homeScore} - {m.awayScore}
                      </span>
                      <span className="newspaper-match-team">{m.awayName}</span>
                      <FutbolCrest logo={m.awayLogo} initials={m.awayName?.[0]} size={26} />
                    </div>
                    <p className="newspaper-match-comment">{cupMatchComment(m)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {columnPiece && (
          <section className="newspaper-section">
            <h3 className="newspaper-section-title">📝 {columnPiece.title}</h3>
            <p className="newspaper-body">{columnPiece.body}</p>
          </section>
        )}

        <section className="newspaper-section">
          <h3 className="newspaper-section-title">📈 Borsa Bülteni</h3>
          {bulletin ? (
            <div className="news-price-list">
              <PriceRow
                label="Elmas"
                unit="altın"
                prev={bulletin.prevDiamondPrice}
                current={bulletin.diamondPrice}
              />
              <PriceRow
                label="Hisse Senedi"
                unit="altın"
                prev={bulletin.prevStockPrice}
                current={bulletin.stockPrice}
              />
              <PriceRow
                label="Kripto"
                unit="altın"
                prev={bulletin.prevCryptoPrice}
                current={bulletin.cryptoPrice}
              />
              <p className="newspaper-muted newspaper-small">
                Bu bülten her gece 00:00'da güncellenir, gün içinde değişmez. Anlık alım/satım
                fiyatları için Parara Bank'a bak.
              </p>
            </div>
          ) : (
            <p className="newspaper-body newspaper-muted">Piyasa verisi henüz oluşmadı.</p>
          )}
        </section>
      </div>

      <div className="newspaper-bottom-row">
        <section className="newspaper-section newspaper-bottom-col">
          <h3 className="newspaper-section-title">🏆 Şampiyona</h3>
          {cabrioYesterday?.winnerUid ? (
            <p className="newspaper-body">
              Üstün Cabrio şampiyonasında dünün galibi <strong>{cabrioYesterday.winnerName}</strong>,
              pisti <strong>{cabrioYesterday.winnerTurns}</strong> turda tamamlayarak zirveye
              oturdu.
            </p>
          ) : (
            <p className="newspaper-body newspaper-muted">
              Dün Üstün Cabrio ile pisti tamamlayan olmadı.
            </p>
          )}
        </section>

        <section className="newspaper-section newspaper-bottom-col">
          <h3 className="newspaper-section-title">🎰 Piyango</h3>
          {lotteryYesterday?.winnerUid ? (
            <p className="newspaper-body">
              Dünün piyango talihlisi <strong>{lotteryYesterday.winnerName}</strong>,{' '}
              <strong>{(lotteryYesterday.winnerAmount || 0).toLocaleString('tr-TR')}</strong> altın
              kazandı.
            </p>
          ) : (
            <p className="newspaper-body newspaper-muted">
              Dün piyangoyu kazanan olmadı — bilet alan çıkmadı.
            </p>
          )}
        </section>
      </div>

      <p className="newspaper-footer">
        Neon Şehir Gazetesi, her gece 00:00'da bir önceki günün özetiyle yenilenir.
      </p>
    </div>
  );
}
