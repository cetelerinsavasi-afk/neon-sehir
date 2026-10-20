// SADECE önizleme (v106 performans ölçümü): 3D mekân (park) + sahte oyuncular
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import VenueHouseScreen from '../src/components/Venue3D/VenueHouseScreen';
import { fakeDb } from './mocks/backend.js';
import { VENUES } from '../functions/venueLayouts.js';
import '../src/index.css';
import '../src/styles/theme.css';

const qs = new URLSearchParams(location.search);
const venue = qs.get('v') || 'park';
const N = Number(qs.get('n') || 8);
const houseId = VENUES[venue].houseId;
setTimeout(() => {
  for (let i = 0; i < N; i++) {
    fakeDb.doc(`users/bot${i}`).set({ displayName: `Bot ${i}`, avatar: { gender: i % 2 ? 'kadin' : 'erkek', hairStyle: i % 2 ? 'long' : 'short' } });
    fakeDb.doc(`housePresence/bot${i}`).set({ houseId, x: 3 + i, z: 4 + (i % 3), left: false, displayName: `Bot ${i}`, avatar: { gender: i % 2 ? 'kadin' : 'erkek' }, updatedAt: { toMillis: () => Date.now() } });
  }
  let t = 0;
  setInterval(() => {
    t += 0.35;
    for (let i = 0; i < N; i++) fakeDb.doc(`housePresence/bot${i}`).set({ x: 3 + i + Math.sin(t + i) * 2, z: 4 + Math.cos(t / 2 + i) * 2, updatedAt: { toMillis: () => Date.now() } }, { merge: true });
  }, 350);
  let c = 0;
  setInterval(() => {
    c += 1;
    fakeDb.collection(`houses/${houseId}/chat`).add({ uid: `bot${c % N}`, name: `Bot ${c % N}`, text: `mesaj ${c}`, createdAtMs: Date.now() });
  }, 3000);
}, 2500);
window.__ready = true;
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>
        <VenueHouseScreen venue={venue} onExit={() => {}} />
      </SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
