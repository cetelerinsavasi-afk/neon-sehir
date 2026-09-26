// functions/moderation.js (UGC Faz D1) için çevrimdışı test — Firebase gerektirmez.
// Çalıştır: node --test functions/scripts/moderation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createModeration, MODERATION, REPORT_TARGETS } from '../moderation.js';
import { createGangSystem } from '../gang/system.js';
import { VEHICLE_CATALOG, WEAPON_CATALOG } from '../catalogData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const clock = { now: NOW };
  const mod = createModeration({
    db,
    FieldValue,
    HttpsError,
    requireAuth: (r) => r.auth.uid,
    onCall: (fn) => fn,
    dateKey: () => '2026-09-26',
    now: () => clock.now,
  });
  // Oyuncular: yaşlı (uygun) ve yeni hesaplar
  for (const [uid, ageDays] of [['old1', 10], ['old2', 10], ['old3', 10], ['old4', 10], ['new1', 1], ['new2', 1], ['bad', 30], ['victim', 30]])
    S(`users/${uid}`, { displayName: uid.toUpperCase(), createdAt: new Timestamp(NOW - ageDays * DAY) });
  S('globalChat/m1', { uid: 'bad', displayName: 'BAD', text: 'kötü söz' });
  S('sixtagramPosts/p1', { uid: 'victim', text: 'gönderim', likeCount: 0 });
  S('sixtagramPosts/p1/comments/c1', { uid: 'bad', text: 'kötü yorum' });
  S('parkPresence/bad', { chatText: 'balon hakaret', displayName: 'BAD' });
  S('parkPresence/victim', { chatText: null, displayName: 'VICTIM' });
  S('gangWorlds/w1/gangs/g1', { name: 'Kötü Ad', babaId: 'bad', note: 'not' });
  S('gangWorlds/w1/gangs/g1/chat_genel/x1', { authorId: 'bad', text: 'çete içi hakaret' });
  S('gangWorlds/w1/memberships/old1', { gangId: 'g1' });
  S('gangWorlds/w1/memberships/old2', { gangId: 'g2' });
  S('gangWorlds/w1/intelChat_genel/i1', { rosterId: 'r9', codeName: 'KARTAL', text: 'anonim hakaret' });
  S('gangWorlds/w1/intelRosterLinks/r9', { actorId: 'bad' });
  S('feedback/f1', { uid: 'bad', text: 'kötü öneri' });
  S('imamState/current', { uid: 'bad', lastNasihat: 'kötü nasihat' });
  return { db, S, mod, clock, report: (uid, data) => mod._impl.reportContentImpl(uid, data), rep: (uid, type, path, reason = 'hakaret') => mod._impl.reportContentImpl(uid, { targetType: type, targetPath: path, reason }) };
}

const rejects = async (p, re) => {
  try {
    await p;
  } catch (e) {
    if (re) assert.match(`${e.code} ${e.message}`, re);
    return e;
  }
  assert.fail('hata bekleniyordu');
};

// ---------------------------------------------------------------------------
test('şikâyet: metin ve hedef oyuncu SUNUCUDA dokümandan kopyalanır', async () => {
  const { db, report } = setup();
  await report('old1', { targetType: 'globalChat', targetPath: 'globalChat/m1', reason: 'hakaret', note: '  çok   kaba  ', platform: 'android' });
  const reps = Object.entries(db._dump('reports/'));
  assert.equal(reps.length, 1);
  const [, r] = reps[0];
  assert.equal(r.targetUid, 'bad');
  assert.equal(r.textSnapshot, 'kötü söz');
  assert.equal(r.note, 'çok kaba');
  assert.equal(r.platform, 'android');
  assert.equal(r.status, 'open');
  assert.equal(r.eligible, true);
  assert.equal(db._get('dailyActions/old1_2026-09-26').reportCount, 1);
});

test('şikâyet: tüm hedef türleri doğru oyuncuyu ve metni bulur', async () => {
  const { db, rep } = setup();
  const cases = [
    ['sixtagramComment', 'sixtagramPosts/p1/comments/c1', 'bad', 'kötü yorum'],
    ['bubble', 'parkPresence/bad', 'bad', 'balon hakaret'],
    ['gang', 'gangWorlds/w1/gangs/g1', 'bad', 'Çete adı: Kötü Ad · Not: not'],
    ['gangChat', 'gangWorlds/w1/gangs/g1/chat_genel/x1', 'bad', 'çete içi hakaret'],
    ['intelChat', 'gangWorlds/w1/intelChat_genel/i1', 'bad', 'anonim hakaret'],
    ['feedback', 'feedback/f1', 'bad', 'kötü öneri'],
    ['nasihat', 'imamState/current', 'bad', 'kötü nasihat'],
    ['user', 'users/bad', 'bad', 'Oyun içi ad: BAD'],
  ];
  for (const [type, path, uid, text] of cases) {
    await rep('old1', type, path);
    const r = Object.values(db._dump('reports/')).find((x) => x.targetPath === path);
    assert.ok(r, `${type} raporu oluşmalı`);
    assert.equal(r.targetUid, uid, `${type} hedef oyuncu`);
    assert.equal(r.textSnapshot, text, `${type} metin`);
  }
});

