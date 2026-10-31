// SADECE önizleme (v137): evde gezen hayvanlar + petshop eşyaları.
//   ?mode=build → Tasarla · ?cat=hayvan|petshop → rafta o kategori
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import HouseScreen from '../src/components/HouseScreen/HouseScreen';
import { fakeDb, houses } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const me = (data) => houses.houseAction({ auth: { uid: 'previewAdmin' }, data });
(async () => {
  await fakeDb.doc('users/previewAdmin').set({ gold: 50_000_000, emerald: 500 }, { merge: true });
  const { houseId } = await me({ op: 'buy', name: 'Hayvan Çiftliği' });
  const P = (i, k, x, z, c = 0, r = 0) => ({ i, k, x, z, r, c, p: 1 });
  const items = [
    P('a1', 'hy_golden', -3, 1),
    P('a2', 'hy_sokak', -1, 2, 6),
    P('a3', 'hy_tavuk', 2, 3),
    P('a4', 'hy_ordek', 3, 3.5),
    P('a5', 'hy_kangal', -4, -2),
    P('a6', 'hy_mops', 0, 0),
    P('a7', 'hy_at', 5, -3),
    P('a8', 'hy_midilli', 4, 1),
    P('a9', 'hy_papagan', -2, -3),
    P('a10', 'hy_hamster', 1, -1),
    P('a11', 'hy_ejder', -5, 2),
    P('a12', 'hy_karakedi', 2, -2, 2),
    P('b1', 'ps_mama', -1, 4),
    P('b2', 'ps_su', -0.5, 4),
    P('b3', 'ps_kulube', -6, -4, 0),
    P('b4', 'ps_yatak', 0.5, -3.5, 1),
    P('b5', 'ps_tirmalama', 3, -5),
    P('b6', 'ps_kumes', 6, 4),
    P('b7', 'ps_ahir', 6, -5),
    P('b8', 'ps_saray', -3, 5),
    P('b9', 'ps_cark', 1.5, 1),
    P('b10', 'ps_kafes', -2, -5),
    P('b11', 'ps_oyuncak', 2, 0.5),
    P('b12', 'ps_kumkabi', 4, 5),
    P('b13', 'ps_cuval', 5, 5),
  ];
  await fakeDb.doc(`houses/${houseId}`).set({ items, pets: { a1: { n: 'Karabaş', l: ['Hav hav!', 'Top atar mısın?'], mv: 'serbest' }, a7: { n: 'Rüzgar', l: ['İhahaha!'], mv: 'sabit' } } }, { merge: true });
  await me({ op: 'enter', houseId });
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
})().catch((e) => {
  console.error('ÖNİZLEME', e);
  document.body.innerHTML = `<pre style="color:red">${e.stack}</pre>`;
});
