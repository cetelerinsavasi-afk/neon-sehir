import { useMemo, useState } from 'react';
import { useNewspaper } from '../../hooks/useNewspaper';
import { useLottery } from '../../hooks/useLottery';
import { useChampionshipDaily } from '../../hooks/useChampionshipDaily';
import { useNewspaperBulletin } from '../../hooks/useNewspaperBulletin';
import { useFutbolLeagues } from '../../hooks/useFutbolLeagues';
import { useFutbolTeams } from '../../hooks/useFutbolTeams';
import { useTalkingBroadcast } from '../../hooks/useTalkingBroadcast';
import { useBroadcastAudio } from '../../hooks/useBroadcastAudio';
import BroadcastFrame from '../Broadcast/BroadcastFrame';
import TalkingAvatarScene from '../Broadcast/TalkingAvatarScene';
import { TV_ANCHORS } from '../../lib/tvAnchors';
import './NewspaperScreen.css';

// NewspaperScreen.jsx — GAZETE → TV UYGULAMASI (madde 3). Dosya adı/ikonu
// aynı kaldı (PhoneScreen.jsx'te sadece etiket/ikon değişti — bkz. madde 3
// yorumu orada), ama içerik artık bir "Neon TV" uygulaması: bir televizyon
// çerçevesi + kumanda ile 3 kanal arasında geçiş yapılıyor. Kanalların
// VERİ KAYNAKLARI (useNewspaper/useNewspaperBulletin/useFutbolLeagues/
// useFutbolTeams vb.) AYNEN korunuyor — sadece SUNUM, gazete/kağıt
// düzeninden "spiker okuyor" (cümle cümle altyazı + konuşma animasyonu,
// bkz. components/Broadcast/) formatına çevrildi. Röportaj özelliğiyle
// (madde 1) AYNI motor kullanılıyor, ikinci kez YAZILMADI.

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
  ROUND_OF_16: 'Kupa Son 16',
  QUARTER_FINAL: 'Kupa Çeyrek Final',
  SEMI_FINAL: 'Kupa Yarı Final',
  FINAL: 'Kupa Finali',
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

// stableIndex — basit, deterministik bir "sözde-rastgele" seçici (AYNI
// veri için sayfa her yeniden çizildiğinde AYNI yorum çıksın diye
// Math.random KULLANILMIYOR — madde 3 sonu, "Math.random KULLANMA").
function stableIndex(seed, length) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % length;
}

