// v123 — Ekip soygunu "polis ekibi yakaladı" (busted) dalının devlet defteri.
// Eskiden: +ceza (soygun_ceza) VE +kurtarılan %75 (soygun_kurtarma) → çift sayım.
// Şimdi:   +ceza (soygun_ceza) − polis payı %25 (soygun_polis_payi, gider).
// Ayrıca: şüphe 50+ suç kilidi (policeRules.js crimeLockedBySuspicion).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { policeBustSplit, heistStateEntries, crimeLockedBySuspicion, CRIME_SUSPICION_LOCK, CRIME_LOCK_TEXT, CRIME_LOCK_TEAM_TEXT } from '../../policeRules.js';
import { stateWrite, readStateReport, STATE_IN, STATE_OUT } from '../../stateTreasury.js';
import { FakeFirestore, FieldValue } from './fakeFirestore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexSrc = fs.readFileSync(path.join(here, '../../index.js'), 'utf8');

// executeHeistPlan busted dalının defter hesabının birebir aynısı
function bustedLedger(totalReward, policeCount, civilianCount) {
  const bust = policeBustSplit(totalReward, policeCount);
  const perCivilianPenalty = civilianCount > 0 ? Math.floor(totalReward / civilianCount) : 0;
  return heistStateEntries({ fines: perCivilianPenalty * civilianCount, policeShare: bust.perEarning * policeCount });
}
const net = (entries) => entries.reduce((s, e) => s + (e.kind === 'in' ? e.amount : -e.amount), 0);

test('busted: 2 polis, 500.000, 1 suçlu → +500.000 ceza, −125.000 polis payı = net +375.000', () => {
  const e = bustedLedger(500_000, 2, 1);
  assert.deepEqual(e, [
    { kind: 'in', cat: 'soygun_ceza', amount: 500_000 },
    { kind: 'out', cat: 'soygun_polis_payi', amount: 125_000 },
  ]);
  assert.equal(net(e), 375_000);
  assert.ok(!e.some((x) => x.cat === 'soygun_kurtarma'), 'kurtarma geliri artık yazılmaz');
});

test('busted: 1 polis, 500.000, 2 suçlu → +500.000 ceza (2×250.000), −125.000 = net +375.000', () => {
  const e = bustedLedger(500_000, 1, 2);
  assert.deepEqual(e, [
    { kind: 'in', cat: 'soygun_ceza', amount: 500_000 },
    { kind: 'out', cat: 'soygun_polis_payi', amount: 125_000 },
  ]);
  assert.equal(net(e), 375_000);
});

test('busted: 3 polis, 10.001, 2 suçlu → yuvarlama: ceza 2×5.000, pay 3×833; net = ceza − pay', () => {
  const e = bustedLedger(10_001, 3, 2);
  assert.deepEqual(e, [
    { kind: 'in', cat: 'soygun_ceza', amount: 10_000 },
    { kind: 'out', cat: 'soygun_polis_payi', amount: 2_499 },
  ]);
  assert.equal(net(e), 7_501);
});

test('busted: defter neti her zaman ceza − polislere ödenen altın (oyuncu tarafıyla birebir)', () => {
  for (const [R, p, c] of [[500_000, 2, 1], [1_000_000, 4, 3], [77_777, 5, 7], [250_000, 1, 1]]) {
    const bust = policeBustSplit(R, p);
    const fines = Math.floor(R / c) * c;
    assert.equal(net(bustedLedger(R, p, c)), fines - bust.perEarning * p, `${R}/${p}/${c}`);
  }
});

test('heistStateEntries: diğer dallar değişmedi (ödeme / ceza / kaçak / polisPay=0 yazılmaz)', () => {
  assert.deepEqual(heistStateEntries({ paidToCriminals: 500_000 }), [{ kind: 'out', cat: 'soygun_odeme', amount: 500_000 }]);
  assert.deepEqual(heistStateEntries({ fines: 1_000_000 }), [{ kind: 'in', cat: 'soygun_ceza', amount: 1_000_000 }]);
  assert.deepEqual(heistStateEntries({ fines: 40_000, contraband: true }), [{ kind: 'in', cat: 'kacak_ceza', amount: 40_000 }]);
  assert.deepEqual(heistStateEntries({ fines: 10, policeShare: 0 }), [{ kind: 'in', cat: 'soygun_ceza', amount: 10 }]);
  assert.deepEqual(heistStateEntries(), []);
});

