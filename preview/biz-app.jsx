// SADECE önizleme (v77): İşletme listesi (BusinessHub → HouseScreen) sahte Firebase ile.
// Adres: /biz-app.html?type=spor  (spor, cafe, bar, internet, silahci, galeri, modifiye)
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import BusinessHub from '../src/components/BusinessHub/BusinessHub';
import HouseHub from '../src/components/HouseScreen/HouseHub';
import { fakeDb, houses, shop, PREVIEW_UID } from './mocks/backend.js';
import GuideScreen from '../src/components/GuideScreen/GuideScreen';
import { BIZ_TYPES, futbolDayKey } from '../functions/businessCatalogData.js';
import '../src/index.css';
import '../src/styles/theme.css';
import '../src/styles/cues.css';

const type = new URLSearchParams(location.search).get('type') || 'spor';
let seq = 0;
// Bir evi türün gerekli mobilyalarıyla (satın alınmış) doldurur, yan yana dizer
export function furnish(houseId, t = type) {
  const items = [];
  BIZ_TYPES[t].groups.forEach((g, gi) => {
    for (let n = 0; n < g.n; n++) items.push({ i: `pv${(seq++).toString(36)}`, k: g.any[0], x: -6 + gi * 3, z: -3 + n * 1.6, r: 0, c: 0, p: 1 });
  });
  // v77 Faz 3: cafe/bar'a pasta vitrini + piyano, bara içecek dolabı
  const extra = { cafe: ['cakecase', 'piano'], bar: ['drinkfridge', 'piano'] }[t] || [];
  extra.forEach((k, n) => items.push({ i: `pv${(seq++).toString(36)}`, k, x: 4 + n * 2.5, z: 3, r: 0, c: 0, p: 1 }));
  const ref = fakeDb.doc(`houses/${houseId}`);
  return ref.get().then((s) => ref.set({ ...s.data(), items }));
}
window.__furnish = furnish;
window.__fakeDb = fakeDb;
window.__housesApi = houses;
window.__shopApi = shop;
import('../src/components/Piano/pianoNet.js').then((m) => (window.__piano = m));

const guest = (uid, data) => houses.houseAction({ auth: { uid }, data });
(async () => {
  try {
    fakeDb.doc('users/misafir2').set({ gold: 3_000_000, emerald: 50, displayName: 'Demir Ustası' });
    for (const [uid, name] of [['misafir1', 'Ali’nin Yeri'], ['misafir2', 'Demir Salon']]) {
      const { houseId } = await guest(uid, { op: 'buy', name, bizIntent: type });
      await furnish(houseId);
      await guest(uid, { op: 'bizOpen', houseId, type });
      if (uid === 'misafir1') {
        await fakeDb.doc(`gameVenues/${type}`).set({ type, bizRank: 2 });
        await fakeDb.doc(`houses/${houseId}`).set({ bizRank: 3, ...(type === 'spor' ? { gymBonusDay: futbolDayKey(Date.now()) } : {}) }, { merge: true });
        await guest('misafir1', { op: 'enter', houseId });
      } else await fakeDb.doc(`houses/${houseId}`).set({ bizRank: 1 }, { merge: true });
    }
    if (new URLSearchParams(location.search).get('mine')) {
      const { houseId } = await houses.houseAction({ auth: { uid: PREVIEW_UID }, data: { op: 'buy', bizIntent: type } });
      await furnish(houseId);
      window.__myHouse = houseId;
    }
    // v77 Faz 2: önizleme oyuncusuna silah/araç + malzeme; misafir dükkânına stok ve fiyat
    const W = (id, catalogId, extra) => fakeDb.doc(`weapons/${id}`).set({ ownerId: PREVIEW_UID, catalogId, name: ['', 'Tabanca', 'Yarı Otomatik Tabanca', 'Revolver'][catalogId], basePrice: [0, 1000, 10000, 20000][catalogId], basePower: [0, 1000, 3000, 5000][catalogId], power: [0, 1000, 3000, 5000][catalogId], level: 1, lifeDays: 4, repairsUsed: 2, ...extra });
    await W('pw1', 1, {});
    await W('pw3', 2, { lifeDays: 9 });
    await W('pw2', 3, { level: 2, power: 7500, lifeDays: 10 });
    await fakeDb.doc('vehicles/pv1').set({ ownerId: PREVIEW_UID, catalogId: 2, model: 'Şehir Hatchback', baseGalleryValue: 10000, gearLevel: 3, baseTank: 100, tankBonus: 0, lifeDays: 7, repairsUsed: 1, gearUpgraded: true });
    await fakeDb.doc(`users/${PREVIEW_UID}/inventory/tamirMalzemesi`).set({ quantity: 40 });
    await fakeDb.doc(`users/${PREVIEW_UID}/inventory/silahUpgrade`).set({ quantity: 30 });
    const shopsSnap = await fakeDb.collection('houses').where('bizType', '==', type).get();
    for (const d of shopsSnap.docs) {
      if (d.data().ownerUid !== 'misafir1') continue;
      await fakeDb.doc(`businessInventories/${d.id}`).set({ materials: { tamirMalzemesi: 45, silahUpgrade: 8, arabaGelistirme: 100 } }, { merge: true });
      await fakeDb.doc(`houses/${d.id}`).set({ bizPrices: { materials: { tamirMalzemesi: { mat: 8, labor: 2 }, silahUpgrade: { mat: 80, labor: 20 }, arabaGelistirme: { mat: 400, labor: 100 } } } }, { merge: true });
      window.__guestShop = d.id;
    }
    window.__ready = true;
  } catch (e) {
    console.error('preview seed', e);
  }
})();

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>
        {new URLSearchParams(location.search).get('guide') ? (
          <GuideScreen />
        ) : new URLSearchParams(location.search).get('mine') ? (
          <HouseHub onClose={() => console.log('hub closed')} />
        ) : (
          <BusinessHub type={type} onClose={() => console.log('hub closed')} onOpenGameVenue={() => console.log('game venue')} />
        )}
      </SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
window.__PREVIEW_UID = PREVIEW_UID;
