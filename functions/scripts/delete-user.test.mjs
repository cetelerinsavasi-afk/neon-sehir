// delete-user.mjs için çevrimdışı test (Firebase gerektirmez).
// Çalıştır: node --test functions/scripts/delete-user.test.mjs
//
// Çete testlerinin sahte Firestore'u (gang/test/fakeFirestore.js) kullanılır;
// Admin SDK'da olup sahte sürümde olmayan birkaç sorgu (documentId aralığı,
// listCollections, collectionGroup, CollectionReference.parent) BU DOSYADA
// eklenir — proje dosyalarına dokunulmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { buildDeletionPlan, enforceReadOnly, formatPlan, findUidRefs, findNameFields, anonymizeData, applyPlan, collectOps, planFingerprint, TOMBSTONE_NAME, TOMBSTONE_STAFF, REDACTED_TEXT } from './delete-user.mjs';

// ---- Sahte Firestore'a eksik Admin SDK yüzeyleri --------------------------------
const DOC_ID = { __documentId: true };
const FieldPath = { documentId: () => DOC_ID };

function shim(db) {
  const colProto = Object.getPrototypeOf(db.collection('x'));
  const queryProto = Object.getPrototypeOf(colProto);
  const docProto = Object.getPrototypeOf(db.doc('x/y'));
  if (!queryProto.__shimmed) {
    const origRun = queryProto._run;
    queryProto._run = function () {
      const idFilters = this._filters.filter((f) => f.field === DOC_ID);
      if (!idFilters.length) return origRun.call(this);
      const saved = this._filters;
      this._filters = saved.filter((f) => f.field !== DOC_ID);
      const rows = origRun.call(this);
      this._filters = saved;
      return rows.filter(({ path }) => {
        const id = path.split('/').pop();
        return idFilters.every(({ op, value }) => (op === '>=' ? id >= value : op === '<' ? id < value : op === '==' ? id === value : true));
      });
    };
    queryProto.__shimmed = true;
    Object.defineProperty(colProto, 'parent', {
      get() {
        const segs = this.path.split('/');
        return segs.length > 1 ? this._db.doc(segs.slice(0, -1).join('/')) : null;
      },
    });
    docProto.listCollections = async function () {
      const prefix = this.path + '/';
      const names = new Set();
      for (const p of this._db._store.keys()) if (p.startsWith(prefix)) names.add(p.slice(prefix.length).split('/')[0]);
      return [...names].map((n) => this.collection(n));
    };
  }
  db.collectionGroup = (name) => {
    const mk = (filters) => ({
      where: (f, op, v) => mk([...filters, { f, op, v }]),
      get: async () => {
        const docs = [];
        for (const [p, e] of db._store) {
          const segs = p.split('/');
          if (segs.length < 2 || segs[segs.length - 2] !== name) continue;
          if (filters.every(({ f, op, v }) => op === '==' && e.data?.[f] === v)) docs.push({ id: segs.at(-1), ref: db.doc(p), exists: true, data: () => e.data });
        }
        return { docs, size: docs.length, empty: !docs.length };
      },
    });
    return mk([]);
  };
  return db;
}

function fakeAuth(users) {
  const calls = [];
  return {
    calls,
    async getUser(uid) {
      const u = users.find((x) => x.uid === uid);
      if (!u) throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
      return u;
    },
    async getUserByEmail(email) {
      const u = users.find((x) => x.email === email);
      if (!u) throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
      return u;
    },
    async deleteUser(uid) {
      calls.push(`deleteUser:${uid}`);
      const i = users.findIndex((x) => x.uid === uid);
      if (i < 0) throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
      users.splice(i, 1);
    },
    async updateUser(uid, p) {
      calls.push(`updateUser:${uid}:${JSON.stringify(p)}`);
      const u = users.find((x) => x.uid === uid);
      if (u && p.disabled) u.disabled = true;
    },
    async revokeRefreshTokens(uid) {
      calls.push(`revoke:${uid}`);
    },
  };
}

// ---- Gerçekçi veri seti ------------------------------------------------------------
const T = 'uTarget';
const NAME = 'Ahmet Yılmaz';
const O1 = 'uOther1';
const O2 = 'uOther2';
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

