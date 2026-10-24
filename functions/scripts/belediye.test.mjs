// v127 — Belediye: oranlar (gün içi ±1 adım, 00:00'da yürürlük), kasa (eksiye
// düşmez, borç), gece maaşları (hepsi ya da hiçbiri), kadro (davet / yetki /
// 24 saat koruma), bağış, rapor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createBelediye, ministryReport, canMinistry, canFireSeat, canInviteSeat } from '../belediye.js';
import { resolveRates, validateNext, rateChanges, DEFAULT_RATES, boundsOf, factoryRateFrac, resaleRateFrac, bizRateFrac, policeSalary, seatSalary } from '../belediyeRates.js';
import { stateWrite, closeStateDays } from '../stateTreasury.js';
import { spendableOf } from '../belediyeKasa.js';
import { bizTax, resaleTax, machineTax, splitSalaryTax, factoryTax, setRatesCache, ratesFor } from '../tax.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const ms = (day, hhmm = '12:00') => Date.parse(`${day}T${hhmm}:00+03:00`);

function world(startDay = '2026-10-24', hhmm = '12:00') {
  const clock = { now: ms(startDay, hhmm) };
  const db = new FakeFirestore({ clock: () => clock.now, yieldEvery: false });
  const posts = [];
  const membership = {};
  const bel = createBelediye({
    db,
    FieldValue,
    HttpsError,
    requireAuth: () => null,
    onCall: null,
    splitIncomeForDebt: (_d, a) => ({ goldDelta: a, debtDelta: 0 }),
    goldTag: (s) => s,
    isAdmin: async (uid) => uid === 'admin',
    liveMembership: async (uid) => (membership[uid] ? { worldId: 'w', ms: membership[uid] } : null),
    postSixtagram: async (t) => posts.push(t),
    rates: { loadRates: async () => {}, ratesFor: (d) => resolveRates(db._get('belediye/rates'), d, db._get('belediye/pending')) },
    now: () => clock.now,
  });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._get(p);
  const act = (uid, op, data = {}) => bel.handle(uid, { op, ...data });
  const fails = async (uid, op, data = {}) => {
    try {
      await act(uid, op, data);
    } catch (e) {
      return e;
    }
    throw new Error(`${op} başarısız olmalıydı`);
  };
  const sms = (uid) => Object.entries(db._dump(`users/${uid}/messages/`)).map(([, v]) => v.text);
  const income = async (amount, day = null) => {
    const b = db.batch();
    stateWrite(b, db, FieldValue, { kind: 'in', cat: 'vergi_fabrika', amount, atMs: clock.now, dayKey: day });
    await b.commit();
  };
  for (const u of ['admin', 'ali', 'veli', 'ayse', 'fatma', 'can', 'imamx', 'polis1', 'polis2']) S(`users/${u}`, { displayName: u.toUpperCase(), gold: 1_000_000 });
  S('friendships/admin', { friends: { ali: {}, veli: {}, ayse: {}, fatma: {}, can: {}, polis1: {} } });
  S('friendships/ali', { friends: { fatma: {}, can: {} } });
  return { db, bel, clock, posts, membership, S, G, act, fails, sms, income };
}

async function seatAll(w) {
  await w.act('admin', 'claimMayor');
  for (const [seat, uid] of [['yrd1', 'ali'], ['san', 'veli'], ['tic', 'ayse']]) {
    await w.act('admin', 'invite', { seat, targetUid: uid });
    await w.act(uid, 'respondInvite', { accept: true });
  }
}

