// SADECE önizleme: Ev ekranı (HouseHub → HouseScreen) sahte Firebase ile.
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import HouseHub from '../src/components/HouseScreen/HouseHub';
import { fakeDb, houses } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

// v78: ?pets=1 → oyuncu ve misafir evcil hayvan + aksesuarla
if (new URLSearchParams(location.search).get('pets') === '1') {
  fakeDb.doc('users/previewAdmin').set({ avatar: { gender: 'erkek', hairStyle: 'slick', clothing: 'suit', pet: { id: 'golden', leash: true, leashColor: '#22d3ee' }, acc: { head: 'crown', back: 'royal' } } }, { merge: true });
  fakeDb.doc('users/misafir1').set({ avatar: { gender: 'kadin', hairStyle: 'long', clothColor: '#8a1d1d', pet: { id: 'papagan' }, acc: { back: 'angel', face: 'visor' } } }, { merge: true });
}
// sahte ikinci oyuncu: kendi evini alır, içinde dolaşır ve konuşur
const guest = (data) => houses.houseAction({ auth: { uid: 'misafir1' }, data });
setTimeout(async () => {
  try {
    const { houseId } = await guest({ op: 'buy', name: 'Ali’nin Kafesi' });
    await guest({ op: 'enter', houseId });
    window.__guestHouse = houseId;
    let t = 0;
    setInterval(() => {
      t += 0.25;
      fakeDb.doc('housePresence/misafir1').set({ x: 5 + Math.sin(t / 2) * 3, z: 4 + Math.cos(t / 3), left: Math.cos(t / 2) < 0, updatedAt: Date.now() }, { merge: true });
    }, 250);
    setTimeout(() => guest({ op: 'chat', houseId, text: 'Selam! Kafeme hoş geldin 🔥' }).catch((e) => console.error('chat', e)), 2500);
  } catch (e) {
    console.error('preview guest', e);
  }
}, 1500);

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>
        <HouseHub onClose={() => console.log('hub closed')} />
      </SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
