import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Hud from './components/Hud/Hud';
import CityMap from './components/CityMap/CityMap';
import BottomBar from './components/BottomBar/BottomBar';
import PhoneScreen from './components/Phone/PhoneScreen';
import RegionModal from './components/RegionModal/RegionModal';
import HeistScreen from './components/HeistScreen/HeistScreen';
import SignInBanner from './components/SignInBanner/SignInBanner';
import RaceFullScreen from './components/RaceTrackScreen/RaceFullScreen';
import OnNumaraFullScreen from './components/OnNumaraScreen/OnNumaraFullScreen';
import ProfileFullScreen from './components/ProfileFullScreen/ProfileFullScreen';
import { usePlayer } from './hooks/usePlayer';
import { useMyActiveRaceRoom } from './hooks/useMyActiveRaceRoom';
import './styles/theme.css';
import './App.css';

// Harita, HUD ve telefon giriş yapmadan da görülebilir/gezilebilir —
// ortadaki SignInBanner haritayı bloklamaz, sadece giriş için görünür bir
// yol sağlar. Bir aksiyon (fabrikada çalışma vb.) denendiğinde ayrıca
// RegionModal içinde de SignInPrompt gösterilir.
function GameShell() {
  const { user } = useAuth();
  const [activeRegion, setActiveRegion] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [heistTarget, setHeistTarget] = useState(undefined); // undefined=kapalı, null=açık/hedefsiz
  const [activeRaceRoomId, setActiveRaceRoomId] = useState(null);
  const [activeTableId, setActiveTableId] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const { player } = usePlayer();

  // Aktif bir yarışım varsa (kurdum/katıldım/devam ediyor), harita üzerinde
  // gezinirken bile tam ekran yarış ekranını otomatik açık tut.
  const { room: myActiveRoom } = useMyActiveRaceRoom();
  const effectiveRaceRoomId = activeRaceRoomId || myActiveRoom?.id || null;

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

      <BottomBar
        onPhoneClick={() => setPhoneOpen(true)}
        onHeistClick={() => openHeistScreen(null)}
        onProfileClick={() => setProfileOpen(true)}
      />

      {phoneOpen && <PhoneScreen onClose={() => setPhoneOpen(false)} />}
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

      {effectiveRaceRoomId && user && (
        <RaceFullScreen
          roomId={effectiveRaceRoomId}
          myUid={user.uid}
          onExit={() => setActiveRaceRoomId(null)}
        />
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
