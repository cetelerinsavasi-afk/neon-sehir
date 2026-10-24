// SADECE önizleme (v127): Belediye ekranı — gerçek functions/belediye.js + sahte Firestore.
//   ?uid=previewAdmin (varsayılan, başkan) · ?uid=ali (yardımcı) · ?uid=veli (Sanayi
//   bakanı) · ?uid=davetli (Kültür daveti bekliyor) · ?uid=gezgin (kadroda değil)
//   ?empty=1 → başkan yok (admin "Başkanlığı devral" görür)
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import BelediyeScreen from '../src/components/Belediye/BelediyeScreen';
import { fakeDb, PreviewHttpsError } from './mocks/backend.js';
import { FieldValue, Timestamp } from '../functions/gang/test/fakeFirestore.js';
import { createBelediye, ministryReport } from '../functions/belediye.js';
import { resolveRates, rateDayKey, addDayKey } from '../functions/belediyeRates.js';
import { stateWrite } from '../functions/stateTreasury.js';
import '../src/index.css';
import '../src/styles/theme.css';

const q = new URLSearchParams(location.search);
const S = (p, d) => fakeDb.doc(p).set(d);
const today = rateDayKey();
const y = addDayKey(today, -1);
const bel = createBelediye({
  db: fakeDb,
  FieldValue,
  HttpsError: PreviewHttpsError,
  requireAuth: () => null,
  onCall: null,
  splitIncomeForDebt: (_d, a) => ({ goldDelta: a, debtDelta: 0 }),
  isAdmin: async (uid) => uid === 'previewAdmin',
  liveMembership: async () => null,
  rates: { loadRates: async () => {}, ratesFor: (d) => resolveRates(fakeDb._get('belediye/rates'), d, fakeDb._get('belediye/pending')) },
});
window.__belediye = bel;
window.__db = fakeDb;

