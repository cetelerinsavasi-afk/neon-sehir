// v136 — SEÇİM: imza dönemi (Cuma), seçim (Pazar 00–21), sayım (21–24, sırayla),
// sonuç + devir (Pazartesi 00:00), sonuç ekranı (Salı 00:00'a kadar).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createBelediye } from '../belediye.js';
import { createPolitics } from '../politics.js';
import { resolveRates } from '../belediyeRates.js';
import { POLITICS, cycleTimes, phaseAt, revealAtMs, termSignupDay, fridayAfter, fridayOnOrAfter, splitCandidates } from '../politicsRules.js';
import { politicsNews } from '../politicsGazete.js';
import { coupVotePassed, coupWon } from '../politicsCoup.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const ms = (day, hhmm = '12:00') => Date.parse(`${day}T${hhmm}:00+03:00`);

function world({ start = ms('2026-10-29', '12:00'), rnd = () => 0 } = {}) {
  const clock = { now: start };
  const db = new FakeFirestore({ clock: () => clock.now, yieldEvery: false });
  const resigned = [];
  const removed = [];
  const bel = createBelediye({
    db,
    FieldValue,
    HttpsError,
    requireAuth: () => null,
    onCall: null,
    splitIncomeForDebt: (_d, a) => ({ goldDelta: a, debtDelta: 0 }),
    goldTag: (s) => s,
    isAdmin: async (uid) => uid === 'admin',
    liveMembership: async () => null,
    rates: { loadRates: async () => {}, ratesFor: (d) => resolveRates(null, d) },
    now: () => clock.now,
  });
  const pol = createPolitics({
    db,
    FieldValue,
    HttpsError,
    requireAuth: () => null,
    onCall: null,
    belediye: bel,
    resignPolice: async (uid) => {
      resigned.push(uid);
      const u = db._get(`users/${uid}`);
      if (u?.profession !== 'polis') return { notMember: true };
      db._store.set(`users/${uid}`, { data: { ...u, profession: null }, version: 9 });
      return { left: true };
    },
    removePolice: async (uid, opts) => {
      removed.push([uid, opts]);
      return { removed: true };
    },
    liveWorldId: async () => 'w',
    now: () => clock.now,
    rnd,
  });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._get(p);
  const act = (uid, op, data = {}) => pol.handle(uid, { op, ...data });
  const fails = async (uid, op, data = {}) => {
    try {
      await act(uid, op, data);
    } catch (e) {
      return e;
    }
    throw new Error(`${op} başarısız olmalıydı`);
  };
  const at = (day, hhmm) => {
    clock.now = ms(day, hhmm);
  };
  const night = async (day) => {
    at(day, '00:02');
    await bel.nightly(day, { step: 'payrollSnapshot' });
    return pol.nightly(day);
  };
  const sms = (uid) => Object.values(db._dump(`users/${uid}/messages/`)).map((v) => v.text);
  const player = (uid, extra = {}) => S(`users/${uid}`, { displayName: uid.toUpperCase(), gold: 1_000_000, onboardingRewardClaimed: true, ...extra });
  for (const u of ['admin', 'ali', 'veli', 'ayse', 'can']) player(u);
  for (let i = 0; i < 25; i += 1) player(`v${i}`);
  return { db, bel, pol, clock, S, G, act, fails, at, night, sms, player, resigned, removed };
}

async function adminGov(w) {
  await w.bel.handle('admin', { op: 'claimMayor' });
  w.S('friendships/admin', { friends: { ayse: {} } });
  await w.bel.handle('admin', { op: 'invite', seat: 'san', targetUid: 'ayse' });
  await w.bel.handle('ayse', { op: 'respondInvite', accept: true });
}
const signers = (from, n) => Array.from({ length: n }, (_, i) => `v${from + i}`);

// -----------------------------------------------------------------------------
test('takvim: Cuma imza → Pazar seçim → 21:00 sayım → Pazartesi sonuç → Salı kapanış; 21 gün + sonraki ilk Cuma', () => {
  const t = cycleTimes('2026-10-30');
  assert.equal(t.signupStart, ms('2026-10-30', '00:00'));
  assert.equal(t.signupEnd, ms('2026-11-01', '00:00'));
  assert.equal(t.voteEnd, ms('2026-11-01', '21:00'));
  assert.equal(t.countEnd, ms('2026-11-02', '00:00'));
  assert.equal(t.resultsEnd, ms('2026-11-03', '00:00'));
  assert.equal(phaseAt('2026-10-30', ms('2026-10-29', '23:59')), 'idle');
  assert.equal(phaseAt('2026-10-30', ms('2026-10-31', '12:00')), 'signup');
  assert.equal(phaseAt('2026-10-30', ms('2026-11-01', '20:59')), 'election');
  assert.equal(phaseAt('2026-10-30', ms('2026-11-01', '23:00')), 'counting');
  assert.equal(phaseAt('2026-10-30', ms('2026-11-02', '10:00')), 'results');
  assert.equal(phaseAt('2026-10-30', ms('2026-11-03', '00:00')), 'idle');
  // 21 saatin oyları 3 saate sırayla: 00:00 → 21:00, 07:00 → 22:00, 20:59 → ~23:59
  assert.equal(revealAtMs('2026-10-30', ms('2026-11-01', '00:00')), ms('2026-11-01', '21:00'));
  assert.equal(revealAtMs('2026-10-30', ms('2026-11-01', '07:00')), ms('2026-11-01', '22:00'));
  assert.ok(revealAtMs('2026-10-30', ms('2026-11-01', '20:59')) < ms('2026-11-02', '00:00'));
  // Pazartesi 02.11 göreve → 21 gün → ilk Cuma 27.11 (Pazartesi 30.11 yeni başkan = 28 gün)
  assert.equal(termSignupDay('2026-11-02'), '2026-11-27');
  // darbeyle Perşembe gelen: 21 gün dolduktan sonraki ilk Cuma
  assert.equal(termSignupDay('2026-11-05'), '2026-11-27');
  assert.equal(fridayAfter('2026-11-01'), '2026-11-06');
  assert.equal(fridayAfter('2026-11-06'), '2026-11-13');
  assert.equal(fridayOnOrAfter('2026-11-06'), '2026-11-06');
});

