// v77 Faz 5 — Gerçek futbolcular (functions/futbolPro.js) testleri.
// Çalıştır: node --test functions/scripts/futbolPro.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createFutbolPro, assignGoalCredits, computeMatchRatings, goalCounts, realPlayerDocId, PRO_SALARY } from '../futbolPro.js';
import { futbolDayKey } from '../businessCatalogData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const H = 60 * 60 * 1000;
const at = (d, h, m = 0) => Date.UTC(2026, 9, d, h - 3, m); // İstanbul saati
const mode = (t) => (t.managerUid ? 'MANAGED' : !t.ownerUid ? 'BOT' : t.autoManaged ? 'OWNER_AUTO' : 'OWNER_ACTIVE');
const ctrl = (t) => (t.managerUid ? t.managerUid : mode(t) === 'OWNER_ACTIVE' ? t.ownerUid : null);

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const clock = { now: at(7, 12) };
  const now = () => clock.now;
  const pro = createFutbolPro({
    db,
    FieldValue,
    HttpsError,
    now,
    futbolDayKey,
    getControlMode: mode,
    controllerUidOf: ctrl,
    isLockedHour: () => new Date(clock.now + 3 * H).getUTCHours() === 18,
    splitIncomeForDebt: (debt, amount) => {
      const d = debt || 0;
      if (d <= 0) return { goldDelta: amount, debtDelta: 0 };
      const repay = Math.min(Math.floor(amount / 2), d);
      return { goldDelta: amount - repay, debtDelta: -repay };
    },
  });
  S('users/baskan', { gold: 100_000 });
  S('users/menajer', { gold: 0 });
  S('users/ali', { gold: 0 });
  S('users/veli', { gold: 0, debtToState: 10_000 });
  S('futbolTeams/t1', { name: 'Neon FK', ownerUid: 'baskan', managerUid: 'menajer', treasury: 3_000, tier: 1 });
  S('futbolTeams/t2', { name: 'Gece SK', ownerUid: 'baskan2', treasury: 0, tier: 2 });
  S('users/baskan2', { gold: 50_000 });
  S('footballers/ali', { uid: 'ali', name: 'Ali', position: 'FWD', power: 214.5, teamId: null });
  S('footballers/veli', { uid: 'veli', name: 'Veli', position: 'GK', power: 230, teamId: null });
  S('footballers/genc', { uid: 'genc', name: 'Genç', position: 'MID', power: 150, teamId: null });
  const act = (uid, data) => pro.action(uid, data);
  return { db, S, G, clock, pro, act };
}

test('gol sahibi + asist: skor değişmez, mevki ağırlıklı', () => {
  const home = [
    { id: 'g', name: 'K', position: 'GK', power: 100, form: 100 },
    { id: 'd', name: 'D', position: 'DEF', power: 100, form: 100 },
    { id: 'm', name: 'M', position: 'MID', power: 100, form: 100 },
    { id: 'f', name: 'F', position: 'FWD', power: 100, form: 100 },
  ];
  const tl = [
    { minute: 10, team: 'home', type: 'goal', label: 'Forvet - Kaleci karşı karşıya' },
    { minute: 20, team: 'home', type: 'goal', label: "Orta saha - Defans'ı geçti" },
    { minute: 30, team: 'away', type: 'shot_on', label: 'Şut kaleciden döndü' },
  ];
  assignGoalCredits(tl, home, [], () => 0.1);
  assert.equal(tl[0].scorerId, 'f');
  assert.equal(tl[1].scorerId, 'm');
  assert.ok(tl[0].assistId && tl[0].assistId !== 'f');
  assert.equal(tl.filter((e) => e.type === 'goal').length, 2);
  const { goals, assists } = goalCounts(tl);
  assert.equal(goals.f, 1);
  assert.equal(Object.values(assists).reduce((a, b) => a + b, 0), 2);
});

