// functions/adminPanel.js (UGC Faz D3 — Yönetim Paneli) için çevrimdışı test.
// Firebase gerektirmez. Çalıştır: node --test functions/scripts/admin-panel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createModeration, MODERATION, REPORT_TARGETS } from '../moderation.js';
import { createAdminPanel } from '../adminPanel.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

function fakeAuth() {
  const users = new Map();
  return {
    users,
    revoked: [],
    async getUser(uid) {
      if (!users.has(uid)) throw new Error('auth/user-not-found');
      return { uid, disabled: users.get(uid).disabled };
    },
    async updateUser(uid, { disabled }) {
      if (!users.has(uid)) throw new Error('auth/user-not-found');
      users.get(uid).disabled = disabled;
    },
    async revokeRefreshTokens(uid) {
      this.revoked.push(uid);
    },
  };
}

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const clock = { now: NOW };
  const auth = fakeAuth();
  const deps = { db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, now: () => clock.now };
  const mod = createModeration({ ...deps, dateKey: () => '2026-09-26' });
  const panel = createAdminPanel({ ...deps, auth, bootstrapAdminUids: ['boss'], reportTargets: REPORT_TARGETS, banUntilMs: MODERATION.BAN_UNTIL_MS });
  const people = { boss: {}, mod1: { role: 'moderator' }, mod2: { role: 'moderator' }, admin2: { role: 'admin' }, bad: {}, victim: {}, old1: {}, old2: {}, old3: {}, fake: { role: 'superuser' } };
  for (const [uid, extra] of Object.entries(people)) {
    S(`users/${uid}`, { displayName: uid.toUpperCase(), displayNameKey: uid, createdAt: new Timestamp(NOW - 30 * DAY), ...extra });
    S(`usernames/${uid}`, { uid });
    auth.users.set(uid, { disabled: false });
  }
  S('globalChat/m1', { uid: 'bad', displayName: 'BAD', text: 'kötü söz' });
  S('globalChat/m2', { uid: 'bad', displayName: 'BAD', text: 'ikinci kötü söz' });
  S('parkPresence/bad', { chatText: 'balon hakaret', displayName: 'BAD' });
  S('gangWorlds/w1/gangs/g1abcd', { name: 'Kötü Ad', nameKey: 'kötü ad', babaId: 'bad', note: 'kötü not' });
  S('gangWorlds/w1/gangNames/kötü ad', { gangId: 'g1abcd' });
  S('factories/bad', { name: 'Kötü Fabrika', ownerName: 'BAD' });
  S('vehicles/v1', { ownerId: 'bad', model: 'Sedan', customName: 'kötü araba' });
  S('imamState/current', { uid: 'bad', lastNasihat: 'kötü nasihat' });
  const call = (uid, action, payload = {}) => panel._impl.handle(uid, { action, payload });
  const report = (uid, type, path, reason = 'hakaret') => mod._impl.reportContentImpl(uid, { targetType: type, targetPath: path, reason });
  const logs = () => [...db._store.entries()].filter(([k]) => k.startsWith('admin_logs/')).map(([, v]) => v.data);
  const sms = (uid) => [...db._store.entries()].filter(([k]) => k.startsWith(`users/${uid}/messages/`)).map(([, v]) => v.data);
  return { db, S, G, clock, auth, mod, panel, call, report, logs, sms };
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

test('yetki: rolsüz ve geçersiz rol reddedilir; kurucu admin ilk çağrıda role=admin olur; moderatör yönetici işlemlerini yapamaz', async () => {
  const h = setup();
  await rejects(h.call('bad', 'me'), /permission-denied/);
  await rejects(h.call('fake', 'me'), /permission-denied/, 'bilinmeyen rol yetki vermez');
  assert.equal(h.G('users/boss').role, undefined);
  assert.deepEqual(await h.call('boss', 'me'), { uid: 'boss', role: 'admin', name: 'BOSS' });
  assert.equal(h.G('users/boss').role, 'admin', 'kurucu admin rolü yazıldı (rules ile aynı alan)');
  assert.equal((await h.call('mod1', 'me')).role, 'moderator');
  for (const a of ['banUser', 'unbanUser', 'setRole', 'listStaff']) await rejects(h.call('mod1', a, { uid: 'bad', duration: '1d', reason: 'x', role: 'moderator' }), /yöneticilere açık/);
  await rejects(h.call('mod1', 'nope'), /Geçersiz işlem/);
});

