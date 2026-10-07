import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BlocksProvider } from './contexts/BlocksContext';
import Hud from './components/Hud/Hud';
import CityMap from './components/CityMap/CityMap';
import BottomBar from './components/BottomBar/BottomBar';
import PhoneScreen from './components/Phone/PhoneScreen';
import RegionModal from './components/RegionModal/RegionModal';
import { SocialProvider, useSocial } from './contexts/SocialContext';
import { OPEN_DM_EVENT } from './lib/chatsappNav';
import ReferralPrompt from './components/ReferralPrompt/ReferralPrompt';
import RaceBubble from './components/RaceTrackScreen/RaceBubble';
import { GangAlertsContext, useGangAlerts } from './components/Gangs/alerts';
import { useUnreadNotifications } from './hooks/useUnreadNotifications';
import TopNotificationBanner from './components/TopNotificationBanner/TopNotificationBanner';
import OnboardingPanel from './components/OnboardingPanel/OnboardingPanel';
import { usePlayer } from './hooks/usePlayer';
import { useMyActiveRaceRoom } from './hooks/useMyActiveRaceRoom';
import { useFirestoreResume } from './hooks/useFirestoreResume';
import { migrateArabaGelistirmeUnification, migrateVehicleWeaponLifeCap, migrateVehicleWeaponLifeCap20, migrateWeaponLifeCap10, resetFutbolTransferMarket, migrateOnboardingPoliceRule } from './services/gameActions';
import { regions } from './data/regions';
import { BIZ_BY_REGION } from '../functions/businessCatalogData.js';
import { IS_ANDROID_APP } from './lib/platform';
import { exitApp, installBackHandler, rearmBack, useBackClose } from './lib/backStack';
import ConfirmModal from './components/ConfirmModal/ConfirmModal';
import './styles/theme.css';
import './styles/cues.css';
import './App.css';


// v67 — "ilk açılışta / sekme geçişlerinde kasma": tam ekran sayfalar ve
// mekân dünyaları ana paketten ayrıldı (ilk yükleme küçüldü). Uygulama
// açıldıktan birkaç saniye sonra boşta arka planda önceden indirilir, böylece
// sekmeye ilk dokunuşta beklenmez.
const LAZY_LOADERS = [];
function lazyScreen(loader) {
  LAZY_LOADERS.push(loader);
  const C = lazy(loader);
  const Wrapped = (props) => (
    <Suspense fallback={<div className="app-lazy-fallback" aria-busy="true"><span /></div>}>
      <C {...props} />
    </Suspense>
  );
  return Wrapped;
}
const MekanlarScreen = lazyScreen(() => import('./components/MekanlarScreen/MekanlarScreen'));
const RaceFullScreen = lazyScreen(() => import('./components/RaceTrackScreen/RaceFullScreen'));
const OnNumaraFullScreen = lazyScreen(() => import('./components/OnNumaraScreen/OnNumaraFullScreen'));
const ProfileFullScreen = lazyScreen(() => import('./components/ProfileFullScreen/ProfileFullScreen'));
const HouseHub = lazyScreen(() => import('./components/HouseScreen/HouseHub'));
const BusinessHub = lazyScreen(() => import('./components/BusinessHub/BusinessHub'));
const NetCreditRing = lazyScreen(() => import('./components/Venue/NetCreditRing'));
const FutbolFullScreen = lazyScreen(() => import('./components/FutbolScreen/FutbolFullScreen'));
const GangsFullScreen = lazyScreen(() => import('./components/Gangs/GangsFullScreen'));
const ParkWorldScreen = lazyScreen(() => import('./components/ParkWorldScreen/ParkWorldScreen'));
const BankWorldScreen = lazyScreen(() => import('./components/BankWorldScreen/BankWorldScreen'));
const KarakolWorldScreen = lazyScreen(() => import('./components/KarakolWorldScreen/KarakolWorldScreen'));
const MosqueWorldScreen = lazyScreen(() => import('./components/MosqueWorldScreen/MosqueWorldScreen'));
const CasinoWorldScreen = lazyScreen(() => import('./components/CasinoWorldScreen/CasinoWorldScreen'));
const CarDealershipWorldScreen = lazyScreen(() => import('./components/CarDealershipWorldScreen/CarDealershipWorldScreen'));
const WeaponShopWorldScreen = lazyScreen(() => import('./components/WeaponShopWorldScreen/WeaponShopWorldScreen'));
const TuningGarageWorldScreen = lazyScreen(() => import('./components/TuningGarageWorldScreen/TuningGarageWorldScreen'));

