// SADECE önizleme (v124): Rulet + Slot. Adres: /casino.html?g=rulet|slot
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import RouletteGame from '../src/components/Roulette/RouletteGame';
import SlotScreen from '../src/components/SlotScreen/SlotScreen';
import '../src/index.css';
import '../src/styles/theme.css';

const g = new URLSearchParams(location.search).get('g') || 'rulet';
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <div style={{ padding: 16, maxWidth: 420, margin: '0 auto' }}>{g === 'slot' ? <SlotScreen /> : <RouletteGame />}</div>
  </AuthProvider>
);
