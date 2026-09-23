// Çete & İstihbarat Firestore rules testleri.
// Çalıştırma (proje kökünden):  cd tests/firestore-rules && npm i && npm test
// (firebase-tools kurulu olmalı; emülatör jar'ı ilk çalıştırmada indirilir)
import test, { before, after, beforeEach } from 'node:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, collection, query, where, orderBy, limit } from 'firebase/firestore';

const here = path.dirname(fileURLToPath(import.meta.url));
const W = 'live_test';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neon-rules',
    firestore: { rules: fs.readFileSync(path.join(here, '../../firestore.rules'), 'utf8') },
  });
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const s = (p, d) => setDoc(doc(db, p), d);
    await s('gangSystem/config', { liveOpen: true, liveWorldId: W });
    await s(`gangWorlds/${W}`, { launchDateKey: '2026-09-21' });
    await s(`gangWorlds/${W}/memberships/baba`, { gangId: 'g1', gangRank: 'baba', gangJoinedAtMs: 100, intelRosterId: null });
    await s(`gangWorlds/${W}/memberships/comez`, { gangId: 'g1', gangRank: 'comez', gangJoinedAtMs: 500, intelRosterId: null });
    await s(`gangWorlds/${W}/memberships/tetik`, { gangId: 'g1', gangRank: 'tetikci', gangJoinedAtMs: 100, intelRosterId: null });
    await s(`gangWorlds/${W}/memberships/rival`, { gangId: 'g2', gangRank: 'baba', gangJoinedAtMs: 100, intelRosterId: null });
    await s(`gangWorlds/${W}/memberships/spy`, { gangId: null, gangRank: null, intelRosterId: 'r1', intelRank: 'muhbir', intelJoinedAtMs: 100 });
    await s(`gangWorlds/${W}/gangs/g1`, { name: 'A', status: 'active' });
    await s(`gangWorlds/${W}/gangs/g1/members/baba`, { name: 'Baba', rank: 'baba', prestige: 1 });
    await s(`gangWorlds/${W}/gangs/g1/private/state`, { kasa: 100 });
    await s(`gangWorlds/${W}/gangs/g1/private/depot`, { items: {} });
    await s(`gangWorlds/${W}/gangs/g1/chat_genel/old`, { text: 'eski', createdAtMs: 200 });
    await s(`gangWorlds/${W}/gangs/g1/chat_genel/new`, { text: 'yeni', createdAtMs: 900 });
    await s(`gangWorlds/${W}/gangs/g1/chat_yonetim/m1`, { text: 'gizli', createdAtMs: 900 });
    await s(`gangWorlds/${W}/gangs/g1/votes/v1`, { status: 'active', yes: 1 });
    await s(`gangWorlds/${W}/gangs/g1/votes/v1/ballots/baba`, { choice: 'yes' });
    await s(`gangWorlds/${W}/gangs/g1/pending/p1`, { initiatorId: 'baba', status: 'pending' });
    await s(`gangWorlds/${W}/trucks/t1`, { gangId: 'g1', status: 'in_transit', code: '1234' });
    await s(`gangWorlds/${W}/trucks/t1/cargo/main`, { items: { tamirMalzemesi: 10 } });
    await s(`gangWorlds/${W}/trucks/t2`, { gangId: 'g1', status: 'idle', code: '5678' });
    await s(`gangWorlds/${W}/intelRoster/r1`, { codeName: 'X', rank: 'muhbir' });
    await s(`gangWorlds/${W}/memberships/chief`, { gangId: null, gangRank: null, intelRosterId: 'r2', intelRank: 'sef', intelJoinedAtMs: 100 });
    await s(`gangWorlds/${W}/intel/main`, { name: 'İstihbarat', baskanCode: 'Y' });
    await s(`gangWorlds/${W}/intel/main/private/state`, { kasa: 5 });
    await s(`gangWorlds/${W}/intel/main/pending/ip1`, { initiatorRosterId: 'r2', status: 'pending' });
    await s(`gangWorlds/${W}/intel/main/votes/iv1`, { status: 'active' });
    await s(`gangWorlds/${W}/intel/main/votes/iv1/ballots/r2`, { choice: 'yes' });
    await s(`gangWorlds/${W}/orders/o1`, { gangId: 'g1', status: 'pending', items: { yasakliMadde: 5 } });
    await s(`gangWorlds/${W}/globalChat/gm1`, { text: 'selam', createdAtMs: 900 });
    await s(`gangWorlds/${W}/sabotageDays/2026-09-22`, { count: 2 });
    await s(`gangWorlds/${W}/intelReports/rep1`, { truckId: 't1' });
    await s(`gangWorlds/${W}/wars/pub`, { visibility: 'public', status: 'active', gangIds: [], activeGangIds: [] });
    await s(`gangWorlds/${W}/wars/priv`, { visibility: 'private', status: 'active', gangIds: ['g1'], activeGangIds: ['g1'], intelInvolved: false });
    await s(`gangWorlds/${W}/distributions/d1`, { orgType: 'gang', orgId: 'g1', status: 'open' });
    await s(`gangWorlds/${W}/ledger/l1`, { amount: 1 });
    await s('gangWorlds/test/players/p1', { gold: 1 });
    await s('gangAdmins/admin1', { expiresAtMs: Date.now() + 3600_000 });
    await s('gangAdmins/admin2', { expiresAtMs: 1 });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const P = (p) => `gangWorlds/${W}/${p}`;