async function seed({ pendingBet = false, sharesSold = false, emailOverride, imam = false } = {}) {
  const db = shim(new FakeFirestore({ yieldEvery: false }));
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  // kullanıcı
  S(`users/${T}`, { displayName: NAME, gold: 12000, bankBalance: 500, debtToState: 300, profession: 'polis', redemptionCode: 'ABC123', createdAt: ts(1) });
  S(`users/${T}/messages/m1`, { text: 'hoş geldin' });
  S(`users/${T}/inventory/tamirMalzemesi`, { quantity: 5 });
  S(`users/${T}/private/meta`, { isPolice: true });
  S(`users/${O1}`, { displayName: 'Diğer1', referredBy: T });
  S(`users/${O2}`, { displayName: 'Diğer2', employment: { factoryId: T, machineId: 'm1' } });
  S(`redemptionCodes/ABC123`, { uid: T });
  S(`usernames/ahmet yılmaz`, { uid: T });
  S(`dailyActions/${T}_2026-09-25`, { heist: {} });
  S(`dailyActions/${T}_2026-09-26`, { heist: {} });
  S(`dailyActions/${O1}_2026-09-26`, { heist: {} }); // başkasınınki — dokunulmamalı
  S(`feedbackLimits/${T}_2026-09-26`, { count: 1, uid: T });
  S(`trainingProgress/${T}`, { x: 1 });
  S(`flappyScores/${T}`, { best: 12 });
  S(`parkPresence/${T}`, { x: 1, chatText: 'selam' });
  S(`sixtagramProfiles/${T}`, { displayName: 'Ahmet Eski Ad', avatar: null });
  S(`sixtagramUserLikes/${T}`, { postIds: { pOther: true } });
  S(`vehicles/v1`, { ownerId: T });
  S(`weapons/w1`, { ownerId: T });
  S(`weapons/w2`, { ownerId: O1 });
  S(`investmentTrades/it1`, { uid: T, goldAmount: 100 });
  S(`globalChat/c1`, { uid: T, displayName: NAME, text: 'selam' });
  S(`globalChat/c2`, { uid: O1, displayName: 'Diğer1', text: 'merhaba' });
  S(`feedback/f1`, { uid: T, displayName: NAME, text: 'öneri' });
  // sixtagram
  S(`sixtagramPosts/pMine`, { uid: T, authorName: NAME });
  S(`sixtagramPosts/pMine/comments/k1`, { uid: O1 });
  S(`sixtagramPosts/pOther`, { uid: O1, authorName: 'Diğer1', likeCount: 1, commentCount: 1 });
  S(`sixtagramPosts/pOther/comments/k2`, { uid: T, authorName: NAME });
  S(`sixtagramPosts/pOther/likes/${T}`, { at: 1 });
  // tarihli
  S(`beggars/2026-09-25`, { x: 1 });
  S(`beggars/2026-09-25/entries/${T}`, { uid: T, displayName: NAME });
  S(`mosqueAttendance/2026-09-25_w1`, { x: 1 });
  S(`mosqueAttendance/2026-09-25_w1/members/${T}`, { uid: T, displayName: NAME });
  // bahis / piyango
  S(`futbolBets/b1`, { uid: T, status: 'won' });
  if (pendingBet) S(`futbolBets/b2`, { uid: T, status: 'pending' });
  S(`lottery/2026-09-25`, { drawnAt: ts(5), winnerUid: T, winnerName: NAME });
  S(`lottery/2026-09-25/tickets/${T}`, { displayName: NAME });
  S(`lottery/2026-09-26`, { drawnAt: null });
  // oyunlar
  S(`onNumaraTables/t1`, { status: 'closed', seatOrder: [T, O1], seats: { [T]: { displayName: NAME }, [O1]: { displayName: 'Diğer1' } } });
  S(`raceRooms/r1`, { status: 'finished', participantUids: [T, O1], players: { [T]: { displayName: NAME } } });
  S(`championshipDaily/c_2026-09-25`, { leaderUid: T, leaderName: NAME });
  S(`heistPlans/h1`, { status: 'open', creatorUid: O1 });
  S(`heistPlans/h1/participants/${T}`, { uid: T, displayName: NAME });
  S(`limanOrders/${T}`, { pending: { tamirMalzemesi: 10 } });
  S(`marketplaceListings/l1`, { sellerId: T, sellerName: NAME, sold: false });
  S(`marketplaceListings/l2`, { sellerId: T, sellerName: NAME, sold: true });
  // fabrika (sahibi)
  S(`factories/${T}`, { name: 'Yılmaz Tekstil', ownerName: NAME });
  S(`factories/${T}/machines/m1`, { workerId: O2, workerName: 'Diğer2' });
  S(`factories/${T}/machines/m2`, { workerId: null });
  S(`factories/${T}/shares/s1`, { status: sharesSold ? 'active' : 'listed', buyerId: sharesSold ? O1 : null, buyerName: sharesSold ? 'Diğer1' : null, price: 4000, sellerId: T, sellerName: NAME });
  // başka fabrikada işçi + hisse
  S(`factories/${O1}`, { name: 'Diğer Fabrika' });
  S(`factories/${O1}/machines/mx`, { workerId: T, workerName: NAME });
  S(`factories/${O1}/shares/sx`, { status: 'active', buyerId: T, buyerName: NAME });
  S(`sponsorshipOffers/so1`, { factoryOwnerUid: T, status: 'pending' });
  // futbol
  S(`futbolTeams/team1`, { name: 'Yılmazspor', ownerUid: T, managerUid: T });
  S(`futbolTeams/team2`, { name: 'Başka FK', ownerUid: O1, sponsorFactoryOwnerUid: T, sponsorFactoryName: 'Yılmaz Tekstil', sponsorDailyAmount: 500 });
  S(`futbolTeams/team4`, { name: 'Bekleyen FK', ownerUid: O2, pendingSponsor: { factoryOwnerUid: T, dailyAmount: 300 } });
  S(`futbolTeams/team5`, { name: 'Devir FK', ownerUid: O1, pendingHandoverUid: T, pendingHandoverLevel: 2 });
  S(`gangSystem/config`, { liveWorldId: 'w1' });
  S(`futbolTeams/team3/managerApplications/a1`, { applicantUid: T });
  // çete (Baba, bir üye daha)
  S(`gangWorlds/w1`, { x: 1 });
  S(`gangWorlds/w1/memberships/${T}`, { gangId: 'g1', gangRank: 'baba' });
  S(`gangWorlds/w1/gangs/g1`, { name: 'Kara Kartallar', babaId: T, babaName: NAME });
  S(`gangWorlds/w1/gangs/g1/members/${T}`, { name: NAME });
  S(`gangWorlds/w1/gangs/g1/members/${O1}`, { name: 'Diğer1' });
  S(`gangWorlds/w1/gangs/g1/chat_genel/x1`, { authorId: T, authorName: NAME, text: 'toplanın' });
  S(`gangWorlds/w1/gangs/g1/chat_genel/x2`, { authorId: O1, authorName: 'Diğer1', text: 'tamam' });
  S(`gangWorlds/w1/gangs/g1/log/lg1`, { text: `${NAME} çeteyi kurdu` });
  // yasal
  S(`shopierOrders/o1`, { uid: T, packageId: 'paket1', email: 'ahmet@gmail.com' });
  // haber
  S(`newsEvents/n1`, { text: `${NAME} yarışı kazandı`, createdAt: ts(10) });
  S(`newsEvents/n2`, { text: 'Hava güzel', createdAt: ts(11) });
  S(`imamState/current`, imam ? { uid: T, displayName: NAME } : { uid: O1, displayName: 'Diğer1' });

  const auth = fakeAuth([{ uid: T, email: emailOverride || 'ahmet@gmail.com', displayName: NAME, providerData: [{ providerId: 'google.com' }], metadata: {} }]);
  return { db, auth };
}