// -----------------------------------------------------------------------------
test('oranlar: varsayılanlar oyunun mevcut değerleri; tek adım; bağımlı sınırlar', () => {
  const r = resolveRates(null, '2026-10-24');
  assert.equal(r.f2, 10);
  assert.equal(r.mkKripto, 5);
  assert.equal(r.polGenel, 25_000);
  assert.equal(r.imam, 10_000);
  assert.equal(r.soygunPay, 25);
  assert.equal(r.ikAraba, 1);
  assert.equal(validateNext(r, { ...r, sosyal: 11 }), null);
  assert.equal(validateNext(r, { ...r, sosyal: 9 }), null);
  assert.match(validateNext(r, { ...r, sosyal: 12 }), /en fazla/);
  assert.match(validateNext(r, { ...r, soygunPay: 26 }), /en fazla/, 'soygun payı 5\'er adım');
  assert.equal(validateNext(r, { ...r, soygunPay: 30 }), null);
  // dilimler sıralı kalmalı: f1 2 olabilir (f2 10) ama f2 = f1 olamaz
  const tight = { ...r, f1: 9, f2: 10 };
  assert.match(validateNext(tight, { ...tight, f2: 9 }), /aralığında/);
  // maaş hiyerarşisi: bakan, yardımcıdan düşük kalmalı
  const sal = { ...r, bakan: 39_000, byrd: 40_000 };
  assert.match(validateNext(sal, { ...sal, bakan: 40_000 }), /aralığında/);
  assert.deepEqual(boundsOf(r, r, 'polMemur'), [4000, 6000]);
  const ch = rateChanges(r, { ...r, sosyal: 9, imam: 11_000 });
  assert.deepEqual(ch.map((c) => [c.id, c.from, c.to]), [['sosyal', 10, 9], ['imam', 10_000, 11_000]]);
});

test('vergi fonksiyonları belediye oranını kullanır (önbellek / açık set)', () => {
  const r = { ...DEFAULT_RATES, isKafe: 12, ikSilah: 3, mkKripto: 8, fisci: 15, f2: 11 };
  assert.equal(bizTax(1000, 'cafe', r), 120);
  assert.equal(bizTax(1000, 'bar', r), 100);
  assert.equal(resaleTax(1000, 'weapon', r), 30);
  assert.equal(resaleTax(1000, 'vehicle', r), 10);
  assert.equal(machineTax(10_000, 'mining', r), 800);
  assert.deepEqual(splitSalaryTax(1000, 'isci', r), { gross: 1000, tax: 150, net: 850 });
  assert.equal(factoryTax(500_000, r), 55_000);
  assert.equal(factoryRateFrac(r, 99_999), 0.01);
  assert.equal(resaleRateFrac(r, 'machine'), 0.01);
  assert.equal(bizRateFrac(r, 'bilinmeyen'), 0.1);
  assert.equal(policeSalary(r, 'uzman'), 15_000);
  assert.equal(seatSalary(r, 'kul'), 30_000);
  // önbellek: gün anahtarına göre çözülür
  setRatesCache({ byDay: { '2026-10-20': { ...DEFAULT_RATES, sosyal: 13 } } }, { next: { ...DEFAULT_RATES, sosyal: 14 }, nextDay: '2026-10-25' }, '2026-10-24');
  assert.equal(ratesFor('2026-10-19').sosyal, 10);
  assert.equal(ratesFor('2026-10-24').sosyal, 13);
  assert.equal(ratesFor('2026-10-25').sosyal, 14, 'bekleyen set yarından itibaren');
  setRatesCache({}, null);
});

