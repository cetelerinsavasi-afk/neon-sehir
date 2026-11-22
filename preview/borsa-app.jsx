// SADECE önizleme (v176): Neon Borsa + Parara Bank telefonda, GERÇEK functions/borsa.js ile.
// Adres: /borsa.html?app=borsa|parara|cappstore  ·  window.__borsa: { hourly, income, day(+n) }
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import PhoneScreen from '../src/components/Phone/PhoneScreen';
import { fakeDb, PREVIEW_UID, PreviewHttpsError } from './mocks/backend.js';
import { FieldValue } from '../functions/gang/test/fakeFirestore.js';
import { createBorsa, BORSA_COS } from '../functions/borsa.js';
import { stateWrite, stateDayKey } from '../functions/stateTreasury.js';
import { addDayKey } from '../functions/belediyeRates.js';
import { goldTag } from '../functions/moneyLog.js';
import '../src/index.css';
import '../src/styles/theme.css';

const q = new URLSearchParams(location.search);
let shift = 0; // önizlemede zamanı ileri sarmak için (ms)
const now = () => Date.now() + shift;
const borsa = createBorsa({ db: fakeDb, FieldValue, HttpsError: PreviewHttpsError, goldTag, stateWrite, taxFrac: () => 0.1, dayKey: (ms) => stateDayKey(ms), addDayKey, now });
window.__fnHook = {
  ...(window.__fnHook || {}),
  borsaAction: (uid, data) => (data?.op === 'topla' ? borsa.collect(uid) : borsa.trade(uid, data)),
};
const income = (day, sk, amount) => fakeDb.doc(`stateLedger/${day}_s0`).set({ dayKey: day, stat: { [`hs_${sk}`]: FieldValue.increment(amount) } }, { merge: true });
window.__borsa = { borsa, fakeDb, hourly: () => borsa.hourly(), income, shiftHours: (h) => (shift += h * 3600_000), now };
// Parara için yatırım fiyatları / geçmişi
const invest = () => {
  const t = Date.now();
  fakeDb.doc('investments/current').set({ diamondPrice: 12840, stockPrice: 96_400_000, cryptoPrice: 151_200, diamondChangePct: 2.4, stockChangePct: -1.1, cryptoChangePct: 6.8, updatedAt: t });
  for (let i = 0; i < 30; i++) {
    fakeDb.collection('investmentHistory').doc(`h${i}`).set({ diamondPrice: 11000 + Math.round(Math.sin(i / 3) * 900 + i * 60), stockPrice: 90_000_000 + Math.round(Math.cos(i / 4) * 4_000_000 + i * 200_000), cryptoPrice: 120_000 + Math.round(Math.sin(i / 2) * 15_000 + i * 1000), timestamp: { toMillis: () => t - (30 - i) * 3600_000, toDate: () => new Date(t - (30 - i) * 3600_000) }, createdAt: t - (30 - i) * 3600_000 });
  }
};

(async () => {
  try {
    window.localStorage.setItem(`neon-phone-apps-v1:${PREVIEW_UID}`, JSON.stringify({ order: q.get('install') === '0' ? ['parara'] : ['parara', 'borsa'] }));
  } catch {
    /* yoksay */
  }
  await fakeDb.doc(`users/${PREVIEW_UID}`).set({ displayName: 'Haluk Levent', gold: 2_500_000, bankBalance: 4_200_000, diamondHoldings: 31.5, diamondCostBasis: 360_000, cryptoHoldings: 2.2, cryptoCostBasis: 300_000, debtToState: q.get('debt') ? 150_000 : 0, creditScore: 640 }, { merge: true });
  invest();
  // 9 gün geçmiş: botlar hisse alır, her gece gelir dağıtılır, grafik dolar
  const bots = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
  for (const b of bots) await fakeDb.doc(`users/${b}`).set({ displayName: b, gold: 50_000_000 });
  shift = -9 * 86_400_000;
  await borsa.hourly();
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
  const base = { kokorecci: [40, 110], simitci: [30, 90], donerci: [25, 80], kofteci: [30, 95], midyeci: [15, 60], dondurmaci: [10, 50], hastane: [60, 160], nakliye: [80, 250], terminal: [40, 120], taksi: [20, 90] };
  for (let h = 0; h < 9 * 24; h++) {
    shift += 3600_000;
    if (h % 3 === 0) {
      const b = bots[rnd(0, bots.length)];
      const c = BORSA_COS[rnd(0, BORSA_COS.length)].id;
      await (Math.random() < 0.7 ? borsa.trade(b, { op: 'al', co: c }) : borsa.trade(b, { op: 'sat', co: c })).catch(() => {});
    }
    if (h % 24 === 20) for (const c of BORSA_COS) await income(stateDayKey(now()), c.sk, rnd(...base[c.id]) * 1000);
    if (h === 150) {
      await borsa.trade(PREVIEW_UID, { op: 'al', co: 'kokorecci' });
      await borsa.trade(PREVIEW_UID, { op: 'al', co: 'kokorecci' });
      await borsa.trade(PREVIEW_UID, { op: 'al', co: 'midyeci' });
    }
    await borsa.hourly();
  }
  shift = 0;
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <BlocksProvider>
        <SocialProvider>
          <div style={{ width: Number(q.get('w') || 390), height: '100vh', position: 'relative', background: '#000' }}>
            <PhoneScreen initialApp={q.get('app') || 'borsa'} onClose={() => {}} />
          </div>
        </SocialProvider>
      </BlocksProvider>
    </AuthProvider>
  );
  window.__ready = true;
})();
