// SADECE önizleme (v146): ?m=gang (çete karargahı) | teskilat (polis teşkilatı)
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import GangHq from '../src/components/Gangs/GangHq';
import VenueHouseScreen from '../src/components/Venue3D/VenueHouseScreen';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const qs = new URLSearchParams(location.search);
const m = qs.get('m') || 'gang';
const W = 'gangWorlds/w1';
fakeDb.doc('gangSystem/config').set({ liveWorldId: 'w1', liveOpen: true, autoOpened: true });
fakeDb.doc(`${W}/gangs/g1`).set({ name: 'Kurtlar', status: 'active', babaId: PREVIEW_UID, memberCount: 3, logo: { emoji: '🐺', color: '#ff2e5a', bg: '#1a0b20' } });
fakeDb.doc(`${W}/gangs/g1/private/state`).set({ kasa: 750000, gem: 12, distributableLeft: 100000, kasaAtMidnight: 750000 });
fakeDb.doc(`${W}/gangs/g2`).set({ name: 'Kartallar', status: 'active', babaId: 'x', memberCount: 5, logo: { emoji: '🦅', color: '#19e8ff', bg: '#04121a' } });
fakeDb.doc(`${W}/gangs/g1/members/${PREVIEW_UID}`).set({ rank: 'baba', name: 'Önizleme Admin', prestige: 1000 });
fakeDb.doc(`${W}/gangs/g1/members/u2`).set({ rank: 'sagkol', name: 'Sağ Kol Cem', prestige: 500 });
if (m === 'teskilat') {
  fakeDb.doc(`${W}/memberships/${PREVIEW_UID}`).set({ intelRosterId: 'r1', intelCodeName: 'Gölge-3', intelRank: 'ajan' });
  fakeDb.doc(`${W}/intelRoster/r1`).set({ codeName: 'Gölge-3', rank: 'ajan' });
  fakeDb.doc('housePresence/pa_r9').set({ houseId: 'game_teskilat', displayName: 'Kartal-7', avatar: null, x: 2, z: 2, left: false, updatedAt: { toMillis: () => Date.now() } });
} else {
  fakeDb.doc(`${W}/memberships/${PREVIEW_UID}`).set({ gangId: 'g1', gangRank: 'baba' });
}
window.__ready = true;
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>{m === 'teskilat' ? <VenueHouseScreen venue="teskilat" onExit={() => {}} /> : <GangHq gangId="g1" onExit={(e) => (window.__exit = e || 'exit')} />}</SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
