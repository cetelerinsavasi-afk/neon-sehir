// v77 Faz 4 — Spor salonu (functions/gym.js) testleri.
// Çalıştır: node --test functions/scripts/gym.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { createBusiness } from '../business.js';
import { createShop } from '../shop.js';
import { createGym, GAME_GYM_ID, rollGymGain, withBonus, gymDeadlineMs } from '../gym.js';
import { BIZ_TYPES } from '../businessCatalogData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const splitIncomeForDebt = (debt, amount) => ({ goldDelta: amount, debtDelta: 0 });
const H = 60 * 60 * 1000;
const at = (d, h, m = 0) => Date.UTC(2026, 9, d, h - 3, m); // İstanbul saati

function setup({ rndSeq } = {}) {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const clock = { now: at(7, 12) };
  const now = () => clock.now;
  let i = 0;
  const rnd = rndSeq ? () => rndSeq[i++ % rndSeq.length] : () => 0.5;
  const business = createBusiness({ db, FieldValue, now });
  const gym = createGym({ db, FieldValue, HttpsError, splitIncomeForDebt, business, now, rnd });
  const shop = createShop({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, splitIncomeForDebt, business, now, extraOps: gym.ops });
  const houses = createHouses({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, isAdmin: () => false, assertCanSpeak: async () => {}, isFriend: async () => false, now, bizHooks: shop.bizHooks });
  S('users/sahip', { displayName: 'Sahip', gold: 2_000_000, emerald: 100 });
  S('users/ali', { displayName: 'Ali', gold: 10_000 });
  const act = (uid, data) => shop.shopAction({ auth: { uid }, data });
  const hact = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const present = (uid, houseId) => S(`housePresence/${uid}`, { houseId, updatedAt: new Timestamp(clock.now) });
  return { db, S, G, clock, act, hact, present, gym, business };
}
let seq = 0;
const it = (k) => ({ i: `x${(seq++).toString(36)}`, k, x: 0, z: 0, r: 0, c: 0, p: 1 });
async function openGym(h, owner = 'sahip') {
  const { houseId } = await h.hact(owner, { op: 'buy', bizIntent: 'spor' });
  const items = [];
  BIZ_TYPES.spor.groups.forEach((g) => {
    for (let n = 0; n < g.n; n++) items.push(it(g.any[0]));
  });
  h.S(`houses/${houseId}`, { ...h.G(`houses/${houseId}`), items });
  await h.hact(owner, { op: 'bizOpen', houseId, type: 'spor' });
  return houseId;
}
async function doSteps(h, uid, houseId) {
  let r = null;
  for (let s = 0; s < 3; s++) {
    const m = Object.values(Object.fromEntries([...h.db._store.keys()].filter((k) => k.startsWith(`gymMemberships/${uid}_`)).map((k) => [k, h.G(k)]))).find((x) => x.status === 'active');
    h.present(uid, houseId);
    await h.act(uid, { op: 'gymStep', equipment: m.tasks[m.step] });
    h.clock.now += 10_500;
    h.present(uid, houseId);
    r = await h.act(uid, { op: 'gymStepDone' });
  }
  return r;
}

test('gelişim tablosu: 200 altı 1–16, üstü 1–4; bonus ×1.1 tek ondalık', () => {
  assert.equal(rollGymGain(150, () => 0), 1);
  assert.equal(rollGymGain(150, () => 0.9999), 16);
  assert.equal(rollGymGain(200, () => 0.9999), 4);
  assert.equal(withBonus(10, true), 11);
  assert.equal(withBonus(3, true), 3.3);
  assert.equal(withBonus(8, true), 8.8);
  // 1–16 arası her değer eşit olasılıkla
  assert.deepEqual([...new Set(Array.from({ length: 16 }, (_, i) => rollGymGain(150, () => i / 16)))], Array.from({ length: 16 }, (_, i) => i + 1));
  assert.equal(withBonus(3, false), 3);
});