test('tam seçim: başvuru 500k kasaya, imzalar herkese açık, 10 imza alta (en hızlı önde), gizli oy, sırayla sayım, Pazartesi devir', async () => {
  const w = world();
  await adminGov(w);
  // Perşembe: henüz dönem yok
  assert.match((await w.fails('ali', 'apply')).message, /adaylık/);
  await w.night('2026-10-30'); // Cuma 00:00
  const st = w.G('politics/state');
  assert.equal(st.phase, 'signup');
  assert.equal(st.cycle, '2026-10-30');
  assert.equal(st.gov.uid, 'admin', 'mevcut yönetici hükümeti');
  w.at('2026-10-30', '09:00');
  await w.act('ali', 'apply', { text: 'Vergileri düşüreceğim.\nSöz.' });
  await w.act('veli', 'apply');
  await w.act('can', 'apply');
  assert.equal(w.G('users/ali').gold, 500_000);
  assert.equal(w.G('users/ali').pol.cand, true);
  const led = Object.values(w.db._dump('stateLedger/')).reduce((a, d) => a + Number(d.in?.adaylik || 0), 0);
  assert.equal(led, 3 * POLITICS.FEE, 'ücretler belediye kasasına');
  assert.match((await w.fails('ali', 'apply')).message, /Zaten aday/);
  assert.match((await w.fails('ali', 'sign', { cand: 'veli' })).message, /Adaysın/);
  // imzalar: veli 10'a önce, ali sonra; can 3'te kalır
  w.at('2026-10-30', '10:00');
  for (const u of signers(0, 10)) await w.act(u, 'sign', { cand: 'veli' });
  assert.ok(w.G('politicsCycles/2026-10-30').cands.veli.fullAtMs);
  assert.match((await w.fails('v10', 'sign', { cand: 'veli' })).message, /10 imzayı topladı/);
  w.at('2026-10-31', '15:00');
  for (const u of signers(10, 10)) await w.act(u, 'sign', { cand: 'ali' });
  for (const u of signers(20, 3)) await w.act(u, 'sign', { cand: 'can' });
  assert.match((await w.fails('v0', 'sign', { cand: 'ali' })).message, /zaten verdin/);
  assert.match((await w.fails('v0', 'apply')).message, /imza verdin/);
  assert.equal(w.G('users/v0').pol.sign, 'veli');
  const { full, pending } = splitCandidates(w.G('politicsCycles/2026-10-30').cands);
  assert.deepEqual(full.map((c) => c.uid), ['veli', 'ali'], 'en hızlı 10 imza önde');
  assert.deepEqual(pending.map((c) => c.uid), ['can']);
  // yazı: aday değiştirebilir, aday olmayan yazamaz
  await w.act('ali', 'setText', { text: 'Yeni vaat' });
  assert.equal(w.G('politicsCycles/2026-10-30').cands.ali.text, 'Yeni vaat');
  await w.fails('v1', 'setText', { text: 'x' });
  // Pazar 00:00 — gece işi gelmeden oy yok
  w.at('2026-11-01', '00:00');
  assert.match((await w.fails('v0', 'vote', { cand: 'ali' })).message, /güncelleniyor/);
  await w.night('2026-11-01');
  assert.equal(w.G('politics/state').phase, 'election');
  assert.deepEqual(w.G('politicsCycles/2026-11-01'), undefined);
  assert.deepEqual(w.G('politicsCycles/2026-10-30').finalists, ['veli', 'ali']);
  assert.ok(w.sms('can').some((t) => /10 imza toplayamadın/.test(t)));
  await w.fails('v0', 'vote', { cand: 'can' }); // sandıkta değil
  // oylar: sabah veli (3), akşam ali (5) → sayımın başında veli önde
  w.at('2026-11-01', '01:00');
  for (const u of ['v0', 'v1', 'v2']) await w.act(u, 'vote', { cand: 'veli' });
  w.at('2026-11-01', '19:00');
  for (const u of ['v3', 'v4', 'v5', 'v6', 'ali']) await w.act(u, 'vote', { cand: 'ali' });
  assert.match((await w.fails('v0', 'vote', { cand: 'ali' })).message, /zaten kullandın/);
  assert.equal(w.G('users/v0').pol.voted, true);
  assert.equal(w.G('politicsCycles/2026-10-30/live/count'), undefined, 'oylar 21:00a kadar görünmez');
  w.at('2026-11-01', '20:59');
  await w.pol.clock();
  assert.equal(w.G('politics/state').phase, 'election');
  // 21:00 sayım
  w.at('2026-11-01', '21:00');
  await w.fails('v7', 'vote', { cand: 'ali' });
  await w.pol.clock();
  assert.equal(w.G('politics/state').phase, 'counting');
  w.at('2026-11-01', '21:20');
  await w.pol.clock();
  let cnt = w.G('politicsCycles/2026-10-30/live/count');
  assert.deepEqual(cnt.counts, { veli: 3, ali: 0 }, 'sabahki oylar önce açıklanır');
  w.at('2026-11-01', '23:50');
  await w.pol.clock();
  cnt = w.G('politicsCycles/2026-10-30/live/count');
  assert.deepEqual(cnt.counts, { veli: 3, ali: 5 });
  assert.equal(cnt.done, false);
  // aday yazısı Pazartesiye kadar değişir
  await w.act('ali', 'setText', { text: 'Teşekkürler' });
  // Pazartesi 00:00 — sonuç + devir
  await w.night('2026-11-02');
  const st2 = w.G('politics/state');
  assert.equal(st2.phase, 'results');
  assert.equal(st2.gov.uid, 'ali');
  assert.equal(st2.gov.since, '2026-11-02');
  assert.equal(st2.nextSignupDay, '2026-11-27');
  assert.equal(st2.coupFreeFromMs, ms('2026-11-09', '00:00'));
  assert.equal(st2.last.outcome, 'won');
  assert.equal(st2.last.votes, 5);
  const main = w.G('belediye/main');
  assert.equal(main.seats.bsk.uid, 'ali');
  assert.equal(main.seats.san, null, 'eski kadro görevden alındı');
  assert.equal(w.G('users/ayse').belediyeSeat, undefined);
  assert.equal(w.G('users/admin').belediyeSeat, undefined);
  assert.equal(w.G('users/ali').belediyeSeat, 'bsk');
  assert.equal(w.G('belediyeStaff/admin'), undefined);
  assert.ok(w.sms('ali').some((t) => /Belediye Başkanı seçildin/.test(t)));
  assert.ok(w.sms('veli').some((t) => /Seçimi ALI kazandı/.test(t)));
  assert.ok(w.sms('ayse').some((t) => /görevin sona erdi/.test(t)));
  // eski kadro biten günün (Pazar) maaş listesinde
  const pr = w.G('belediyePayroll/2026-11-02');
  assert.deepEqual(pr.staff.payees.map((p) => p.uid).sort(), ['admin', 'ayse']);
  assert.equal(w.G('politicsCycles/2026-10-30/live/count').done, true);
  // tekrar çalıştırma etkisiz
  await w.night('2026-11-02');
  assert.equal(w.G('belediye/main').seats.bsk.uid, 'ali');
  // Salı: sonuç ekranı kalkar
  await w.night('2026-11-03');
  assert.equal(w.G('politics/state').phase, 'idle');
  // ara Cumalarda imza yok; 27.11'de var
  for (const d of ['2026-11-06', '2026-11-13', '2026-11-20']) {
    await w.night(d);
    assert.equal(w.G('politics/state').phase, 'idle');
  }
  await w.night('2026-11-27');
  assert.equal(w.G('politics/state').phase, 'signup');
  assert.equal(w.G('politics/state').cycle, '2026-11-27');
  assert.equal(w.G('users/v0').pol.c, '2026-10-30', 'eski döngü bayrağı yeni döngüde sayılmaz');
  w.at('2026-11-27', '10:00');
  await w.act('v0', 'apply');
  assert.deepEqual(w.G('users/v0').pol, { c: '2026-11-27', cand: true, sign: null, voted: false, vote: null });
});

