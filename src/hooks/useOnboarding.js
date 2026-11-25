import { useMemo } from 'react';
import { usePoliticsState, politicsNeed } from './usePolitics';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from './usePlayer';
import { useDailyActions } from './useDailyActions';
import { useVehicles } from './useVehicles';
import { isCarCatalogId } from '../data/vehicleCatalog'; // v163 — şampiyona hatırlatması sadece arabalar
import { useWeapons } from './useWeapons'; // v162 — "Gücün 0" hatırlatması
import { useInventory } from './useInventory'; // v162 — eksik yasaklı madde hatırlatması
import { useMyFactoryRunNeeded } from './useMyFactory'; // v204: makineler canlı dinlenmez
import { useMyFutbolTeam } from './useMyFutbolTeam';
import { currentPrayerWindow } from './useMosqueAttendance';
import { useBizReminders } from './useBizReminders';
import { useMatchLive } from './useMatchLive'; // v163 — "Maç başladı" hatırlatması
import { useBelediyeChatUnread } from './useBelediyeChatUnread'; // v146
import { SAFE_DAILY_LIMIT } from '../components/ShadyDeal/shadyDeal';
import { ONBOARDING_ORDER, ONBOARDING_TASK_COUNT, onboardingPosOf, onboardingTaskIdAt, storyStarted } from '../../functions/onboardingData.js';

// Görev listesi/hatırlatıcı paneli — bkz. functions/index.js ONBOARDING
// bölümü. Sayaç (onboardingStep, 1-20) ve tamamlanma bayrağı
// (onboardingRewardClaimed — alan adı geriye dönük uyumluluk için
// değiştirilmedi, ama artık altın ödülü YOK, sadece "tamamlandı"
// bayrağı) users/{uid} dokümanında tutuluyor; bu hook sadece OKUR —
// ilerleme SUNUCUDA (advanceOnboardingStep) yapılıyor.
// v124: liste functions/onboardingData.js'te (sunucuyla ortak). v167: 18 görev; eski
// kayıtlı adımlar orada yeni sıraya çevrilir (onboardingPosOf).
export { ONBOARDING_TASK_COUNT };

function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now()));
}