const snapshotStore = (db) => JSON.stringify([...db._store.entries()]);
const paths = (items) => items.flatMap((i) => i.paths || []);

test('deneme modu: rapor doğru ve veritabanında HİÇBİR şey değişmiyor', async () => {
  const { db, auth } = await seed();
  const before = snapshotStore(db);
  const unlock = enforceReadOnly(db, auth);
  const plan = await buildDeletionPlan({ db, auth, uid: T, email: 'ahmet@gmail.com', FieldPath });
  assert.equal(snapshotStore(db), before, 'store değişmemeli');

  assert.equal(plan.identity.emailMatches, true);
  const del = paths(plan.delete);
  for (const p of [
    `auth/${T}`, `users/${T}`, 'redemptionCodes/ABC123', 'usernames/ahmet yılmaz',
    `dailyActions/${T}_2026-09-25`, `dailyActions/${T}_2026-09-26`, `feedbackLimits/${T}_2026-09-26`,
    `trainingProgress/${T}`, `flappyScores/${T}`, `parkPresence/${T}`, `sixtagramProfiles/${T}`, `sixtagramUserLikes/${T}`,
    'vehicles/v1', 'weapons/w1', 'investmentTrades/it1', 'globalChat/c1', 'feedback/f1',
    'sixtagramPosts/pMine', 'sixtagramPosts/pOther/comments/k2', `sixtagramPosts/pOther/likes/${T}`,
    `beggars/2026-09-25/entries/${T}`, `mosqueAttendance/2026-09-25_w1/members/${T}`,
    'futbolBets/b1', `lottery/2026-09-25/tickets/${T}`, `limanOrders/${T}`,
    `factories/${O1}/shares/sx`, 'sponsorshipOffers/so1', 'futbolTeams/team3/managerApplications/a1',
    'gangWorlds/w1/gangs/g1/chat_genel/x1',
  ]) assert.ok(del.includes(p), `silinecekler içinde olmalı: ${p}`);
  // başkalarının verisi silinecekler listesinde OLMAMALI
  for (const p of [`dailyActions/${O1}_2026-09-26`, 'globalChat/c2', 'weapons/w2', 'sixtagramPosts/pOther', 'gangWorlds/w1/gangs/g1/chat_genel/x2', `users/${O1}`])
    assert.ok(!del.includes(p), `başkasının verisi silinmemeli: ${p}`);

  const anon = paths(plan.anonymize);
  for (const p of ['lottery/2026-09-25', 'onNumaraTables/t1', 'raceRooms/r1', 'championshipDaily/c_2026-09-25', 'marketplaceListings/l2', 'gangWorlds/w1/gangs/g1/log/lg1', 'newsEvents/n1'])
    assert.ok(anon.includes(p), `anonimleştirilecek: ${p}`);
  assert.ok(!anon.includes('newsEvents/n2'));
  const race = plan.anonymize.find((a) => a.paths.includes('raceRooms/r1'));
  assert.deepEqual(race.detectedFields, [`players.${T}.displayName`]);

  const flowText = plan.flow.map((f) => f.what + ' ' + (f.detail || '')).join('\n');
  assert.match(flowText, /Fabrika sahibi: "Yılmaz Tekstil"/);
  assert.match(flowText, /1 başka oyuncu çalışıyor/);
  assert.match(flowText, /Futbol takımı sahibi: "Yılmazspor"/);
  assert.match(flowText, /bot/);
  assert.match(flowText, /MAFYA BABASI, çetede 1 üye daha var/);
  assert.match(flowText, /Başka fabrikada işçi/);
  assert.match(flowText, /Soygun planı — katılımcı/);
  assert.match(flowText, /2\. El — açık ilanlar/);
  assert.match(flowText, /Polis/);
  assert.match(flowText, /1 takıma sponsor, 1 bekleyen sponsorluk/);
  assert.match(flowText, /Bekleyen takım devri/);
  assert.ok(!flowText.includes('Futbol menajeri'), 'sahibi olduğu takımın menajerliği ayrıca listelenmemeli');

  assert.deepEqual(paths(plan.retain), ['shopierOrders/o1']);
  assert.equal(plan.blocker.length, 0, JSON.stringify(plan.blocker));
  const report = formatPlan(plan);
  assert.match(report, /DENEME MODU/);
  assert.match(report, /Engel yok/);
  unlock();
});

test('engeller: sonuç bekleyen bahis; satılmış hisse ENGEL DEĞİL, iade planlanır', async () => {
  const { db, auth } = await seed({ pendingBet: true, sharesSold: true });
  const unlock = enforceReadOnly(db, auth);
  const plan = await buildDeletionPlan({ db, auth, uid: T, FieldPath });
  const whats = plan.blocker.map((b) => b.what).join(' | ');
  assert.match(whats, /SONUÇ BEKLİYOR/);
  assert.doesNotMatch(whats, /hisse/);
  assert.ok(plan.info.some((i) => /Hisse iadesi — toplam 4\.000 altın/.test(i.what)));
  assert.ok(collectOps(plan).some((o) => o.type === 'refundShare' && o.path === `factories/${T}/shares/s1`));
  assert.ok(paths(plan.blocker).includes('futbolBets/b2'));
  assert.ok(!paths(plan.delete).includes('futbolBets/b2'), 'bekleyen bahis silinecekler listesinde olmamalı');
  unlock();
});

