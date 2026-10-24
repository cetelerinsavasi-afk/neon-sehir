// SADECE önizleme (v125): Mağaza'da satıcı yerine fabrika / işletme adı. /pmagaza.html
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import { MagazaScreen } from '../src/components/MarketplaceScreen/MarketplaceScreen';
import '../src/index.css';
import '../src/styles/theme.css';

fakeDb.doc(`factories/${PREVIEW_UID}`).set({ ownerId: PREVIEW_UID, ownerName: 'Önizleme' });
fakeDb.doc('factories/pat').set({ ownerId: 'pat', ownerName: 'Patron', name: 'Demir Çelik A.Ş.' });
fakeDb.doc('factories/ece').set({ ownerId: 'ece', ownerName: 'Ece' });
fakeDb.doc('houses/h1').set({ ownerUid: 'ali', name: 'Ali Silah Dükkânı', biz: { type: 'silahci' }, bizType: 'silahci' });
const L = (id, sellerId, sellerName, materialType, q, unit) =>
  fakeDb.doc(`marketplaceListings/${id}`).set({ itemType: 'material', materialType, quantity: q, unitPrice: unit, price: q * unit, sellerId, sellerName, sold: false, createdAtMs: Date.now() });
L('a', 'pat', 'Patron', 'tamirMalzemesi', 500, 9);
L('b', 'ece', 'Ece', 'silahUpgrade', 20, 95);
L('c', 'ali', 'Ali', 'tamirMalzemesi', 100, 10);
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <MagazaScreen onClose={() => {}} />
  </AuthProvider>
);
