// SADECE önizleme (v136): Seçim ekranı — gerçek functions/politics.js + sahte Firestore.
//   ?s=signup (vars.) · election · voted · counting · results · ?uid=… başka oyuncu
//   ?home=1 → anasayfa sol alt sütunu (Görevler/CANLI yerine örnek kutular + 🗳️)
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import PoliticsScreen from '../src/components/Politics/PoliticsScreen';
import PoliticsHomeButton from '../src/components/Politics/PoliticsHomeButton';
import { CoupScreen, CoupPanel } from '../src/components/Politics/Coup';
import { fakeDb, PreviewHttpsError } from './mocks/backend.js';
import { FieldValue } from '../functions/gang/test/fakeFirestore.js';
import { createBelediye } from '../functions/belediye.js';
import { createPolitics } from '../functions/politics.js';
import { resolveRates } from '../functions/belediyeRates.js';
import '../src/index.css';
import '../src/styles/theme.css';

const q = new URLSearchParams(location.search);
const scen = q.get('s') || 'signup';
const realNow = Date.now.bind(Date);
let virt = Date.parse('2026-10-29T12:00:00+03:00');
let offset = virt - realNow();
const setClock = (iso) => {
  offset = Date.parse(iso) - realNow();
};
Date.now = () => realNow() + offset;
const bel = createBelediye({
  db: fakeDb,
  FieldValue,
  HttpsError: PreviewHttpsError,
  requireAuth: () => null,
  onCall: null,
  splitIncomeForDebt: (_d, a) => ({ goldDelta: a, debtDelta: 0 }),
  isAdmin: async (uid) => uid === 'previewAdmin',
  liveMembership: async () => null,
  rates: { loadRates: async () => {}, ratesFor: (d) => resolveRates(null, d) },
});
const pol = createPolitics({ db: fakeDb, FieldValue, HttpsError: PreviewHttpsError, requireAuth: () => null, onCall: null, belediye: bel, rnd: () => 0 });
window.__politics = pol;
const AV = (skin, hair, shirt) => ({ skin, hair, shirt });
const NAMES = ['Aylin_Z', 'Demir_Ali', 'Cemre', 'Bora_Fb', 'Kaan_34', 'Mira', 'Selin', 'Tuna', 'Ece', 'Mert', 'Arda', 'Deniz', 'Yaren', 'Efe', 'Nisa', 'Kerem', 'Lara', 'Onur', 'Pelin', 'Rüzgar', 'Sude', 'Toprak', 'Umut', 'Vera', 'Yağız', 'Zeyno', 'Atlas', 'Bade', 'Can', 'Duru'];
(async () => {
  await fakeDb.doc('users/previewAdmin').set({ displayName: 'Haluk Levent', gold: 2_500_000, onboardingRewardClaimed: true, avatar: AV('#e0ac84', '#3b2314', '#1f6feb') });
  for (let i = 0; i < NAMES.length; i++) await fakeDb.doc(`users/u${i}`).set({ displayName: NAMES[i], gold: 1_000_000, onboardingRewardClaimed: true, avatar: AV(['#e0ac84', '#c68642', '#8d5524', '#f1c27d'][i % 4], ['#3b2314', '#111', '#a55728', '#d6b370'][i % 4], ['#1f6feb', '#d6336c', '#2f9e44', '#f08c00'][i % 4]) });
  await bel.handle('previewAdmin', { op: 'claimMayor' });
  const at = (iso) => setClock(iso);
  const night = async (day) => {
    at(`${day}T00:01:00+03:00`);
    await bel.nightly(day, { step: 'payrollSnapshot' });
    await pol.nightly(day);
  };
  await night('2026-10-30');
  at('2026-10-30T10:00:00+03:00');
  await pol.handle('u0', { op: 'apply', text: 'Sevgili hemşehrilerim! Fabrika vergilerini %2 düşüreceğim, polis maaşlarını artıracağım.\n\nKasayı şeffaf yöneteceğim: her gece raporu gazetede yayınlanacak. Çetelerle mücadele ve esnafa destek önceliğim.' });
  await pol.handle('u1', { op: 'apply', text: 'Değişim için oy verin. Kafe ve bar vergileri inecek.' });
  await pol.handle('u2', { op: 'apply' });
  await pol.handle('u3', { op: 'apply', text: 'Gençlere iş, sokaklara ışık.' });
  for (let i = 4; i < 14; i++) await pol.handle(`u${i}`, { op: 'sign', cand: 'u1' });
  at('2026-10-30T14:00:00+03:00');
  for (let i = 14; i < 24; i++) await pol.handle(`u${i}`, { op: 'sign', cand: 'u0' });
  for (let i = 24; i < 27; i++) await pol.handle(`u${i}`, { op: 'sign', cand: 'u3' });
  if (scen.startsWith('coup')) {
    // seçim → u0 başkan; polisler; Pazartesi plan → Salı oylama → Çarşamba darbe
    await night('2026-11-01');
    at('2026-11-01T10:00:00+03:00');
    await pol.handle('u5', { op: 'vote', cand: 'u0' });
    await night('2026-11-02');
    await night('2026-11-03');
    await fakeDb.doc('gangSystem/config').set({ liveWorldId: 'w', liveOpen: true }, { merge: true });
    const cop = async (uid, rid, rank, code) => {
      await fakeDb.doc(`gangWorlds/w/memberships/${uid}`).set({ intelRosterId: rid, intelRank: rank, intelCodeName: code });
      await fakeDb.doc(`gangWorlds/w/intelRoster/${rid}`).set({ rank, codeName: code, prestige: 5e6 });
      await fakeDb.doc(`gangWorlds/w/intelRosterLinks/${rid}`).set({ actorId: uid });
    };
    await cop('previewAdmin', 'r1', 'baskan', 'Kartal');
    await fakeDb.doc('users/previewAdmin').set({ profession: 'polis' }, { merge: true });
    await cop('u20', 'r2', 'sef', 'Şahin');
    await cop('u21', 'r3', 'sef', 'Atmaca');
    await cop('u22', 'r4', 'uzman', 'Doğan');
    at('2026-11-09T10:00:00+03:00');
    await pol.handle('previewAdmin', { op: 'coupPlan' });
    if (scen !== 'coupPlan') {
      await night('2026-11-10');
      at('2026-11-10T10:00:00+03:00');
      for (const u of ['u20', 'u21', 'u22']) await pol.handle(u, { op: 'coupPoliceVote', choice: 'yes' });
      if (scen === 'coupVote') at('2026-11-10T12:00:00+03:00');
      else {
        await night('2026-11-11');
        at('2026-11-11T10:00:00+03:00');
        for (let i = 1; i < 12; i++) await pol.handle(`u${i}`, { op: 'coupJoin', side: 'coup' });
        for (let i = 12; i < 16; i++) await pol.handle(`u${i}`, { op: 'coupJoin', side: 'gov' });
        await pol.handle('u20', { op: 'coupJoin', side: 'gov' });
        await pol.handle('previewAdmin', { op: 'coupText', text: 'Bu şehir çürümüş bir yönetime teslim edilemez.\nVergiler halkı eziyor, kasa boşaltılıyor. Emniyet olarak düzeni yeniden kuracağız.' });
        await pol.handle('u0', { op: 'coupText', text: 'Seçilmiş hükümet yerinde. Darbeye geçit yok!' });
        at('2026-11-11T14:30:00+03:00');
        if (scen === 'coupWon') {
          await night('2026-11-12');
          at('2026-11-12T09:00:00+03:00');
        }
      }
    }
  } else if (scen === 'signup') at('2026-10-31T15:20:00+03:00');
  else {
    await night('2026-11-01');
    at('2026-11-01T03:00:00+03:00');
    for (let i = 4; i < 12; i++) await pol.handle(`u${i}`, { op: 'vote', cand: 'u1' });
    at('2026-11-01T15:00:00+03:00');
    for (let i = 12; i < 25; i++) await pol.handle(`u${i}`, { op: 'vote', cand: 'u0' });
    if (scen === 'voted') await pol.handle('previewAdmin', { op: 'vote', cand: 'u0' });
    if (scen === 'counting' || scen === 'results') {
      at('2026-11-01T21:00:30+03:00');
      await pol.clock();
      at('2026-11-01T22:40:00+03:00');
      await pol.clock();
    }
    if (scen === 'results') await night('2026-11-02');
    if (scen === 'results') at('2026-11-02T10:00:00+03:00');
    if (scen === 'election' || scen === 'voted') at('2026-11-01T16:30:00+03:00');
  }
  window.__clock = setClock;
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      {scen === 'coup' ? (
        <CoupScreen onClose={() => {}} />
      ) : scen.startsWith('coup') ? (
        <div className="gx-root" style={{ minHeight: '100vh', padding: 16, background: '#070a12' }}>
          <CoupPanel rank="baskan" rosterId="r1" />
        </div>
      ) : q.get('home') ? (
        <div style={{ height: '100vh', background: '#0b1020' }}>
          <PoliticsHomeButton slot={Number(q.get('slot') || 0)} />
        </div>
      ) : (
        <PoliticsScreen onClose={() => console.log('kapat')} />
      )}
    </AuthProvider>
  );
})().catch((e) => {
  console.error('ÖNİZLEME KURULUM HATASI', e);
  document.body.innerHTML = `<pre style="color:red">${e.stack}</pre>`;
});