test('ayar: bakan kendi bakanlığını değiştirir (yarın geçerli), diğerine dokunamaz; kadro maaşı sadece başkan', async () => {
  const w = world();
  await seatAll(w);
  await w.act('veli', 'setRate', { id: 'f2', value: 11 });
  let e = await w.fails('veli', 'setRate', { id: 'isKafe', value: 11 });
  assert.equal(e.code, 'permission-denied');
  e = await w.fails('veli', 'setRate', { id: 'f2', value: 12 });
  assert.match(e.message, /en fazla/);
  await w.act('veli', 'setRate', { id: 'f2', value: 9 }); // gün içinde fikrini değiştirebilir
  e = await w.fails('ali', 'setRate', { id: 'f2', value: 10 });
  assert.equal(e.code, 'permission-denied', 'yardımcının yetkisi yok');
  await w.act('admin', 'setPerms', { seat: 'yrd1', perms: { sanayi: true } });
  await w.act('ali', 'setRate', { id: 'f2', value: 11 });
  e = await w.fails('ali', 'setRate', { id: 'bakan', value: 31_000 });
  assert.match(e.message, /sadece belediye başkanı/);
  await w.act('admin', 'setRate', { id: 'bakan', value: 31_000 });
  // bugün hâlâ eski oran
  assert.equal(resolveRates(w.G('belediye/rates'), '2026-10-24', w.G('belediye/pending')).f2, 10);
  assert.equal(resolveRates(w.G('belediye/rates'), '2026-10-25', w.G('belediye/pending')).f2, 11);
  const p = await w.act('veli', 'panel');
  assert.equal(p.cur.f2, 10);
  assert.equal(p.next.f2, 11);
  assert.equal(p.nextBy.f2.name, 'ALI');
  // gün sonu kilidi
  w.clock.now = ms('2026-10-24', '23:59') + 45_000;
  e = await w.fails('veli', 'setRate', { id: 'f2', value: 10 });
  assert.match(e.message, /Gün bitmek üzere/);
});

test('00:00: ayarlar yürürlüğe girer, Sixtagram\'da duyurulur, sonraki gün sabit kalır; değişiklik yoksa paylaşım yok', async () => {
  const w = world();
  await seatAll(w);
  await w.act('veli', 'setRate', { id: 'mkKripto', value: 6 });
  await w.act('ayse', 'setRate', { id: 'piyango', value: 9 });
  w.clock.now = ms('2026-10-25', '00:00');
  const r = await w.bel.nightlyRoll('2026-10-25');
  assert.equal(r.changes.length, 2);
  assert.equal(w.posts.length, 1);
  assert.match(w.posts[0], /Kripto \(Mining\) Makinesi: %5 → %6/);
  assert.match(w.posts[0], /Piyango Kazancı: %10 → %9/);
  const pub = w.G('belediye/public');
  assert.equal(pub.changesDay, '2026-10-25');
  assert.equal(pub.changes.find((c) => c.id === 'piyango').by, 'AYSE');
  assert.equal(w.G('belediye/rates').byDay['2026-10-25'].mkKripto, 6);
  assert.equal(resolveRates(w.G('belediye/rates'), '2026-10-24').mkKripto, 5, 'dünün oranı korunur (gece tahsilatı için)');
  await w.bel.nightlyRoll('2026-10-25');
  assert.equal(w.posts.length, 1, 'tekrar çalışınca yeniden paylaşmaz');
  w.clock.now = ms('2026-10-26', '00:00');
  await w.bel.nightlyRoll('2026-10-26');
  assert.equal(w.posts.length, 1, 'değişiklik yoksa paylaşım yok');
  assert.deepEqual(w.G('belediye/public').changes, []);
});

test('davet: arkadaş şartı, koltuk başına tek davet, 24 saatte düşer, polis/imam önce istifa eder', async () => {
  const w = world();
  await w.act('admin', 'claimMayor');
  let e = await w.fails('admin', 'invite', { seat: 'san', targetUid: 'imamx' });
  assert.match(e.message, /arkadaş/);
  await w.act('admin', 'invite', { seat: 'san', targetUid: 'veli' });
  assert.ok(w.sms('veli').some((t) => /Belediye başkanı seni Sanayi Bakanlığı görevine davet ediyor\. Maaş 30\.000 altın\. Kabul etmek için belediyeye uğra\./.test(t)));
  assert.equal(w.G('users/veli').belediyeInvite.seat, 'san');
  e = await w.fails('admin', 'invite', { seat: 'san', targetUid: 'ayse' });
  assert.match(e.message, /zaten cevap bekleyen/);
  e = await w.fails('admin', 'invite', { seat: 'tic', targetUid: 'veli' });
  assert.match(e.message, /başka bir belediye daveti/);
  // polis davetli kabul edemez
  await w.act('admin', 'invite', { seat: 'guv', targetUid: 'polis1' });
  w.membership.polis1 = { intelRosterId: 'r1', intelRank: 'muhbir' };
  e = await w.fails('polis1', 'respondInvite', { accept: true });
  assert.match(e.message, /Polisler belediyede görev alamaz/);
  // 24 saat sonra düşer
  w.clock.now += 24 * 3600_000 + 1;
  const r = await w.act('veli', 'respondInvite', { accept: true });
  assert.equal(r.expired, true);
  assert.equal(w.G('users/veli').belediyeInvite, undefined);
  await w.act('admin', 'invite', { seat: 'san', targetUid: 'veli' }); // koltuk yeniden davet edilebilir
  await w.act('veli', 'respondInvite', { accept: true });
  assert.equal(w.G('belediye/main').seats.san.uid, 'veli');
  assert.equal(w.G('users/veli').belediyeSeat, 'san');
  assert.ok(w.G('belediyeStaff/veli'));
  await w.bel.nightly('2026-10-26', { step: 'report', extra: {} });
  assert.ok(!w.G('belediye/main').invites.guv, 'gece temizliği düşen daveti kaldırır');
});