test('maç puanı: 6,0 taban, gol/asist/sonuç/gol yememe; maçın yıldızı', () => {
  const homeSel = [
    { id: 'hg', position: 'GK', power: 100 },
    { id: 'hd', position: 'DEF', power: 100 },
    { id: 'hf', position: 'FWD', power: 100 },
  ];
  const awaySel = [
    { id: 'ag', position: 'GK', power: 100 },
    { id: 'af', position: 'FWD', power: 300 },
  ];
  const timeline = [
    { team: 'home', type: 'goal', scorerId: 'hf', assistId: 'hd' },
    { team: 'away', type: 'shot_on' },
    { team: 'away', type: 'shot_on' },
  ];
  const { ratings, motmId } = computeMatchRatings({ timeline, homeSel, awaySel, homeScore: 1, awayScore: 0 });
  assert.equal(ratings.hf, 7.5); // 6 + 0,5 + 1
  assert.equal(ratings.hd, 7.8); // 6 + 0,5 + 0,7 + 0,6
  assert.equal(ratings.hg, 7.9); // 6 + 0,5 + 1 + 2×0,2
  assert.equal(ratings.ag, 5.3); // 6 − 0,3 − 0,4
  assert.equal(ratings.af, 5.7);
  assert.equal(motmId, 'hg');
});

test('teklif: yönetici gönderir, futbolcu kabul eder; diğer teklifler düşer; 200 altı ve bant dışı olmaz', async () => {
  const h = setup();
  await assert.rejects(h.act('baskan', { op: 'offerSend', teamId: 't1', uid: 'ali', salary: 5000 }), /yetkin yok/); // menajerli takımda başkan değil menajer
  await assert.rejects(h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'genc', salary: 5000 }), /not-pro/);
  await assert.rejects(h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'ali', salary: PRO_SALARY.max + 1 }), /salary-band/);
  await h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'ali', salary: 5000 });
  await h.act('baskan2', { op: 'offerSend', teamId: 't2', uid: 'ali', salary: 7000 });
  assert.equal(h.G('futbolOffers/t1_ali').status, 'pending');
  assert.equal(h.G('futbolOffers/t1_ali').expiresAtMs, h.clock.now + 24 * H);
  await assert.rejects(h.act('veli', { op: 'offerRespond', offerId: 't1_ali', accept: true }), /sana değil/);
  const r = await h.act('ali', { op: 'offerRespond', offerId: 't1_ali', accept: true });
  assert.equal(r.teamId, 't1');
  const p = h.G(`futbolPlayers/${realPlayerDocId('ali')}`);
  assert.equal(p.real, true);
  assert.equal(p.teamId, 't1');
  assert.equal(p.power, 214.5);
  assert.equal(p.value, 0);
  assert.equal(p.salary, 5000);
  assert.equal(h.G('footballers/ali').teamId, 't1');
  assert.equal(h.G('futbolOffers/t2_ali').status, 'void');
  await assert.rejects(h.act('ali', { op: 'offerRespond', offerId: 't2_ali', accept: true }), /offer-closed/);
  // 24 saat sonra teklif düşer
  await h.act('baskan2', { op: 'offerSend', teamId: 't2', uid: 'veli', salary: 3000 });
  h.clock.now += 24 * H + 1;
  await assert.rejects(h.act('veli', { op: 'offerRespond', offerId: 't2_veli', accept: true }), /offer-closed/);
  assert.equal(await h.pro.expireOffers(), 3, 'süresi geçen tüm teklif kayıtları (kabul/düşen dahil) temizlenir');
});

