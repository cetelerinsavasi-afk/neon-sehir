// SADECE önizleme (v177): ticari araç satış sayfası (GERÇEK functions/fleet.js) · /fleet.html?job=otobus&own=1
// · oyunun motor galerisi: /fleet.html?moto=1 · binek: /fleet.html?animal=deve|at|bisiklet
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { FleetSheet, AnimalSheet } from '../src/components/City/CityScreen';
import { createStable } from '../functions/stable.js';
import MotorGalleryScreen from '../src/components/MotorGallery/MotorGalleryScreen';
import { fakeDb, PREVIEW_UID, PreviewHttpsError } from './mocks/backend.js';
import { FieldValue } from '../functions/gang/test/fakeFirestore.js';
import { createFleet } from '../functions/fleet.js';
import { newVehicleDoc } from '../functions/shop.js';
import { statWrite, stateDayKey } from '../functions/stateTreasury.js';
import { borsaCompanyStatKey } from '../functions/borsa.js';
import { goldTag } from '../functions/moneyLog.js';
import '../src/index.css';
import '../src/styles/theme.css';
import '../src/components/City/City.css';
import '../src/components/VehicleGalleryScreen/VehicleGalleryScreen.css';

const q = new URLSearchParams(location.search);
const fleet = createFleet({ db: fakeDb, FieldValue, HttpsError: PreviewHttpsError, goldTag, statWrite, newVehicleDoc, companyStatKey: borsaCompanyStatKey, dayKey: stateDayKey });
const stable = createStable({ db: fakeDb, FieldValue, HttpsError: PreviewHttpsError, goldTag, statWrite, newVehicleDoc, dayKey: stateDayKey });
window.__fnHook = { ...(window.__fnHook || {}), shopAction: (uid, d) => ({ ...fleet.ops, ...stable.ops })[d.op](uid, d) };
(async () => {
  await fakeDb.doc(`users/${PREVIEW_UID}`).set({ displayName: 'Test', gold: 900_000 }, { merge: true });
  const job = q.get('job') || 'otobus';
  for (const cid of [11, 12, 13, 14, 15]) await fakeDb.doc(`vehicles/pv_${cid}`).delete();
  if (q.get('own')) await fakeDb.doc('vehicles/own1').set({ ownerId: PREVIEW_UID, catalogId: { taksi: 13, otobus: 12, ambulans: 15, tir: 11 }[job], lifeDays: 6, jobEarned: 187_500, model: 'X' });
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      {q.get('animal') ? <AnimalSheet kind={q.get('animal')} gold={900_000} onClose={() => {}} /> : q.get('moto') ? <MotorGalleryScreen onClose={() => {}} /> : <FleetSheet job={job} uid={PREVIEW_UID} gold={900_000} onClose={() => {}} />}
    </AuthProvider>
  );
  window.__ready = true;
})();
