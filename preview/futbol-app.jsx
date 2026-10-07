// SADECE önizleme (v77 Faz 5): gerçek futbolcu ekranları sahte Firebase ile.
// /futbol-app.html?v=free | contract | team | board | match
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import FutbolFutbolcu from '../src/components/FutbolScreen/FutbolFutbolcu';
import { ProContracts, ProPlayersList } from '../src/components/FutbolScreen/FutbolProMarket';
import FutbolOyuncular from '../src/components/FutbolScreen/FutbolOyuncular';
import FutbolMatchDetail from '../src/components/FutbolScreen/FutbolMatchDetail';
import { fakeDb, futbolPro, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';
import '../src/components/FutbolScreen/FutbolFullScreen.css';

const v = new URLSearchParams(location.search).get('v') || 'free';
const S = (p, d) => fakeDb.doc(p).set(d);
const T0 = Date.now();
async function seed() {
  await S('futbolLeagues/l1', { tier: 1, season: 3, name: 'Süper Lig' });
  await S('futbolTeams/t1', { name: 'Neon FK', ownerUid: v === 'team' ? PREVIEW_UID : 'baskan', managerUid: null, treasury: 20000, tier: 1, logo: null, playerDebts: v === 'team' ? { eski: 3000 } : {} });
  await S('futbolTeams/t2', { name: 'Gece SK', ownerUid: 'baskan2', treasury: 0, tier: 2 });
  await S('users/baskan2', { gold: 100000 });
  await S('users/baskan', { gold: 100000 });
  const pros = [
    ['p1', 'Kerem Yıldız', 'FWD', 236.4, true, 8000],
    ['p2', 'Deniz Kaya', 'GK', 221, false],
    ['p3', 'Mert Aslan', 'MID', 205.2, true, 4500],
  ];
  for (const [id, name, position, power, listed, ask] of pros) await S(`footballers/${id}`, { uid: id, name, position, power, teamId: null, listed, ...(ask ? { askSalary: ask } : {}) });
  const me = { uid: PREVIEW_UID, name: 'Önizleme Admin', position: 'FWD', power: 214.6, teamId: null };
  if (v === 'free') {
    await S(`footballers/${PREVIEW_UID}`, me);
    await S(`futbolOffers/t1_${PREVIEW_UID}`, { teamId: 't1', teamName: 'Neon FK', uid: PREVIEW_UID, salary: 6000, status: 'pending', createdAtMs: T0, expiresAtMs: T0 + 20 * 3600e3 });
    await S(`futbolOffers/t2_${PREVIEW_UID}`, { teamId: 't2', teamName: 'Gece SK', uid: PREVIEW_UID, salary: 4000, status: 'pending', createdAtMs: T0, expiresAtMs: T0 + 50 * 60e3 });
  }
  if (v === 'contract' || v === 'match') {
    await S(`footballers/${PREVIEW_UID}`, {
      ...me,
      teamId: 't1',
      teamName: 'Neon FK',
      playerDocId: `real_${PREVIEW_UID}`,
      lastDay:
        v === 'match'
          ? { dayKey: '2026-10-06', kind: 'match', teamName: 'Neon FK', oppName: 'Gece SK', gf: 3, ga: 1, goals: 2, assists: 1, rating: 9.1, motm: true, powerFrom: 214.6, powerTo: 216.1, form: 72 }
          : { dayKey: '2026-10-06', kind: 'training', teamName: 'Neon FK', powerFrom: 212.3, powerTo: 214.6, gain: 2.3, bonus: true, form: 100 },
    });
    await S(`futbolPlayers/real_${PREVIEW_UID}`, { real: true, realUid: PREVIEW_UID, teamId: 't1', name: 'Önizleme Admin', position: 'FWD', age: 24, power: 216.1, form: 72, value: 0, salary: 6000, salaryDebt: 1500, contractSince: T0 - 5 * 864e5, raiseRequest: null });
  }
  if (v === 'team') {
    await S('futbolPlayers/real_x1', { real: true, realUid: 'x1', teamId: 't1', name: 'Ozan Demir', position: 'DEF', age: 24, power: 228, form: 90, value: 0, salary: 7000, salaryDebt: 2000, contractSince: T0, raiseRequest: { salary: 9000, atMs: T0 } });
    await S('futbolOffers/t1_p2', { teamId: 't1', teamName: 'Neon FK', uid: 'p2', salary: 5000, status: 'pending', createdAtMs: T0, expiresAtMs: T0 + 10 * 3600e3 });
  }
  const st = [
    ['real_' + PREVIEW_UID, 'Önizleme Admin', 'FWD', 'Neon FK', 9, 3, 4, 8, 61.6, true],
    ['b1', 'Bora Şahin', 'FWD', 'Gece SK', 11, 2, 2, 8, 56, false],
    ['b2', 'Cem Uçar', 'MID', 'Neon FK', 4, 7, 1, 8, 55.2, false],
    ['b3', 'Ege Tan', 'GK', 'Liman SK', 0, 0, 3, 8, 57.6, false],
    ['b4', 'Arda Kılıç', 'DEF', 'Gece SK', 1, 2, 0, 7, 46.2, false],
  ];
  for (const [id, name, position, teamName, goals, assists, motm, apps, ratingSum, real] of st)
    await S(`futbolPlayerStats/3_${id}`, { season: 3, playerId: id, name, position, teamName, teamLogo: null, goals, assists, motm, apps, ratingSum, ratingAvg: Math.round((ratingSum / apps) * 10) / 10, cleanSheets: position === 'GK' ? 4 : position === 'DEF' ? 3 : 0, real });
  window.__ready = true;
}
// canlı saha önizlemesi: canlıda maç 20 dk önce başladı (≈30'), 31'de gol var
const LIVE_START = Date.now() - (v === 'live' ? Number(new URLSearchParams(location.search).get('min') || 30) * 40000 : 0);
const DEMO_MATCH = {
  status: v === 'live' ? 'live' : 'finished',
  homeTeamId: 't1',
  awayTeamId: 't2',
  homeScore: 2,
  awayScore: 1,
  matchStartAt: LIVE_START,
  revealAt: LIVE_START + 3600000,
  possessionCheckpoints: Array.from({ length: 10 }, (_, i) => ({ minute: i * 10, home: 55 + ((i * 7) % 9) - 4, away: 45 - ((i * 7) % 9) + 4 })),
  timeline: [
    { minute: 8, team: 'away', type: 'shot_off', label: 'Şut auta / bloke oldu' },
    { minute: 17, team: 'home', type: 'shot_on', label: 'Şut kaleciden döndü' },
    { minute: 31, team: 'home', type: 'goal', label: 'Forvet - Kaleci karşı karşıya', scorerName: 'Önizleme Admin', assistName: 'Cem Uçar' },
    { minute: 44, team: 'away', type: 'goal', label: 'Serbest atak', scorerName: 'Bora Şahin' },
    { minute: 52, team: 'home', type: 'shot_off', label: 'Şut auta / bloke oldu' },
    { minute: 63, team: 'away', type: 'shot_on', label: 'Şut kaleciden döndü' },
    { minute: 78, team: 'home', type: 'goal', label: "Orta saha - Defans'ı geçti", scorerName: 'Cem Uçar' },
    { minute: 86, team: 'away', type: 'shot_off', label: 'Şut auta / bloke oldu' },
  ],
};
window.__fakeDb = fakeDb;
window.__futbolPro = futbolPro;
window.__PREVIEW_UID = PREVIEW_UID;
seed().then(() =>
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <div className="futbol-fullscreen" style={{ position: 'relative', minHeight: '100vh' }}>
        <div className="futbol-fullscreen-body" style={{ padding: 12 }}>
          {v === 'pitch' || v === 'live' ? (
            <FutbolMatchDetail match={DEMO_MATCH} homeName="Neon FK" awayName="Gece SK" homeSponsorName="Demir Fabrika" onClose={() => {}} />
          ) : v === 'team' ? (
            <>
              <ProContracts team={{ id: 't1', name: 'Neon FK', managerUid: null, playerDebts: { eski: 3000 } }} readOnly={false} />
              <ProPlayersList team={{ id: 't1', name: 'Neon FK', managerUid: null }} readOnly={false} />
            </>
          ) : v === 'board' ? (
            <FutbolOyuncular season={3} />
          ) : (
            <FutbolFutbolcu />
          )}
        </div>
      </div>
    </AuthProvider>
  )
);
