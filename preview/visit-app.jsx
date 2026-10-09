// SADECE önizleme (v77): Soygun › Ziyaret sekmesi (Popüler + filtreler)
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import VisitTab from '../src/components/MekanlarScreen/VisitTab';
import { fakeDb, houses } from './mocks/backend.js';
import { Timestamp } from '../functions/gang/test/fakeFirestore.js';
import { midnightDayKey, prevDayKey } from '../functions/businessCatalogData.js';
import '../src/index.css';
import '../src/styles/theme.css';

const scenario = new URLSearchParams(location.search).get('s') || 'empty';
const y = prevDayKey(midnightDayKey(Date.now()));
(async () => {
  const guest = (uid, data) => houses.houseAction({ auth: { uid }, data });
  fakeDb.doc('users/misafir2').set({ gold: 3_000_000, emerald: 50, displayName: 'Demir' });
  const { houseId: cafe } = await guest('misafir1', { op: 'buy', name: 'Ali Kafe' });
  const { houseId: net } = await guest('misafir2', { op: 'buy', name: 'Demir Net' });
  await fakeDb.doc(`houses/${cafe}`).set({ biz: { type: 'cafe' }, bizType: 'cafe', privacy: 'public' }, { merge: true });
  await fakeDb.doc(`houses/${net}`).set({ biz: { type: 'internet' }, bizType: 'internet', privacy: 'public' }, { merge: true });
  const V = (key, count, extra = {}) => fakeDb.doc(`venueVisits/${y}_${key}`).set({ dayKey: y, key, count, kind: extra.houseId ? 'house' : 'venue', ...extra });
  await V('camii', 12);
  await V(`h_${net}`, 10, { houseId: net, name: 'Demir Net', ownerName: 'Demir', bizType: 'internet' });
  await V(`h_${cafe}`, 8, { houseId: cafe, name: 'Ali Kafe', ownerName: 'Misafir Ali', bizType: 'cafe' });
  for (const [k, n] of [['banka', 4], ['park', 3], ['gazino', 4], ['karakol', 3], ['silah_magazasi', 2], ['araba_galerisi', 1], ['modifiye_garaji', 1]]) await V(k, n);
  const now = Timestamp.fromMillis(Date.now());
  // v78: Evler filtresi için boş ama girilebilir evler
  if (scenario === 'houses') {
    for (const [uid, name, gold] of [['ev1', 'Deniz Manzaralı Villa', 9e6], ['ev2', 'Çatı Katı', 9e6], ['ev3', 'Bahçeli Ev', 9e6]]) {
      fakeDb.doc(`users/${uid}`).set({ gold, displayName: name.split(' ')[0] });
      const { houseId } = await guest(uid, { op: 'buy', name });
      await fakeDb.doc(`houses/${houseId}`).set({ privacy: 'public' }, { merge: true });
      if (uid === 'ev2') await fakeDb.doc('housePresence/ev2').set({ houseId, updatedAt: now });
      if (uid === 'ev3') await V(`h_${houseId}`, 5, { houseId, name, ownerName: 'Bahçeli' });
    }
  }
  if (scenario === 'live') {
    // Demir Net'te 2 kişi, galeride 1 kişi
    await fakeDb.doc('housePresence/misafir1').set({ houseId: net, updatedAt: now });
    await fakeDb.doc('housePresence/misafir2').set({ houseId: net, updatedAt: now });
    await fakeDb.doc('interiorPresence/x1').set({ locationId: 'araba_galerisi', updatedAt: now });
  }
  window.__ready = true;
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <BlocksProvider>
        <SocialProvider>
          <div style={{ padding: 12, background: '#0b0d14', minHeight: '100vh', color: '#fff' }}>
            <VisitTab onVisitVenue={(k) => console.log('venue', k)} onVisitHouse={(h) => console.log('house', h)} />
          </div>
        </SocialProvider>
      </BlocksProvider>
    </AuthProvider>
  );
})();