test('seçim olmazsa: başvuru yok → ekip devam, haftaya Cuma; kimse 10 imza toplayamadı → aynısı (ücret iade yok)', async () => {
  const w = world();
  await adminGov(w);
  await w.night('2026-10-30');
  await w.night('2026-10-31');
  await w.night('2026-11-01');
  let st = w.G('politics/state');
  assert.equal(st.phase, 'idle');
  assert.equal(st.last.outcome, 'noApplicants');
  assert.equal(st.nextSignupDay, '2026-11-06');
  assert.equal(st.gov.uid, 'admin');
  assert.equal(w.G('belediye/main').seats.bsk.uid, 'admin');
  assert.equal(w.G('politicsCycles/2026-10-30').status, 'failed');
  await w.night('2026-11-02');
  assert.equal(w.G('belediye/main').seats.san.uid, 'ayse', 'ekip devam ediyor');
  await w.night('2026-11-06');
  st = w.G('politics/state');
  assert.equal(st.phase, 'signup');
  w.at('2026-11-06', '10:00');
  await w.act('ali', 'apply');
  for (const u of signers(0, 9)) await w.act(u, 'sign', { cand: 'ali' });
  await w.night('2026-11-08');
  st = w.G('politics/state');
  assert.equal(st.last.outcome, 'noQualified');
  assert.equal(st.nextSignupDay, '2026-11-13');
  assert.equal(w.G('users/ali').gold, 500_000, 'ücret iade edilmez');
});