test('üyelik: mevki zorunlu, emanet ödeme, 3 görev (≥10 sn), gelişim, ödeme salona ve ÖDEME gününe', async () => {
  const h = setup({ rndSeq: [0.1, 0.6, 0.3, 0.8, 0.5] });
  h.clock.now = at(5, 12); // 5 Ekim futbol gününden önce açıldı → 6 Ekim'de bonus hakkı var
  const id = await openGym(h);
  h.clock.now = at(7, 12);
  await h.act('sahip', { op: 'gymPrice', houseId: id, price: 800 });
  await assert.rejects(h.act('sahip', { op: 'gymPrice', houseId: id, price: 400 }), /price-band/);
  await assert.rejects(h.act('ali', { op: 'gymStart', houseId: id, expect: 800 }), /not-present/);
  h.present('ali', id);
  await assert.rejects(h.act('ali', { op: 'gymStart', houseId: id, expect: 800 }), /position-required/);
  await assert.rejects(h.act('ali', { op: 'gymStart', houseId: id, expect: 1000, position: 'FWD' }), /price-changed:800/);
  // 18:59'da öde → futbol günü 6 Ekim
  h.clock.now = at(7, 18, 59);
  h.present('ali', id);
  const r = await h.act('ali', { op: 'gymStart', houseId: id, expect: 800, position: 'FWD' });
  assert.equal(r.dayKey, '2026-10-06');
  assert.equal(r.bonus, true, 'dünün tamamında açık + dünkü gelir 0 → bonuslu');
  assert.equal(new Set(r.tasks).size, 3);
  assert.equal(h.G('users/ali').gold, 9_200);
  assert.equal(h.G('users/sahip').gold, 1_500_000, 'para emanette');
  assert.equal(h.G('footballers/ali').position, 'FWD');
  assert.equal(h.G(`houses/${id}`).bizLockUntilMs, h.clock.now + H, '18:59 → 19:59');
  // yanlış alet / çok hızlı
  h.present('ali', id);
  const wrong = ['bag', 'treadmill', 'bench', 'dumbbells'].find((k) => k !== r.tasks[0]);
  await assert.rejects(h.act('ali', { op: 'gymStep', equipment: wrong }), /wrong-equipment/);
  await h.act('ali', { op: 'gymStep', equipment: r.tasks[0] });
  h.clock.now += 5_000;
  h.present('ali', id);
  await assert.rejects(h.act('ali', { op: 'gymStepDone' }), /too-fast/);
  h.clock.now = at(7, 19, 3);
  const done = await doSteps(h, 'ali', id);
  assert.equal(done.done, true);
  assert.equal(done.from, 100);
  assert.equal(done.bonus, true);
  assert.equal(done.to, Math.round((100 + done.gain) * 10) / 10);
  assert.equal(done.gain, withBonus(done.base, true));
  assert.equal(h.G('footballers/ali').power, done.to);
  assert.equal(h.G('users/sahip').gold, 1_500_720, 'görev bitince salona (800 − %10 vergi)');
  assert.equal(h.G(`businessDaily/${id}_2026-10-06`).revenue, 800, 'ödeme gününün gelirine');
  // bugünün (7 Ekim futbol günü) hakkı hemen alınabilir
  h.present('ali', id);
  const r2 = await h.act('ali', { op: 'gymStart', houseId: id, expect: 800 });
  assert.equal(r2.dayKey, '2026-10-07');
  // aynı gün ikinci üyelik yok (bitince de)
  await doSteps(h, 'ali', id);
  h.present('ali', id);
  await assert.rejects(h.act('ali', { op: 'gymStart', houseId: id, expect: 800 }), /membership-today/);
});

