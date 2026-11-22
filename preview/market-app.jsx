// SADECE önizleme (v177): 2. el ekranı — araba / ticari / motor sekmeleri. /market.html
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import MarketplaceScreen from '../src/components/MarketplaceScreen/MarketplaceScreen';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const L = (id, cid, model, price, life, seller = 'b1') =>
  fakeDb.doc(`marketplaceListings/${id}`).set({ itemType: 'vehicle', sold: false, vehicleId: `v_${id}`, vehicleCatalogId: cid, vehicleModel: model, price, vehicleLifeDays: life, vehicleRepairsUsed: 0, sellerId: seller, sellerName: 'Bot', createdAtMs: Date.now() });
(async () => {
  await fakeDb.doc(`users/${PREVIEW_UID}`).set({ displayName: 'Test', gold: 900_000 }, { merge: true });
  await fakeDb.doc('vehicles/pv_25').set({ ownerId: PREVIEW_UID, catalogId: 25, model: 'Bisiklet', lifeDays: 20 });
  await L('a', 5, 'Sedan M-Sport', 80_000, 18);
  await L('t', 13, 'Taksi', 40_000, 9);
  await L('o', 12, 'Otobüs', 150_000, 16);
  await L('m', 22, 'Cross Motor', 20_000, 12);
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <div style={{ width: 390 }}><MarketplaceScreen /></div>
    </AuthProvider>
  );
  window.__ready = true;
})();