test('katılım şartı: başlangıç görevleri bitmemiş oyuncu imza / aday / oy veremez; altın yetmezse aday olunmaz', async () => {
  const w = world();
  await adminGov(w);
  w.player('yeni', { onboardingRewardClaimed: false });
  w.player('fakir', { gold: 499_999 });
  await w.night('2026-10-30');
  w.at('2026-10-30', '10:00');
  assert.match((await w.fails('yeni', 'apply')).message, /başlangıç görevlerini/);
  await w.act('ali', 'apply');
  assert.match((await w.fails('yeni', 'sign', { cand: 'ali' })).message, /başlangıç görevlerini/);
  assert.match((await w.fails('fakir', 'apply')).message, /500\.000/);
  assert.match((await w.fails('v0', 'sign', { cand: 'v0' })).message, /Kendine/);
  for (const u of signers(0, 10)) await w.act(u, 'sign', { cand: 'ali' });
  await w.night('2026-11-01');
  w.at('2026-11-01', '10:00');
  assert.match((await w.fails('yeni', 'vote', { cand: 'ali' })).message, /başlangıç görevlerini/);
  assert.equal(w.G('politicsBallots/2026-10-30_yeni'), undefined);
});

test('eşitlik kurayla; kura tekrar çalıştırmada değişmez; polis kazanırsa polisliği, imam kazanırsa imamlığı biter', async () => {
  const w = world({ rnd: (n) => n - 1 }); // son eşit aday
  await adminGov(w);
  w.player('pol', { profession: 'polis' });
  w.player('imm', { isImam: true });
  w.S('imamState/current', { uid: 'imm', displayName: 'IMM' });
  await w.night('2026-10-30');
  w.at('2026-10-30', '10:00');
  await w.act('pol', 'apply');
  await w.act('imm', 'apply');
  for (const u of signers(0, 10)) await w.act(u, 'sign', { cand: 'pol' });
  w.at('2026-10-30', '11:00');
  for (const u of signers(10, 10)) await w.act(u, 'sign', { cand: 'imm' });
  await w.night('2026-11-01');
  assert.deepEqual(w.G('politicsCycles/2026-10-30').finalists, ['pol', 'imm']);
  w.at('2026-11-01', '12:00');
  await w.act('v0', 'vote', { cand: 'pol' });
  await w.act('v1', 'vote', { cand: 'imm' });
  await w.night('2026-11-02');
  const st = w.G('politics/state');
  assert.equal(st.last.tie, true);
  assert.equal(st.gov.uid, 'imm', 'kura: son eşit aday');
  assert.equal(w.G('imamState/current'), undefined);
  assert.equal(w.G('users/imm').isImam, false);
  assert.ok(w.sms('imm').some((t) => /imamlık görevin sona erdi/.test(t)));
  assert.deepEqual(w.resigned, ['imm'], 'imam polis değil — teşkilat çağrısı etkisiz');
});

test('polis kazanırsa polislik biter; sayım hiç başlamadıysa (saat turu çalışmadı) Pazartesi tüm oylar sayılır', async () => {
  const w = world();
  await adminGov(w);
  w.player('pol', { profession: 'polis' });
  await w.night('2026-10-30');
  w.at('2026-10-30', '10:00');
  await w.act('pol', 'apply');
  for (const u of signers(0, 10)) await w.act(u, 'sign', { cand: 'pol' });
  await w.night('2026-11-01');
  w.at('2026-11-01', '05:00');
  for (const u of signers(0, 4)) await w.act(u, 'vote', { cand: 'pol' });
  await w.night('2026-11-02');
  assert.equal(w.G('politics/state').gov.uid, 'pol');
  assert.equal(w.G('politicsCycles/2026-10-30').result.counts.pol, 4);
  assert.equal(w.G('users/pol').profession, null);
  assert.ok(w.sms('pol').some((t) => /polislik görevin sona erdi/.test(t)));
  // v136: seçim sistemi başladıktan sonra yönetici başkanlığı devralamaz
  await w.bel.handle('pol', { op: 'resign' }).catch(() => {});
  const e = await w.bel.handle('admin', { op: 'claimMayor' }).catch((x) => x);
  assert.match(e.message, /seçimle|zaten bir başkanı/);
});

test('gece işi gecikirse saat turu devralır (maaş adımı bittiyse 00:40, hiç bitmediyse 04:00)', async () => {
  const w = world();
  await adminGov(w);
  await w.pol.readState();
  w.at('2026-10-30', '00:20');
  await w.pol.clock();
  assert.equal(w.G('politics/state').phase, 'idle', '00:40 öncesi gece işini bekler');
  w.at('2026-10-30', '00:45');
  await w.pol.clock();
  assert.equal(w.G('politics/state').phase, 'idle', 'maaş adımı bitmedi');
  w.S('dailyResetRuns/2026-10-30', { steps: { belediyePayroll: true } });
  await w.pol.clock();
  assert.equal(w.G('politics/state').phase, 'signup');
});