test('kuyruk: şikâyetler içerik başına gruplanır; kaldır → kalıcı gizlenir, şikâyetler kapanır, uyarı SMS gider, denetim kaydı yazılır', async () => {
  const h = setup();
  await h.report('old1', 'globalChat', 'globalChat/m1');
  await h.report('old2', 'globalChat', 'globalChat/m1', 'taciz');
  await h.report('victim', 'globalChat', 'globalChat/m2');
  const q = await h.call('mod1', 'listReports');
  assert.equal(q.groups.length, 2);
  const g = q.groups[0];
  assert.equal(g.targetPath, 'globalChat/m1', 'en çok şikâyet alan üstte');
  assert.equal(g.reporterCount, 2);
  assert.deepEqual(g.reasons, { hakaret: 1, taciz: 1 });
  assert.equal(g.targetName, 'BAD');
  assert.equal(g.hideable, true);
  const r = await h.call('mod1', 'resolveReport', { targetPath: 'globalChat/m1', decision: 'remove', warn: true, note: 'küfür' });
  assert.deepEqual(r, { ok: true, effect: 'hidden', closed: 2, warned: true });
  assert.equal(h.G('globalChat/m1').hidden, true);
  assert.equal(h.G('globalChat/m1').hiddenBy, 'moderator');
  assert.equal(h.G('globalChat/m1').text, 'kötü söz', 'metin silinmez (denetim için)');
  assert.equal((await h.call('mod1', 'listReports')).groups.length, 1);
  assert.equal((await h.call('mod1', 'listReports', { status: 'actioned' })).groups[0].resolvedByName, 'MOD1');
  assert.equal(h.sms('bad').length, 1);
  assert.equal(h.sms('bad')[0].from, 'Moderasyon');
  const log = h.logs().find((l) => l.action === 'report_remove');
  assert.equal(log.actorUid, 'mod1');
  assert.equal(log.targetUid, 'bad');
  assert.equal(log.details.before, 'kötü söz');
  assert.equal(log.reason, 'küfür');
  await rejects(h.call('mod1', 'resolveReport', { targetPath: 'globalChat/m1', decision: 'remove' }), /zaten kapatılmış/);
  // geri al
  await h.call('mod1', 'restoreContent', { targetPath: 'globalChat/m1', targetType: 'globalChat' });
  assert.equal(h.G('globalChat/m1').hidden, false);
  assert.ok(h.logs().some((l) => l.action === 'content_restore'));
});

test('kuyruk: reddet (yersiz şikâyet) → otomatik gizlenen içerik geri açılır', async () => {
  const h = setup();
  for (const u of ['old1', 'old2', 'old3']) await h.report(u, 'globalChat', 'globalChat/m2');
  assert.equal(h.G('globalChat/m2').hiddenBy, 'auto_reports');
  const r = await h.call('mod1', 'resolveReport', { targetPath: 'globalChat/m2', decision: 'dismiss' });
  assert.equal(r.effect, 'unhidden');
  assert.equal(h.G('globalChat/m2').hidden, false);
  const statuses = [...h.db._store.entries()].filter(([k]) => k.startsWith('reports/')).map(([, v]) => v.data.status);
  assert.deepEqual([...new Set(statuses)], ['dismissed']);
  assert.equal(h.sms('bad').length, 0, 'reddette uyarı yok');
});

test('kaldır: ad/isim türleri varsayılana sıfırlanır (oyuncu adı, çete adı+notu, fabrika, araç, balon, nasihat)', async () => {
  const h = setup();
  const cases = [
    ['user', 'users/bad'],
    ['gang', 'gangWorlds/w1/gangs/g1abcd'],
    ['factory', 'factories/bad'],
    ['vehicleName', 'vehicles/v1'],
    ['bubble', 'parkPresence/bad'],
    ['nasihat', 'imamState/current'],
  ];
  for (const [type, path] of cases) await h.report('victim', type, path);
  for (const [, path] of cases) await h.call('mod1', 'resolveReport', { targetPath: path, decision: 'remove' });
  assert.equal(h.G('users/bad').displayName, 'Oyuncu');
  assert.equal(h.G('users/bad').displayNameKey, undefined);
  assert.equal(h.G('usernames/bad'), undefined, 'eski isim rezervasyonu serbest');
  assert.equal(h.G('gangWorlds/w1/gangs/g1abcd').name, 'Çete ABCD');
  assert.equal(h.G('gangWorlds/w1/gangs/g1abcd').note, '');
  assert.equal(h.G('gangWorlds/w1/gangNames/kötü ad'), undefined);
  assert.deepEqual(h.G('gangWorlds/w1/gangNames/çete abcd'), { gangId: 'g1abcd' });
  assert.equal(h.G('factories/bad').name, undefined);
  assert.equal(h.G('vehicles/v1').customName, undefined);
  assert.equal(h.G('parkPresence/bad').chatText, null);
  assert.equal(h.G('imamState/current').lastNasihat, null);
  const gl = h.logs().find((l) => l.targetType === 'gang');
  assert.equal(gl.details.before, 'Kötü Ad · kötü not');
  assert.equal(gl.details.after, 'Çete ABCD');
  // sıfırlamalar geri açılamaz
  await rejects(h.call('mod1', 'restoreContent', { targetPath: 'users/bad', targetType: 'user' }), /geri açılamaz/);
});