function prefetchScreens() {
  let i = 0;
  const next = () => {
    if (i >= LAZY_LOADERS.length) return;
    LAZY_LOADERS[i++]().catch(() => {});
    (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(next);
  };
  next();
}

const RACE_TRACK_REGION = regions.find((r) => r.screen === 'yaris-pisti');

// Depo + Vites Geliştirme Malzemeleri birleştirme geçişi bu oturumda
// zaten tetiklendi mi? (Gereksiz tekrar çağrıyı önlemek için — işlemin
// kendisi zararsız/idempotent olsa da.)
let arabaGelistirmeMigrationTriggered = false;
// Araç/silah ömür tavanı 50→30 geçişi bu oturumda tetiklendi mi? (Bu göç
// artık ASIL OLARAK sunucudaki dailyReset içinde her gece otomatik
// çalışıyor — bu istemci tetiklemesi sadece deploy edilir edilmez, gece
// yarısını beklemeden hemen çalışsın diye ekstra bir güvence.)
let lifeCapMigrationTriggered = false;
let lifeCap20MigrationTriggered = false;
let weaponLifeCap10MigrationTriggered = false; // v58
// Futbol transfer piyasası eski (dengesiz) sistem stoğunu yeni,
// takımlardaki gerçek güce göre dengelenmiş kurallara sıfırlayan
// geçişin bu oturumda tetiklenip tetiklenmediği. Sunucu tarafında bir
// migration bayrağıyla İDEMPOTENT olduğu için tekrar tekrar çağırmak
// zararsız, ama gereksiz ağ isteğini önlemek için burada da işaretliyoruz.
let futbolTransferMarketResetTriggered = false;
// Onboarding polis kuralı göçü (tüm mevcut polisleri görevden alma +
// bekleyen başvuruları iptal etme + gazete duyurusu) bu oturumda
// tetiklendi mi? Asıl olarak sunucudaki dailyReset içinde her gece
// otomatik çalışıyor (bkz. functions/index.js runOnboardingPoliceRuleMigration)
// — bu istemci tetiklemesi, deploy'dan sonra kullanıcı uygulamayı ilk
// açtığı an, gece yarısını beklemeden hemen çalışsın diye ekstra bir
// güvence. TAMAMEN OTOMATİK — hiçbir elle tıklama gerektirmez.
let onboardingPoliceRuleMigrationTriggered = false;

// Harita, HUD ve telefon giriş yapmadan da görülebilir/gezilebilir — giriş
// çağrısı artık haritayı bloklayan ayrı bir katman yerine, her ekranda görünen
// HUD'un içinde (sağ üstteki "Giriş Yap" butonu) yaşıyor. Bir aksiyon
// (fabrikada çalışma vb.) denendiğinde ayrıca RegionModal içinde de
// SignInPrompt gösterilir.
function GameShell() {
  const { user } = useAuth();
  // Çeteler bildirim işaretleri (alt çubuk + çete içi sekmeler)
  const gangAlerts = useGangAlerts(user?.uid);
  // Telefon rozeti + haritadaki ChatsApp kısayolunun "yeni mesaj" noktası (tek dinleyici)
  const unread = useUnreadNotifications();
  const [activeRegion, setActiveRegion] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneInitialApp, setPhoneInitialApp] = useState(null);
  // v60: arkadaş sohbetleri + istekler (ChatsApp rozeti) ve Oyuncu Kartı → "💬 Mesaj"
  const social = useSocial();
  const chatsAppCount = social.unreadTotal + social.requestCount;
  useEffect(() => {
    const on = () => {
      setPhoneInitialApp('chatsapp');
      setPhoneOpen(true);
    };
    window.addEventListener(OPEN_DM_EVENT, on);
    return () => window.removeEventListener(OPEN_DM_EVENT, on);
  }, []);
  const [heistTarget, setHeistTarget] = useState(undefined); // undefined=kapalı, null=açık/hedefsiz (Mekanlar ekranı)
  // mekanlarTab — Mekanlar ekranı açıkken hangi sekme aktif (yeni istek:
  // "Soygun sekmesinin adını Mekanlar yapacağız, 3 ana sekmeye ayrılacak:
  // Soygun - Şüphe - Ziyaret").
  const [mekanlarTab, setMekanlarTab] = useState('soygun');
  // visitReturnPending — Ziyaret sekmesinden bir mekana girildiyse true;
  // o mekandan çıkınca ana haritaya değil, Mekanlar ekranına (Ziyaret
  // sekmesinde) geri dönülür (yeni istek: "oradan girdiysek mekandan
  // çıktığımızda yine o ekran açık şekilde bizi bekleyecek").
  const [visitReturnPending, setVisitReturnPending] = useState(false);
  const [activeRaceRoomId, setActiveRaceRoomId] = useState(null);
  const [raceExpanded, setRaceExpanded] = useState(false);
  // raceLobbyMode — kullanıcı revizesi: "şampiyonadan/antrenmandan/
  // bahisli yarıştan çıkınca, yarışın genel ana ekranına değil, hangi
  // lobiden girdiysek ORAYA dönelim". RaceTrackScreen hangi kartı
  // (championship/bet/training) seçtiğimizi buraya bildiriyor, oda
  // kapanınca (bkz. RaceFullScreen onExit) aynı lobiyle tekrar açıyoruz.
  const [raceLobbyMode, setRaceLobbyMode] = useState(null);
  const [activeTableId, setActiveTableId] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // v66: Ev ekranı — null kapalı, { houseId } açık (houseId null → liste)
  const [houseView, setHouseView] = useState(null);
  // v77: İşletme listesi — null kapalı, { type } açık (spor, cafe, bar, internet, silahci, galeri, modifiye)
  const [businessView, setBusinessView] = useState(null);
  const [gangsOpen, setGangsOpen] = useState(false);
  const [futbolOpen, setFutbolOpen] = useState(false);
  // comingSoon — "Çok yakında" mesajı (mekan adı), 2 sn sonra kendiliğinden kapanır.
  const [comingSoon, setComingSoon] = useState(null);
  const comingSoonTimer = useRef(null);
  const showComingSoon = (name) => {
    setComingSoon(name);
    clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = setTimeout(() => setComingSoon(null), 2200);
  };
  useEffect(() => () => clearTimeout(comingSoonTimer.current), []);
  const [parkOpen, setParkOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [karakolOpen, setKarakolOpen] = useState(false);
  const [mosqueOpen, setMosqueOpen] = useState(false);
  const [casinoOpen, setCasinoOpen] = useState(false);
  const [dealershipOpen, setDealershipOpen] = useState(false);
  const [weaponShopOpen, setWeaponShopOpen] = useState(false);
  const [tuningGarageOpen, setTuningGarageOpen] = useState(false);
  const { player } = usePlayer();

  // v68 — Android geri tuşu: açık ekran/mekân varsa onu kapatır (mekândan →
  // ana sayfa); ana sayfadayken "Çıkmak istiyor musun?" sorulur.
  const [exitAsk, setExitAsk] = useState(false);
  useEffect(() => {
    installBackHandler(() => setExitAsk(true));
  }, []);
  const venueClose = (fn) => () => closeVenueMaybeReturnToVisit(fn);
  useBackClose(Boolean(activeRegion), () => setActiveRegion(null));
  useBackClose(profileOpen, () => setProfileOpen(false));
  useBackClose(futbolOpen, () => setFutbolOpen(false));
  useBackClose(gangsOpen, () => setGangsOpen(false));
  useBackClose(heistTarget !== undefined, () => setHeistTarget(undefined));
  useBackClose(parkOpen, venueClose(setParkOpen));
  useBackClose(bankOpen, venueClose(setBankOpen));
  useBackClose(karakolOpen, venueClose(setKarakolOpen));
  useBackClose(mosqueOpen, venueClose(setMosqueOpen));
  useBackClose(casinoOpen, venueClose(setCasinoOpen));
  useBackClose(dealershipOpen, venueClose(setDealershipOpen));
  useBackClose(weaponShopOpen, venueClose(setWeaponShopOpen));
  useBackClose(tuningGarageOpen, venueClose(setTuningGarageOpen));
  useBackClose(raceExpanded, () => setRaceExpanded(false));
  useBackClose(Boolean(activeTableId), () => setActiveTableId(null));

  // Uygulama arka plana alınıp geri geldiğinde (özellikle iOS'ta) Firestore
  // dinleyicilerinin durağanlaşmasını önlemek için — bkz. hook içindeki not.
  useFirestoreResume();

  // v67 — açılıştaki kasmayı azaltmak için: eski tek seferlik göç
  // çağrıları (hepsi sunucuda bayraklı/idempotent ve gece 00:00'da zaten
  // otomatik çalışıyor) artık açılışın ilk saniyelerinde ağı meşgul etmiyor —
  // 20 sn sonra, cihaz başına GÜNDE en fazla bir kez, sırayla tetikleniyor.
  // Ekranlar da 3 sn sonra arka planda önceden indiriliyor.
  useEffect(() => {
    if (!user) return undefined;
    const pre = setTimeout(prefetchScreens, 3000);
    const t = setTimeout(async () => {
      const key = `ns_migrations_${new Date().toISOString().slice(0, 10)}`;
      try {
        if (localStorage.getItem(key)) return;
      } catch {
        /* depolama yok — yine de çalıştır */
      }
      const jobs = [
        [() => !arabaGelistirmeMigrationTriggered && ((arabaGelistirmeMigrationTriggered = true), migrateArabaGelistirmeUnification()), 'Araba geliştirme malzemesi geçişi'],
        [() => !lifeCapMigrationTriggered && ((lifeCapMigrationTriggered = true), migrateVehicleWeaponLifeCap()), 'Araç/silah ömür tavanı geçişi'],
        [() => !lifeCap20MigrationTriggered && ((lifeCap20MigrationTriggered = true), migrateVehicleWeaponLifeCap20()), 'Araç/silah ömür tavanı (20) geçişi'],
        [() => !weaponLifeCap10MigrationTriggered && ((weaponLifeCap10MigrationTriggered = true), migrateWeaponLifeCap10()), 'Silah ömür tavanı (10) geçişi'],
        [() => !futbolTransferMarketResetTriggered && ((futbolTransferMarketResetTriggered = true), resetFutbolTransferMarket()), 'Futbol transfer piyasası sıfırlama'],
        [() => !onboardingPoliceRuleMigrationTriggered && ((onboardingPoliceRuleMigrationTriggered = true), migrateOnboardingPoliceRule()), 'Onboarding polis kuralı göçü'],
      ];
      for (const [run, label] of jobs) {
        try {
          await run();
        } catch (err) {
          console.error(`${label} başarısız:`, err);
        }
      }
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* yoksay */
      }
    }, 20_000);
    return () => {
      clearTimeout(pre);
      clearTimeout(t);
    };
  }, [user]);

  // Aktif bir yarışım varsa (kurdum/katıldım/devam ediyor), harita üzerinde
  // gezinirken bile takip etmeye devam et — ama rakip beklenirken tüm
  // ekranı KAPLAMASIN, sadece küçük bir yuvarlak göstersin (bkz.
  // RaceBubble). Yarış gerçekten başladığında (status='racing') otomatik
  // olarak tam ekrana geçer.
  const { room: myActiveRoom } = useMyActiveRaceRoom();
  const effectiveRaceRoomId = activeRaceRoomId || myActiveRoom?.id || null;

  useEffect(() => {
    if (myActiveRoom?.status === 'racing') {
      setRaceExpanded(true);
    }
  }, [myActiveRoom?.status]);

  const handleRegionClick = (regionId, regionMeta) => {
    // v66: "Ev" → Evler ekranı (ev satın al, evlerim, girebileceğim evler).
    // Profil alttaki 5. sekmede (👤).
    if (regionMeta?.screen === 'ev') {
      setHouseView({ houseId: null });
      return;
    }
    // Stadyum → doğrudan Futbol paneli (alttaki Futbol butonu kaldırıldı).
    if (regionMeta?.screen === 'futbol') {
      setFutbolOpen(true);
      return;
    }
    // v77: işletme türleri (Spor Salonu, Cafe, Bar, İnternet Kafe, Silah
    // Mağazası, Araba Galerisi, Modifiye Garajı) → o türdeki aktif dükkânlar +
    // "[tür] aç". Oyunun kendi dükkânı (silah/galeri/modifiye) listenin en üstünde.
    const bizType = BIZ_BY_REGION[regionMeta?.id];
    if (bizType) {
      setBusinessView({ type: bizType });
      return;
    }
    // Henüz yapılmamış mekanlar (Belediye): kısa bir "Çok yakında" mesajı.
    if (regionMeta?.screen === 'yakinda') {
      showComingSoon(regionMeta.name);
      return;
    }
    if (regionMeta?.screen === 'park') {
      setParkOpen(true);
      return;
    }
    // Banka artık Park gibi girilebilir bir mekan (bkz. madde 2-4) —
    // RegionModal'daki eski "hızlı panel" yerine tam ekran iç mekana
    // giriliyor.
    if (regionMeta?.screen === 'banka') {
      setBankOpen(true);
      return;
    }
    // Karakol da artık Banka gibi girilebilir bir mekan (bkz. madde 5) —
    // eski "hızlı panel" (PoliceStationScreen tek ekran) yerine tam ekran
    // iç mekana giriliyor; girişteki memur (rüşvet) ve içerideki komiser
    // (başvuru) artık ayrı NPC etkileşimleri.
    if (regionMeta?.screen === 'rüşvet') {
      setKarakolOpen(true);
      return;
    }
    // Camii de artık girilebilir bir mekan (bkz. madde 6) — eski "hızlı
    // panel" (MosqueScreen tek ekran) yerine tam ekran iç mekana giriliyor;
    // imam ve dilenci artık ayrı NPC etkileşimleri.
    if (regionMeta?.screen === 'ibadet') {
      setMosqueOpen(true);
      return;
    }
    // Gazino da artık girilebilir bir mekan (bkz. madde 7-9) — eski "hızlı
    // panel" (CasinoScreen) yerine tam ekran iç mekana giriliyor. Telefon
    // uygulaması (madde 8) hâlâ CasinoScreen'i olduğu gibi kullanıyor.
    if (regionMeta?.screen === 'casino') {
      setCasinoOpen(true);
      return;
    }
    // Araba Galerisi, Silah Mağazası ve Modifiye Garajı da artık Banka/Gazino
    // gibi girilebilir mekanlar (bkz. yeni 3 mekan talebi) — RegionModal'daki
    // eski düz panel yerine tam ekran iç mekana giriliyor.
    if (regionMeta?.screen === 'araba-galerisi') {
      setDealershipOpen(true);
      return;
    }
    if (regionMeta?.screen === 'silah-magazasi') {
      setWeaponShopOpen(true);
      return;
    }
    if (regionMeta?.screen === 'modifiye-garaji') {
      setTuningGarageOpen(true);
      return;
    }
    setActiveRegion(regionMeta);
  };

  const openHeistScreen = (target) => {
    setActiveRegion(null);
    // Soygun köşe butonlarından (Banka/Gazino/Galeri/Garaj içi) veya alt
    // bardan açılınca her zaman Soygun sekmesinde açılır.
    setMekanlarTab('soygun');
    setHeistTarget(target ?? null);
  };

  // openVenueForVisit / closeVenueMaybeReturnToVisit — Ziyaret sekmesinden
  // bir mekana giriş/çıkış akışı. Girerken Mekanlar ekranı kapanır (mekan
  // üstte açılır), çıkarken (visitReturnPending true ise) Mekanlar ekranı
  // Ziyaret sekmesinde tekrar açılır — RaceFullScreen'in "kendi lobisine
  // dön" deseniyle AYNI mantık (bkz. aşağıdaki RACE_TRACK_REGION notu).
  const openVenueForVisit = (openFn) => {
    setHeistTarget(undefined);
    setVisitReturnPending(true);
    openFn(true);
  };

  const closeVenueMaybeReturnToVisit = (closeFn) => {
    closeFn(false);
    if (visitReturnPending) {
      setVisitReturnPending(false);
      setMekanlarTab('ziyaret');
      setHeistTarget(null);
    }
  };

  const VISIT_OPEN_FNS = {
    park: setParkOpen,
    banka: setBankOpen,
    karakol: setKarakolOpen,
    mosque: setMosqueOpen,
    casino: setCasinoOpen,
    dealership: setDealershipOpen,
    weaponShop: setWeaponShopOpen,
    tuningGarage: setTuningGarageOpen,
  };

  const handleVisitVenue = (openKey) => {
    const fn = VISIT_OPEN_FNS[openKey];
    if (fn) openVenueForVisit(fn);
  };

  const openRace = (roomId) => {
    setActiveRegion(null);
    setActiveRaceRoomId(roomId);
    setRaceExpanded(false);
  };

  const openTable = (tableId) => {
    setActiveRegion(null);
    setActiveTableId(tableId);
  };

  return (
    <div className="app-shell">
      {exitAsk && (
        <ConfirmModal
          title="Çıkmak istiyor musun?"
          message="İlerlemen kayıtlı. Çıkmak için geri tuşuna bir kez daha bas."
          confirmLabel="Çık"
          cancelLabel="Oyunda kal"
          onCancel={() => {
            setExitAsk(false);
            rearmBack();
          }}
          onConfirm={() => exitApp()}
        />
      )}
      <Hud
        suspicion={player?.suspicion ?? 0}
        reputation={player?.reputation ?? 0}
        gold={player?.gold ?? 0}
        onGoldClick={() => {
          // Android (Google Play TWA): Altın Mağazası yerine telefondaki
          // Parara Bank açılır (altın bakiyesi başlıkta görünür). Web aynı.
          setPhoneInitialApp(IS_ANDROID_APP ? 'banka' : 'altin-magazasi');
          setPhoneOpen(true);
        }}
      />

      {/* v77: internet kafe ödenmiş süre halkası — mekân dışında da görünür */}
      {user && <NetCreditRing className="vn-fixed" />}

      <main className="map-stage">
        <CityMap onRegionClick={handleRegionClick} />
      </main>

      <ReferralPrompt />

      <BottomBar
        onHeistClick={() => openHeistScreen(null)}
        onGangsClick={() => setGangsOpen(true)}
        gangsBadge={gangAlerts.any}
        onProfileClick={() => setProfileOpen(true)}
      />

      {/* Telefon kısayolu — ChatsApp butonunun TAM üstünde, aynı boyutta. */}
      <button
        className="map-phone-btn"
        onClick={() => setPhoneOpen(true)}
        aria-label="Telefon"
        title="Telefon"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
        {unread.totalBadge > 0 && (
          <span className="bottom-bar-badge">{unread.totalBadge > 9 ? '9+' : unread.totalBadge}</span>
        )}
      </button>

      {comingSoon && (
        <div className="coming-soon-toast" role="status">
          🚧 {comingSoon} — Çok yakında
        </div>
      )}

      {/* Yeni istek: "chatsapp ... anasayfada sağ alta yakın bi noktada
          kısa yolu bulunsun" — alttaki 4 sekmeden biri DEĞİL, çubuğun
          hafif üstünde/sağında, mekanlardaki kamera/telefon butonlarıyla
          aynı boyutta (52px) bağımsız bir kısayol. */}
      <button
        className="map-chatsapp-btn"
        onClick={() => {
          setPhoneInitialApp('chatsapp');
          setPhoneOpen(true);
        }}
        aria-label="ChatsApp"
        title="ChatsApp"
      >
        💬
        {chatsAppCount > 0 ? (
          <span className="map-chatsapp-badge">{chatsAppCount > 99 ? '99+' : chatsAppCount}</span>
        ) : (
          unread.chatsAppHasNew && <span className="map-chatsapp-dot" />
        )}
      </button>

      {/* Yeni görev/hatırlatıcı paneli — ChatsApp butonunun tam simetriği,
          sol altta aynı boyut/konumda (bkz. OnboardingPanel.css). */}
      <OnboardingPanel gangReminders={gangAlerts?.reminders} />

      {phoneOpen && (
        <PhoneScreen
          onClose={() => {
            setPhoneOpen(false);
            setPhoneInitialApp(null);
          }}
          initialApp={phoneInitialApp}
          onEnterTable={openTable}
        />
      )}
      <TopNotificationBanner
        onOpenPhone={(type) => {
          setPhoneInitialApp(type === 'sms' ? 'sms' : 'chatsapp');
          setPhoneOpen(true);
        }}
      />
      {profileOpen && <ProfileFullScreen onClose={() => setProfileOpen(false)} />}
      {houseView && (
        <HouseHub
          initialHouseId={houseView.houseId}
          onClose={() => {
            const fromVisit = Boolean(houseView.houseId) && visitReturnPending;
            setHouseView(null);
            if (fromVisit) {
              setVisitReturnPending(false);
              setMekanlarTab('ziyaret');
              setHeistTarget(null);
            }
          }}
        />
      )}
      {businessView && (
        <BusinessHub
          type={businessView.type}
          onClose={() => setBusinessView(null)}
          onOpenGameVenue={() => {
            const open = { silahci: setWeaponShopOpen, galeri: setDealershipOpen, modifiye: setTuningGarageOpen }[businessView.type];
            setBusinessView(null);
            open?.(true);
          }}
        />
      )}
      {futbolOpen && <FutbolFullScreen onClose={() => setFutbolOpen(false)} />}
      {gangsOpen && (
        <GangAlertsContext.Provider value={gangAlerts}>
          <GangsFullScreen onClose={() => setGangsOpen(false)} />
        </GangAlertsContext.Provider>
      )}

      <RegionModal
        region={activeRegion}
        onClose={() => setActiveRegion(null)}
        onOpenHeist={openHeistScreen}
        onEnterRace={openRace}
        onEnterTable={openTable}
        raceLobbyMode={raceLobbyMode}
        onRaceModeChange={setRaceLobbyMode}
      />

      {parkOpen && (
        <ParkWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setParkOpen)} />
      )}

      {bankOpen && (
        <BankWorldScreen
          onExit={() => closeVenueMaybeReturnToVisit(setBankOpen)}
          onOpenHeist={openHeistScreen}
        />
      )}

      {karakolOpen && (
        <KarakolWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setKarakolOpen)} />
      )}

      {mosqueOpen && (
        <MosqueWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setMosqueOpen)} />
      )}

      {casinoOpen && (
        <CasinoWorldScreen
          onExit={() => closeVenueMaybeReturnToVisit(setCasinoOpen)}
          onOpenHeist={openHeistScreen}
        />
      )}

      {dealershipOpen && (
        <CarDealershipWorldScreen
          onExit={() => closeVenueMaybeReturnToVisit(setDealershipOpen)}
          onOpenHeist={openHeistScreen}
        />
      )}

      {weaponShopOpen && (
        <WeaponShopWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setWeaponShopOpen)} />
      )}

      {tuningGarageOpen && (
        <TuningGarageWorldScreen
          onExit={() => closeVenueMaybeReturnToVisit(setTuningGarageOpen)}
          onOpenHeist={openHeistScreen}
        />
      )}

      {heistTarget !== undefined && (
        <MekanlarScreen
          tab={mekanlarTab}
          onTabChange={setMekanlarTab}
          initialHeistTarget={heistTarget}
          onClose={() => setHeistTarget(undefined)}
          onVisitVenue={handleVisitVenue}
          onVisitHouse={(houseId) => {
            setHeistTarget(undefined);
            setVisitReturnPending(true);
            setHouseView({ houseId });
          }}
        />
      )}

      {effectiveRaceRoomId && user && raceExpanded && (
        <RaceFullScreen
          roomId={effectiveRaceRoomId}
          myUid={user.uid}
          onCollapse={() => setRaceExpanded(false)}
          onExit={() => {
            setActiveRaceRoomId(null);
            setRaceExpanded(false);
            // Ana haritaya değil, doğrudan Yarış Pisti'nin kendi lobisine
            // dön — "Lobiye Dön" tam olarak bunu vaat ediyor.
            setActiveRegion(RACE_TRACK_REGION);
          }}
        />
      )}

      {effectiveRaceRoomId && user && !raceExpanded && (
        <RaceBubble roomId={effectiveRaceRoomId} onExpand={() => setRaceExpanded(true)} />
      )}

      {activeTableId && user && (
        <OnNumaraFullScreen
          tableId={activeTableId}
          myUid={user.uid}
          onExit={() => setActiveTableId(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      {/* UGC D2: engelleme listesi — tek dinleyici, tüm ekranlar buradan okur */}
      <BlocksProvider>
        {/* v60: arkadaşlar, istekler, özel sohbetler — tek sağlayıcı */}
        <SocialProvider>
          <GameShell />
        </SocialProvider>
      </BlocksProvider>
    </AuthProvider>
  );
}
