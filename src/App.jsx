import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Hud from './components/Hud/Hud';
import CityMap from './components/CityMap/CityMap';
import BottomBar from './components/BottomBar/BottomBar';
import PhoneScreen from './components/Phone/PhoneScreen';
import RegionModal from './components/RegionModal/RegionModal';
import MekanlarScreen from './components/MekanlarScreen/MekanlarScreen';
import ReferralPrompt from './components/ReferralPrompt/ReferralPrompt';
import RaceFullScreen from './components/RaceTrackScreen/RaceFullScreen';
import RaceBubble from './components/RaceTrackScreen/RaceBubble';
import OnNumaraFullScreen from './components/OnNumaraScreen/OnNumaraFullScreen';
import ProfileFullScreen from './components/ProfileFullScreen/ProfileFullScreen';
import FutbolFullScreen from './components/FutbolScreen/FutbolFullScreen';
import ParkWorldScreen from './components/ParkWorldScreen/ParkWorldScreen';
import BankWorldScreen from './components/BankWorldScreen/BankWorldScreen';
import KarakolWorldScreen from './components/KarakolWorldScreen/KarakolWorldScreen';
import MosqueWorldScreen from './components/MosqueWorldScreen/MosqueWorldScreen';
import CasinoWorldScreen from './components/CasinoWorldScreen/CasinoWorldScreen';
import CarDealershipWorldScreen from './components/CarDealershipWorldScreen/CarDealershipWorldScreen';
import WeaponShopWorldScreen from './components/WeaponShopWorldScreen/WeaponShopWorldScreen';
import TuningGarageWorldScreen from './components/TuningGarageWorldScreen/TuningGarageWorldScreen';
import TopNotificationBanner from './components/TopNotificationBanner/TopNotificationBanner';
import { usePlayer } from './hooks/usePlayer';
import { useMyActiveRaceRoom } from './hooks/useMyActiveRaceRoom';
import { useFirestoreResume } from './hooks/useFirestoreResume';
import { migrateArabaGelistirmeUnification, migrateVehicleWeaponLifeCap, resetFutbolTransferMarket } from './services/gameActions';
import { regions } from './data/regions';
import './styles/theme.css';
import './App.css';

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
// Futbol transfer piyasası eski (dengesiz) sistem stoğunu yeni,
// takımlardaki gerçek güce göre dengelenmiş kurallara sıfırlayan
// geçişin bu oturumda tetiklenip tetiklenmediği. Sunucu tarafında bir
// migration bayrağıyla İDEMPOTENT olduğu için tekrar tekrar çağırmak
// zararsız, ama gereksiz ağ isteğini önlemek için burada da işaretliyoruz.
let futbolTransferMarketResetTriggered = false;

// Harita, HUD ve telefon giriş yapmadan da görülebilir/gezilebilir — giriş
// çağrısı artık haritayı bloklayan ayrı bir katman yerine, her ekranda görünen
// HUD'un içinde (sağ üstteki "Giriş Yap" butonu) yaşıyor. Bir aksiyon
// (fabrikada çalışma vb.) denendiğinde ayrıca RegionModal içinde de
// SignInPrompt gösterilir.
function GameShell() {
  const { user } = useAuth();
  const [activeRegion, setActiveRegion] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneInitialApp, setPhoneInitialApp] = useState(null);
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
  const [futbolOpen, setFutbolOpen] = useState(false);
  const [parkOpen, setParkOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [karakolOpen, setKarakolOpen] = useState(false);
  const [mosqueOpen, setMosqueOpen] = useState(false);
  const [casinoOpen, setCasinoOpen] = useState(false);
  const [dealershipOpen, setDealershipOpen] = useState(false);
  const [weaponShopOpen, setWeaponShopOpen] = useState(false);
  const [tuningGarageOpen, setTuningGarageOpen] = useState(false);
  const { player } = usePlayer();

  // Uygulama arka plana alınıp geri geldiğinde (özellikle iOS'ta) Firestore
  // dinleyicilerinin durağanlaşmasını önlemek için — bkz. hook içindeki not.
  useFirestoreResume();

  // Depo + Vites Geliştirme Malzemeleri birleştirme geçişini, kullanıcı
  // giriş yapar yapmaz sessizce (bir kez) tetikle — hangi ekranı önce
  // açtığından bağımsız olarak çalışsın diye en üst seviyede.
  useEffect(() => {
    if (!user || arabaGelistirmeMigrationTriggered) return;
    arabaGelistirmeMigrationTriggered = true;
    migrateArabaGelistirmeUnification().catch((err) => {
      console.error('Araba geliştirme malzemesi geçişi başarısız:', err);
    });
  }, [user]);

  // Araç/silah ömür tavanı 50→30 güne düştüğü için, eski (50 güne göre
  // yaşlanmış) kayıtları yeni tavana çeken geçişi de aynı şekilde tetikle.
  useEffect(() => {
    if (!user || lifeCapMigrationTriggered) return;
    lifeCapMigrationTriggered = true;
    migrateVehicleWeaponLifeCap().catch((err) => {
      console.error('Araç/silah ömür tavanı geçişi başarısız:', err);
    });
  }, [user]);

  // Futbol transfer piyasasını yeni (takımlardaki gerçek güce göre
  // dengelenmiş) kurallara sıfırla — bkz. yukarıdaki not.
  useEffect(() => {
    if (!user || futbolTransferMarketResetTriggered) return;
    futbolTransferMarketResetTriggered = true;
    resetFutbolTransferMarket().catch((err) => {
      console.error('Futbol transfer piyasası sıfırlama başarısız:', err);
    });
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
    // "Ev" ve "Park" artık ara bir onay ekranı göstermiyor — doğrudan
    // ilgili tam ekrana giriyor.
    if (regionMeta?.screen === 'ev') {
      setProfileOpen(true);
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
      <Hud
        suspicion={player?.suspicion ?? 0}
        reputation={player?.reputation ?? 0}
        gold={player?.gold ?? 0}
        onGoldClick={() => {
          setPhoneInitialApp('altin-magazasi');
          setPhoneOpen(true);
        }}
      />

      <main className="map-stage">
        <CityMap onRegionClick={handleRegionClick} />
      </main>

      <ReferralPrompt />

      <BottomBar
        onPhoneClick={() => setPhoneOpen(true)}
        onHeistClick={() => openHeistScreen(null)}
        onProfileClick={() => setProfileOpen(true)}
        onFutbolClick={() => setFutbolOpen(true)}
      />

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
      {futbolOpen && <FutbolFullScreen onClose={() => setFutbolOpen(false)} />}

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
      <GameShell />
    </AuthProvider>
  );
}