test('gazete: Cuma duyuru, Cumartesi imza durumu, Pazar sandık / seçim yok, Pazartesi kazanan', () => {
  const rnd = () => 0;
  const cands = { a: { name: 'Ali', sigs: 10, fullAtMs: 2, appliedAtMs: 1 }, b: { name: 'Veli', sigs: 4, appliedAtMs: 1 } };
  const fri = politicsNews({ day: '2026-10-30', state: { phase: 'signup', cycle: '2026-10-30', gov: { name: 'Haluk' } }, cycle: { cands: {} }, rnd });
  assert.ok(fri.headline.t);
  assert.equal(fri.headline.kind, 'secim');
  const sat = politicsNews({ day: '2026-10-31', state: { phase: 'signup', cycle: '2026-10-30' }, cycle: { cands }, rnd });
  assert.ok(/Ali/.test(sat.headline.t + sat.headline.s));
  assert.ok(sat.items.some((x) => /Veli 4\/10/.test(x.d)));
  const satNone = politicsNews({ day: '2026-10-31', state: { phase: 'signup', cycle: '2026-10-30' }, cycle: { cands: { b: cands.b } }, rnd });
  assert.ok(/devam|sürüyor|10 imza/i.test(satNone.headline.t + satNone.headline.s));
  const sun = politicsNews({ day: '2026-11-01', state: { phase: 'election', cycle: '2026-10-30' }, cycle: { cands, finalists: ['a'] }, rnd });
  assert.ok(/Ali/.test(JSON.stringify(sun)));
  const fail = politicsNews({ day: '2026-11-01', state: { phase: 'idle', last: { outcome: 'noApplicants', day: '2026-11-01', govName: 'Haluk' } }, cycle: null, rnd });
  assert.ok(/Haluk/.test(JSON.stringify(fail)), 'ekip devam ediyor yazar');
  const mon = politicsNews({ day: '2026-11-02', state: { phase: 'results', cycle: '2026-10-30', last: { outcome: 'won', day: '2026-11-02', winnerName: 'Ali', votes: 5, total: 8, finalists: [{ name: 'Ali', votes: 5 }, { name: 'Veli', votes: 3 }] } }, cycle: null, rnd });
  assert.ok(/Ali/.test(mon.headline.t + mon.headline.s));
  assert.equal(politicsNews({ day: '2026-11-03', state: { phase: 'idle', last: { outcome: 'won', day: '2026-11-02' } }, cycle: null, rnd }), null);
});

test('başkan istifası: 1. adım 24 saat kilit, sonra 24 saat içinde son adım hükümeti düşürür; süre geçerse başa döner; gazete', async () => {
  const w = world();
  await adminGov(w);
  await w.pol.readState();
  w.at('2026-11-03', '10:00');
  const b = (op, d = {}) => w.bel.handle('admin', { op, ...d });
  await assert.rejects(w.bel.handle('ayse', { op: 'mayorResign', step: 'start' }), /Sadece belediye başkanı/);
  await assert.rejects(w.bel.handle('admin', { op: 'resign' }), /istifa adımlarını/);
  await assert.rejects(b('mayorResign', { step: 'final' }), /Önce istifa/);
  const r1 = await b('mayorResign', { step: 'start' });
  assert.equal(r1.stage, 'locked');
  await assert.rejects(b('mayorResign', { step: 'final' }), /kilidi henüz/);
  // 48 saat geçti, son adım basılmadı → başa döner
  w.at('2026-11-05', '10:01');
  await assert.rejects(b('mayorResign', { step: 'final' }), /Önce istifa/);
  await b('mayorResign', { step: 'start' });
  w.at('2026-11-06', '11:00'); // kilit açıldı (Cuma)
  const r2 = await b('mayorResign', { step: 'final' });
  assert.equal(r2.stage, 'fallen');
  const main = w.G('belediye/main');
  assert.equal(main.seats.bsk, null);
  assert.equal(main.seats.san, null);
  assert.equal(w.G('users/ayse').belediyeSeat, undefined);
  const st = w.G('politics/state');
  assert.equal(st.gov, null);
  assert.equal(st.nextSignupDay, '2026-11-13', 'bir sonraki Cuma');
  const news = politicsNews({ day: '2026-11-07', state: st, cycle: null, rnd: () => 0 });
  assert.match(news.headline.t, /İstifa/);
  await w.night('2026-11-13');
  assert.equal(w.G('politics/state').phase, 'signup');
});

