// SADECE önizleme (v77 performans ölçümü): Park / Banka dünya ekranları + sahte oyuncular
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import ParkWorldScreen from '../src/components/ParkWorldScreen/ParkWorldScreen';
import BankWorldScreen from '../src/components/BankWorldScreen/BankWorldScreen';
import { fakeDb } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const v = new URLSearchParams(location.search).get('v') || 'park';
const N = Number(new URLSearchParams(location.search).get('n') || 6);
const coll = v === 'park' ? 'parkPresence' : 'interiorPresence';
for (let i = 0; i < N; i++) {
  fakeDb.doc(`${coll}/bot${i}`).set({ x: 300 + i * 40, y: 400 + (i % 3) * 30, facing: 'down', pose: 'idle', displayName: `Bot ${i}`, avatar: null, locationId: 'banka', updatedAt: { toMillis: () => Date.now() } });
}
// botlar saniyede bir hareket etsin (gerçek oyundaki gibi her biri ~1 sn'de bir yazar)
setInterval(() => {
  for (let i = 0; i < N; i++) {
    fakeDb.doc(`${coll}/bot${i}`).set({ x: 300 + i * 40 + Math.sin(Date.now() / 900 + i) * 60, y: 400 + Math.cos(Date.now() / 1100 + i) * 60, pose: 'walk1', updatedAt: { toMillis: () => Date.now() } }, { merge: true });
  }
}, 1000);
window.__ready = true;
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>{v === 'park' ? <ParkWorldScreen onExit={() => {}} /> : <BankWorldScreen onExit={() => {}} onOpenHeist={() => {}} />}</SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
