// SADECE önizleme (v154): gezilebilir şehir + sahte araçlar — yolcu kamerası testleri için.
// ?uid=xyz ile ikinci sekme ikinci oyuncu olur (RTDB sahtesi sekmeler arası paylaşılır).
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import CityScreen from '../src/components/City/CityScreen';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const q = new URLSearchParams(location.search);
const uid = q.get('uid') || PREVIEW_UID;
const spawn = q.get('spawn') || 'ev';
fakeDb.doc(`users/${uid}`).set({ displayName: uid, gold: 1e7, avatar: { gender: 'erkek', hairStyle: 'short', clothing: 'hoodie' } }, { merge: true });
if (q.get('power')) fakeDb.doc(`weapons/${uid}_w1`).set({ ownerId: uid, power: Number(q.get('power')), lifeDays: 10 });
[1, 6, 12, 13, 21, 23, 24].forEach((id) => fakeDb.doc(`vehicles/${uid}_${id}`).set({ ownerId: uid, catalogId: id, lifeDays: 30, mods: null }));
window.__ready = true;
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>
        <CityScreen spawn={spawn} onClose={() => {}} onEnterRegion={() => {}} />
      </SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