// -----------------------------------------------------------------------------
// v136 — DARBE
// -----------------------------------------------------------------------------
function police(w, uid, rid, rank, code) {
  w.player(uid);
  w.S(`gangWorlds/w/memberships/${uid}`, { intelRosterId: rid, intelRank: rank, intelCodeName: code });
  w.S(`gangWorlds/w/intelRoster/${rid}`, { rank, codeName: code, prestige: 5_000_000 });
  w.S(`gangWorlds/w/intelRosterLinks/${rid}`, { actorId: uid });
}
async function electedGov(w) {
  await adminGov(w);
  await w.night('2026-10-30');
  w.at('2026-10-30', '10:00');
  await w.act('ali', 'apply');
  for (const u of signers(0, 10)) await w.act(u, 'sign', { cand: 'ali' });
  await w.night('2026-11-01');
  w.at('2026-11-01', '10:00');
  await w.act('v0', 'vote', { cand: 'ali' });
  await w.night('2026-11-02');
  await w.night('2026-11-03');
  w.S('friendships/ali', { friends: { veli: {} } });
  await w.bel.handle('ali', { op: 'invite', seat: 'yrd1', targetUid: 'veli' });
  await w.bel.handle('veli', { op: 'respondInvite', accept: true });
  police(w, 'egm', 'r1', 'baskan', 'Kartal');
  police(w, 'amir1', 'r2', 'sef', 'Şahin');
  police(w, 'amir2', 'r3', 'sef', 'Atmaca');
  police(w, 'bk1', 'r4', 'uzman', 'Doğan');
  police(w, 'memur', 'r5', 'muhbir', 'Serçe');
}

test('darbe kuralları: polis oylaması en az 3 evet + çoğunluk; halkta eşitlik hükümetin', () => {
  assert.equal(coupVotePassed(3, 2), true);
  assert.equal(coupVotePassed(4, 3), true);
  assert.equal(coupVotePassed(3, 3), false);
  assert.equal(coupVotePassed(2, 0), false);
  assert.equal(coupWon({ coup: 5, gov: 5 }), false);
  assert.equal(coupWon({ coup: 6, gov: 5 }), true);
});

test('darbe: sadece EGM, Pazar/Pazartesi, 7 gün koruma; gizli polis oylaması; 24 saat halk; başarılı → kadro gider, EGM devleti alır', async () => {
  const w = world();
  await electedGov(w);
  w.at('2026-11-08', '10:00'); // Pazar — yeni hükümetin 7 günü dolmadı
  assert.match((await w.fails('egm', 'coupPlan')).message, /7 günü/);
  w.at('2026-11-09', '10:00'); // Pazartesi
  assert.match((await w.fails('amir1', 'coupPlan')).message, /Emniyet Genel Müdürü/);
  await w.act('egm', 'coupPlan');
  assert.equal(w.G('coupPlans/current').status, 'planned');
  assert.equal(w.G('politics/state').coup ?? null, null, 'plan halka görünmez');
  assert.match((await w.fails('egm', 'coupPlan')).message, /zaten|Zaten/);
  await w.night('2026-11-10'); // Salı 00:00 — oylama
  const p = w.G('coupPlans/current');
  assert.equal(p.status, 'voting');
  assert.deepEqual([...p.voters].sort(), ['r1', 'r2', 'r3', 'r4']);
  assert.equal(p.leaderUid, undefined, 'EGM kimliği plan belgesinde yok');
  assert.equal(w.G('users/amir1').coupPlanVote.choice, null);
  w.at('2026-11-10', '09:00');
  await w.act('egm', 'coupPoliceVote', { choice: 'yes' });
  await w.act('amir1', 'coupPoliceVote', { choice: 'yes' });
  await w.act('amir2', 'coupPoliceVote', { choice: 'yes' });
  await w.act('bk1', 'coupPoliceVote', { choice: 'no' });
  assert.match((await w.fails('bk1', 'coupPoliceVote', { choice: 'yes' })).message, /zaten/);
  assert.match((await w.fails('memur', 'coupPoliceVote', { choice: 'yes' })).message, /oy hakkın yok/);
  await w.night('2026-11-11'); // Çarşamba 00:00 — darbe başlar
  const st = w.G('politics/state');
  assert.equal(st.coup.status, 'active');
  assert.equal(st.coup.leaderCode, 'Kartal');
  assert.equal(st.lastCoup.outcome, 'started');
  w.at('2026-11-11', '12:00');
  // halk: Komiser+ polis hükümeti savunursa 3 güç + 1M prestij; Polis Memuru ve vatandaş 1; bir kez
  const r = await w.act('memur', 'coupJoin', { side: 'gov' });
  assert.equal(r.power, 1, 'Polis Memuru halk gücünde');
  assert.equal(w.G('gangWorlds/w/intelRoster/r5').prestige, 5_000_000);
  const r2 = await w.act('bk1', 'coupJoin', { side: 'gov' });
  assert.equal(r2.power, 3);
  assert.equal(w.G('gangWorlds/w/intelRoster/r4').prestige, 6_000_000);
  await w.act('egm', 'coupJoin', { side: 'coup' });
  for (const u of signers(1, 8)) await w.act(u, 'coupJoin', { side: 'coup' }); // 8 vatandaş
  assert.match((await w.fails('v1', 'coupJoin', { side: 'gov' })).message, /zaten/);
  w.player('yeni', { onboardingRewardClaimed: false });
  assert.match((await w.fails('yeni', 'coupJoin', { side: 'gov' })).message, /başlangıç/);
  const doc = w.G('politicsCoups/2026-11-09');
  assert.deepEqual(doc.power, { coup: 9, gov: 4 });
  // açıklamalar: darbeci (kod adı) ve hükümet (başkan / yardımcı)
  await w.act('egm', 'coupText', { text: 'Şehri kurtaracağız.' });
  await w.act('veli', 'coupText', { text: 'Hükümet yerinde.' });
  await w.fails('amir1', 'coupText', { text: 'x' });
  assert.equal(w.G('politicsCoups/2026-11-09').leaderText, 'Şehri kurtaracağız.');
  assert.equal(w.G('politicsCoups/2026-11-09').govTextBy.title, 'Belediye Başkan Yardımcısı');
  // Perşembe 00:00 — sonuç: başarılı
  await w.night('2026-11-12');
  const st2 = w.G('politics/state');
  assert.equal(st2.coup.status, 'decision');
  assert.equal(st2.gov, null);
  assert.equal(w.G('belediye/main').seats.bsk, null, 'kadro anında görevden alındı');
  assert.equal(w.G('users/veli').belediyeSeat, undefined);
  assert.deepEqual(w.G('belediyePayroll/2026-11-12').staff.payees.map((x) => x.uid).sort(), ['ali', 'veli'], 'biten günün maaşı');
  assert.match(politicsNews({ day: '2026-11-12', state: st2, cycle: null, rnd: () => 0 }).headline.t, /Darbe|Yönetim/);
  // EGM kararı: devletin başına geç
  w.at('2026-11-12', '15:00');
  await w.fails('amir1', 'coupDecide', { choice: 'rule' });
  await w.act('egm', 'coupDecide', { choice: 'rule' });
  const st3 = w.G('politics/state');
  assert.equal(st3.coup, null);
  assert.equal(st3.gov.uid, 'egm');
  assert.equal(st3.gov.kind, 'coup');
  assert.equal(st3.nextSignupDay, '2026-12-04');
  assert.equal(st3.coupFreeFromMs, ms('2026-11-19', '00:00'));
  assert.equal(w.G('belediye/main').seats.bsk.uid, 'egm');
  assert.ok(w.resigned.includes('egm'), 'polislikten ayrıldı');
  assert.match(politicsNews({ day: '2026-11-13', state: st3, cycle: null, rnd: () => 0 }).headline.t, /Kartal|Darbeci/);
  // Cuma: imza dönemi YOK (yeni yönetim)
  await w.night('2026-11-13');
  assert.equal(w.G('politics/state').phase, 'idle');
});