test('defter kategorileri: soygun_polis_payi gider; soygun_kurtarma eski kayıtlar için etiketli kalır', async () => {
  assert.equal(STATE_OUT.soygun_polis_payi, 'Polis payı (durdurulan soygunlar)'); // v127: oran artık belediyenin
  assert.match(STATE_IN.soygun_kurtarma, /eski, artık yazılmıyor/);
  const day = '2026-10-23';
  const atMs = Date.parse(`${day}T12:00:00+03:00`);
  const db = new FakeFirestore({ clock: () => atMs });
  const b = db.batch();
  for (const e of bustedLedger(500_000, 2, 1)) stateWrite(b, db, FieldValue, { ...e, dayKey: day, atMs });
  await b.commit();
  const r = await readStateReport(db, { todayKey: day });
  assert.equal(r.today.in.soygun_ceza, 500_000);
  assert.equal(r.today.out.soygun_polis_payi, 125_000, '"diger"e düşmemeli');
  assert.equal(r.today.inTotal - r.today.outTotal, 375_000);
});

test('index.js busted dalı: fines + policeShare yazar, recoveredToState / stateShare kullanmaz', () => {
  const plan = indexSrc.slice(indexSrc.indexOf('export const executeHeistPlan'), indexSrc.indexOf('export const expireHeistPlans'));
  const busted = plan.slice(plan.indexOf('} else if (busted) {'), plan.indexOf('  } else {', plan.indexOf('} else if (busted) {')));
  assert.ok(busted.length > 100);
  assert.ok(/heistStateEntries\(\{ fines: perCivilianPenalty \* civilianIdx\.length, policeShare: perPoliceEarning \* policeIdx\.length \}\)/.test(busted));
  assert.ok(!indexSrc.includes('recoveredToState'));
  assert.ok(!busted.includes('bust.stateShare'));
  // dokunulmayan dallar
  assert.ok(plan.includes('heistStateEntries({ fines: perPolicePenalty * participants.length })'), 'sadece-polis şüphe dalı');
  assert.ok(plan.includes('heistStateEntries({ fines: perCivilianPenalty * civilianIdx.length })); // v108'), 'şüpheden yakalanma dalı');
  assert.ok(plan.includes('heistPayout = perPersonAmount * participants.length;'), 'başarılı soygun (v127: belediye kasasından ödenir)');
});

// v123 — şüphe 50+ suç kilidi

test('şüphe kilidi: 50 ve üstü suç işleyemez; metin', () => {
  assert.equal(CRIME_SUSPICION_LOCK, 50);
  assert.equal(crimeLockedBySuspicion(49), false);
  assert.equal(crimeLockedBySuspicion(50), true);
  assert.equal(crimeLockedBySuspicion(100), true);
  assert.equal(crimeLockedBySuspicion(undefined), false);
  assert.match(CRIME_LOCK_TEXT, /Şüphen 50\+ iken suç işleyemezsin/);
});

test('index.js: tek soygun/haraç, ekip başlatma ve park satışları (iki mod) şüphe kilidine bakar; ekip kur/katıl serbest (v124)', () => {
  const sec = (a, b) => indexSrc.slice(indexSrc.indexOf(a), indexSrc.indexOf(b));
  const solo = sec('export const attemptHeist', 'export const sellContrabandToDepo');
  assert.ok((solo.match(/crimeLockedBySuspicion\(/g) || []).length >= 2, 'tek soygun: önce + işlem içinde');
  assert.ok(solo.indexOf('crimeLockedBySuspicion(suspicion)') < solo.indexOf('tx.update(userRef'));
  assert.ok(sec('async function sellContrabandSafe', 'export const sellContrabandAtPark').includes('crimeLockedBySuspicion(user.suspicion)'));
  const risky = indexSrc.slice(indexSrc.indexOf('export const sellContrabandAtPark')).slice(0, 3000);
  assert.ok(risky.includes('crimeLockedBySuspicion(user?.suspicion)'));
  // v124: ekip kurmak / katılmak serbest
  assert.ok(!sec('export const createHeistPlan', 'export const updateHeistPlanNote').includes('crimeLockedBySuspicion('));
  assert.ok(!sec('export const joinHeistPlan', 'export const leaveHeistPlan').includes('crimeLockedBySuspicion('));
  assert.match(CRIME_LOCK_TEAM_TEXT.replace('{names}', 'Ali'), /\(Ali\)/);
  const exec = sec('export const executeHeistPlan', 'export const expireHeistPlans');
  const lock = exec.indexOf('crimeLockedBySuspicion(');
  assert.ok(lock > 0 && lock < exec.indexOf('const totalPower'), 'ekip kilidi güç kontrolünden ve her yazmadan önce');
  assert.ok(lock < exec.indexOf('batch.update('));
});
