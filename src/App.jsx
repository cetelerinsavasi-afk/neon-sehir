import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Hud from './components/Hud/Hud';
import CityMap from './components/CityMap/CityMap';
import BottomBar from './components/BottomBar/BottomBar';
import PhoneScreen from './components/Phone/PhoneScreen';
import RegionModal from './components/RegionModal/RegionModal';
import HeistScreen from './components/HeistScreen/HeistScreen';
import SignInBanner from './components/SignInBanner/SignInBanner';
import ReferralPrompt from './components/ReferralPrompt/ReferralPrompt';
import RaceFullScreen from './components/RaceTrackScreen/RaceFullScreen';
import RaceBubble from './components/RaceTrackScreen/RaceBubble';
import OnNumaraFullScreen from './components/OnNumaraScreen/OnNumaraFullScreen';
import ProfileFullScreen from './components/ProfileFullScreen/ProfileFullScreen';
import FutbolFullScreen from './components/FutbolScreen/FutbolFullScreen';
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

// Harita, HUD ve telefon giriş yapmadan da görülebilir/gezilebilir —
// ortadaki SignInBanner haritayı bloklamaz, sadece giriş için görünür bir
// yol sağlar. Bir aksiyon (fabrikada çalışma vb.) denendiğinde ayrıca
// RegionModal içinde de SignInPrompt gösterilir.
function GameShell() {
  const { user } = useAuth();
  const [activeRegion, setActiveRegion] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneInitialApp, setPhoneInitialApp] = useState(null);
  const [heistTarget, setHeistTarget] = useState(undefined); // undefined=kapalı, null=açık/hedefsiz
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
  const { player } = usePlayer();

  // Shopier'den "?goldOrder=<id>" ile geri dönüldüğünde, telefonu otomatik
  // olarak Altın Mağazası'nda açıp sipariş sonucunu göster (bkz.
  // GoldStoreScreen — asıl teslimat zaten sunucu tarafındaki webhook'ta
  // gerçekleşti, bu sadece kullanıcıya sonucu göstermek için).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('goldOrder')) {
      setPhoneInitialApp('altin-magazasi');
      setPhoneOpen(true);
    }
  }, []);

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
    setActiveRegion(regionMeta);
  };

  const openHeistScreen = (target) => {
    setActiveRegion(null);
    setHeistTarget(target ?? null);
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
      />

      <main className="map-stage">
        <CityMap onRegionClick={handleRegionClick} />
      </main>

      <SignInBanner />
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

      {heistTarget !== undefined && (
        <HeistScreen initialTarget={heistTarget} onClose={() => setHeistTarget(undefined)} />
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