test('kimlik: talep e-postası eşleşmezse engel', async () => {
  const { db, auth } = await seed();
  const unlock = enforceReadOnly(db, auth);
  const plan = await buildDeletionPlan({ db, auth, uid: T, email: 'baskasi@gmail.com', FieldPath });
  assert.equal(plan.identity.emailMatches, false);
  assert.match(plan.blocker[0].what, /KİMLİK EŞLEŞMEDİ/);
  unlock();
});

test('kimlik: yalnızca e-postayla uid bulunur', async () => {
  const { db, auth } = await seed();
  const unlock = enforceReadOnly(db, auth);
  const plan = await buildDeletionPlan({ db, auth, email: 'ahmet@gmail.com', FieldPath });
  assert.equal(plan.uid, T);
  unlock();
});

test('olmayan hesap', async () => {
  const { db, auth } = await seed();
  const unlock = enforceReadOnly(db, auth);
  const plan = await buildDeletionPlan({ db, auth, uid: 'yok', FieldPath });
  assert.match(plan.blocker[0].what, /HESAP YOK/);
  unlock();
});

test('salt-okunur kilit: her yazma yolu engellenir', async () => {
  const { db, auth } = await seed();
  const unlock = enforceReadOnly(db, auth);
  const before = snapshotStore(db);
  const attempts = [
    () => db.doc(`users/${T}`).delete(),
    () => db.doc(`users/${T}`).set({ gold: 0 }),
    () => db.doc(`users/${T}`).update({ gold: 0 }),
    () => db.collection('globalChat').add({ text: 'x' }),
    () => db.batch(),
    () => db.runTransaction(async () => {}),
    () => db.recursiveDelete(db.doc(`users/${T}`)),
    () => auth.deleteUser(T),
    () => auth.updateUser(T, {}),
  ];
  for (const fn of attempts) assert.throws(fn, /SALT-OKUNUR MOD/);
  assert.equal(snapshotStore(db), before);
  unlock();
});

test('yardımcılar', () => {
  assert.deepEqual(findUidRefs({ a: 'x', seats: { x: { n: 1 } }, list: ['x'] }, 'x').sort(), ['a', 'list[]', 'seats.x (anahtar)'].sort());
  assert.deepEqual(findNameFields({ a: 'Ali', b: { c: 'Ali', d: 'Veli' } }, ['Ali']), ['a', 'b.c']);
  assert.equal(TOMBSTONE_NAME, 'Silinmiş Oyuncu');
});

// =============================================================================
// SİLME MODU (--apply) — sahte oyun fonksiyonlarıyla uçtan uca
// =============================================================================
// Oyun fonksiyonlarının (.run) test için sadeleştirilmiş taklitleri. Gerçek
// betik bunların yerine functions/index.js'teki GERÇEK fonksiyonları çağırır.
function fakeCallables(db, { failGang = false } = {}) {
  const calls = [];
  const sms = (uid, text) => db._store.set(`users/${uid}/messages/sms_${Math.random().toString(36).slice(2)}`, { data: { text, read: false }, version: 1 });
  return {
    calls,
    async sellFutbolTeam(req) {
      calls.push(['sellFutbolTeam', req.auth.uid, req.data]);
      const p = `futbolTeams/${req.data.teamId}`;
      const t = db._get(p);
      db._store.set(p, { data: { ...t, ownerUid: null, isBot: true, managerUid: undefined }, version: 9 });
      // Gerçek fonksiyon da satıcıya altın + SMS yazar → users/{uid} sonra silinmeli
      const u = db._get(`users/${req.auth.uid}`);
      if (u) db._store.set(`users/${req.auth.uid}`, { data: { ...u, gold: (u.gold || 0) + 999 }, version: 9 });
      sms(req.auth.uid, 'takımını sattın');
    },
    async resignFutbolManager(req) {
      calls.push(['resignFutbolManager', req.auth.uid, req.data]);
    },
    async leaveHeistPlan(req) {
      calls.push(['leaveHeistPlan', req.auth.uid, req.data]);
      db._store.delete(`heistPlans/${req.data.planId}/participants/${req.auth.uid}`);
      const h = db._get(`heistPlans/${req.data.planId}`);
      db._store.set(`heistPlans/${req.data.planId}`, { data: { ...h, removedUids: [...(h.removedUids || []), req.auth.uid] }, version: 9 });
    },
    async cancelHeistPlan(req) {
      calls.push(['cancelHeistPlan', req.auth.uid, req.data]);
    },
    async gangAction(req) {
      calls.push(['gangAction', req.auth.uid, req.data]);
      if (failGang) throw new Error('Çeteler şu an tadilatta (test hatası)');
      assert.equal(req.data.action, 'leaveGang');
      const uid = req.auth.uid;
      db._store.delete(`gangWorlds/w1/gangs/g1/members/${uid}`);
      db._store.set(`gangWorlds/w1/memberships/${uid}`, { data: { gangId: null, gangStint: 1 }, version: 9 });
      const g = db._get('gangWorlds/w1/gangs/g1');
      db._store.set('gangWorlds/w1/gangs/g1', { data: { ...g, babaId: null, babaName: null }, version: 9 });
      // Gerçek leaveGang de çete kaydına YENİ bir satır yazar (planda yok!)
      db._store.set('gangWorlds/w1/gangs/g1/log/lgNew', { data: { text: `${NAME} çeteden ayrıldı` }, version: 9 });
      sms(uid, 'çeteden ayrıldın');
    },
  };
}

async function planUnlocked(db, auth, email = 'ahmet@gmail.com') {
  const unlock = enforceReadOnly(db, auth);
  try {
    return await buildDeletionPlan({ db, auth, uid: T, email, FieldPath });
  } finally {
    unlock();
  }
}

