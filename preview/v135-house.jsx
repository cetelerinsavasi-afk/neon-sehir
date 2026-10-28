// SADECE önizleme (v135): haber stüdyosu + tuval + liman eşyaları olan ev
// ?as=misafir1 → misafir olarak (ücretli haber masası / tuval)
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import HouseScreen from '../src/components/HouseScreen/HouseScreen';
import { fakeDb, houses, shop } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const ME = 'previewAdmin';
const it = (i, k, x, z, r = 0, c = 0) => ({ i, k, x, z, r, c, p: 1 });
window.__db = fakeDb;
window.__shop = shop;
(async () => {
  await fakeDb.doc(`users/${ME}`).set({ avatar: { gender: 'erkek', hairStyle: 'short', clothColor: '#222', acc: { aura: 'fire' } } }, { merge: true });
  const { houseId } = await houses.houseAction({ auth: { uid: ME }, data: { op: 'buy', name: 'Neon Medya' } });
  await fakeDb.doc(`houses/${houseId}`).set({ items: [it('n1', 'newsdesk', 0, -4), it('e1', 'easel', -5, 1, 0, 2), it('e2', 'painttable', -5, 3), it('c1', 'container', 6, 6, 0, 1), it('m1', 'mixer', 5, -3), it('l1', 'portlight', 7, -6)] }, { merge: true });
  await shop.shopAction({ auth: { uid: ME }, data: { op: 'officeSet', houseId, keys: { newsdesk: true, easel: true }, minutes: { newsdesk: 600, easel: 150 }, emoji: '🎥' } });
  window.__houseId = houseId;
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <BlocksProvider>
        <SocialProvider>
          <HouseScreen houseId={houseId} onExit={() => console.log('exit')} />
        </SocialProvider>
      </BlocksProvider>
    </AuthProvider>
  );
})();