test('istemci hiçbir çete belgesine yazamaz', async () => {
  await assertFails(setDoc(doc(as('baba'), P('gangs/g1/private/state')), { kasa: 999999 }));
  await assertFails(setDoc(doc(as('baba'), P('memberships/baba')), { gangRank: 'baba' }));
  await assertFails(setDoc(doc(as('baba'), P('gangs/g1/chat_genel/x')), { text: 'hi', createdAtMs: 1000 }));
});

test('üyelik belgesi sadece sahibine', async () => {
  await assertSucceeds(getDoc(doc(as('baba'), P('memberships/baba'))));
  await assertFails(getDoc(doc(as('comez'), P('memberships/baba'))));
});

test('kasa herkese açık (Çeteler listesi), depo çete üyelerine, üye listesi üyelere', async () => {
  await assertSucceeds(getDoc(doc(as('comez'), P('gangs/g1/private/state'))));
  await assertSucceeds(getDoc(doc(as('rival'), P('gangs/g1/private/state'))));
  await assertSucceeds(getDoc(doc(as('spy'), P('intel/main/private/state'))));
  await assertSucceeds(getDoc(doc(as('comez'), P('gangs/g1/private/depot'))));
  await assertFails(getDoc(doc(as('rival'), P('gangs/g1/private/depot'))));
  await assertFails(getDocs(collection(as('rival'), P('gangs/g1/members'))));
});

test('siparişler Kıdemli+; tüm çetelerin rütbeli sohbeti çete üyelerine (katılmadan öncesi hariç); İstihbarat-only göremez', async () => {
  await assertSucceeds(getDoc(doc(as('baba'), P('orders/o1'))));
  await assertFails(getDoc(doc(as('tetik'), P('orders/o1'))));
  await assertFails(getDoc(doc(as('rival'), P('orders/o1'))));
  const q = (db, since) => query(collection(db, P('globalChat')), where('createdAtMs', '>=', since));
  await assertSucceeds(getDocs(q(as('rival'), 100)));
  await assertSucceeds(getDocs(q(as('comez'), 500)));
  await assertFails(getDocs(q(as('comez'), 0)));
  await assertFails(getDocs(q(as('spy'), 100)));
  await assertSucceeds(getDoc(doc(as('comez'), P('sabotageDays/2026-09-22'))));
});

test('sohbet: katılmadan önceki mesaj görünmez; yönetim kanalı rütbelilere', async () => {
  const q = (db, since) => query(collection(db, P('gangs/g1/chat_genel')), where('createdAtMs', '>=', since), orderBy('createdAtMs', 'desc'), limit(50));
  await assertSucceeds(getDocs(q(as('comez'), 500)));
  await assertFails(getDocs(q(as('comez'), 0)));
  await assertFails(getDocs(query(collection(as('tetik'), P('gangs/g1/chat_yonetim')), where('createdAtMs', '>=', 100))));
  await assertSucceeds(getDocs(query(collection(as('baba'), P('gangs/g1/chat_yonetim')), where('createdAtMs', '>=', 100))));
});