test('ilan: futbolcu maaşını belirler, takım doğrudan imzalar; fesih → aynı takıma 19:00 sonra', async () => {
  const h = setup();
  await assert.rejects(h.act('genc', { op: 'proList', listed: true, askSalary: 4000 }), /not-pro/);
  await h.act('veli', { op: 'proList', listed: true, askSalary: 4000 });
  await assert.rejects(h.act('baskan2', { op: 'sign', teamId: 't2', uid: 'veli', expect: 3000 }), /price-changed:4000/);
  await h.act('baskan2', { op: 'sign', teamId: 't2', uid: 'veli', expect: 4000 });
  assert.equal(h.G(`futbolPlayers/${realPlayerDocId('veli')}`).salary, 4000);
  assert.equal(h.G('footballers/veli').listed, false);
  // kadroya alınmışsa diziliş/antrenmandan da düşer
  h.S('futbolTeams/t2', { ...h.G('futbolTeams/t2'), lineup: ['x', realPlayerDocId('veli')], trainingPlayerIds: [realPlayerDocId('veli')] });
  h.clock.now = at(7, 18, 30);
  await assert.rejects(h.act('veli', { op: 'terminate' }), /locked-hour/);
  h.clock.now = at(7, 18, 59);
  h.clock.now = at(7, 17);
  await h.act('veli', { op: 'terminate' });
  assert.equal(h.G(`futbolPlayers/${realPlayerDocId('veli')}`), undefined);
  assert.equal(h.G('footballers/veli').teamId, null);
  assert.deepEqual(h.G('futbolTeams/t2').lineup, ['x']);
  assert.deepEqual(h.G('futbolTeams/t2').trainingPlayerIds, []);
  await assert.rejects(h.act('baskan2', { op: 'offerSend', teamId: 't2', uid: 'veli', salary: 3000 }), /rejoin-wait/);
  await h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'veli', salary: 3000 }); // başka takım olur
  h.clock.now = at(7, 19, 1); // 19:00 geçti
  await h.act('baskan2', { op: 'offerSend', teamId: 't2', uid: 'veli', salary: 3000 });
});

test('maaş: 19:00 kasadan/başkandan; yetmezse borç; fesihte borç takıma; para gelince ödenir; BOT → son maaş', async () => {
  const h = setup();
  await h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'ali', salary: 5000 });
  await h.act('ali', { op: 'offerRespond', offerId: 't1_ali', accept: true });
  await h.act('baskan2', { op: 'offerSend', teamId: 't2', uid: 'veli', salary: 2000 });
  await h.act('veli', { op: 'offerRespond', offerId: 't2_veli', accept: true });
  h.clock.now = at(7, 19);
  await h.pro.paySalaries();
  // ali: menajerli → kasa 3.000 → 3.000 ödendi, 2.000 borç
  assert.equal(h.G('futbolTeams/t1').treasury, 0);
  assert.equal(h.G('users/ali').gold, 3000);
  assert.equal(h.G(`futbolPlayers/${realPlayerDocId('ali')}`).salaryDebt, 2000);
  // veli: başkan yönetiyor → başkanın altınından; devlet borcu yarısı kesilir
  assert.equal(h.G('users/baskan2').gold, 48_000);
  assert.equal(h.G('users/veli').gold, 1000);
  assert.equal(h.G('users/veli').debtToState, 9000);
  // ertesi gün: kasa 10.000 → 5.000 + 2.000 borç
  h.S('futbolTeams/t1', { ...h.G('futbolTeams/t1'), treasury: 10_000 });
  h.clock.now = at(8, 19);
  await h.pro.paySalaries();
  assert.equal(h.G('futbolTeams/t1').treasury, 3000);
  assert.equal(h.G('users/ali').gold, 10_000);
  assert.equal(h.G(`futbolPlayers/${realPlayerDocId('ali')}`).salaryDebt, 0);
  // kasa boş, maaş borç olur; takım fesheder → borç takımın borcu
  h.S('futbolTeams/t1', { ...h.G('futbolTeams/t1'), treasury: 0 });
  h.clock.now = at(9, 19);
  await h.pro.paySalaries();
  h.clock.now = at(9, 20);
  const r = await h.act('menajer', { op: 'terminate', uid: 'ali' });
  assert.equal(r.debt, 5000);
  assert.equal(h.G('futbolTeams/t1').playerDebts.ali, 5000);
  assert.equal(h.G('futbolTeams/t1').hasPlayerDebts, true);
  assert.equal(await h.pro.settleTeamDebts(), 0, 'kasa boş → ödeme yok');
  h.S('futbolTeams/t1', { ...h.G('futbolTeams/t1'), treasury: 3500 });
  assert.equal(await h.pro.settleTeamDebts(), 3500);
  assert.equal(h.G('futbolTeams/t1').playerDebts.ali, 1500);
  h.S('futbolTeams/t1', { ...h.G('futbolTeams/t1'), treasury: 9000 });
  await h.pro.settleTeamDebts();
  assert.equal(h.G('futbolTeams/t1').treasury, 7500);
  assert.equal(h.G('futbolTeams/t1').playerDebts.ali, undefined);
  assert.equal(h.G('futbolTeams/t1').hasPlayerDebts, false);
  assert.equal(h.G('users/ali').gold, 15_000);
  // takım bota düştü → 19:00'da son maaş, sözleşme biter
  h.S('futbolTeams/t2', { ...h.G('futbolTeams/t2'), ownerUid: null, isBot: true, treasury: 1500 });
  h.clock.now = at(10, 19);
  const out = await h.pro.paySalaries();
  assert.equal(out.ended, 1);
  assert.equal(h.G(`futbolPlayers/${realPlayerDocId('veli')}`), undefined);
  assert.equal(h.G('footballers/veli').teamId, null);
  assert.equal(h.G('futbolTeams/t2').playerDebts.veli, 500);
});

