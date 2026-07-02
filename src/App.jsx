import { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Hud from './components/Hud/Hud';
import CityMap from './components/CityMap/CityMap';
import BottomBar from './components/BottomBar/BottomBar';
import PhoneScreen from './components/Phone/PhoneScreen';
import RegionModal from './components/RegionModal/RegionModal';
import HeistScreen from './components/HeistScreen/HeistScreen';
import SignInBanner from './components/SignInBanner/SignInBanner';
import { usePlayer } from './hooks/usePlayer';
import './styles/theme.css';
import './App.css';

// Harita, HUD ve telefon giriş yapmadan da görülebilir/gezilebilir —
// ortadaki SignInBanner haritayı bloklamaz, sadece giriş için görünür bir
// yol sağlar. Bir aksiyon (fabrikada çalışma vb.) denendiğinde ayrıca
// RegionModal içinde de SignInPrompt gösterilir.
function GameShell() {
  const [activeRegion, setActiveRegion] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [heistTarget, setHeistTarget] = useState(undefined); // undefined=kapalı, null=açık/hedefsiz
  const { player } = usePlayer();

  const handleRegionClick = (regionId, regionMeta) => {
    setActiveRegion(regionMeta);
  };

  const openHeistScreen = (target) => {
    setActiveRegion(null);
    setHeistTarget(target ?? null);
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

      <BottomBar onPhoneClick={() => setPhoneOpen(true)} onHeistClick={() => openHeistScreen(null)} />

      {phoneOpen && <PhoneScreen onClose={() => setPhoneOpen(false)} />}

      <RegionModal
        region={activeRegion}
        onClose={() => setActiveRegion(null)}
        onOpenHeist={openHeistScreen}
      />

      {heistTarget !== undefined && (
        <HeistScreen initialTarget={heistTarget} onClose={() => setHeistTarget(undefined)} />
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