test('oylamalar Tetikçi+; oy pusulası sadece sahibine; gizli talepler sadece başlatana', async () => {
  await assertFails(getDoc(doc(as('comez'), P('gangs/g1/votes/v1'))));
  await assertSucceeds(getDoc(doc(as('tetik'), P('gangs/g1/votes/v1'))));
  await assertFails(getDoc(doc(as('tetik'), P('gangs/g1/votes/v1/ballots/baba'))));
  await assertSucceeds(getDoc(doc(as('baba'), P('gangs/g1/votes/v1/ballots/baba'))));
  await assertFails(getDoc(doc(as('tetik'), P('gangs/g1/pending/p1'))));
  await assertSucceeds(getDocs(query(collection(as('baba'), P('gangs/g1/pending')), where('initiatorId', '==', 'baba'))));
});

test('tırlar: tüm çetelerin üyeleri görür (içerik yok); içerik sahibin Kıdemli+; İstihbarat-only göremez', async () => {
  await assertSucceeds(getDoc(doc(as('comez'), P('trucks/t2'))));
  await assertSucceeds(getDoc(doc(as('rival'), P('trucks/t1'))));
  await assertFails(getDoc(doc(as('spy'), P('trucks/t1'))));
  await assertFails(getDoc(doc(as('tetik'), P('trucks/t1/cargo/main'))));
  await assertSucceeds(getDoc(doc(as('baba'), P('trucks/t1/cargo/main'))));
  await assertFails(getDoc(doc(as('rival'), P('trucks/t1/cargo/main'))));
});

test('İstihbarat verisi sadece İstihbarat üyelerine; atma talebi başlatana; oylama Muhbire kapalı', async () => {
  await assertSucceeds(getDoc(doc(as('spy'), P('intelRoster/r1'))));
  await assertFails(getDoc(doc(as('baba'), P('intelRoster/r1'))));
  await assertFails(getDoc(doc(as('baba'), P('intelReports/rep1'))));
  await assertSucceeds(getDoc(doc(as('chief'), P('intel/main/pending/ip1'))));
  await assertFails(getDoc(doc(as('spy'), P('intel/main/pending/ip1'))));
  await assertSucceeds(getDoc(doc(as('chief'), P('intel/main/votes/iv1'))));
  await assertFails(getDoc(doc(as('spy'), P('intel/main/votes/iv1'))));
  await assertSucceeds(getDoc(doc(as('chief'), P('intel/main/votes/iv1/ballots/r2'))));
  await assertFails(getDoc(doc(as('spy'), P('intel/main/votes/iv1/ballots/r2'))));
});

test('savaşlar: herkese açık olanlar herkese, özel olanlar taraflara', async () => {
  await assertSucceeds(getDoc(doc(as('rival'), P('wars/pub'))));
  await assertFails(getDoc(doc(as('rival'), P('wars/priv'))));
  await assertSucceeds(getDoc(doc(as('comez'), P('wars/priv'))));
  await assertSucceeds(getDocs(query(collection(as('comez'), P('wars')), where('activeGangIds', 'array-contains', 'g1'))));
});

test('dağıtım sadece o çetenin üyelerine; ledger kimseye', async () => {
  await assertSucceeds(getDocs(query(collection(as('comez'), P('distributions')), where('orgType', '==', 'gang'), where('orgId', '==', 'g1'), where('status', '==', 'open'))));
  await assertFails(getDoc(doc(as('rival'), P('distributions/d1'))));
  await assertFails(getDoc(doc(as('baba'), P('ledger/l1'))));
});

test('test dünyası sadece aktif admin oturumuna açık', async () => {
  await assertFails(getDoc(doc(as('baba'), 'gangWorlds/test/players/p1')));
  await assertFails(getDoc(doc(as('admin2'), 'gangWorlds/test/players/p1')));
  await assertSucceeds(getDoc(doc(as('admin1'), 'gangWorlds/test/players/p1')));
  await assertFails(setDoc(doc(as('admin1'), 'gangWorlds/test/players/p1'), { gold: 1e9 }));
});