// Silmeden sonra veritabanında bu oyuncuya ait İZ kalmamalı. İzin verilen
// istisnalar (kararlaştırılmış): yasal kayıt, kimliksiz uid referansları ve
// geçmiş kayıtlardaki map anahtarları.
const ALLOWED_UID_TRACES = new Set([
  'shopierOrders/o1',        // yasal saklama
  `users/${O1}`,             // referredBy (kimliksiz kod)
  'heistPlans/h1',           // removedUids (oyunun leaveHeistPlan davranışı)
  'onNumaraTables/t1',       // seats.{uid} anahtarı (ad anonimleştirildi)
  'raceRooms/r1',            // players.{uid} anahtarı + participantUids
  'championshipDaily/c_2026-09-25', // leaderUid (ad anonimleştirildi)
  'lottery/2026-09-25',      // winnerUid (ad anonimleştirildi)
  'marketplaceListings/l2',  // satılmış ilan sellerId (ad anonimleştirildi)
]);

function tracesOf(db, uid, names) {
  const hits = [];
  for (const [p, e] of db._store) {
    if (p.split('/').includes(uid)) {
      hits.push(`${p} (yol)`);
      continue;
    }
    const json = JSON.stringify(e.data);
    if (findUidRefs(e.data, uid).length && !ALLOWED_UID_TRACES.has(p)) hits.push(`${p} (uid)`);
    for (const n of names) if (json.includes(n)) hits.push(`${p} (ad: ${n})`);
  }
  return hits;
}

test('SİLME: uçtan uca — iz kalmıyor, diğer oyuncular korunuyor, iade ve SMS yapılıyor', async () => {
  const { db, auth } = await seed({ sharesSold: true, imam: true });
  const plan = await planUnlocked(db, auth);
  assert.equal(plan.blocker.length, 0, JSON.stringify(plan.blocker));
  const o1GoldBefore = db._get(`users/${O1}`).gold || 0;
  const callables = fakeCallables(db);
  const logs = [];
  const res = await applyPlan({ db, auth, FieldValue, callables, plan, log: (m) => logs.push(m) });
  assert.equal(res.ok, true, JSON.stringify(res.results.filter((r) => !r.ok)));

  // Sıra: önce dondurma, en son Auth silme
  assert.match(auth.calls[0], /^updateUser:uTarget:\{"disabled":true\}/);
  assert.equal(auth.calls.at(-1), `deleteUser:${T}`);
  // Oyun fonksiyonları oyuncunun kimliğiyle çağrıldı
  const called = callables.calls.map((c) => `${c[0]}:${c[1]}`);
  for (const c of ['sellFutbolTeam:uTarget', 'leaveHeistPlan:uTarget', 'gangAction:uTarget']) assert.ok(called.includes(c), c);

  // İZ YOK (ad ve uid)
  const names = [NAME, 'Ahmet Eski Ad'];
  assert.deepEqual(tracesOf(db, T, names), []);
  assert.equal(db._get(`users/${T}`), undefined);

  // Hisse iadesi + SMS
  assert.equal(db._get(`users/${O1}`).gold, o1GoldBefore + 4000);
  const o1Sms = [...db._store.keys()].filter((k) => k.startsWith(`users/${O1}/messages/`)).map((k) => db._get(k).text);
  assert.ok(o1Sms.some((t) => /4\.000 altın hesabına iade/.test(t)), JSON.stringify(o1Sms));
  assert.ok(o1Sms.some((t) => /sponsorluk sona erdi/.test(t)));
  // İşçi serbest + SMS
  assert.equal(db._get(`users/${O2}`).employment, undefined);
  const o2Sms = [...db._store.keys()].filter((k) => k.startsWith(`users/${O2}/messages/`)).map((k) => db._get(k).text);
  assert.ok(o2Sms.some((t) => /işinden serbest kaldın/.test(t)));
  assert.ok(o2Sms.some((t) => /bekleyen sponsorluk/.test(t)));
  // Sponsorluklar
  assert.equal(db._get('futbolTeams/team2').sponsorFactoryOwnerUid, null);
  assert.equal(db._get('futbolTeams/team2').sponsorDailyAmount, 0);
  assert.equal(db._get('futbolTeams/team4').pendingSponsor, null);
  assert.equal(db._get('futbolTeams/team5').pendingHandoverUid, undefined);
  // Takım bot oldu
  assert.equal(db._get('futbolTeams/team1').isBot, true);
  // Başka fabrikadaki makine boşaldı, fabrika kapandı
  assert.equal(db._get(`factories/${O1}/machines/mx`).workerId, null);
  assert.equal(db._get(`factories/${T}`), undefined);
  // Sayaçlar
  assert.equal(db._get('sixtagramPosts/pOther').likeCount, 0);
  assert.equal(db._get('sixtagramPosts/pOther').commentCount, 0);
  // Anonimleştirme
  assert.equal(db._get('lottery/2026-09-25').winnerName, TOMBSTONE_NAME);
  assert.equal(db._get('raceRooms/r1').players[T].displayName, TOMBSTONE_NAME);
  assert.equal(db._get('onNumaraTables/t1').seats[T].displayName, TOMBSTONE_NAME);
  assert.equal(db._get('onNumaraTables/t1').seats[O1].displayName, 'Diğer1');
  assert.match(db._get('newsEvents/n1').text, /Silinmiş Oyuncu yarışı kazandı/);
  assert.match(db._get('gangWorlds/w1/gangs/g1/log/lgNew').text, /Silinmiş Oyuncu çeteden ayrıldı/, 'uygulama sırasında oluşan çete kaydı da anonimleşmeli');
  // İmamlık boşaldı
  assert.equal(db._get('imamState/current'), undefined);
  // Diğer oyuncuların verisi yerinde
  for (const p of ['globalChat/c2', 'weapons/w2', `dailyActions/${O1}_2026-09-26`, `gangWorlds/w1/gangs/g1/members/${O1}`, 'gangWorlds/w1/gangs/g1/chat_genel/x2', 'sixtagramPosts/pOther', `factories/${O1}`, 'shopierOrders/o1'])
    assert.ok(db._get(p) !== undefined, `korunmalı: ${p}`);

  // Doğrulama: yeni plan "HESAP YOK"
  const after = await planUnlocked(db, auth);
  assert.match(after.blocker[0].what, /HESAP YOK/);
});

