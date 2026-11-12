// SADECE önizleme (v154): Mekanlar ekranı (Soygun / Şüphe sekmeleri) + sahte silah gücü
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import MekanlarScreen from '../src/components/MekanlarScreen/MekanlarScreen';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const q = new URLSearchParams(location.search);
fakeDb.doc(`users/${PREVIEW_UID}`).set({ displayName: 'Önizleme', gold: 50000, suspicion: 22 }, { merge: true });
fakeDb.doc(`weapons/${PREVIEW_UID}_w1`).set({ ownerId: PREVIEW_UID, power: Number(q.get('power') || 6500), lifeDays: 10 });
if (q.get('daily')) {
  const d = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  fakeDb.doc(`dailyActions/${PREVIEW_UID}_${d}`).set({ heist: { seyyar_satici_1: true }, vendorPurchases: { seyyar_satici_2: true } });
}
if (q.get('plans')) {
  const exp = { toMillis: () => Date.now() + 864e5 };
  const av = (c, h) => ({ gender: 'erkek', hairStyle: h, clothing: 'hoodie', clothColor: c });
  const P = (id, creator, members) => {
    fakeDb.doc(`heistPlans/${id}`).set({ target: 'banka', creatorUid: creator, status: 'open', memberUids: members.map((m) => m[0]), note: id === 'p1' ? 'Şüphen 20 altındaysa gel' : '', expiresAt: exp });
    members.forEach(([uid, name, pw, sus, c, h]) => fakeDb.doc(`heistPlans/${id}/participants/${uid}`).set({ uid, displayName: name, weaponPower: pw, suspicion: sus, avatar: av(c, h) }));
  };
  P('p1', 'demir', [['demir', 'Demir', 38000, 12, '#3a2f1d', 'kel'], ['kaan', 'Kaan', 30000, 44, '#1d3d5c', 'slick']]);
  P('p2', PREVIEW_UID, [[PREVIEW_UID, 'Önizleme', 6500, 22, '#4a1d5c', 'short'], ['zeyno', 'Zeyno', 41000, 8, '#7a1f2b', 'ponytail'], ['efe', 'Efe', 30000, 14, '#1d5c3a', 'curly'], ['ayse', 'Ayşe', 25000, 3, '#c0392b', 'bun']]);
  P('p3', 'mert', [['mert', 'Mert', 52000, 61, '#1a1a1a', 'short'], ['ali', 'Ali', 25000, 5, '#24445c', 'short'], ['can', 'Can', 18000, 30, '#c0392b', 'short']]);
}
function App() {
  const [tab, setTab] = useState(q.get('tab') || 'soygun');
  return <MekanlarScreen tab={tab} onTabChange={setTab} initialHeistTarget={q.get('t') || null} onClose={() => {}} onVisitVenue={() => {}} onVisitHouse={() => {}} />;
}
window.__ready = true;
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BlocksProvider>
      <SocialProvider>
        <App />
      </SocialProvider>
    </BlocksProvider>
  </AuthProvider>
);
