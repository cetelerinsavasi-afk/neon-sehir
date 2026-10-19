// SADECE önizleme (v100): Evler › Ofisler / Evler / Depolar + ofis paneli
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import HouseHub from '../src/components/HouseScreen/HouseHub';
import { fakeDb, houses, shop } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const ME = 'previewAdmin';
const it = (i, k, x, z) => ({ i, k, x, z, r: 0, c: 0, p: 1 });
window.__shop = shop;
window.__db = fakeDb;
(async () => {
  const me = (data) => houses.houseAction({ auth: { uid: ME }, data });
  const guest = (data) => houses.houseAction({ auth: { uid: 'misafir1' }, data });
  // benim ofisim: manav tezgâhı + içecek dolabı + bağış kutusu + mikser
  const { houseId: o1 } = await me({ op: 'buy', name: 'Neon Plaj' });
  await fakeDb.doc(`houses/${o1}`).set({ items: [it('a1', 'fruitstand', -3, -2), it('a2', 'drinkfridge', 0, -5), it('a3', 'bagiskutusu', 3, -5), it('a4', 'mixer', 5, 2), it('a5', 'lounger', -5, 3), it('a6', 'umbrella', -3, 3)] }, { merge: true });
  await shop.shopAction({ auth: { uid: ME }, data: { op: 'officeSet', houseId: o1, keys: { fruitstand: true, bagiskutusu: true }, prices: { meyve: 80 }, emoji: '🏖️' } });
  // benim evim (10+ mobilya) ve depom
  const { houseId: e1 } = await me({ op: 'buy', name: 'Sahil Evi' });
  await fakeDb.doc(`houses/${e1}`).set({ items: Array.from({ length: 11 }, (_, n) => it(`e${n}`, 'chairm', -6 + n, 0)) }, { merge: true });
  await me({ op: 'buy', name: 'Boş Depo' });
  // misafirin eski home ofisi (göç edilecek) + misafirin ofisi
  const { houseId: g1 } = await guest({ op: 'buy', name: 'Ritim Stüdyo' });
  await fakeDb.doc(`houses/${g1}`).set({ items: [it('m1', 'mixer', 0, 0)], biz: { type: 'studyo', openedAtMs: 1 }, bizType: 'studyo', bizPrices: { minute: 350 } }, { merge: true });
  // misafirin ofisi: manav tezgâhı ücretli (120) + bağış kutusu + market rafı ücretsiz
  const { houseId: g2 } = await guest({ op: 'buy', name: 'Misafir Manav' });
  await fakeDb.doc(`houses/${g2}`).set({ items: [it('n1', 'fruitstand', 0, -2), it('n2', 'bagiskutusu', 3, -2), it('n3', 'shelf', -3, -2), it('n4', 'tdining', 0, 2)] }, { merge: true });
  await shop.shopAction({ auth: { uid: 'misafir1' }, data: { op: 'officeSet', houseId: g2, keys: { fruitstand: true, bagiskutusu: true }, prices: { meyve: 120 }, emoji: '🍎' } });
  window.__ids = { o1, e1, g1, g2 };
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <BlocksProvider>
        <SocialProvider>
          <HouseHub onClose={() => console.log('hub closed')} />
        </SocialProvider>
      </BlocksProvider>
    </AuthProvider>
  );
})();