// Görevlerin sırayla, sabit metinleriyle tanımı — kullanıcının verdiği
// başlık ve (i) açıklama metinleri BİREBİR kullanılıyor.
// v124: `id` = görevin sabit kimliği (sunucudaki advanceOnboardingStep numarası),
// `step` = listedeki sırası (1–17). Kaldırılanlar: slot (8), 2. el alışveriş (15),
// silah geliştirme malzemesi (18).
const TASK_DEFS = {
  21: { emoji: '🗺️', title: 'Mini haritaya dokun ve bir yere ışınlan', info: 'Şehirde sağ üstteki mini haritaya dokun, büyük haritada bir yer seç ve oraya ışınlan.' },
  1: { emoji: '🏭', title: 'Fabrikada çalış', info: 'Fabrikaya git, kapıdan gir, Çalış’a bas. Günde bir kez 5.000 altın.' },
  2: { emoji: '📦', title: "Liman & Depo'ya git ve 1 adet yasaklı madde satın al", info: 'Yasaklı madde ticareti depolarda döner. Haritadan Liman & Depo’ya git, bir depoya gir ve “Yasaklı madde satın al”a bas.' },
  3: { emoji: '🌳', title: 'Parktaki şüpheli adama 5000 altın karşılığında 1 adet yasaklı madde sat', info: 'Bu görev için RİSKLİ satış yapmalısın (5.000 altın). Şüphen yüksekse yakalanma ihtimalin artar.' },
  4: { emoji: '🕌', title: "Camii'ye gidip ibadet et", info: 'Günde 5 vakit ibadet ederek şüphe miktarını düşük tut ve saygınlık kazan, şüphen yüksekken polise yakalanırsın.' },
  5: { emoji: '🔫', title: 'Herhangi bir silah al', info: 'Silah alıp güçlenebilir ve seyyar satıcılardan haraç kesebilirsin.' },
  6: { emoji: '💸', title: 'Bir seyyar satıcıdan haraç kes', info: 'Seyyar satıcılardan haraç kesip para kazanabilirsin.' },
  7: { emoji: '🤲', title: 'Bir seyyar satıcıya bağış yap', info: 'Seyyar satıcılara bağış yaparak şüpheni azaltıp saygınlık kazanabilirsin.' },
  9: { emoji: '🚨', title: "Şüpheni 20'ye çıkart", info: 'Şüphen yükseldikçe yakalanma riskin artar, yakalanırsan para cezası yersin.' },
  10: { emoji: '🤝', title: 'Polise rüşvet ver', info: 'Rüşvet vermek şüpheyi 20 düşürür.' },
  11: { emoji: '🚗', title: 'Herhangi bir araba al', info: 'Arabanla yarışlara katılabilirsin.' },
  12: { emoji: '🏎️', title: 'Yarış pistinden antrenmana gir ve 1. seviyeyi tamamla', info: 'Hem kendini geliştir hem para kazan.' },
  13: { emoji: '🏆', title: 'Yarış pistinden Şampiyonaya gir', info: 'Günün şampiyonu para ödülünü alır.' },
  14: { emoji: '🏦', title: 'Bankadan kredi çek', info: 'Kredi puanını yükselterek daha fazla kredi çekebilirsin.' },
  16: { emoji: '👤', title: 'Profile gir ve avatarını düzenle', info: "Alttaki Profil sekmesinden avatarını düzenleyebilir, adını değiştirebilirsin." },
  17: { emoji: '💬', title: 'Telefon > ChatsApp uygulamasına gir ve bi mesaj gönder', info: 'Diğer oyuncularla konuş.' },
  19: { emoji: '🔧', title: 'Silahçıda silahını geliştir', info: 'Silah Mağazası ya da bir oyuncunun silahçı dükkânında 🛠️ Atölye\'den silahını geliştirerek daha büyük soygunlar yapabilirsin.' },
  // v168: Rıza Amca senaryosunun son sahnesi (sadece hurdalığa gidip sahne bitince geçer)
  22: { emoji: '🔥', title: 'Rıza Amca ile hurdalığa git', info: 'Hesap bu gece kapanacak.', secret: true },
  20: { emoji: '🏴', title: 'Bi çeteye gir', info: 'Tüm mafya babaları bu yollardan geçti.' },
};
export const ONBOARDING_TASKS = ONBOARDING_ORDER.map((id, i) => ({ step: i + 1, id, ...TASK_DEFS[id] }));

/**
 * useOnboarding — anasayfadaki 📋 butonunun tüm verisini tek yerde toplar:
 * - Tamamlanana kadar: 20 görevlik sıralı checklist (onboardingStep).
 * - Tamamlandıktan sonra: koşulları o an sağlananları gösteren hatırlatıcı
 *   listesi.
 */
// v158 — hatırlatmanın "Git" hedefi: şehirdeki yer (bölge anahtarı) ya da panel ('gang' / 'intel')
const POL_REMIND = {
  signup: { emoji: '✍️', text: 'Seçim imzaları başladı — imza ver' },
  vote: { emoji: '🗳️', text: 'Seçim başladı — oy kullan' },
  count: { emoji: '🗳️', text: 'Oylar sayılıyor' },
  coup: { emoji: '⚡', text: 'Darbe var — tarafını seç' },
};

export function reminderTarget(id) {
  const k = String(id || '');
  if (k === 'pray') return 'camii';
  if (k === 'championship') return 'yaris_pisti';
  if (k === 'lineup' || k === 'match-live') return 'stadyum'; // v163: maç başladı → stadyumun içi
  if (k === 'work' || k === 'machines') return 'fabrika';
  if (k === 'park-safe') return 'park_shady'; // v162: şüpheli adamın yanına (düğmesi açık)
  if (k === 'belediye' || k === 'chat-belediye') return 'belediye';
  if (k.startsWith('pol-')) return 'belediye'; // v160.3: seçim / imza / darbe → Belediyeye git (seçim sandığı orada)
  if (k.startsWith('gang-') || k === 'chat-gang') return 'gang';
  if (k === 'chat-intel') return 'intel';
  if (k === 'gym') return 'spor_salonu';
  if (k.startsWith('galeri-')) return 'araba_galerisi';
  if (k.startsWith('depo-')) return 'liman_depo';
  if (k.startsWith('gz-')) return 'casino';
  if (k.startsWith('silah-')) return 'silah_magazasi';
  return null;
}