test('darbe: polis oylaması 3-3 → iptal; başarısız darbe → EGM görevden alınır, hükümet kalır; karar verilmezse Cuma gecesi imza başlar', async () => {
  const w = world();
  await electedGov(w);
  police(w, 'bk2', 'r6', 'uzman', 'Kumru');
  police(w, 'bk3', 'r7', 'uzman', 'Martı');
  w.at('2026-11-09', '10:00');
  await w.act('egm', 'coupPlan');
  await w.night('2026-11-10');
  w.at('2026-11-10', '10:00');
  for (const u of ['egm', 'amir1', 'amir2']) await w.act(u, 'coupPoliceVote', { choice: 'yes' });
  for (const u of ['bk1', 'bk2', 'bk3']) await w.act(u, 'coupPoliceVote', { choice: 'no' });
  await w.night('2026-11-11');
  assert.equal(w.G('coupPlans/current').status, 'failed');
  assert.equal(w.G('politics/state').coup ?? null, null);
  // haftaya Pazar: başarısız halk darbesi
  w.at('2026-11-15', '10:00');
  await w.act('egm', 'coupPlan');
  await w.night('2026-11-16');
  w.at('2026-11-16', '10:00');
  for (const u of ['egm', 'amir1', 'amir2']) await w.act(u, 'coupPoliceVote', { choice: 'yes' });
  await w.night('2026-11-17');
  w.at('2026-11-17', '10:00');
  await w.act('v1', 'coupJoin', { side: 'coup' });
  await w.act('v2', 'coupJoin', { side: 'gov' }); // eşit → hükümet
  await w.night('2026-11-18');
  assert.equal(w.G('politics/state').lastCoup.outcome, 'lost');
  assert.equal(w.G('politics/state').gov.uid, 'ali');
  assert.equal(w.G('belediye/main').seats.bsk.uid, 'ali');
  assert.equal(w.removed[0][0], 'egm');
});