test('yetkiler: başkan herkesi atar (24 saat sonra, gerekçeyle); yardımcı izinle sadece bakan atar/davet eder', async () => {
  const w = world();
  await seatAll(w);
  let e = await w.fails('admin', 'fire', { seat: 'san', reason: 'görev ihmali' });
  assert.match(e.message, /saat daha görevden alınamaz/);
  w.clock.now += 24 * 3600_000 + 1;
  e = await w.fails('admin', 'fire', { seat: 'san', reason: '' });
  assert.match(e.message, /nedenini/);
  e = await w.fails('ali', 'fire', { seat: 'san', reason: 'neden' });
  assert.equal(e.code, 'permission-denied');
  e = await w.fails('ali', 'invite', { seat: 'kul', targetUid: 'can' });
  assert.equal(e.code, 'permission-denied');
  await w.act('admin', 'setPerms', { seat: 'yrd1', perms: { fire: true, invite: true } });
  await w.act('ali', 'invite', { seat: 'kul', targetUid: 'can' });
  assert.ok(w.sms('can').some((t) => /başkan yardımcısı ALI seni Kültür ve Spor Bakanlığı/.test(t)));
  e = await w.fails('ali', 'invite', { seat: 'yrd2', targetUid: 'fatma' });
  assert.match(e.message, /sadece belediye başkanı/);
  await w.act('ali', 'fire', { seat: 'san', reason: 'görev ihmali' });
  assert.equal(w.G('belediye/main').seats.san, null);
  assert.equal(w.G('users/veli').belediyeSeat, undefined);
  assert.ok(w.sms('veli').some((t) => /Neden: görev ihmali/.test(t)));
  e = await w.fails('ayse', 'fire', { seat: 'yrd1', reason: 'xxx' });
  assert.equal(e.code, 'permission-denied', 'bakan kimseyi atamaz');
  e = await w.fails('ali', 'fire', { seat: 'bsk', reason: 'xxx' });
  assert.equal(e.code, 'permission-denied');
  assert.equal(canMinistry({ seats: { yrd1: { perms: { kultur: true } } } }, 'yrd1', 'kultur'), true);
  assert.equal(canMinistry({}, 'san', 'ticaret'), false);
  assert.equal(canFireSeat({ seats: { yrd2: { perms: { fire: true } } } }, 'yrd2', 'yrd1'), false, 'yardımcı yardımcıyı atamaz');
  assert.equal(canInviteSeat({}, 'bsk', 'yrd2'), true);
});