test('şikâyet: geçersiz tür/sebep/yol, kendini şikâyet, olmayan içerik, boş balon reddedilir', async () => {
  const { report, rep } = setup();
  await rejects(report('old1', { targetType: 'yok', targetPath: 'globalChat/m1', reason: 'hakaret' }), /Geçersiz bildirim türü/);
  await rejects(report('old1', { targetType: 'globalChat', targetPath: 'globalChat/m1', reason: 'canimsikildi' }), /Geçersiz bildirim sebebi/);
  await rejects(rep('old1', 'globalChat', 'users/bad'), /Geçersiz içerik/, 'yol, türün kalıbına uymalı');
  await rejects(rep('old1', 'globalChat', 'globalChat/../users/bad'), /Geçersiz içerik/);
  await rejects(rep('bad', 'globalChat', 'globalChat/m1'), /Kendini bildiremezsin/);
  await rejects(rep('old1', 'globalChat', 'globalChat/yok'), /bulunamadı/);
  await rejects(rep('old1', 'bubble', 'parkPresence/victim'), /Balon artık görünmüyor/);
});

test('şikâyet: çete sohbetini yalnızca o çetenin üyesi şikâyet edebilir', async () => {
  const { rep } = setup();
  await rejects(rep('old2', 'gangChat', 'gangWorlds/w1/gangs/g1/chat_genel/x1'), /bildiremezsin/);
  await rep('old1', 'gangChat', 'gangWorlds/w1/gangs/g1/chat_genel/x1');
});

test('şikâyet: aynı içerik ikinci kez şikâyet edilemez; günlük sınır', async () => {
  const { S, rep } = setup();
  await rep('old1', 'globalChat', 'globalChat/m1');
  await rejects(rep('old1', 'globalChat', 'globalChat/m1'), /zaten bildirdin/);
  for (let i = 0; i <= MODERATION.REPORTS_PER_DAY; i++) S(`globalChat/z${i}`, { uid: 'bad', text: `m${i}` });
  for (let i = 0; i < MODERATION.REPORTS_PER_DAY; i++) await rep('old2', 'globalChat', `globalChat/z${i}`);
  await rejects(rep('old2', 'globalChat', `globalChat/z${MODERATION.REPORTS_PER_DAY}`), /Bugün yeterince/);
});

test('otomatik gizleme: 3 FARKLI uygun (≥3 günlük) şikâyetçi → hidden; yeni hesaplar sayılmaz', async () => {
  const { db, rep } = setup();
  await rep('new1', 'globalChat', 'globalChat/m1');
  await rep('new2', 'globalChat', 'globalChat/m1');
  await rep('old1', 'globalChat', 'globalChat/m1');
  await rep('old2', 'globalChat', 'globalChat/m1');
  assert.equal(db._get('globalChat/m1').hidden, undefined, '2 uygun şikâyetle gizlenmemeli');
  const res = await rep('old3', 'globalChat', 'globalChat/m1');
  assert.equal(res.autoHidden, true);
  assert.equal(db._get('globalChat/m1').hidden, true);
  assert.equal(db._get('globalChat/m1').hiddenBy, 'auto_reports');
  assert.equal(db._get('globalChat/m1').text, 'kötü söz', 'içerik SİLİNMEZ, yalnızca gizlenir');
  const again = await rep('old4', 'globalChat', 'globalChat/m1');
  assert.equal(again.autoHidden, false, 'zaten gizli');
});

test('otomatik gizleme: gizlenemeyen türler (balon, ad) gizlenmez', async () => {
  const { db, rep } = setup();
  for (const u of ['old1', 'old2', 'old3']) await rep(u, 'bubble', 'parkPresence/bad');
  assert.equal(db._get('parkPresence/bad').hidden, undefined);
});