test('bitmemiş üyelik: yenisi alınamaz, 19:00\'da iade; sahip kendi salonunda günde 1 ücretsiz; takımdaki oyuncu yapamaz', async () => {
  const h = setup();
  const id = await openGym(h);
  const id2 = await openGym(h);
  h.present('ali', id);
  await h.act('ali', { op: 'gymStart', houseId: id, expect: 1000, position: 'DEF' });
  assert.equal(h.G(`gymMemberships/ali_2026-10-06`).expiresAtMs, at(7, 19), '12:00 → 19:00\'a kadar');
  h.clock.now += 5 * H; // 17:00 — üyelik hâlâ açık
  h.present('ali', id2);
  await assert.rejects(h.act('ali', { op: 'gymStart', houseId: id2, expect: 1000 }), new RegExp(`membership-open:${id}`));
  // kilit: mobilya kaldırılamaz
  const d = h.G(`houses/${id}`);
  await assert.rejects(h.hact('sahip', { op: 'save', houseId: id, design: { items: d.items.slice(1), wall: d.wall, floor: d.floor }, allowBizClose: true }), /biz-locked/);
  h.clock.now += 2 * H + 1; // 19:00 geçti
  assert.equal(await h.gym.expireMemberships(), 1);
  assert.equal(h.G('users/ali').gold, 10_000, 'iade');
  h.present('ali', id2);
  await h.act('ali', { op: 'gymStart', houseId: id2, expect: 1000 });
  // sahip kendi salonunda günde 1 kez ücretsiz (gelir yazılmaz)
  h.present('sahip', id);
  const goldBefore = h.G('users/sahip').gold;
  const own = await h.act('sahip', { op: 'gymStart', houseId: id, position: 'GK' });
  assert.equal(own.price, 0);
  assert.equal(h.G('users/sahip').gold, goldBefore);
  await doSteps(h, 'sahip', id);
  assert.equal(h.G('users/sahip').gold, goldBefore);
  assert.ok(h.G('footballers/sahip').power > 100);
  h.present('sahip', id);
  await assert.rejects(h.act('sahip', { op: 'gymStart', houseId: id }), /membership-today/);
  // takımdaki oyuncu
  h.S('users/veli', { gold: 10_000 });
  h.S('footballers/veli', { uid: 'veli', position: 'MID', power: 210, teamId: 't1' });
  h.present('veli', id);
  await assert.rejects(h.act('veli', { op: 'gymStart', houseId: id, expect: 1000 }), /in-team/);
});

test('üyelik süresi: sonraki 19:00; son 1 saatte başlarsa +1 saat', () => {
  assert.equal(gymDeadlineMs(at(7, 12)), at(7, 19));
  assert.equal(gymDeadlineMs(at(7, 17, 30)), at(7, 19));
  assert.equal(gymDeadlineMs(at(7, 18, 30)), at(7, 19, 30));
  assert.equal(gymDeadlineMs(at(7, 18, 59)), at(7, 19, 59));
  assert.equal(gymDeadlineMs(at(7, 20)), at(8, 19));
  assert.equal(gymDeadlineMs(at(8, 2)), at(8, 19));
});

test('mevki: günde 1 kez değişir, 200 güçte kalıcı, takımdayken değişmez', async () => {
  const h = setup();
  await h.act('ali', { op: 'footballerPosition', position: 'GK' });
  assert.equal(h.G('footballers/ali').power, 100);
  await assert.rejects(h.act('ali', { op: 'footballerPosition', position: 'FWD' }), /position-today/);
  h.clock.now += 24 * H;
  await h.act('ali', { op: 'footballerPosition', position: 'FWD' });
  assert.equal(h.G('footballers/ali').position, 'FWD');
  h.clock.now += 24 * H;
  h.S('footballers/ali', { ...h.G('footballers/ali'), power: 200 });
  await assert.rejects(h.act('ali', { op: 'footballerPosition', position: 'MID' }), /position-pro/);
  h.S('footballers/ali', { ...h.G('footballers/ali'), power: 150 });
  h.S('footballers/ali', { ...h.G('footballers/ali'), teamId: 't1', positionChangedAtMs: 0 });
  await assert.rejects(h.act('ali', { op: 'footballerPosition', position: 'MID' }), /position-team/);
});