test('imam: Kültür yetkisiyle gerekçeli azil, ilk 24 saat korunur', async () => {
  const w = world();
  await seatAll(w);
  const { Timestamp } = await import('../gang/test/fakeFirestore.js');
  w.S('imamState/current', { uid: 'imamx', displayName: 'IMAMX', becameImamAt: new Timestamp(w.clock.now - 3600_000), lastNasihat: 'Sabır.' });
  w.S('users/imamx', { displayName: 'IMAMX', isImam: true, gold: 0 });
  let e = await w.fails('veli', 'fireImam', { reason: 'nasihat yok' });
  assert.equal(e.code, 'permission-denied');
  e = await w.fails('admin', 'fireImam', { reason: 'nasihat yok' });
  assert.match(e.message, /yeni başladı/);
  w.clock.now += 24 * 3600_000;
  await w.act('admin', 'fireImam', { reason: 'nasihatlere özen yok' });
  assert.equal(w.G('imamState/current'), undefined);
  assert.equal(w.G('users/imamx').isImam, false);
  assert.ok(w.G('users/imamx').imamCooldownUntilMs > w.clock.now);
  assert.ok(w.sms('imamx').some((t) => /Neden: nasihatlere özen yok/.test(t)));
});

test('kasa: soygun ödemesi kasa yeterse öder, yetmezse TAMAMI borç (kasa değişmez); faiz %1; parça ödeme', async () => {
  const w = world();
  await w.income(400_000);
  let r = await w.bel.spendOrDebt({ cat: 'soygun_odeme', amount: 500_000, note: 'banka' });
  assert.equal(r.paid, false);
  let st = await w.bel.kasa.status();
  assert.equal(st.spendable, 400_000, '400.000 kasada kalır');
  assert.equal(st.other.soygun, 500_000, '500.000 borç');
  r = await w.bel.spendOrDebt({ cat: 'soygun_odeme', amount: 100_000 });
  assert.equal(r.paid, true);
  st = await w.bel.kasa.status();
  assert.equal(st.spendable, 300_000);
  await w.bel.kasa.applyInterest('2026-10-25');
  await w.bel.kasa.applyInterest('2026-10-25');
  st = await w.bel.kasa.status();
  assert.equal(st.other.soygun, 505_000, 'günde bir kez %1');
  await seatAll(w);
  let e = await w.fails('veli', 'payOther', { amount: 1000 });
  assert.equal(e.code, 'permission-denied', 'bakan borç ödeyemez');
  e = await w.fails('ali', 'payOther', { amount: 400_000 });
  assert.match(e.message, /Kasada yeterli para yok/);
  await w.act('ali', 'payOther', { amount: 200_000 }); // yardımcı her zaman öder
  st = await w.bel.kasa.status();
  assert.equal(st.other.soygun, 305_000);
  assert.equal(st.spendable, 100_000);
});

test('kasa: güncellemede eksi bakiye 0\'a çekilir, eksi kısım faizsiz borç olur', async () => {
  const w = world();
  const b = w.db.batch();
  stateWrite(b, w.db, FieldValue, { kind: 'in', cat: 'soygun_ceza', amount: 100, atMs: w.clock.now });
  stateWrite(b, w.db, FieldValue, { kind: 'out', cat: 'soygun_odeme', amount: 1100, atMs: w.clock.now, shard: 3 });
  await b.commit();
  await w.bel.kasa.fold();
  const st = await w.bel.kasa.status();
  assert.equal(st.spendable, 0);
  assert.equal(st.other.eski, 1000);
  await w.bel.kasa.applyInterest('2026-10-25');
  assert.equal((await w.bel.kasa.status()).other.eski, 1000, 'eski açığa faiz yok');
  assert.equal(spendableOf({ outCum: 50, reserved: 10 }, { balance: 100, outCumAt: 30 }), 70);
});

async function nightPayroll(w, day, police = []) {
  w.clock.now = ms(day, '00:01');
  await w.bel.setPolicePayroll(day, { worldId: 'w', payees: police, bribe: { total: police.reduce((a, p) => a + p.bribe, 0), policeCount: police.length } });
  await w.bel.snapshotStaffAndImam(day);
  w.S('gangSystem/config', { liveOpen: true, liveWorldId: 'w' });
  return w.bel.tryRunPayroll(day);
}