// footballComment — KULLANICI İSTEĞİ (madde 3): "gazetede maç yorumları
// tekdüze gidiyor, cümleleri de arttırıp çeşitlendirebiliriz" — her dal
// artık 3-4 varyant içeriyor (öncekinden fazla), hepsi deterministik
// (stableIndex) seçiliyor.
function footballComment(homeName, awayName, homeScore, awayScore, context) {
  const seed = `${homeName}${awayName}${homeScore}${awayScore}`;
  if (homeScore === awayScore) {
    const opts =
      homeScore === 0
        ? [
            'Golsüz geçen mücadelede iki takım da bir puanla yetindi.',
            'Kaleler bu maçta gol görmedi, taraflar sahadan berabere ayrıldı.',
            'Nefes kesen anlar yaşansa da top ağlarla buluşmadı, maç 0-0 bitti.',
          ]
        : [
            'Golcü bir mücadelede taraflar puanları paylaştı.',
            'Karşılıklı gollerle geçen maç berabere sonuçlandı.',
            'İki takım da kazanmaya yakın durdu ama sonunda bir puana razı oldu.',
          ];
    return opts[stableIndex(seed, opts.length)];
  }
  const winner = homeScore > awayScore ? homeName : awayName;
  const loser = homeScore > awayScore ? awayName : homeName;
  const diff = Math.abs(homeScore - awayScore);

  // Gerçek sıralama bilgisi varsa: alt sıradaki takım üst sıradaki
  // favoriyi yendiyse bu her zaman "beklenmedik sonuç" olarak işlenir.
  if (context?.winnerRank && context?.loserRank && context.winnerRank - context.loserRank >= 4) {
    const opts = [
      `Ligin favorilerinden ${loser}, alt sıralardaki ${winner} karşısında aldığı mağlubiyetle sürpriz bir sonuca imza attı.`,
      `${winner}, sıralamada kendisinden çok daha üstteki ${loser}'yı deviren gecenin sürpriz sonucuna imza attı.`,
      `Kimse beklemiyordu ama ${winner}, favori ${loser}'yı sahasında/deplasmanında alt etmeyi başardı.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }

  if (diff >= 3) {
    const opts = [
      `${winner}, ${loser} karşısında farklı skorla güldü.`,
      `${winner} rakibine göz açtırmadı, sahadan net bir galibiyetle ayrıldı.`,
      `${loser} savunmasız kaldı, ${winner} farklı skorla sahadan 3 puanla ayrıldı.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }

  if (context?.winnerRank && context.winnerRank <= 3) {
    const opts = [
      `${winner}, çekişmeli geçen maçtan aldığı 3 puanla zirve yarışındaki iddiasını sürdürdü.`,
      `${winner}'nın galibiyeti zirve yarışında önemli bir adım oldu.`,
      `Zirve takımlarından ${winner}, bu galibiyetle şampiyonluk hesaplarını canlı tuttu.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }
  if (context?.loserRank && context?.teamCount && context.loserRank >= context.teamCount - 1) {
    const opts = [
      `${loser} aldığı bu mağlubiyetle düşme hattında daha zor bir konuma düştü.`,
      `${winner}, düşme hattındaki ${loser} deplasmanından/sahasından 3 puanla ayrıldı.`,
      `${loser} için alarm zilleri çalıyor — bu mağlubiyet küme düşme hattını iyice yaklaştırdı.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }

  const opts = [
    `${winner}, çekişmeli geçen maçtan 3 puanla ayrıldı.`,
    `${winner}, ${loser} deplasmanında/sahasında mücadeleyi kazanmayı bildi.`,
    `Denk bir mücadelede ${winner} son sözü söyledi.`,
    `${winner}, mücadeleci bir performansla 3 puanın sahibi oldu.`,
  ];
  return opts[stableIndex(seed, opts.length)];
}

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
      `Kupada büyük sürpriz: ${loserTier}. Lig temsilcisi ${loser}, ${winnerTier}. Lig'den ${winner} karşısında elenerek kupaya erken veda etti.`,
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

// investmentComment — YENİ (madde 3, Kanal 3 — Yatırım): footballComment
// ile AYNI desen — seed'e dayalı stableIndex, Math.random YOK. Aynı fiyat
// verisi için sayfa her yeniden çizildiğinde AYNI yorum çıkar.
function investmentComment(label, prev, current) {
  if (!prev || !current) return `${label} için henüz yeterli fiyat geçmişi yok.`;
  const diff = current - prev;
  const pct = prev > 0 ? (diff / prev) * 100 : 0;
  const absPct = Math.abs(pct);
  const seed = `${label}${prev}${current}`;
  const pctTxt = absPct.toFixed(1);

  if (absPct < 0.5) {
    const opts = [
      `${label} fiyatında dün belirgin bir hareket görülmedi, yatay bir seyir izlendi.`,
      `${label} piyasası dün sakindi, fiyat neredeyse aynı seviyede kaldı.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }
  if (diff > 0) {
    if (absPct >= 8) {
      const opts = [
        `${label} dün sert bir yükselişle günü %${pctTxt} artışla kapattı, yatırımcılar keyifli.`,
        `${label} fiyatı adeta uçtu — dünkü kazanç %${pctTxt}'e ulaştı.`,
      ];
      return opts[stableIndex(seed, opts.length)];
    }
    const opts = [
      `${label} dün %${pctTxt} değer kazandı.`,
      `${label} fiyatında dün %${pctTxt}'lik bir yükseliş yaşandı.`,
      `${label} yatırımcılarını dün %${pctTxt}'lik artışla güldürdü.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }
  if (absPct >= 8) {
    const opts = [
      `${label} dün sert bir düşüşle %${pctTxt} değer kaybetti.`,
      `${label} piyasasında dün panik havası hakimdi, fiyat %${pctTxt} geriledi.`,
    ];
    return opts[stableIndex(seed, opts.length)];
  }
  const opts = [
    `${label} dün %${pctTxt} değer kaybetti.`,
    `${label} fiyatında dün %${pctTxt}'lik bir düşüş görüldü.`,
    `${label} yatırımcıları dün %${pctTxt}'lik gerilemeyle karşılaştı.`,
  ];
  return opts[stableIndex(seed, opts.length)];
}

const CHANNELS = [
  { id: 1, key: 'haber', label: 'Haber', emoji: '📰' },
  { id: 2, key: 'spor', label: 'Spor', emoji: '⚽' },
  { id: 3, key: 'yatirim', label: 'Yatırım', emoji: '📈' },
];

export default function NewspaperScreen() {
  const { events, editionDateKey } = useNewspaper();
  const { yesterday: lotteryYesterday } = useLottery();
  const { byCatalogId } = useChampionshipDaily();
  const { bulletin } = useNewspaperBulletin();
  const { leagues } = useFutbolLeagues();
  const [channel, setChannel] = useState('haber');
  const [muted, setMuted] = useState(true);

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
    .slice(0, 8);
  const cupMatchEvents = events.filter((e) => e.type === 'football_cup_match');
  const seasonEndEvent = events.find((e) => e.type === 'football_season_end');
  // v38: birden çok kupa grubu olabilir — manşette 1. grubun (1-2. Lig) finali öncelikli
  const cupFinalEvent =
    events.find((e) => e.type === 'football_cup_final' && (e.cupGroup || 1) === 1) ||
    events.find((e) => e.type === 'football_cup_final');
  const newSeasonEvent = events.find((e) => e.type === 'football_new_season');
  const onboardingPoliceRuleEvent = events.find((e) => e.type === 'onboarding_police_rule');

  // columnPiece — köşe yazısı metni, sadece gerçek puan tablosu farkından.
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
      return [
        `${leader?.name} zirveyi ${second?.name}'a karşı sadece ${titleRaceGap} puan farkla koruyor.`,
        `Zirvede fark kapandı: ${leader?.name} ile ${second?.name} arasında yalnızca ${titleRaceGap} puan var.`,
      ][stableIndex(seed, 2)];
    }
    if (relegationGap <= 2) {
      return [
        `Düşme hattında ${secondBottom?.name} ile ${bottom?.name} arasında yalnızca ${relegationGap} puan var.`,
        `Küme düşme hattındaki puan farkı daralıyor — ${bottom?.name}, güvenli bölgeye ${relegationGap} puan uzaklıkta.`,
      ][stableIndex(seed, 2)];
    }
    return null;
  }, [topTierTeams, seasonEndEvent, cupFinalEvent, editionDateKey]);

  // --- Kanal metinleri — cümle cümle altyazı motoruna (useTalkingBroadcast)
  // verilen tek bir "spiker script"i. Veri kaynakları YUKARIDAKİ hook'larla
  // AYNEN korunuyor, sadece JSX paragraf yerine düz metin cümlelere çevrildi.

  const newsScript = useMemo(() => {
    const lines = [`İyi günler, karşınızda Neon TV Haber — ${todayLongDate()}.`];
    if (onboardingPoliceRuleEvent) {
      lines.push(`Resmi bir duyuru geldi. ${onboardingPoliceRuleEvent.message}`);
    }
    if (seasonEndEvent) {
      const champ = seasonEndEvent.topThree?.find((t) => t.rank === 1)?.teamName;
      lines.push(champ ? `Lig sezonu sona erdi, şampiyon ${champ} oldu.` : 'Lig sezonu sona erdi.');
      if (seasonEndEvent.cup?.championTeamName) {
        lines.push(`Neon Kupası'nın sahibi ${seasonEndEvent.cup.championTeamName} oldu.`);
      }
    } else if (cupFinalEvent) {
      lines.push(
        `${cupFinalEvent.championTeamName}, finalde ${cupFinalEvent.finalistTeamName}'yı ${cupFinalEvent.homeScore}-${cupFinalEvent.awayScore} mağlup ederek ${cupFinalEvent.cupName || 'Neon Kupası'}'nın sahibi oldu.`
      );
    } else if (newSeasonEvent) {
      lines.push('Şehrin takımları yeni sezona merhaba dedi.');
    }

    if (biggestHeist) {
      lines.push(
        `${(HEIST_TARGET_LABELS[biggestHeist.target] || biggestHeist.target).toUpperCase()} SOYULDU. Dün gerçekleşen soygunda ${(biggestHeist.amount || 0).toLocaleString('tr-TR')} altınlık kayıp yaşandı, failler hâlâ aranıyor.`
      );
      if (heistEvents.length > 1) lines.push(`Şehirde dün toplam ${heistEvents.length} soygun bildirildi.`);
    } else {
      lines.push('Dün şehirde bildirilen bir soygun haberi yok.');
    }
    if (stoppedCount > 0) lines.push(`Polis dün ${stoppedCount} soygun girişimini örgüt içine sızarak durdurdu.`);
    if (arrestCount > 0) {
      lines.push(
        `Şüphe üzerine yapılan denetimlerde dün ${arrestCount} kişiye toplam ${arrestFine.toLocaleString('tr-TR')} altın ceza yazıldı.`
      );
    }

    if (columnPiece) lines.push(columnPiece);

    if (matchEvents.length > 0 || cupMatchEvents.length > 0) {
      lines.push('Spor kanalımızda futbol sonuçlarının detaylarını bulabilirsiniz.');
    }
    if (bulletin) {
      lines.push('Piyasalarda son durumu Yatırım kanalımızdan takip edebilirsiniz.');
    }
    if (cabrioYesterday?.winnerUid) {
      lines.push(
        `Üstün Cabrio şampiyonasında dünün galibi ${cabrioYesterday.winnerName}, pisti ${cabrioYesterday.winnerTurns} turda tamamlayarak zirveye oturdu.`
      );
    }
    if (lotteryYesterday?.winnerUid) {
      lines.push(
        `Dünün piyango talihlisi ${lotteryYesterday.winnerName}, ${(lotteryYesterday.winnerAmount || 0).toLocaleString('tr-TR')} altın kazandı.`
      );
    }
    lines.push('Neon TV Haber\'de bugünlük bu kadar, bizi izlediğiniz için teşekkürler.');
    return lines.join(' ');
  }, [
    onboardingPoliceRuleEvent, seasonEndEvent, cupFinalEvent, newSeasonEvent, biggestHeist, heistEvents.length,
    stoppedCount, arrestCount, arrestFine, columnPiece, matchEvents.length, cupMatchEvents.length, bulletin,
    cabrioYesterday, lotteryYesterday,
  ]);

  const sportsScript = useMemo(() => {
    const lines = ['Merhaba, Neon TV Spor\'da 1. Lig\'den son gelişmeler.'];
    if (matchEvents.length === 0 && cupMatchEvents.length === 0) {
      lines.push('Dün 1. Lig\'de oynanan bir maç yoktu.');
    }
    matchEvents.forEach((m) => {
      const winnerRank = m.homeScore === m.awayScore ? null : rankByTeamName[m.homeScore > m.awayScore ? m.homeName : m.awayName];
      const loserRank = m.homeScore === m.awayScore ? null : rankByTeamName[m.homeScore > m.awayScore ? m.awayName : m.homeName];
      lines.push(
        `${m.homeName} ${m.homeScore} - ${m.awayScore} ${m.awayName}. ${footballComment(m.homeName, m.awayName, m.homeScore, m.awayScore, { winnerRank, loserRank, teamCount: topTierTeams.length })}`
      );
    });
    cupMatchEvents.forEach((m) => {
      lines.push(
        `${CUP_ROUND_LABELS[m.round] || m.round}: ${m.homeName} ${m.homeScore} - ${m.awayScore} ${m.awayName}. ${cupMatchComment(m)}`
      );
    });
    lines.push('Spor haberlerimiz burada sona eriyor, bizi izlediğiniz için teşekkürler.');
    return lines.join(' ');
  }, [matchEvents, cupMatchEvents, rankByTeamName, topTierTeams.length]);

  const investmentScript = useMemo(() => {
    const lines = ['İyi günler, Neon TV Yatırım\'da günün piyasa özeti.'];
    if (!bulletin) {
      lines.push('Piyasa verisi henüz oluşmadı.');
    } else {
      lines.push(investmentComment('Elmas', bulletin.prevDiamondPrice, bulletin.diamondPrice));
      lines.push(investmentComment('Hisse senedi', bulletin.prevStockPrice, bulletin.stockPrice));
      lines.push(investmentComment('Kripto para', bulletin.prevCryptoPrice, bulletin.cryptoPrice));
      lines.push('Bu bülten her gece yenilenir, anlık alım satım fiyatları için Parara Bank\'a bakabilirsiniz.');
    }
    lines.push('Yatırım haberlerimiz burada sona eriyor, bir sonraki bültende görüşmek üzere.');
    return lines.join(' ');
  }, [bulletin]);

  const SCRIPTS = { haber: newsScript, spor: sportsScript, yatirim: investmentScript };
  const anchor = TV_ANCHORS[channel];
  const { triggerMumble } = useBroadcastAudio(null, { muted });
  const { currentSentence, mouthOpen, progress, elapsedSec } = useTalkingBroadcast(SCRIPTS[channel], {
    onMouthToggle: triggerMumble,
  });
  const activeChannel = CHANNELS.find((c) => c.key === channel);

  return (
    <div className="tv-app">
      <div className="tv-set">
        <div className="tv-set-brand">NEON TV</div>
        <div className="tv-screen">
          <BroadcastFrame
            subtitle={currentSentence}
            kicker={`${activeChannel?.emoji} ${activeChannel?.label} — ${anchor.name}`}
            progress={progress}
            elapsedSec={elapsedSec}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
          >
            <TalkingAvatarScene studio avatar={anchor.avatar} mouthOpen={mouthOpen} />
          </BroadcastFrame>
        </div>
        <div className="tv-set-vents">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="tv-remote">
        <div className="tv-remote-top">
          <span className="tv-remote-led" />
          <span className="tv-remote-label">KUMANDA</span>
        </div>
        <div className="tv-remote-channels">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              className={`tv-remote-btn${channel === c.key ? ' active' : ''}`}
              onClick={() => setChannel(c.key)}
            >
              <span className="tv-remote-btn-num">{c.id}</span>
              <span className="tv-remote-btn-emoji">{c.emoji}</span>
              <span className="tv-remote-btn-label">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
