// SADECE önizleme: 3D Ev ekranı (HouseGate → HouseScreen) sahte Firebase ile.
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import HouseGate from '../src/components/HouseScreen/HouseGate';
import HouseMaintenance from '../src/components/HouseScreen/HouseMaintenance';
import { fakeDb, houses } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

// sahte ikinci oyuncu: davet et, eve sok, dolaştır, konuştur
setTimeout(async () => { console.log('guest start'); try {
  console.log('inv', JSON.stringify(await houses.houseAction({ auth: { uid: 'previewAdmin' }, data: { op: 'invite', name: 'Misafir Ali' } })));
  await fakeDb.doc('housePresence/misafir1').set({ houseId: 'previewAdmin', displayName: 'Misafir Ali', avatar: { gender: 'kadin', hairStyle: 'long', clothColor: '#8a1d1d' }, x: 2, z: 2, left: false, seat: null, updatedAt: Date.now() });
  let t = 0;
  setInterval(() => {
    t += 0.25;
    fakeDb.doc('housePresence/misafir1').set({ x: 2 + Math.sin(t / 2) * 3, z: 2.5 + Math.cos(t / 3), left: Math.cos(t / 2) < 0, updatedAt: Date.now() }, { merge: true });
  }, 250);
  setTimeout(() => houses.houseAction({ auth: { uid: 'misafir1' }, data: { op: 'chat', houseId: 'previewAdmin', text: 'Selam! Ev harika olmuş 🔥' } }).catch((e) => console.error('chat', e)), 2500);
} catch (e) { console.error('preview guest', e); } }, 4000);

const maint = location.hash === '#tadilat';
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>{maint ? <HouseMaintenance onClose={() => {}} /> : <HouseGate onClose={() => {}} />}</SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