test('darbe: başarılı ama karar yok → erken seçim; Pazartesi kararı → Cuma 00:00 (karar süresinin dolduğu gece) imza dönemi', async () => {
  const w = world();
  await electedGov(w);
  w.at('2026-11-09', '11:00');
  await w.act('egm', 'coupPlan');
  await w.night('2026-11-10');
  w.at('2026-11-10', '10:00');
  for (const u of ['egm', 'amir1', 'amir2']) await w.act(u, 'coupPoliceVote', { choice: 'yes' });
  await w.night('2026-11-11');
  w.at('2026-11-11', '10:00');
  await w.act('v1', 'coupJoin', { side: 'coup' });
  await w.night('2026-11-12');
  assert.equal(w.G('politics/state').coup.status, 'decision');
  await w.night('2026-11-13'); // Cuma 00:00 — karar süresi doldu → erken seçim, aynı gece imza
  const st = w.G('politics/state');
  assert.equal(st.coup, null);
  assert.equal(st.lastCoup.decision, 'election');
  assert.equal(st.phase, 'signup');
  assert.equal(st.cycle, '2026-11-13');
  assert.match(politicsNews({ day: '2026-11-13', state: { ...st, phase: 'idle', cycle: null }, cycle: null, rnd: () => 0 }).headline.t, /Seçim/);
  // darbe sürerken polislik başvurusu engeli (politics/state.coup) — burada sona erdi
  assert.equal(st.coup, null);
});

test('darbe: 00:00da EGM değilse oylama başlamaz; oylamada teşkilattan ayrılırsa darbe başlamaz; çete saati turu beklenir', async () => {
  const w = world();
  await electedGov(w);
  w.at('2026-11-09', '10:00');
  await w.act('egm', 'coupPlan');
  // gece: rütbe düştü (çete saati turu)
  w.S('gangWorlds/w', { lastTickDateKey: '2026-11-09' });
  w.at('2026-11-10', '00:02');
  await w.bel.nightly('2026-11-10', { step: 'payrollSnapshot' });
  const wait = await w.pol.nightly('2026-11-10');
  assert.ok(JSON.stringify(wait).includes('waitGang'), 'çete turu bitmeden oylama başlamaz');
  assert.equal(w.G('coupPlans/current').status, 'planned');
  w.S('gangWorlds/w', { lastTickDateKey: '2026-11-10' });
  w.S('gangWorlds/w/intelRoster/r1', { rank: 'sef', codeName: 'Kartal', prestige: 1 });
  await w.pol.nightly('2026-11-10');
  assert.equal(w.G('coupPlans/current').status, 'cancelled');
  assert.equal(w.G('coupPlans/current').cancelReason, 'leader_rank');
  // ikinci deneme (haftaya Pazar): oylama geçer ama EGM oylama sürerken ayrılır
  w.S('gangWorlds/w/intelRoster/r1', { rank: 'baskan', codeName: 'Kartal', prestige: 5_000_000 });
  w.S('gangWorlds/w', { lastTickDateKey: '2026-11-15' });
  w.at('2026-11-15', '10:00');
  await w.act('egm', 'coupPlan');
  w.S('gangWorlds/w', { lastTickDateKey: '2026-11-16' });
  await w.night('2026-11-16');
  assert.equal(w.G('coupPlans/current').status, 'voting');
  w.at('2026-11-16', '10:00');
  for (const u of ['egm', 'amir1', 'amir2']) await w.act(u, 'coupPoliceVote', { choice: 'yes' });
  w.db._store.delete('gangWorlds/w/intelRoster/r1'); // istifa / atıldı
  w.S('gangWorlds/w', { lastTickDateKey: '2026-11-17' });
  await w.night('2026-11-17');
  assert.equal(w.G('coupPlans/current').status, 'failed');
  assert.equal(w.G('coupPlans/current').result.blocked, 'leader_left');
  assert.equal(w.G('politics/state').coup ?? null, null);
});

test('darbe: başarılı darbeden sonra rütbesi düşen / teşkilattan ayrılan darbeci de kararını verir', async () => {
  const w = world();
  await electedGov(w);
  w.at('2026-11-09', '11:00');
  await w.act('egm', 'coupPlan');
  await w.night('2026-11-10');
  w.at('2026-11-10', '10:00');
  for (const u of ['egm', 'amir1', 'amir2']) await w.act(u, 'coupPoliceVote', { choice: 'yes' });
  await w.night('2026-11-11');
  w.at('2026-11-11', '10:00');
  await w.act('v1', 'coupJoin', { side: 'coup' });
  await w.night('2026-11-12');
  assert.equal(w.G('politics/state').coup.status, 'decision');
  assert.equal(w.G('users/egm').coupDecide.id, w.G('politics/state').coup.id, 'karar butonu');
  // son 12 saat hatırlatması (bir kez)
  w.at('2026-11-12', '11:59');
  await w.pol.clock();
  assert.ok(!w.sms('egm').some((t) => /son 12 saat/.test(t)));
  w.at('2026-11-12', '12:01');
  await w.pol.clock();
  await w.pol.clock();
  assert.equal(w.sms('egm').filter((t) => /son 12 saat/.test(t)).length, 1);
  w.S('gangWorlds/w/memberships/egm', { intelRosterId: 'r1', intelRank: 'sef', intelCodeName: 'Kartal' });
  w.at('2026-11-12', '13:00');
  await w.fails('amir1', 'coupDecide', { choice: 'rule' });
  await w.act('egm', 'coupDecide', { choice: 'election' });
  assert.equal(w.G('politics/state').lastCoup.decision, 'election');
  assert.ok(!w.resigned.includes('egm'), 'polislikte kaldı');
  assert.equal(w.G('users/egm').coupDecide, null);
});
