import { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Hud from './components/Hud/Hud';
import CityMap from './components/CityMap/CityMap';
import PhoneButton from './components/Phone/PhoneButton';
import PhoneScreen from './components/Phone/PhoneScreen';
import RegionModal from './components/RegionModal/RegionModal';
import { usePlayer } from './hooks/usePlayer';
import './styles/theme.css';
import './App.css';

// Harita, HUD ve telefon giriş yapmadan da görülebilir/gezilebilir —
// giriş sadece gerçek bir aksiyon (meslek seçme, fabrikada çalışma vb.)
// denendiğinde, o aksiyonun içinde (RegionModal → SignInPrompt) istenir.
function GameShell() {
  const [activeRegion, setActiveRegion] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const { player } = usePlayer();

  const handleRegionClick = (regionId, regionMeta) => {
    setActiveRegion(regionMeta);
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

      <PhoneButton onClick={() => setPhoneOpen(true)} />

      {phoneOpen && <PhoneScreen onClose={() => setPhoneOpen(false)} />}

      <RegionModal region={activeRegion} onClose={() => setActiveRegion(null)} />
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
