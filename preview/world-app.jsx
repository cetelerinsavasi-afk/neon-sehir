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
// v78: ?pets=1 → botlar ve oyuncu evcil hayvan + aksesuarla
const PETS_ON = new URLSearchParams(location.search).get('pets') === '1';
const LOOKS = [
  { pet: { id: 'golden', leash: true, leashColor: '#22d3ee' }, acc: { head: 'crown', back: 'royal' } },
  { pet: { id: 'papagan' }, acc: { face: 'visor', back: 'angel' } },
  { pet: { id: 'ejder', leash: false }, acc: { aura: 'fire', head: 'horns' } },
  { pet: { id: 'panda', leash: true, leashColor: '#ffd23f' }, acc: { neck: 'diamond', back: 'jet' } },
  { pet: { id: 'baykus' }, acc: { head: 'halo', aura: 'spark' } },
  { pet: { id: 'bulldog', leash: true, leashColor: '#c81d3f' }, acc: { face: 'mustache', back: 'dragonw' } },
];
if (PETS_ON) fakeDb.doc('users/previewAdmin').set({ avatar: { gender: 'erkek', hairStyle: 'slick', clothing: 'suit', ...LOOKS[0] } }, { merge: true });
for (let i = 0; i < N; i++) {
  fakeDb.doc(`${coll}/bot${i}`).set({ x: 300 + i * 40, y: 400 + (i % 3) * 30, facing: 'down', pose: 'idle', displayName: `Bot ${i}`, avatar: PETS_ON ? { gender: i % 2 ? 'kadin' : 'erkek', hairStyle: i % 2 ? 'long' : 'short', ...LOOKS[(i + 1) % LOOKS.length] } : null, locationId: 'banka', updatedAt: { toMillis: () => Date.now() } });
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