test('kaldır: nasihat bu arada değiştiyse dokunulmaz; çete adı çakışırsa ek alır', async () => {
  const h = setup();
  await h.report('victim', 'nasihat', 'imamState/current');
  h.S('imamState/current', { uid: 'victim', lastNasihat: 'iyi nasihat' });
  const r = await h.call('mod1', 'resolveReport', { targetPath: 'imamState/current', decision: 'remove' });
  assert.equal(r.effect, 'stale');
  assert.equal(h.G('imamState/current').lastNasihat, 'iyi nasihat');
  h.S('gangWorlds/w1/gangNames/çete abcd', { gangId: 'baska' });
  await h.report('victim', 'gang', 'gangWorlds/w1/gangs/g1abcd');
  await h.call('mod1', 'resolveReport', { targetPath: 'gangWorlds/w1/gangs/g1abcd', decision: 'remove' });
  assert.equal(h.G('gangWorlds/w1/gangs/g1abcd').name, 'Çete ABCD-2');
});

test('susturma: moderatör ≤7 gün; sebep zorunlu; mesaj yazamaz; kaldırılabilir; hedef kuralları', async () => {
  const h = setup();
  await rejects(h.call('mod1', 'muteUser', { uid: 'bad', duration: '30d', reason: 'x' }), /en fazla 7 gün/);
  await rejects(h.call('mod1', 'muteUser', { uid: 'bad', duration: '24h' }), /Sebep/);
  await rejects(h.call('mod1', 'muteUser', { uid: 'bad', duration: '2y', reason: 'x' }), /Geçersiz süre/);
  const r = await h.call('mod1', 'muteUser', { uid: 'bad', duration: '24h', reason: 'hakaret' });
  assert.equal(r.untilMs, NOW + DAY);
  await rejects(h.mod.assertCanSpeak('bad'), /yazı yazamazsın/);
  assert.equal(h.sms('bad').length, 1);
  const d = await h.call('mod1', 'getUser', { uid: 'bad' });
  assert.equal(d.mute.untilMs, NOW + DAY);
  assert.equal(d.ban, null);
  assert.equal(d.recentLogs[0].action, 'mute');
  await h.call('mod1', 'unmuteUser', { uid: 'bad' });
  await h.mod.assertCanSpeak('bad');
  await rejects(h.call('mod1', 'unmuteUser', { uid: 'bad' }), /aktif bir susturması yok/);
  // hedef kuralları
  await rejects(h.call('mod1', 'muteUser', { uid: 'mod1', duration: '1h', reason: 'x' }), /Kendine/);
  await rejects(h.call('mod1', 'muteUser', { uid: 'mod2', duration: '1h', reason: 'x' }), /yalnızca yöneticiler/);
  await rejects(h.call('mod1', 'warnUser', { uid: 'boss' }), /yöneticiye bu işlem uygulanamaz/);
  await rejects(h.call('admin2', 'muteUser', { uid: 'boss', duration: '1h', reason: 'x' }), /yöneticiye/);
  await h.call('boss', 'muteUser', { uid: 'mod2', duration: '30d', reason: 'admin moderatörü susturabilir' });
  await h.call('mod1', 'warnUser', { uid: 'victim', text: 'dikkat et' });
  assert.match(h.sms('victim')[0].text, /Uyarı: dikkat et/);
});