test('zam: futbolcu ister → yönetici kabul/ret; yönetici doğrudan artırır, düşüremez', async () => {
  const h = setup();
  await h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'ali', salary: 5000 });
  await h.act('ali', { op: 'offerRespond', offerId: 't1_ali', accept: true });
  await assert.rejects(h.act('ali', { op: 'raiseRequest', salary: 4000 }), /raise-low/);
  await h.act('ali', { op: 'raiseRequest', salary: 8000 });
  assert.equal(h.G(`futbolPlayers/${realPlayerDocId('ali')}`).raiseRequest.salary, 8000);
  await assert.rejects(h.act('ali', { op: 'raiseRespond', uid: 'ali', accept: true }), /yetkin yok/);
  await h.act('menajer', { op: 'raiseRespond', uid: 'ali', accept: false });
  assert.equal(h.G(`futbolPlayers/${realPlayerDocId('ali')}`).salary, 5000);
  await h.act('ali', { op: 'raiseRequest', salary: 8000 });
  await h.act('menajer', { op: 'raiseRespond', uid: 'ali', accept: true });
  assert.equal(h.G(`futbolPlayers/${realPlayerDocId('ali')}`).salary, 8000);
  await assert.rejects(h.act('menajer', { op: 'raiseSet', uid: 'ali', salary: 7000 }), /raise-low/);
  await h.act('menajer', { op: 'raiseSet', uid: 'ali', salary: 9000 });
  assert.equal(h.G(`futbolPlayers/${realPlayerDocId('ali')}`).salary, 9000);
});