// ---------------------------------------------------------------------------
test('engelleme: engelle / tekrar engelle (idempotent) / kaldır; kendini ve olmayanı engelleyemez', async () => {
  const { db, mod } = setup();
  const b = mod._impl;
  await b.blockUserImpl('victim', { targetUid: 'bad' });
  await b.blockUserImpl('victim', { targetUid: 'bad' });
  const doc = db._get('userBlocks/victim');
  assert.deepEqual(Object.keys(doc.blocked), ['bad']);
  assert.equal(doc.blocked.bad.name, 'BAD');
  assert.equal(await mod.isBlockedBy('victim', 'bad'), true);
  assert.equal(await mod.isBlockedBy('bad', 'victim'), false, 'tek yönlü');
  await rejects(b.blockUserImpl('victim', { targetUid: 'victim' }), /Kendini engelleyemezsin/);
  await rejects(b.blockUserImpl('victim', { targetUid: 'yokboyle' }), /bulunamadı/);
  await rejects(b.blockUserImpl('victim', { targetUid: '../users/x' }), /Geçersiz/);
  await b.unblockUserImpl('victim', { targetUid: 'bad' });
  assert.equal(await mod.isBlockedBy('victim', 'bad'), false);
  await b.unblockUserImpl('victim', { targetUid: 'bad' }); // idempotent
});

test('engelleme: üst sınır', async () => {
  const { S, mod } = setup();
  const blocked = {};
  for (let i = 0; i < MODERATION.MAX_BLOCKS; i++) blocked[`u${i}`] = { at: 1, name: 'x' };
  S('userBlocks/victim', { blocked });
  await rejects(mod._impl.blockUserImpl('victim', { targetUid: 'bad' }), /En fazla/);
});

// ---------------------------------------------------------------------------
test('susturma: aktif susturma engeller, süresi dolan engellemez, yasak mesajı farklı', async () => {
  const { S, mod, clock } = setup();
  await mod.assertCanSpeak('bad'); // kayıt yok
  S('mutes/bad', { untilMs: NOW + DAY, level: 'mute24h' });
  await rejects(mod.assertCanSpeak('bad'), /tarihine kadar yazı yazamazsın/);
  clock.now = NOW + DAY + 1;
  await mod.assertCanSpeak('bad'); // süresi doldu
  S('mutes/bad', { untilMs: MODERATION.BAN_UNTIL_MS, level: 'ban' });
  await rejects(mod.assertCanSpeak('bad'), /kısıtlandı/);
});

// ---------------------------------------------------------------------------
test('çete sistemi: canlı dünyada metin eylemleri susturmaya takılır, diğer eylemler takılmaz', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  S('gangSystem/config', { autoOpened: true, liveOpen: true, liveWorldId: 'wlive' });
  S('gangWorlds/wlive', { createdAtMs: NOW, launchDateKey: '2026-09-26', lastTickDateKey: '2026-09-26', clockOffsetMs: 0 });
  const muted = new Set(['bad']);
  const system = createGangSystem({
    db,
    FieldValue,
    HttpsError,
    realNow: () => NOW,
    getMaxWeaponPower: async () => 0,
    splitIncomeForDebt: (d, a) => ({ goldDelta: a, debtDelta: 0 }),
    catalogs: { VEHICLE_CATALOG, WEAPON_CATALOG, AMAZOR_PRICES: {} },
    lifeDays: 20,
    adminUids: [],
    getTestPassword: () => null,
    assertCanSpeak: async (uid) => {
      if (muted.has(uid)) throw new HttpsError('permission-denied', 'SUSTURULDU');
    },
  });
  const act = (uid, action, payload = {}) => system.handleAction({ auth: { uid }, data: { action, payload } });
  for (const action of ['sendGangChat', 'sendGlobalChat', 'sendIntelChat', 'createGang', 'updateGangProfile', 'sendAllianceNote', 'joinIntel', 'updateIntelNote', 'changeCodeName'])
    await rejects(act('bad', action, { text: 'x', name: 'Çete', channel: 'genel' }), /SUSTURULDU/);
  // Susturulmamış oyuncu kapıdan geçer (sonra çetesi olmadığı için oyun kuralıyla reddedilir)
  const e = await rejects(act('good', 'sendGangChat', { text: 'selam' }));
  assert.doesNotMatch(e.message, /SUSTURULDU/);
  // Metin olmayan eylem susturmaya takılmaz
  const e2 = await rejects(act('bad', 'leaveGang', {}));
  assert.doesNotMatch(e2.message, /SUSTURULDU/);
});

test('hedef kalıpları: istemcinin gönderdiği yol yalnızca izinli koleksiyonlara uyar', () => {
  const allowed = ['globalChat/a', 'sixtagramPosts/a', 'sixtagramPosts/a/comments/b', 'parkPresence/a', 'interiorPresence/a', 'users/a', 'feedback/a'];
  const denied = ['reports/a', 'mutes/a', 'userBlocks/a', 'shopierOrders/a', 'users/a/messages/b', 'globalChat/a/b', 'redemptionCodes/a'];
  const matchesAny = (p) => Object.values(REPORT_TARGETS).some((t) => t.re.test(p));
  for (const p of allowed) assert.ok(matchesAny(p), p);
  for (const p of denied) assert.ok(!matchesAny(p), `izin verilmemeli: ${p}`);
});
