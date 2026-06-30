import { useState } from 'react';
import Hud from './components/Hud/Hud';
import CityMap from './components/CityMap/CityMap';
import PhoneButton from './components/Phone/PhoneButton';
import PhoneScreen from './components/Phone/PhoneScreen';
import RegionModal from './components/RegionModal/RegionModal';
import './styles/theme.css';
import './App.css';

// Faz 1: mock oyuncu verisi. Faz 2+'da Firestore'dan gelecek.
const MOCK_PLAYER = {
  suspicion: 15,
  reputation: 40,
  gold: 12500,
};

export default function App() {
  const [activeRegion, setActiveRegion] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const handleRegionClick = (regionId, regionMeta) => {
    setActiveRegion(regionMeta);
  };

  return (
    <div className="app-shell">
      <Hud {...MOCK_PLAYER} />

      <main className="map-stage">
        <CityMap onRegionClick={handleRegionClick} />
      </main>

      <PhoneButton onClick={() => setPhoneOpen(true)} />

      {phoneOpen && <PhoneScreen onClose={() => setPhoneOpen(false)} />}

      <RegionModal region={activeRegion} onClose={() => setActiveRegion(null)} />
    </div>
  );
}
