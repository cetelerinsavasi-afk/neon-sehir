// SADECE önizleme (v145): seyyar satıcı 3D mekânı — ?v=kokorecci|simitci|donerci|kofteci
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import VenueHouseScreen from '../src/components/Venue3D/VenueHouseScreen';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import { VENUES } from '../functions/venueLayouts.js';
import { VENDORS, VENDOR_COST } from '../functions/vendorData.js';
import '../src/index.css';
import '../src/styles/theme.css';

const qs = new URLSearchParams(location.search);
const venue = qs.get('v') || 'kokorecci';
const vendorId = VENUES[venue].vendor;
const dayKey = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
if (qs.get('done')) fakeDb.doc(`dailyActions/${PREVIEW_UID}_${dayKey()}`).set({ vendorPurchases: { [vendorId]: true } });
// sunucu buyFromVendor'un sadeleştirilmiş taklidi
window.__buyFromVendor = async ({ vendorId: id, itemId }) => {
  const v = VENDORS[id];
  const isMenu = Boolean(itemId);
  const price = isMenu ? v.menu[itemId] : VENDOR_COST;
  const dref = fakeDb.doc(`dailyActions/${PREVIEW_UID}_${dayKey()}`);
  if (!isMenu && (await dref.get()).data()?.vendorPurchases?.[id]) throw Object.assign(new Error('Bu satıcıdan bugün zaten alışveriş yaptın.'), { code: 'failed-precondition' });
  const uref = fakeDb.doc(`users/${PREVIEW_UID}`);
  const u = (await uref.get()).data();
  await uref.set({ gold: u.gold - price, ...(isMenu ? {} : { suspicion: Math.max(0, (u.suspicion || 0) - 5) }) }, { merge: true });
  if (!isMenu) await dref.set({ vendorPurchases: { [id]: true } }, { merge: true });
  const it = isMenu ? itemId : v.product;
  await fakeDb.doc(`heldItems/${PREVIEW_UID}`).set({ itemId: it, venue: 'ev', houseId: VENUES[v.venue].houseId, untilMs: Date.now() + 120000 });
  await fakeDb.doc(`housePresence/${PREVIEW_UID}`).set({ holding: it }, { merge: true });
  return { ok: true, itemId: it, price };
};
window.__heist = [];
window.__ready = true;
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>
        <VenueHouseScreen venue={venue} onExit={() => {}} onOpenHeist={(t) => window.__heist.push(t)} />
      </SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