// v163: opts.inStadium — oyuncu şehirde stadyumun içindeyse "Maç başladı" hatırlatması gösterilmez
export function useOnboarding(gangReminders = null, gangChans = null, { inStadium = false } = {}) {
  const { user } = useAuth();
  const { player, loading: playerLoading } = usePlayer();
  // v160.3: seçim / imza / darbe dönemi — anasayfadaki 🗳️ düğmesi yerine hatırlatma (Belediyeye git)
  const pol = usePoliticsState();
  const polNeed = politicsNeed({ phase: pol.phase, cycle: pol.cycle, player, state: pol.state, now: pol.now });
  // v146 — "Belediyede yeni mesajlar var": sadece belediye koltuğu olanlar (kanal başına
  // tek hafif dinleyici; sohbet açılınca markBelediyeChatSeen → hatırlatma kaybolur)
  const bdUid = user?.uid || null;
  const hasSeat = Boolean(player?.belediyeSeat);
  const bdMine = (m) => Boolean(bdUid) && m.uid === bdUid;
  const bdGenel = useBelediyeChatUnread(bdUid, 'genel', hasSeat, bdMine);
  const bdKoord = useBelediyeChatUnread(bdUid, 'koord', hasSeat, bdMine);
  const gangChat = Boolean(gangChans?.gang?.genel || gangChans?.gang?.yonetim);
  const intelChat = Boolean(gangChans?.intel?.genel || gangChans?.intel?.yonetim);
  const belediyeChat = bdGenel || bdKoord;
  const { actions, loading: actionsLoading } = useDailyActions();
  const { vehicles } = useVehicles();
  const { weapons, loading: weaponsLoading } = useWeapons();
  const { inventory, loading: invLoading } = useInventory();
  const { team, role: futbolRole } = useMyFutbolTeam();
  const bizReminders = useBizReminders(); // v92: galeri / silahçı / spor salonu
  const matchLive = useMatchLive(Boolean(user)); // v163: 18:00–19:00 maç günü

  // v196: işçi sistemi kalktı — Çalış hatırlatması dailyActions.factoryWork'ten (ek okuma yok)

  const todayKey = istanbulDateKey();
  const factoryRunNeeded = useMyFactoryRunNeeded(todayKey);
  const win = currentPrayerWindow();

  // v124: eski kayıtlı adım yeni sıraya çevrilir (sunucuyla aynı formül)
  const onboardingStep = onboardingPosOf(player);
  const currentTaskId = onboardingTaskIdAt(onboardingStep);
  const onboardingRewardClaimed = Boolean(player?.onboardingRewardClaimed);
  const checklistDone = onboardingStep > ONBOARDING_TASK_COUNT;
  // v168.1: yeni oyuncu "3 yıl önce"yi izleyene kadar görev / hatırlatma yok (sadece o düğme)
  const storyPre = Boolean(player) && !onboardingRewardClaimed && !storyStarted(player);

  // Hatırlatıcı listesi — SADECE ödül alındıktan sonra anlamlı, ama
  // hesaplaması ucuz olduğu için her zaman üretiliyor.
  const reminders = useMemo(() => {
    if (!player) return [];
    const list = [];

    // v124: "Ücretsiz slot haklarını kullan" hatırlatması kaldırıldı (ücretsiz slot yok)

    // v163 — MAÇ BAŞLADI: maç olan günlerde 18:00–19:00 arası, stadyumun dışındayken en üstte.
    // "Git" → stadyumun içi (güney tüneli; üstte canlı maç skoru görünür)
    if (matchLive && !inStadium) {
      list.push({ id: 'match-live', emoji: '⚽', text: 'Maç başladı — stadyumda canlı izle' });
    }

    if (!actions.prayedWindows?.[win]) {
      list.push({ id: 'pray', emoji: '🕌', text: 'İbadet et' });
    }

    // v91 KULLANICI HATASI: "arabalarımı 2. elde anında sattım, hiç arabam
    // yok ama 'Şampiyonaya katıl' hatırlatması geliyor". Anında satılan /
    // ilana konan araç belge olarak sahibinde kalıyor (listed:true), bu
    // yüzden hatırlatıcı yalnızca GERÇEKTEN yarışabilecek araçları sayar —
    // RaceLobby/ChampionshipScreen'deki raceable() ile aynı kural.
    // v163 KULLANICI HATASI: "yeni motor aldım, katılabileceğim araç yok ama 'Şampiyonaya katıl'
    // geliyor" — motor / ticari araç / bisiklet / at yarışa giremez (RaceLobby › raceable ile aynı)
    const raceableVehicles = vehicles.filter(
      (v) => isCarCatalogId(v.catalogId) && !v.listed && !v.seizedByBank && (v.lifeDays ?? 20) > 0
    );
    // v129: şampiyona hakkı MODEL başına (championship_{catalogId})
    const hasUnracedVehicleToday = raceableVehicles.some(
      (v) => !actions[`championship_${v.catalogId}`] && !raceableVehicles.some((x) => x.catalogId === v.catalogId && x.champDay === todayKey)
    );
    if (raceableVehicles.length > 0 && hasUnracedVehicleToday) {
      list.push({ id: 'championship', emoji: '🏁', text: 'Şampiyonaya katıl' });
    }

    // Kullanıcı revizesi: "maça girmediysek kadroyu düzenlemeye gerek yok
    // çünkü oyuncuların formu düşmemiş olacak" — bu yüzden takımın BUGÜN
    // gerçekten bir maç (lig ya da kupa) oynadığı doğrulanmadan bu
    // hatırlatıcı gösterilmiyor. lastMatchPlayedDateKey, sunucuda
    // applyFutbolMatchResult/applyFutbolCupMatchResult tarafından her
    // maç sonrası yazılıyor (bkz. functions/index.js).
    //
    // KULLANICI KONTROLÜ ("takım sahiplerine geliyor, menajerlere gelmiyor
    // olabilir"): useMyFutbolTeam menajerin yönettiği takımı da (managedTeam)
    // döndürdüğü ve maç/kadro tarihleri takım dokümanında tutulduğu için
    // hatırlatıcı menajerlere de geliyordu. Ters yönde ise bir eksik vardı:
    // takımın MENAJERİ varsa kadroyu sadece menajer düzenleyebiliyor (bkz.
    // functions/index.js futbolTeamControllerUid) — başkana "Kadronu düzenle"
    // demek işlem yapamayacağı bir uyarı olurdu. Artık hatırlatıcı yalnızca
    // kadroyu gerçekten düzenleyebilen kişiye (menajer ya da menajersiz
    // takımın başkanı) gösteriliyor.
    const canEditLineup = futbolRole === 'manager' || (futbolRole === 'owner' && !team?.managerUid);
    if (
      team &&
      canEditLineup &&
      team.lastMatchPlayedDateKey === todayKey &&
      team.lineupUpdatedDateKey !== todayKey
    ) {
      list.push({ id: 'lineup', emoji: '⚽', text: 'Kadronu düzenle' });
    }

    // v196: Çalış herkes için (fabrikası olan da) — günde 1 kez 5.000 (dailyActions.factoryWork)
    if (!actionsLoading && !actions.factoryWork) {
      list.push({ id: 'work', emoji: '🏭', text: 'Fabrikada çalış' });
    }

    // v204: fabrika belgesi + gerekirse 2 sayım (bkz. useMyFactoryRunNeeded)
    if (factoryRunNeeded) {
      list.push({ id: 'machines', emoji: '⚙️', text: 'Makineleri çalıştır' });
    }

    // v115: Park'taki gizemli adama günlük 10 risksiz satış hakkı — her
    // satışta sayı 1 azalır (sunucu: users.parkSafeSales = { day, count }).
    const safeUsed = player.parkSafeSales?.day === todayKey ? Number(player.parkSafeSales.count || 0) : 0;
    const safeLeft = Math.max(0, SAFE_DAILY_LIMIT - safeUsed);
    if (safeLeft > 0) {
      list.push({ id: 'park-safe', emoji: '💊', text: `Risksiz şekilde ${safeLeft} adet yasaklı madde sat` });
      // v162: elindeki yasaklı madde kalan satış hakkından azsa, eksik kadarını almayı hatırlat
      // ("Git" → Liman & Depo kapısı; kapıda Depolar listesi kendiliğinden açılır)
      const owned = Math.max(0, Math.floor(Number(inventory?.yasakliMadde || 0)));
      if (!invLoading && owned < safeLeft) {
        list.push({ id: 'depo-buy-contraband', emoji: '📦', text: `${safeLeft - owned} adet yasaklı madde al` });
      }
    }

    // v162: gücün 0 ise (kullanılabilir silahın yok) silahçıya yönlendir — Soygun ekranındaki
    // "Gücün" ile aynı kural: satışta olan / ömrü bitmiş silah sayılmaz
    const myPower = weapons.reduce((max, w) => (!w.listed && (w.lifeDays ?? 20) > 0 ? Math.max(max, Number(w.power) || 0) : max), 0);
    if (!weaponsLoading && myPower <= 0) {
      list.push({ id: 'silah-power0', emoji: '🔫', text: 'Gücün 0 — silahçıya git, silah al' });
    }

    // v108.1: polis rüşvet payı da her gece 00:00'da maaşla otomatik yatar (hatırlatıcı yok)
    // v108: imam maaşı her gece 00:00'da otomatik yatar (hatırlatıcı yok)

    // v127: belediye daveti (24 saat geçerli) — Belediye Binası › Belediye
    if (Number(player.belediyeInvite?.expiresAtMs || 0) > Date.now()) {
      list.push({ id: 'belediye', emoji: '🏛️', text: 'Belediyeye uğra' });
    }

    // v160.3: seçim dönemi hatırlatmaları (gizli polis darbe oylaması 🗳️ düğmesinde kalır)
    if (polNeed && POL_REMIND[polNeed]) list.push({ id: `pol-${polNeed}`, ...POL_REMIND[polNeed] });

    // v38: çete hatırlatıcıları (bkz. components/Gangs/alerts.jsx)
    if (gangReminders?.joinWar) list.push({ id: 'gang-war', emoji: '⚔️', text: 'Savaşa katıl' });
    if (gangReminders?.takeMoney) list.push({ id: 'gang-money', emoji: '💰', text: 'Çeteden para al' });
    if (gangReminders?.report) list.push({ id: 'gang-report', emoji: '📡', text: 'İhbar et' });
    if (gangReminders?.leak) list.push({ id: 'gang-leak', emoji: '📦', text: 'İçeriği aç' });
    // v146: okunmamış sohbetler (sohbet görülünce kaybolur)
    if (belediyeChat) list.push({ id: 'chat-belediye', emoji: '🏛️', text: 'Belediyede yeni mesajlar var' });
    if (gangChat) list.push({ id: 'chat-gang', emoji: '💬', text: 'Çetende yeni mesajlar var' });
    if (intelChat) list.push({ id: 'chat-intel', emoji: '🚔', text: 'Polis teşkilatında yeni mesajlar var' });

    list.push(...bizReminders);

    return list;
  }, [matchLive, inStadium, player, actions, vehicles, weapons, weaponsLoading, inventory, invLoading, team, futbolRole, actionsLoading, factoryRunNeeded, todayKey, win, gangReminders?.joinWar, gangReminders?.takeMoney, gangReminders?.report, gangReminders?.leak, bizReminders, belediyeChat, gangChat, intelChat, polNeed]);

  return {
    loading: playerLoading || actionsLoading,
    player,
    onboardingStep,
    currentTaskId, // v124: aktif görevin sabit kimliği (durum görevleri için)
    onboardingRewardClaimed,
    checklistDone,
    storyPre,
    reminders,
    // Butonun tamamen gizlenmesi gereken durum: ödül alınmış VE aktif
    // hiçbir hatırlatıcı yok.
    shouldHideButton: Boolean(user) && onboardingRewardClaimed && reminders.length === 0,
  };
}