test('lig maçı: istatistik (gol/asist/puan/yıldız/gol yememe) + gerçek futbolcunun gün sonu kartı', async () => {
  const h = setup();
  await h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'ali', salary: 5000 });
  await h.act('ali', { op: 'offerRespond', offerId: 't1_ali', accept: true });
  const ali = { id: realPlayerDocId('ali'), ...h.G(`futbolPlayers/${realPlayerDocId('ali')}`) };
  const playersById = {
    [ali.id]: ali,
    hg: { id: 'hg', name: 'Kaleci', position: 'GK', power: 90, form: 100 },
    ag: { id: 'ag', name: 'Rakip K', position: 'GK', power: 90, form: 100 },
    af: { id: 'af', name: 'Rakip F', position: 'FWD', power: 90, form: 100 },
  };
  const match = {
    id: 'm1',
    homeScore: 2,
    awayScore: 0,
    homeLineupIds: [ali.id, 'hg'],
    awayLineupIds: ['ag', 'af'],
    homeBenchIds: [],
    awayBenchIds: [],
    timeline: [
      { team: 'home', type: 'goal', scorerId: ali.id },
      { team: 'home', type: 'goal', scorerId: ali.id, assistId: 'hg' },
    ],
  };
  Object.assign(match, computeMatchRatings({ timeline: match.timeline, homeSel: [playersById[ali.id], playersById.hg], awaySel: [playersById.ag, playersById.af], homeScore: 2, awayScore: 0 }));
  h.clock.now = at(7, 19);
  const batch = h.db.batch();
  await h.pro.recordLeagueMatch(batch, { match, season: 3, homeTeam: { name: 'Neon FK' }, awayTeam: { name: 'Gece SK' }, homeTeamId: 't1', awayTeamId: 't2', playersById, updatesById: { [ali.id]: { power: 216, form: 76 } } });
  await batch.commit();
  const st = h.G(`futbolPlayerStats/3_${ali.id}`);
  assert.equal(st.goals, 2);
  assert.equal(st.apps, 1);
  assert.equal(st.real, true);
  assert.equal(st.motm, match.motmId === ali.id ? 1 : 0);
  assert.equal(h.G('futbolPlayerStats/3_hg').cleanSheets, 1);
  assert.equal(h.G('futbolPlayerStats/3_hg').assists, 1);
  const card = h.G('footballers/ali').lastDay;
  assert.equal(card.kind, 'match');
  assert.equal(card.goals, 2);
  assert.equal(card.powerFrom, 214.5);
  assert.equal(card.powerTo, 216);
  assert.equal(card.form, 76);
  assert.equal(card.dayKey, '2026-10-06');
  assert.equal(h.G('footballers/ali').power, 216);
  // kupa maçı istatistiğe yazılmaz
  const b2 = h.db.batch();
  await h.pro.recordLeagueMatch(b2, { match, season: 3, cup: true, homeTeam: { name: 'Neon FK' }, awayTeam: { name: 'Gece SK' }, homeTeamId: 't1', awayTeamId: 't2', playersById, updatesById: {} });
  await b2.commit();
  assert.equal(h.G(`futbolPlayerStats/3_${ali.id}`).goals, 2);
  assert.equal(h.G('footballers/ali').lastDay.kind, 'cup');
});

test('transfer: takımdaki futbolcuya teklif gider; kabul edince eski sözleşme biter (borç eski takıma), takımdayken ilana çıkılamaz', async () => {
  const h = setup();
  await h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'ali', salary: 5000 });
  await h.act('ali', { op: 'offerRespond', offerId: 't1_ali', accept: true });
  await assert.rejects(h.act('ali', { op: 'proList', listed: true, askSalary: 9000 }), /in-team/);
  await assert.rejects(h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'ali', salary: 6000 }), /same-team/);
  // eski takımda borç + kadroda
  const id = realPlayerDocId('ali');
  h.S(`futbolPlayers/${id}`, { ...h.G(`futbolPlayers/${id}`), salaryDebt: 1200, power: 220, form: 64, injuryDaysLeft: 2 });
  h.S('futbolTeams/t1', { ...h.G('futbolTeams/t1'), lineup: [id, 'x'] });
  await h.act('baskan2', { op: 'offerSend', teamId: 't2', uid: 'ali', salary: 9000 });
  assert.equal(h.G('futbolOffers/t2_ali').fromTeamId, 't1');
  h.clock.now = at(7, 18, 20);
  await assert.rejects(h.act('ali', { op: 'offerRespond', offerId: 't2_ali', accept: true }), /locked-hour/);
  h.clock.now = at(7, 19, 30);
  const r = await h.act('ali', { op: 'offerRespond', offerId: 't2_ali', accept: true });
  assert.equal(r.transfer, true);
  const p = h.G(`futbolPlayers/${id}`);
  assert.equal(p.teamId, 't2');
  assert.equal(p.salary, 9000);
  assert.equal(p.salaryDebt, 0);
  assert.equal(p.power, 220);
  assert.equal(p.form, 64);
  assert.equal(p.injuryDaysLeft, 2);
  assert.equal(h.G('futbolTeams/t1').playerDebts.ali, 1200);
  assert.deepEqual(h.G('futbolTeams/t1').lineup, ['x']);
  assert.equal(h.G('footballers/ali').teamId, 't2');
  assert.equal(h.G('footballers/ali').lastLeft.teamId, 't1');
  // eski takım aynı gün geri alamaz
  await assert.rejects(h.act('menajer', { op: 'offerSend', teamId: 't1', uid: 'ali', salary: 9999 }), /rejoin-wait/);
});
