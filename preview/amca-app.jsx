// SADECE önizleme (v168): Rıza Amca senaryosu — gerçek şehir + gerçek senaryo katmanı, sahte sunucu.
//   ?step=1..20   görev sırası (onboardingV 4)      ?old=1  görevleri bitmiş eski oyuncu
//   ?dead=1       Amca ölmüş (mezar)                  ?fresh=1  bu cihazdaki senaryo kayıtlarını sil
// Konsoldan: __step(n) sunucunun görevi ilerletmesini taklit eder; __user() oyuncu belgesi.
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import CityScreen from '../src/components/City/CityScreen';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import { ONBOARDING_TASK_COUNT, onboardingPosOf, currentOnboardingTaskId } from '../functions/onboardingData.js';
import '../src/index.css';
import '../src/styles/theme.css';

const q = new URLSearchParams(location.search);
const uid = PREVIEW_UID;
if (q.get('fresh')) Object.keys(localStorage).filter((k) => k.startsWith(`amca:${uid}:`)).forEach((k) => localStorage.removeItem(k));
const old = Boolean(q.get('old'));
const doc = fakeDb.doc(`users/${uid}`);
doc.set(
  {
    displayName: 'Sen',
    gold: 1e7,
    avatar: { gender: 'erkek', hairStyle: 'buzz', clothing: 'hoodie', clothColor: '#5b6270', skin: '#c68863' },
    onboardingStep: old ? ONBOARDING_TASK_COUNT + 1 : Number(q.get('step') || 1),
    onboardingV: 4,
    onboardingRewardClaimed: old,
    amcaDead: Boolean(q.get('dead')),
    ...(q.get('credit') ? { credit: { principal: 1000, totalOwed: 1200, paid: 0 } } : {}),
  },
  { merge: true }
);
if (q.get('car')) fakeDb.doc(`vehicles/${uid}_1`).set({ ownerId: uid, catalogId: 1, lifeDays: 30, mods: null });
const user = async () => (await doc.get()).data();
window.__user = user;
window.__step = async (n) => {
  const u = await user();
  await doc.update({ onboardingStep: n ?? onboardingPosOf(u) + 1, onboardingV: 4 });
};
window.__calls = [];
window.__fnHook = {
  async checkOnboardingProgress(_uid, data) {
    window.__calls.push(data || {});
    const u = await user();
    const pos = onboardingPosOf(u);
    const cur = currentOnboardingTaskId(u);
    if (data?.event === 'replay') {
      if (!u.amcaDead && pos > ONBOARDING_TASK_COUNT) await doc.update({ amcaDead: true });
    } else if (data?.event === 'finale') {
      if (cur === 22) await doc.update({ onboardingStep: pos + 1, onboardingV: 4, amcaDead: true });
    } else if (data?.event === 'teleport') {
      if (cur === 21) await doc.update({ onboardingStep: pos + 1, onboardingV: 4 });
    } else if (cur === 14 && u.credit) await doc.update({ onboardingStep: pos + 1, onboardingV: 4 });
    return { ok: true };
  },
};
window.__ready = true;
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>
        <CityScreen spawn="ev" onClose={() => {}} onEnterRegion={() => {}} />
      </SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