test('gece maaşları: kasa yetmezse polis + imam + kadronun HİÇBİRİ ödenmez (borç), rüşvet yine yatar; sonra en yeni günden kapanır', async () => {
  const w = world('2026-10-24', '10:00');
  await seatAll(w); // başkan 50.000 + yardımcı 40.000 + 2 bakan 30.000 = 150.000
  const police = [{ uid: 'polis1', rid: 'r1', rank: 'muhbir', salary: 5000, bribe: 700 }];
  // gece 1: kasa 100.000 → 155.000 maaş ödenemez
  await w.income(100_000);
  let r = await nightPayroll(w, '2026-10-25', police);
  assert.equal(r.status, 'unpaid');
  assert.equal(w.G('users/veli').gold, 1_000_000, 'bakan maaş almadı');
  assert.equal(w.G('users/polis1').gold, 1_000_700, 'rüşvet yattı');
  assert.ok(w.sms('veli').some((t) => /ödenemedi/.test(t)));
  const d1 = w.G('belediyeDebts/2026-10-25');
  assert.equal(d1.total, 155_000);
  assert.equal(d1.status, 'open');
  assert.equal((await w.bel.kasa.status()).spendable, 100_000, 'kasa olduğu gibi kaldı');
  // gece 2: hâlâ yetmiyor (150.000 + 5.000)
  r = await nightPayroll(w, '2026-10-26', police);
  assert.equal(r.status, 'unpaid');
  // gün içinde borcun bir kısmı kapatılamaz: tamamı ya da hiç
  w.clock.now = ms('2026-10-26', '12:00');
  let e = await w.fails('admin', 'payDebt', { debtId: '2026-10-25' });
  assert.match(e.message, /Kasada yeterli para yok/);
  // gelir girer: 100.000 + 400.000 = 500.000
  await w.income(400_000);
  w.clock.now += 60_000;
  await w.act('admin', 'payDebt', { debtId: '2026-10-25' }); // başkan bir günün tamamını kapatır
  assert.equal(w.G('belediyeDebts/2026-10-25').status, 'paid');
  assert.equal(w.G('users/veli').gold, 1_030_000, 'eski maaş işi bırakmış olsa da yatar');
  assert.equal((await w.bel.kasa.status()).spendable, 345_000);
  // gece 3: bugünün 155.000'i ödenir, sonra 26'nın borcu (155.000) da yeter → kasa 35.000
  r = await nightPayroll(w, '2026-10-27', police);
  assert.equal(r.status, 'paying');
  assert.deepEqual(r.paidOld, ['2026-10-26']);
  assert.equal((await w.bel.kasa.status()).spendable, 35_000);
  assert.equal(w.G('users/polis1').gold, 1_000_000 + 3 * 700 + 3 * 5000, '3 gecenin rüşveti + 3 günün maaşı (25 elle, 26 gece, 27 bugün)');
  assert.ok(w.sms('admin').some((t) => /Belediye maaşın yattı: 50\.000 altın/.test(t)));
  // tekrar çalışınca çift ödeme yok
  await w.bel.tryRunPayroll('2026-10-27');
  assert.equal((await w.bel.kasa.status()).spendable, 35_000);
});

test('gece maaşları: en yeni günden başlar, yetmeyende durur', async () => {
  const w = world('2026-10-24', '10:00');
  await w.act('admin', 'claimMayor'); // 50.000/gece
  await nightPayroll(w, '2026-10-25'); // kasa 0 → borç
  w.clock.now = ms('2026-10-25', '12:00');
  w.S('belediye/main', { ...w.G('belediye/main') });
  await nightPayroll(w, '2026-10-26'); // borç
  await w.income(140_000);
  const r = await nightPayroll(w, '2026-10-27'); // bugün 50 + 26'nın 50'si → kalan 40 < 50
  assert.equal(r.status, 'paying');
  assert.deepEqual(r.paidOld, ['2026-10-26']);
  assert.equal(w.G('belediyeDebts/2026-10-25').status, 'open');
  assert.equal((await w.bel.kasa.status()).spendable, 40_000);
});

