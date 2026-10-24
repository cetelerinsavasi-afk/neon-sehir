// SADECE önizleme (v124 Faz 6): oyuncu gazinosu. /pcasino.html?v=games|owner|report|remove [&g=slot|rulet|onnumara|piyango] [&uid=patron]
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { AuthProvider } from '../src/contexts/AuthContext';
import { fakeDb } from './mocks/backend.js';
import { CasinoGamesSheet, CasinoPriceSection, CasinoInvSection, CasinoReportCard } from '../src/components/Casino/PlayerCasino';
import { BizRemovePanel } from '../src/components/HouseScreen/HouseBusiness';
import '../src/index.css';
import '../src/styles/theme.css';
import '../src/components/HouseScreen/HouseScreen.css';

const qs = new URLSearchParams(location.search);
const v = qs.get('v') || 'games';
const H = { ownerUid: 'patron', name: 'Altın Saray Gazino', biz: { type: 'gazino' }, bizType: 'gazino', bizPrices: { gazino: { slot: 1450, cut: 5 } } };
fakeDb.doc('houses/g1').set(H);
fakeDb.doc('users/patron').set({ displayName: 'Patron', gold: 750_000 });
fakeDb.doc('users/patron/inventory/yasakliMadde').set({ quantity: 12 });
fakeDb.doc('casinoMachines/g1_slot').set({ casinoId: 'g1', ownerUid: 'patron', m: 'slot', gold: qs.get('empty') ? 4000 : 25_000, yasakliMadde: 6 });
fakeDb.doc('casinoMachines/g1_rulet').set({ casinoId: 'g1', ownerUid: 'patron', m: 'rulet', gold: 48_000 });
fakeDb.doc('casinoMachines/g1_kart').set({ casinoId: 'g1', ownerUid: 'patron', m: 'kart', gold: 2_500 });
const report = {
  revenue: 265_000,
  cust: { a: true, b: true, c: true },
  casino: { slot: { in: 15_000, outGold: 10_000, outYm: 10, n: 10 }, piyango: { in: 100_000, out: 95_000 }, rulet: { in: 50_000, out: 40_000 }, onnumara: { in: 100_000, out: 50_000 } },
};
function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);
  if (!ready) return null;
  return (
    <div className="hs-root" style={{ position: 'relative', minHeight: '100vh', padding: 12 }}>
      <div className="wk-sheet" style={{ position: 'relative', maxWidth: 440, margin: '0 auto' }}>
        {v === 'games' && <CasinoGamesSheet casinoId="g1" houseDoc={H} initialGame={qs.get('g')} onClose={() => {}} />}
        {v === 'owner' && (
          <div className="bz">
            <CasinoPriceSection houseId="g1" houseDoc={H} />
            <CasinoInvSection houseId="g1" />
          </div>
        )}
        {v === 'report' && (
          <div className="bz">
            <CasinoReportCard label="Bugün" d={report} />
          </div>
        )}
      </div>
      {v === 'remove' && <BizRemovePanel type="gazino" status={{ lock: { locked: false }, materialBlock: [], returns: { materials: {}, casinoGold: 67_950, casinoTax: 7_550, casinoContraband: 6 } }} onCancel={() => {}} onConfirm={() => {}} />}
    </div>
  );
}
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