test('SİLME: yarıda kalırsa tekrar çalıştırınca devam eder, iade ÇİFT yapılmaz', async () => {
  const { db, auth } = await seed({ sharesSold: true });
  const o1GoldBefore = db._get(`users/${O1}`).gold || 0;
  // 1. deneme: çete adımında hata
  const plan1 = await planUnlocked(db, auth);
  const r1 = await applyPlan({ db, auth, FieldValue, callables: fakeCallables(db, { failGang: true }), plan: plan1 });
  assert.equal(r1.ok, false);
  assert.match(r1.failedAt, /gangAction/);
  assert.ok(db._get(`users/${T}`), 'hata çete adımında: users henüz silinmemiş olmalı');
  assert.equal(auth.calls.includes(`deleteUser:${T}`), false, 'Auth silinmemiş olmalı');
  assert.equal(db._get(`users/${O1}`).gold, o1GoldBefore + 4000, 'iade ilk denemede yapıldı');
  // 2. deneme: yeni plan, kaldığı yerden
  const plan2 = await planUnlocked(db, auth);
  assert.equal(plan2.blocker.length, 0);
  assert.ok(!collectOps(plan2).some((o) => o.type === 'refundShare'), 'iade edilmiş hisse yeni planda olmamalı');
  const r2 = await applyPlan({ db, auth, FieldValue, callables: fakeCallables(db), plan: plan2 });
  assert.equal(r2.ok, true);
  assert.equal(db._get(`users/${O1}`).gold, o1GoldBefore + 4000, 'iade ÇİFT yapılmamalı');
  assert.deepEqual(tracesOf(db, T, [NAME]), []);
});

test('SİLME: plan parmak izi değişirse fark edilir (onay sırasında veri değişimi)', async () => {
  const { db, auth } = await seed();
  const a = await planUnlocked(db, auth);
  const b = await planUnlocked(db, auth);
  assert.equal(planFingerprint(a), planFingerprint(b));
  db._store.set('globalChat/cNew', { data: { uid: T, text: 'son mesaj' }, version: 1 });
  const c = await planUnlocked(db, auth);
  assert.notEqual(planFingerprint(a), planFingerprint(c));
});

test('anonymizeData: tam ad alanı, metin içi ad, diğer oyuncular dokunulmaz', () => {
  const ch = anonymizeData({ a: 'Ahmet Yılmaz', b: { c: 'Ahmet Yılmaz kazandı', d: 'Diğer1' }, n: 5, arr: ['Ahmet Yılmaz', 'x'] }, ['Ahmet Yılmaz']);
  assert.deepEqual(ch, { a: TOMBSTONE_NAME, b: { c: 'Silinmiş Oyuncu kazandı', d: 'Diğer1' }, arr: [TOMBSTONE_NAME, 'x'] });
});