test('ban: yalnızca admin; Auth kapanır + oturumlar iptal; yazı yasağı anında; önceki susturma geri gelir; süre dolunca otomatik kalkar; kalıcı kalır', async () => {
  const h = setup();
  await h.call('mod1', 'muteUser', { uid: 'bad', duration: '7d', reason: 'önceki' });
  const r = await h.call('boss', 'banUser', { uid: 'bad', duration: '1d', reason: 'tekrarlayan hakaret' });
  assert.equal(r.authDisabled, true);
  assert.equal(h.auth.users.get('bad').disabled, true);
  assert.deepEqual(h.auth.revoked, ['bad']);
  await rejects(h.mod.assertCanSpeak('bad'), /kısıtlandı|yazı yazamazsın/);
  await rejects(h.call('mod1', 'muteUser', { uid: 'bad', duration: '1h', reason: 'x' }), /zaten banlı/);
  await rejects(h.call('mod1', 'unmuteUser', { uid: 'bad' }), /banlı/);
  const d = await h.call('mod1', 'getUser', { uid: 'bad' });
  assert.equal(d.ban.untilMs, NOW + DAY);
  assert.equal(d.authDisabled, true);
  // süre dolmadan tarama bir şey yapmaz
  assert.deepEqual(await h.panel.sweepExpiredBans(), { lifted: 0 });
  h.clock.now = NOW + DAY + 1;
  assert.deepEqual(await h.panel.sweepExpiredBans(), { lifted: 1 });
  assert.equal(h.auth.users.get('bad').disabled, false);
  assert.equal(h.G('bans/bad').active, false);
  assert.equal(h.G('mutes/bad').untilMs, NOW + 7 * DAY, 'önceki 7 günlük susturma geri geldi');
  await rejects(h.mod.assertCanSpeak('bad'), /yazı yazamazsın/);
  assert.ok(h.logs().some((l) => l.action === 'ban_expired' && l.actorUid === 'system'));
  // kalıcı ban taramada kalkmaz; elle kalkar
  await h.call('boss', 'banUser', { uid: 'victim', duration: 'permanent', reason: 'dolandırıcılık' });
  h.clock.now = NOW + 400 * DAY;
  assert.deepEqual(await h.panel.sweepExpiredBans(), { lifted: 0 });
  assert.equal(h.auth.users.get('victim').disabled, true);
  await h.call('boss', 'unbanUser', { uid: 'victim', reason: 'itiraz kabul' });
  assert.equal(h.auth.users.get('victim').disabled, false);
  await h.mod.assertCanSpeak('victim');
  await rejects(h.call('boss', 'unbanUser', { uid: 'victim' }), /aktif bir banı yok/);
});

test('ban: Auth kaydı yoksa Firestore yasağı yine uygulanır', async () => {
  const h = setup();
  h.auth.users.delete('bad');
  const r = await h.call('boss', 'banUser', { uid: 'bad', duration: '7d', reason: 'x' });
  assert.equal(r.authDisabled, false);
  assert.equal(h.G('bans/bad').active, true);
  await rejects(h.mod.assertCanSpeak('bad'));
});

test('roller: admin moderatör atar/alır; kendi ve kurucu rolü değişmez; atanan moderatör paneli kullanır', async () => {
  const h = setup();
  await rejects(h.call('victim', 'me'), /permission-denied/);
  await h.call('boss', 'setRole', { uid: 'victim', role: 'moderator' });
  assert.equal((await h.call('victim', 'me')).role, 'moderator');
  await rejects(h.call('boss', 'setRole', { uid: 'victim', role: 'moderator' }), /zaten bu rolde/);
  await rejects(h.call('boss', 'setRole', { uid: 'boss', role: 'none' }), /Kendi rolünü/);
  await rejects(h.call('admin2', 'setRole', { uid: 'boss', role: 'none' }), /Kurucu/);
  await rejects(h.call('boss', 'setRole', { uid: 'victim', role: 'god' }), /Geçersiz rol/);
  const staff = (await h.call('boss', 'listStaff')).staff;
  assert.deepEqual(staff.map((s) => [s.uid, s.role]), [['admin2', 'admin'], ['boss', 'admin'], ['mod1', 'moderator'], ['mod2', 'moderator'], ['victim', 'moderator']]);
  await h.call('boss', 'setRole', { uid: 'victim', role: 'none' });
  assert.equal(h.G('users/victim').role, undefined);
  await rejects(h.call('victim', 'me'), /permission-denied/);
  assert.equal(h.logs().filter((l) => l.action === 'set_role').length, 2);
});

test('arama ve işlem geçmişi: ad/uid ile bulunur; kayıtlar yeniden eskiye, sayfalı', async () => {
  const h = setup();
  const byName = await h.call('mod1', 'searchUsers', { q: 'BA' });
  assert.deepEqual(byName.results.map((r) => r.uid), ['bad']);
  const byKey = await h.call('mod1', 'searchUsers', { q: 'vic' });
  assert.deepEqual(byKey.results.map((r) => r.uid), ['victim']);
  const byUid = await h.call('mod1', 'searchUsers', { q: 'old2' });
  assert.ok(byUid.results.some((r) => r.uid === 'old2'));
  await rejects(h.call('mod1', 'searchUsers', { q: 'a' }), /En az 2/);
  for (let i = 0; i < 55; i++) {
    h.clock.now = NOW + i * 1000;
    await h.call('mod1', 'warnUser', { uid: 'victim', text: `u${i}` });
  }
  const p1 = await h.call('mod1', 'listLogs');
  assert.equal(p1.logs.length, 50);
  assert.equal(p1.logs[0].details.text, 'u54', 'en yeni üstte');
  assert.ok(p1.nextBeforeMs);
  const p2 = await h.call('mod1', 'listLogs', { beforeMs: p1.nextBeforeMs });
  assert.equal(p2.logs.length, 5);
  assert.equal(p2.nextBeforeMs, null);
});