test('bonus: dünkü kazancı en çok kazananın yarısından az olan bonuslu; yeni salon ilk 19:00 bonussuz; oyunun salonu bonussuz 2.000 ama sıralamada', async () => {
  const h = setup();
  h.clock.now = at(6, 12); // 6 Ekim futbol gününden (6 Eki 19:00) önce açıldılar
  const a = await openGym(h);
  const b = await openGym(h);
  const c = await openGym(h);
  h.clock.now = at(7, 12);
  const d = await openGym(h); // 7 Eki 12:00'de açıldı → ilk 19:00'da bonus olamaz
  assert.equal(h.G(`houses/${d}`).gymBonusDay ?? null, null, 'açılışta bonus yok');
  // 6 Ekim futbol günü gelirleri: a 10.000 · b 4.000 · c 6.000 · d 0
  const rec = (id, amount) => h.db.runTransaction(async (tx) => h.business.recordIncomeTx(tx, { houseId: id, h: h.G(`houses/${id}`), amount, kind: 'service', customerUid: 'x', atMs: at(7, 12) }));
  await rec(a, 10_000);
  await rec(b, 4_000);
  await rec(c, 6_000);
  h.clock.now = at(7, 19, 5);
  await h.business.rollover(['spor']);
  const today = '2026-10-07';
  assert.equal(h.G(`houses/${a}`).gymBonusDay, null);
  assert.equal(h.G(`houses/${b}`).gymBonusDay, today);
  assert.equal(h.G(`houses/${c}`).gymBonusDay, null);
  assert.equal(h.G(`houses/${d}`).gymBonusDay, null, 'yeni salon: geliri 0 olsa da ilk 19:00 bonussuz');
  assert.deepEqual(h.G(`businessDaily/${b}_${today}`).bonusRef, { on: true, eligible: true, yesterday: 4000, top: 10000, threshold: 5000 });
  assert.equal(h.G(`businessDaily/${d}_${today}`).bonusRef.eligible, false);
  assert.equal(await h.gym.gymBonus(d, h.G(`houses/${d}`), today), false);
  assert.equal(await h.gym.gymBonus(b, h.G(`houses/${b}`), today), true);
  assert.equal(await h.gym.gymBonus(a, h.G(`houses/${a}`), today), false);
  // oyunun salonu
  await h.act('ali', { op: 'gymEnsureGame' });
  await h.act('ali', { op: 'gymEnsureGame' });
  const g = h.G(`houses/${GAME_GYM_ID}`);
  assert.equal(g.bizGame, true);
  assert.equal(g.items.filter((x) => x.k === 'bag').length, 2);
  h.present('ali', GAME_GYM_ID);
  const r = await h.act('ali', { op: 'gymStart', houseId: GAME_GYM_ID, expect: 2000, position: 'MID' });
  assert.equal(r.bonus, false);
  await doSteps(h, 'ali', GAME_GYM_ID);
  assert.equal(h.G('users/ali').gold, 8_000);
  // oyunun salonu da kazancına göre sıralanır (7 Ekim günü: oyun 2.000, salonlar 0)
  h.clock.now = at(8, 19, 5);
  await h.business.rollover(['spor']);
  assert.equal(h.G(`houses/${GAME_GYM_ID}`).bizRank, 1);
  assert.equal(h.G('gameVenues/spor').bizRank, 1);
  assert.equal(h.G(`houses/${a}`).bizRank, 2);
  // ikinci 19:00: d artık tam gün açıktı → geliri 0 → bonuslu; eşiğe oyunun salonu da girer
  assert.equal(h.G(`houses/${d}`).gymBonusDay, '2026-10-08');
  assert.equal(h.G('businessRollups/spor_2026-10-07').topRevenue, 2000);
});

test('oyunun dükkânları kazanca göre sıralanır (en üstte sabit değil)', async () => {
  const h = setup();
  const a = await openGym(h);
  const rec = (fn) => h.db.runTransaction(async (tx) => fn(tx));
  await rec((tx) => h.business.recordIncomeTx(tx, { houseId: a, h: h.G(`houses/${a}`), amount: 5000, kind: 'service', customerUid: 'x' }));
  await rec((tx) => h.business.recordGameIncomeTx(tx, { type: 'spor', amount: 2000, kind: 'service', customerUid: 'x' }));
  await rec((tx) => h.business.recordGameIncomeTx(tx, { type: 'silahci', amount: 1000, kind: 'sale', customerUid: 'x' }));
  h.clock.now = at(7, 19, 5);
  await h.business.rollover(['spor']);
  assert.equal(h.G(`houses/${a}`).bizRank, 1);
  assert.equal(h.G('gameVenues/spor').bizRank, 2);
  assert.equal(h.G(`houses/${GAME_GYM_ID}`), undefined, 'oyunun salonu kurulmadıysa ev belgesi oluşturulmaz');
  h.clock.now = at(8, 0, 5);
  await h.business.rollover(['silahci']);
  assert.equal(h.G('gameVenues/silahci').bizRank, 1);
});