// ---------------------------------------------------------------------------
// UGC D5 — moderasyon kayıtları
// ---------------------------------------------------------------------------
test('SİLME (D5): ban/susturma/engelleme silinir, bildirimler temizlenir, denetim kayıtları kimliksizleşir ama korunur', async () => {
  const { db, auth } = await seed();
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  S(`bans/${T}`, { active: true, untilMs: Date.now() + 864e5, permanent: false, reason: 'x', byUid: O1, byName: 'Mod' });
  S(`mutes/${T}`, { untilMs: Date.now() + 864e5, level: 'ban', reason: 'x' });
  S(`userBlocks/${T}`, { blocked: { [O1]: { at: 1, name: 'Diğer1' } } });
  S(`userBlocks/${O1}`, { blocked: { [T]: { at: 5, name: NAME }, [O2]: { at: 6, name: 'Diğer2' } } });
  S(`userBlocks/${O2}`, { blocked: { [O1]: { at: 7, name: 'Diğer1' } } });
  S(`reports/hBy_${T}`, { reporterUid: T, targetUid: O1, textSnapshot: 'O1 metni', status: 'open', createdAtMs: 1 });
  S(`reports/hAbout_${O1}`, { reporterUid: O1, targetUid: T, textSnapshot: `${NAME} küfretti`, status: 'open', reason: 'hakaret', createdAtMs: 2 });
  S(`reports/hAbout2_${O2}`, { reporterUid: O2, targetUid: T, textSnapshot: 'eski metin', status: 'actioned', createdAtMs: 3 });
  S('admin_logs/l1', { action: 'report_remove', actorUid: O1, actorName: 'Mod Ayşe', targetUid: T, targetName: NAME, reason: 'küfür', details: { before: 'kötü söz', effect: 'hidden' }, atMs: 1 });
  S('admin_logs/l2', { action: 'mute', actorUid: T, actorName: NAME, actorRole: 'moderator', targetUid: O2, targetName: 'Diğer2', reason: 'spam', details: { duration: '1h' }, atMs: 2 });
  S('admin_logs/l3', { action: 'warn', actorUid: O1, actorName: 'Mod Ayşe', targetUid: O2, targetName: 'Diğer2', reason: 'x', details: {}, atMs: 3 });

  const plan = await planUnlocked(db, auth);
  const whats = [...plan.delete, ...plan.flow].map((i) => i.what);
  for (const w of ['Ban kaydı (bans) — AKTİF', 'Susturma kaydı (mutes)', 'Engelleme listesi (userBlocks)', 'Başka oyuncuların engelleme listelerindeki kaydı', 'Yaptığı bildirimler (reports)', 'Hakkındaki bildirimler (reports)', 'Yetkili işlem kayıtları (admin_logs — denetim izi korunur)'])
    assert.ok(whats.includes(w), w);
  // aktif ban ön temizlikte (dondurmadan hemen sonra) silinir
  const banOp = collectOps(plan).find((o) => o.path === `bans/${T}`);
  assert.equal(banOp.phase, 1);
  const res = await applyPlan({ db, auth, FieldValue, callables: fakeCallables(db), plan });
  assert.equal(res.ok, true, JSON.stringify(res.results.filter((r) => !r.ok)));

  for (const p of [`bans/${T}`, `mutes/${T}`, `userBlocks/${T}`, `reports/hBy_${T}`]) assert.equal(db._get(p), undefined, p);
  assert.deepEqual(Object.keys(db._get(`userBlocks/${O1}`).blocked), [O2], 'başkasının listesinden çıkarıldı, diğer satır kaldı');
  assert.deepEqual(db._get(`userBlocks/${O2}`).blocked, { [O1]: { at: 7, name: 'Diğer1' } }, 'ilgisiz liste aynı');
  const a1 = db._get(`reports/hAbout_${O1}`);
  assert.equal(a1.textSnapshot, REDACTED_TEXT);
  assert.equal(a1.status, 'closed_account_deleted', 'açık bildirim kapandı (kuyrukta görünmez)');
  assert.equal(a1.reporterUid, O1, 'bildirenin kaydı korunur');
  assert.equal(db._get(`reports/hAbout2_${O2}`).status, 'actioned', 'kapalı bildirimin durumu değişmez');
  const l1 = db._get('admin_logs/l1');
  assert.deepEqual([l1.targetName, l1.targetDeleted, l1.details.before, l1.details.effect, l1.reason, l1.actorName], [TOMBSTONE_NAME, true, REDACTED_TEXT, 'hidden', 'küfür', 'Mod Ayşe']);
  const l2 = db._get('admin_logs/l2');
  assert.deepEqual([l2.actorName, l2.actorDeleted, l2.targetName, l2.reason], [TOMBSTONE_STAFF, true, 'Diğer2', 'spam']);
  assert.deepEqual(db._get('admin_logs/l3'), { action: 'warn', actorUid: O1, actorName: 'Mod Ayşe', targetUid: O2, targetName: 'Diğer2', reason: 'x', details: {}, atMs: 3 }, 'ilgisiz kayıt aynı');
  // Ad hiçbir yerde kalmadı (denetim kayıtları dahil); uid yalnızca izin verilen denetim/bildirim kayıtlarında
  const hits = tracesOf(db, T, [NAME, 'Ahmet Eski Ad']).filter((h) => !/^(admin_logs\/l1|admin_logs\/l2|reports\/hAbout_|reports\/hAbout2_).* \(uid\)$/.test(h));
  assert.deepEqual(hits, []);
});

test('SİLME (v60): arkadaş listesi, istekler ve özel sohbetler silinir; başkalarının listesinden çıkarılır; iz kalmaz', async () => {
  const { db, auth } = await seed();
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const chat = [T, O1].sort().join('__');
  const other = [O1, O2].sort().join('__');
  S(`friendships/${T}`, { friends: { [O1]: { name: 'Diğer1', sinceMs: 1 } } });
  S(`friendships/${O1}`, { friends: { [T]: { name: NAME, avatar: { skin: '#fff' }, sinceMs: 1 }, [O2]: { name: 'Diğer2', sinceMs: 2 } } });
  S(`friendships/${O2}`, { friends: { [O1]: { name: 'Diğer1', sinceMs: 2 } } });
  S(`friendRequests/${T}_${O2}`, { fromUid: T, toUid: O2, fromName: NAME, toName: 'Diğer2', createdAtMs: 1, expiresAtMs: 9e15 });
  S(`friendRequests/${O2}_${T}`, { fromUid: O2, toUid: T, fromName: 'Diğer2', toName: NAME, createdAtMs: 1, expiresAtMs: 9e15 });
  S(`dmChats/${chat}`, { members: [T, O1].sort(), names: { [T]: NAME, [O1]: 'Diğer1' }, lastText: 'selam', lastSenderUid: T, lastAtMs: 5 });
  S(`dmChats/${chat}/dmMessages/m1`, { uid: T, text: 'selam', createdAtMs: 5 });
  S(`dmChats/${chat}/dmMessages/m2`, { uid: O1, text: 'naber', createdAtMs: 6 });
  S(`dmChats/${other}`, { members: [O1, O2].sort(), names: { [O1]: 'Diğer1', [O2]: 'Diğer2' }, lastText: 'x', lastAtMs: 7 });
  S(`dmChats/${other}/dmMessages/k1`, { uid: O2, text: 'x', createdAtMs: 7 });

  const plan = await planUnlocked(db, auth);
  const whats = [...plan.delete, ...plan.flow].map((i) => i.what);
  for (const w of ['Arkadaş listesi (friendships)', 'Başka oyuncuların arkadaş listelerindeki kaydı', 'Arkadaşlık istekleri (friendRequests)', 'Özel sohbetler ve mesajları (dmChats)']) assert.ok(whats.includes(w), w);
  const res = await applyPlan({ db, auth, FieldValue, callables: fakeCallables(db), plan });
  assert.equal(res.ok, true, JSON.stringify(res.results.filter((r) => !r.ok)));
  for (const p of [`friendships/${T}`, `friendRequests/${T}_${O2}`, `friendRequests/${O2}_${T}`, `dmChats/${chat}`, `dmChats/${chat}/dmMessages/m1`, `dmChats/${chat}/dmMessages/m2`]) assert.equal(db._get(p), undefined, p);
  assert.deepEqual(Object.keys(db._get(`friendships/${O1}`).friends), [O2], 'başkasının listesinden çıkarıldı, diğer arkadaş kaldı');
  assert.ok(db._get(`dmChats/${other}`) && db._get(`dmChats/${other}/dmMessages/k1`), 'ilgisiz sohbet aynı');
  assert.deepEqual(tracesOf(db, T, [NAME, 'Ahmet Eski Ad']), []);
});