test('bağış: en az 100, günün ilk 3\'ü; devlet defterine bağış geliri', async () => {
  const w = world();
  let e = await w.fails('ali', 'donate', { amount: 50 });
  assert.match(e.message, /En az/);
  await w.act('ali', 'donate', { amount: 5000 });
  await w.act('veli', 'donate', { amount: 2000 });
  await w.act('ayse', 'donate', { amount: 9000 });
  await w.act('can', 'donate', { amount: 100 });
  await w.act('veli', 'donate', { amount: 4000 });
  const d = w.G('belediyeDonations/2026-10-24');
  assert.deepEqual(d.top.map((x) => [x.name, x.amount]), [['AYSE', 9000], ['VELI', 6000], ['ALI', 5000]]);
  assert.equal(d.total, 20_100);
  assert.equal(w.G('users/ali').gold, 995_000);
  assert.equal((await w.bel.kasa.fold()).today.in.bagis, 20_100);
});

test('rapor: devlet defteri günü bakanlıklara bölünür', async () => {
  const rep = ministryReport({
    in: { vergi_fabrika: 1000, vergi_makine: 100, vergi_isl_cafe: 50, vergi_piyango: 20, soygun_ceza: 500, vergi_yayin: 30, vergi_maasMenajer: 5, bagis: 70, gazino_slot: 10 },
    out: { maas_polis: 300, soygun_polis_payi: 100, maas_imam: 40, maas_belediye: 200, borc_maas: 60 },
  });
  assert.equal(rep.ministries.sanayi.in, 1100);
  assert.equal(rep.ministries.ticaret.in, 80);
  assert.equal(rep.ministries.guvenlik.in, 500);
  assert.equal(rep.ministries.guvenlik.out, 400);
  assert.equal(rep.ministries.kultur.in, 35);
  assert.equal(rep.ministries.kultur.out, 40);
  assert.equal(rep.ministries.yonetim.in, 70);
  assert.equal(rep.ministries.yonetim.out, 260);
  assert.equal(rep.net, rep.inTotal - rep.outTotal);
});

test('gece raporu: kapanmış gün + analiz tek belgede (belediye/public)', async () => {
  const w = world('2026-10-24', '12:00');
  await w.income(1000);
  w.S('belediyeAnalysis/2026-10-24', { factories: { count: 1, top: [{ name: 'F', gross: 10, ratePct: 1, tax: 1 }] } });
  w.clock.now = ms('2026-10-25', '00:02');
  await closeStateDays(w.db, FieldValue, { todayKey: '2026-10-25' });
  await w.bel.nightly('2026-10-25', { step: 'report', extra: { bizCounts: { cafe: 3 } } });
  const pub = w.G('belediye/public');
  assert.equal(pub.reportDay, '2026-10-24');
  assert.equal(pub.report.ministries.sanayi.in, 1000);
  assert.equal(pub.report.analysis.factories.count, 1);
  assert.equal(pub.report.analysis.bizCounts.cafe, 3);
});

test('kaynak: polis maaşları canlıda belediyeden, operasyon kasa yetmezse başlamaz, belediye görevlisi polis/imam olamaz', () => {
  const roles = fs.readFileSync(new URL('../gang/actions/roles.js', import.meta.url), 'utf8');
  assert.ok(roles.includes('if (!ctx.isTest && belediye) return snapshotPolicePayroll(ctx, safe, belediye);'));
  for (const f of ['../gang/actions/wars.js', '../gang/actions/intel.js']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(src.includes('Belediyenin kasası boş olduğu için operasyon başlatılamadı'), f);
  }
  const intel = fs.readFileSync(new URL('../gang/actions/intel.js', import.meta.url), 'utf8');
  assert.ok(intel.includes('if (wallet.belediyeSeat)'));
  const idx = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.ok(idx.includes("if (user.belediyeSeat) throw new HttpsError('failed-precondition', 'Belediye görevlileri imam olamaz."));
  assert.ok(!idx.includes("stateWrite(tx, db, admin.firestore.FieldValue, { kind: 'out', cat: 'maas_imam'"), 'imam maaşı artık belediye bordrosunda');
  assert.ok(idx.includes('await loadRates(db);'), 'her çağrıda günün oranları');
});
