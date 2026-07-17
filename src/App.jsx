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
import TopNotificationBanner from './components/TopNotificationBanner/TopNotificationBanner';
import { usePlayer } from './hooks/usePlayer';
import { useMyActiveRaceRoom } from './hooks/useMyActiveRaceRoom';
import { migrateArabaGelistirmeUnification } from './services/gameActions';
import { regions } from './data/regions';
import './styles/theme.css';
import './App.css';

const RACE_TRACK_REGION = regions.find((r) => r.screen === 'yaris-pisti');

// Depo + Vites Geliştirme Malzemeleri birleştirme geçişi bu oturumda
// zaten tetiklendi mi? (Gereksiz tekrar çağrıyı önlemek için — işlemin
// kendisi zararsız/idempotent olsa da.)
let arabaGelistirmeMigrationTriggered = false;

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
  const [activeTableId, setActiveTableId] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const { player } = usePlayer();

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

      <RegionModal
        region={activeRegion}
        onClose={() => setActiveRegion(null)}
        onOpenHeist={openHeistScreen}
        onEnterRace={openRace}
        onEnterTable={openTable}
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