// ---- v62: Yönetim Paneli üzerinden silme (functions/deletionRequests.js) -----------------
import { createDeletionRequests } from '../deletionRequests.js';
import { createAdminPanel } from '../adminPanel.js';

class TestHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
async function panelSetup(opts = {}) {
  const { db, auth } = await seed(opts);
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  S('users/boss', { displayName: 'Boss', createdAt: ts(1) });
  S('users/mod1', { displayName: 'Mod', role: 'moderator', createdAt: ts(1) });
  const base = { db, auth, FieldValue, HttpsError: TestHttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn };
  const panel = createAdminPanel({ ...base, bootstrapAdminUids: ['boss'], reportTargets: {}, banUntilMs: 0 });
  const dr = createDeletionRequests({ ...base, FieldPath, getActor: panel.getActor, logAction: panel.logAction, callables: fakeCallables(db), bootstrapAdminUids: ['boss'] });
  const admin = (uid, action, payload) => dr.adminAccountDeletion({ auth: { uid }, data: { action, payload } });
  const player = (uid, email) => dr.requestAccountDeletion({ auth: { uid, token: { email } }, data: {} });
  return { db, auth, S, admin, player };
}

test('PANEL (v62): oyuncu talep açar → yönetici önizler → siler; talep kaydı kalmaz, işlem denetim kaydında', async () => {
  const { db, admin, player } = await panelSetup();
  const r = await player(T, 'ahmet@gmail.com');
  assert.equal(r.ok, true);
  assert.equal((await player(T, 'ahmet@gmail.com')).already, true, 'ikinci talep açılmaz');
  const req = db._get(`deletionRequests/${T}`);
  assert.deepEqual([req.status, req.source, req.email, req.name], ['pending', 'app', 'ahmet@gmail.com', NAME]);
  await assert.rejects(admin('mod1', 'list'), /yalnızca yöneticilere/);
  const { requests } = await admin('boss', 'list');
  assert.deepEqual(requests.map((x) => x.uid), [T]);
  const { plan } = await admin('boss', 'preview', { uid: T });
  assert.equal(plan.blocker.length, 0);
  assert.equal(plan.identity.emailMatches, true);
  assert.ok(plan.delete.some((d) => /users/.test(d.what) || d.count > 0));
  await assert.rejects(admin('boss', 'apply', { uid: T, fingerprint: 'yanlış' }), /verisi değişti/);
  assert.equal(db._get(`deletionRequests/${T}`).status, 'pending', 'reddedilince talep bekler');
  const res = await admin('boss', 'apply', { uid: T, fingerprint: plan.fingerprint });
  assert.equal(res.ok, true);
  assert.equal(db._get(`users/${T}`), undefined, 'hesap silindi');
  assert.equal(db._get(`deletionRequests/${T}`), undefined, 'talep kaydı kalmadı');
  const logs = [...db._store.keys()].filter((k) => k.startsWith('admin_logs/')).map((k) => db._get(k));
  const del = logs.find((l) => l.action === 'account_delete');
  assert.ok(del && del.targetUid === T && del.targetName === 'Silinmiş Oyuncu' && del.actorUid === 'boss');
  assert.deepEqual(tracesOf(db, T, [NAME, 'ahmet@gmail.com']).filter((h) => !h.startsWith('admin_logs/') && !h.startsWith('shopierOrders/o1')), []); // sipariş kaydı yasal saklama
});

test('PANEL (v62): e-postayla gelen talep eklenir; iptal edilince oyuncuya SMS; engel varsa silinmez; yetkili/kendi hesabı silinemez', async () => {
  const { db, S, admin } = await panelSetup({ pendingBet: true });
  await assert.rejects(admin('boss', 'addByEmail', { email: 'yok@ornek.com' }), /kayıtlı bir oyun hesabı yok/);
  const add = await admin('boss', 'addByEmail', { email: 'ahmet@gmail.com' });
  assert.equal(add.uid, T);
  assert.equal(db._get(`deletionRequests/${T}`).source, 'email');
  const { plan } = await admin('boss', 'preview', { uid: T });
  assert.ok(plan.blocker.length > 0, 'bekleyen bahis engel');
  await assert.rejects(admin('boss', 'apply', { uid: T, fingerprint: plan.fingerprint }), /Engel var/);
  assert.ok(db._get(`users/${T}`), 'engel varken hesap duruyor');
  await admin('boss', 'cancel', { uid: T });
  assert.equal(db._get(`deletionRequests/${T}`).status, 'cancelled');
  const sms = [...db._store.keys()].filter((k) => k.startsWith(`users/${T}/messages/`)).map((k) => db._get(k).text);
  assert.ok(sms.some((t) => /silme talebin iptal edildi/.test(t)));
  assert.deepEqual((await admin('boss', 'list')).requests, []);
  // yetkili hesabı
  S(`users/${T}`, { ...db._get(`users/${T}`), role: 'moderator' });
  await admin('boss', 'addByEmail', { email: 'ahmet@gmail.com' });
  await assert.rejects(admin('boss', 'apply', { uid: T, fingerprint: 'x' }), /rolünü kaldır/);
});
