import { useMemo } from 'react';
import { useNewspaper } from '../../hooks/useNewspaper';
import { useLottery } from '../../hooks/useLottery';
import { useChampionshipDaily } from '../../hooks/useChampionshipDaily';
import { useInvestmentHistory } from '../../hooks/useInvestmentHistory';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
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

function footballComment(homeName, awayName, homeScore, awayScore) {
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
  if (diff >= 3) {
    const opts = [
      `${winner}, ${loser} karşısında farklı skorla güldü.`,
      `${winner} rakibine göz açtırmadı, sahadan net bir galibiyetle ayrıldı.`,
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
  const { events, loading } = useNewspaper();
  const { yesterday: lotteryYesterday } = useLottery();
  const { byCatalogId } = useChampionshipDaily();
  const { history } = useInvestmentHistory();
  const { prices } = useInvestmentPrices();

  const cabrioYesterday = byCatalogId[String(UST_CABRIO_CATALOG_ID)]?.yesterday;

  // ~24 saat önceki fiyat noktası: hourlyInvestmentUpdate saatte bir
  // çalıştığı için history dizisinde (en yeni sonda) 24 kayıt geriye
  // gitmek ~24 saat önceye denk geliyor. Yetersiz geçmişte elimizdeki
  // en eski noktayı kullanıyoruz.
  const point24hAgo = useMemo(() => {
    if (!history.length) return null;
    const idx = Math.max(0, history.length - 25);
    return history[idx];
  }, [history]);

  const heistEvents = events.filter((e) => e.type === 'heist_success');
  const biggestHeist = heistEvents.length
    ? heistEvents.reduce((max, e) => ((e.amount || 0) > (max.amount || 0) ? e : max))
    : null;
  const stoppedCount = events.filter((e) => e.type === 'heist_stopped_by_police').length;
  const arrestEvents = events.filter((e) => e.type === 'arrest');
  const arrestCount = arrestEvents.reduce((sum, e) => sum + (e.count || 0), 0);
  const arrestFine = arrestEvents.reduce((sum, e) => sum + (e.totalFine || 0), 0);

  const matchEvents = events.filter((e) => e.type === 'football_match').slice(0, 10);
  const seasonEndEvent = events.find((e) => e.type === 'football_season_end');

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
          <h2 className="newspaper-headline-title">⚽ SEZON SONA ERDİ!</h2>
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
          </div>
        </section>
      )}

      <div className="newspaper-columns">
        <section className="newspaper-section">
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

        <section className="newspaper-section">
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

        <section className="newspaper-section">
          <h3 className="newspaper-section-title">📈 Borsa Bülteni</h3>
          {point24hAgo ? (
            <div className="news-price-list">
              <PriceRow
                label="Elmas"
                unit="altın"
                prev={point24hAgo.diamondPrice}
                current={prices.diamondPrice}
              />
              <PriceRow
                label="Hisse Senedi"
                unit="altın"
                prev={point24hAgo.stockPrice}
                current={prices.stockPrice}
              />
              <PriceRow
                label="Kripto"
                unit="altın"
                prev={point24hAgo.cryptoPrice}
                current={prices.cryptoPrice}
              />
              <p className="newspaper-muted newspaper-small">Son 24 saatlik değişim.</p>
            </div>
          ) : (
            <p className="newspaper-body newspaper-muted">Piyasa verisi henüz oluşmadı.</p>
          )}
        </section>

        <section className="newspaper-section">
          <h3 className="newspaper-section-title">🚨 Asayiş</h3>
          {biggestHeist ? (
            <p className="newspaper-body">
              <strong>
                {(HEIST_TARGET_LABELS[biggestHeist.target] || biggestHeist.target).toUpperCase()}{' '}
                SOYULDU!
              </strong>{' '}
              Bugün şehrin gördüğü en büyük soygunda{' '}
              <strong>{(biggestHeist.amount || 0).toLocaleString('tr-TR')}</strong> altınlık kayıp
              yaşandı. Failler hâlâ aranıyor.
            </p>
          ) : (
            <p className="newspaper-body newspaper-muted">
              Bugün şehirde bildirilen bir soygun haberi yok.
            </p>
          )}
          {stoppedCount > 0 && (
            <p className="newspaper-body">
              👮 Polis bugün {stoppedCount} soygun girişimini örgüt içine sızarak durdurdu.
            </p>
          )}
          {arrestCount > 0 && (
            <p className="newspaper-body">
              ⚖️ Şüphe üzerine yapılan denetimlerde bugün {arrestCount} kişiye toplam{' '}
              {arrestFine.toLocaleString('tr-TR')} altın ceza yazıldı.
            </p>
          )}
          {!biggestHeist && stoppedCount === 0 && arrestCount === 0 && (
            <p className="newspaper-muted newspaper-small">Şehir bugün sakindi.</p>
          )}
        </section>
      </div>

      <section className="newspaper-section newspaper-football">
        <h3 className="newspaper-section-title">⚽ Futbol</h3>
        {matchEvents.length === 0 && (
          <p className="newspaper-body newspaper-muted">Bugün oynanan maç yok.</p>
        )}
        <div className="newspaper-match-list">
          {matchEvents.map((m) => (
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
                {footballComment(m.homeName, m.awayName, m.homeScore, m.awayScore)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <p className="newspaper-footer">
        Neon Şehir Gazetesi, şehirde olanları gerçek zamanlı olarak takip eder — sayfa
        kendiliğinden güncellenir.
      </p>
    </div>
  );
}