const AV = (skin, hair) => ({ skin, hair, shirt: '#1f6feb' });
(async () => {
  const users = { previewAdmin: 'Haluk Levent', ali: 'Aylin_Z', veli: 'Demir_Ali', ayse: 'Cemre', davetli: 'Bora_Fb', gezgin: 'Gezgin', kaan: 'Kaan_34', mira: 'Mira' };
  for (const [u, n] of Object.entries(users)) await fakeDb.doc(`users/${u}`).set({ displayName: n, gold: 2_500_000, avatar: AV('#e0ac84', '#3b2314') }, { merge: true });
  await S('friendships/previewAdmin', { friends: Object.fromEntries(['ali', 'veli', 'ayse', 'davetli', 'kaan', 'mira'].map((u) => [u, { name: users[u], avatar: AV('#c68642', '#111') }])) });
  // kasa: dünkü ve bugünkü defter
  const b = fakeDb.batch();
  const W = (kind, cat, amount, dayKey = y) => stateWrite(b, fakeDb, FieldValue, { kind, cat, amount, dayKey, atMs: Date.now() });
  [['vergi_fabrika', 1_840_000], ['vergi_makine', 210_000], ['vergi_maasIsci', 96_000], ['vergi_isl_cafe', 220_000], ['vergi_isl_bar', 310_000], ['vergi_ikinciEl', 53_000], ['vergi_piyango', 250_000], ['gazino_slot', 420_000], ['soygun_ceza', 2_100_000], ['ist_operasyon', 640_000], ['vergi_yayin', 86_000], ['vergi_sanatci', 41_000], ['vergi_maasFutbolcu', 240_000], ['bagis', 150_000]].forEach(([c, a]) => W('in', c, a));
  [['maas_polis', 1_295_000], ['soygun_polis_payi', 525_000], ['soygun_odeme', 160_000], ['ist_operasyon', 210_000], ['maas_imam', 10_000], ['maas_belediye', 160_000]].forEach(([c, a]) => W('out', c, a));
  W('in', 'vergi_fabrika', 900_000, today);
  await b.commit();
  const day = { in: {}, out: {} };
  Object.values(fakeDb._dump('stateLedger/')).forEach((d) => {
    if (d.dayKey !== y) return;
    for (const k of ['in', 'out']) for (const [c, v] of Object.entries(d[k] || {})) day[k][c] = (day[k][c] || 0) + v;
  });
  const rep = ministryReport(day);
  if (!q.get('empty')) {
    await bel.handle('previewAdmin', { op: 'claimMayor' });
    for (const [seat, uid] of [['yrd1', 'ali'], ['san', 'veli'], ['tic', 'ayse']]) {
      await bel.handle('previewAdmin', { op: 'invite', seat, targetUid: uid });
      await bel.handle(uid, { op: 'respondInvite', accept: true });
    }
    await bel.handle('previewAdmin', { op: 'setPerms', seat: 'yrd1', perms: { sanayi: true, ticaret: true, fire: true } });
    await bel.handle('previewAdmin', { op: 'invite', seat: 'kul', targetUid: 'davetli' });
    await bel.handle('previewAdmin', { op: 'setRate', id: 'isKafe', value: 11 });
    await bel.handle('veli', { op: 'setRate', id: 'f2', value: 9 });
    await bel.handle('previewAdmin', { op: 'chat', channel: 'genel', text: 'Hoş geldiniz arkadaşlar, ilk toplantı bu akşam.' });
    await bel.handle('ali', { op: 'chat', channel: 'genel', text: 'Ticaret vergilerini biraz düşürelim mi?' });
    await bel.handle('previewAdmin', { op: 'donate', amount: 50_000 });
    await bel.handle('ali', { op: 'donate', amount: 120_000 });
  }
  await S('belediye/public', {
    reportDay: y,
    report: {
      dayKey: y,
      ...rep,
      stat: { mk_mining_n: 42, mk_mining_ciro: 4_200_000, mk_mining_vergi: 210_000, isci_n: 2840, isci_brut: 960_000, isl_cafe_ciro: 2_200_000, isl_bar_ciro: 3_100_000, ie_araba_n: 12, ie_araba_ciro: 3_400_000, ie_silah_n: 38, ie_silah_ciro: 1_900_000, pi_bilet: 812, pi_odul: 2_500_000, sosyal_yayin: 860_000, sosyal_sarki: 410_000, fut_brut: 2_400_000 },
      analysis: {
        factories: { count: 127, top: [{ name: 'Demir Çelik A.Ş.', gross: 18_400_000, ratePct: 40, tax: 7_360_000 }, { name: 'Kuzey Otomotiv', gross: 7_200_000, ratePct: 20, tax: 1_440_000 }, { name: 'Neon Makine', gross: 460_000, ratePct: 10, tax: 46_000 }, { name: 'Kartal Kripto', gross: 290_000, ratePct: 10, tax: 29_000 }], others: { count: 123, gross: 1_350_000, tax: 13_500 } },
        bizCounts: { cafe: 48, bar: 27, spor: 31, internet: 35, silahci: 14, modifiye: 22, gazino: 9 },
        police: { ranks: { baskan: 1, sef: 3, uzman: 6, ajan: 14, muhbir: 61 }, count: 85 },
        creators: [{ name: 'NeonKral', kind: 'yayın', earned: 210_000 }, { name: 'Gece Kuşu', kind: 'şarkı', earned: 140_000 }],
      },
      donations: { total: 150_000, top: [] },
      kasa: 4_100_000,
      debts: { maasCount: 1, maasTotal: 400_000, other: 500_000 },
    },
    changesDay: today,
    changes: [
      { id: 'isKumar', label: 'Kumarhane (gazino)', m: 'ticaret', unit: '%', from: 10, to: 11, good: false },
      { id: 'polMemur', label: 'Polis Memuru', m: 'guvenlik', unit: 'gold', from: 5000, to: 6000, good: true },
    ],
    payroll: { dayKey: today, paid: false, total: 400_000, paidOld: [] },
  });
  await S(`belediyeDebts/${addDayKey(today, -3)}`, { kind: 'maas', dayKey: addDayKey(today, -3), workDay: addDayKey(today, -4), total: 400_000, items: [{ uid: 'ali', role: 'belediye', name: 'x', amount: 400_000 }], status: 'open' });
  await S('belediye/otherDebt', { soygun: 500_000, eski: 0, log: [{ atMs: Date.now() - 3600e3, kind: 'soygun', amount: 500_000, note: 'Banka soygunu' }] });
  // ayrıntılı defter: 30 kapanmış gün + özet + canlı bugün
  let bal = 3_000_000;
  const totals = { in: {}, out: {}, inTotal: 0, outTotal: 0 };
  for (let i = 30; i >= 1; i--) {
    const k = addDayKey(today, -i);
    const f = 0.6 + ((i * 37) % 10) / 10;
    const d = { dayKey: k, in: { vergi_fabrika: Math.round(1_500_000 * f), vergi_yayin: Math.round(60_000 * f), vergi_sanatci: 30_000, vergi_isletme: i > 3 ? 400_000 : 0, vergi_isl_cafe: i <= 3 ? 220_000 : 0, soygun_ceza: i % 4 ? 0 : 2_000_000, gazino_slot: 300_000, gazino_rulet: 90_000 }, out: { maas_polis: 1_200_000, maas_imam: 10_000, soygun_odeme: i % 6 ? 0 : 3_500_000 } };
    d.inTotal = Object.values(d.in).reduce((x, y) => x + y, 0);
    d.outTotal = Object.values(d.out).reduce((x, y) => x + y, 0);
    bal += d.inTotal - d.outTotal;
    for (const kk of ['in', 'out']) for (const [c, n] of Object.entries(d[kk])) totals[kk][c] = (totals[kk][c] || 0) + n;
    totals.inTotal += d.inTotal;
    totals.outTotal += d.outTotal;
    await S(`stateDays/${k}`, { ...d, net: d.inTotal - d.outTotal, balanceAfter: bal });
  }
  await S('stateTreasury/main', { balance: bal, totals, closedThrough: y, firstDayKey: addDayKey(today, -30) });
  await bel.kasa.fold();
  await S('imamState/current', { uid: 'kaan', displayName: 'Kaan_34', avatar: AV('#8d5524', '#111'), lastNasihat: 'Kazancın helalinden olsun; komşun açken tok yatma.', lastNasihatAt: Timestamp.fromMillis(Date.now() - 3 * 3600e3), becameImamAt: Timestamp.fromMillis(Date.now() - 50 * 3600e3) });
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <BlocksProvider>
        <SocialProvider>
          <BelediyeScreen onClose={() => console.log('kapat')} />
        </SocialProvider>
      </BlocksProvider>
    </AuthProvider>
  );
})().catch((e) => {
  console.error('ÖNİZLEME KURULUM HATASI', e);
  document.body.innerHTML = `<pre style="color:red">${e.stack}</pre>`;
});
