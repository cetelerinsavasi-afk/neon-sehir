// v108 — Devlet (belediye) kasası defteri: vergiler, gün kapanışı, admin raporu
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { stateWrite, closeStateDays, readStateReport, STATE_IN, STATE_OUT, stateDayKey } from '../stateTreasury.js';
import { taxLedgerWrite, TAX_SOURCES } from '../tax.js';

const ms = (day, hh = 12) => Date.parse(`${day}T${String(hh).padStart(2, '0')}:00:00+03:00`);

test('her vergi kaynağı devlet kasasında ayrı gelir kalemi; oyunun mekânları ayrı; vergi defteri de yazılır', async () => {
  const clock = { now: ms('2026-10-20') };
  const db = new FakeFirestore({ clock: () => clock.now });
  const batch = db.batch();
  for (const src of Object.keys(TAX_SOURCES)) taxLedgerWrite(batch, db, FieldValue, { amount: 100, source: src, uid: 'u1', atMs: clock.now });
  taxLedgerWrite(batch, db, FieldValue, { amount: 50, source: 'isletme', uid: '__game__', atMs: clock.now });
  taxLedgerWrite(batch, db, FieldValue, { amount: 0, source: 'isletme', uid: 'u2', atMs: clock.now }); // yazılmaz
  await batch.commit();
  const r = await readStateReport(db, { todayKey: '2026-10-20' });
  // v127: maaş vergisi işe göre ayrı kalem (ref yoksa fabrika işçisi)
  const catOf = (src) => (src === 'maas' ? 'vergi_maasIsci' : `vergi_${src}`);
  for (const src of Object.keys(TAX_SOURCES)) {
    assert.equal(r.today.in[catOf(src)], 100, src);
    assert.ok(STATE_IN[catOf(src)], `${src} için rapor etiketi var`);
  }
  assert.equal(r.today.in.vergi_oyun, 50);
  assert.equal(r.today.inTotal, 100 * Object.keys(TAX_SOURCES).length + 50);
  assert.equal(r.balance, r.today.inTotal);
  assert.equal(db._get('taxLedger/2026-10-20_u1').total, 100 * Object.keys(TAX_SOURCES).length);
});

test('kasa eksiye inebilir; günler 00:00 kapanışında özetlenir, bakiye ve tüm zamanlar korunur; kapanış bir kez', async () => {
  const clock = { now: ms('2026-10-18') };
  const db = new FakeFirestore({ clock: () => clock.now });
  const w = async (day, kind, cat, amount) => {
    const b = db.batch();
    stateWrite(b, db, FieldValue, { kind, cat, amount, atMs: ms(day) });
    await b.commit();
  };
  await w('2026-10-18', 'in', 'soygun_ceza', 300_000);
  await w('2026-10-18', 'out', 'maas_polis', 50_000);
  await w('2026-10-19', 'out', 'soygun_odeme', 400_000);
  await w('2026-10-19', 'out', 'maas_istihbarat', 75_000);
  await w('2026-10-19', 'in', 'bilinmeyen_kalem', 10); // → diger
  await w('2026-10-20', 'in', 'vergi_isletme', 1_000);
  // kapanış öncesi: bakiye açık günlerden
  let r = await readStateReport(db, { todayKey: '2026-10-20' });
  assert.equal(r.balance, 300_000 - 50_000 - 400_000 - 75_000 + 10 + 1_000);
  assert.ok(r.balance < 0, 'eksiye inebilir');
  assert.equal(r.yesterday.out.soygun_odeme, 400_000);
  assert.equal(r.yesterday.in.diger, 10);
  // 20 Ekim 00:00 kapanışı: 18 ve 19 kapanır, 20 açık kalır
  const c1 = await closeStateDays(db, FieldValue, { todayKey: '2026-10-20' });
  assert.equal(c1.closed, 2);
  const c2 = await closeStateDays(db, FieldValue, { todayKey: '2026-10-20' });
  assert.equal(c2.closed, 0, 'ikinci kapanış bir şey yapmaz');
  assert.equal(db._get('stateDays/2026-10-19').net, -400_000 - 75_000 + 10);
  r = await readStateReport(db, { todayKey: '2026-10-20' });
  assert.equal(r.balance, 300_000 - 50_000 - 400_000 - 75_000 + 10 + 1_000, 'kapanış bakiyeyi değiştirmez');
  assert.equal(r.allTime.out.maas_polis, 50_000);
  assert.equal(r.allTime.in.vergi_isletme, 1_000);
  assert.equal(r.last7.outTotal, 50_000 + 400_000 + 75_000);
  assert.equal(r.daily.length, 14);
  assert.equal(r.daily[13].dayKey, '2026-10-20');
  assert.equal(r.daily[12].outTotal, 475_000);
  assert.ok(r.labels.out.soygun_odeme && STATE_OUT.maas_imam);
  assert.equal(stateDayKey(ms('2026-10-20', 1)), '2026-10-20');
});

// v123 — maaş (futbolcu / menajer / fabrika işçisi) ve piyango vergisi %10
import { splitSalaryTax, splitLotteryTax, SALARY_TAX_RATE, LOTTERY_TAX_RATE } from '../tax.js';
import fsV123 from 'node:fs';

test('v123: maaş ve piyango vergisi %10 — net + vergi = brüt; devlet kasasında ayrı kalemler', async () => {
  assert.equal(SALARY_TAX_RATE, 0.1);
  assert.equal(LOTTERY_TAX_RATE, 0.1);
  assert.deepEqual(splitSalaryTax(5000), { gross: 5000, tax: 500, net: 4500 });
  assert.deepEqual(splitSalaryTax(1005), { gross: 1005, tax: 100, net: 905 });
  assert.deepEqual(splitSalaryTax(9), { gross: 9, tax: 0, net: 9 });
  assert.deepEqual(splitSalaryTax(0), { gross: 0, tax: 0, net: 0 });
  assert.deepEqual(splitLotteryTax(123_456), { gross: 123_456, tax: 12_345, net: 111_111 });
  assert.ok(STATE_IN.vergi_maas && STATE_IN.vergi_piyango);
  const clock = { now: ms('2026-10-22') };
  const db = new FakeFirestore({ clock: () => clock.now });
  const b = db.batch();
  taxLedgerWrite(b, db, FieldValue, { amount: 500, source: 'maas', uid: 'isci', atMs: clock.now, ref: 'fabrika' });
  taxLedgerWrite(b, db, FieldValue, { amount: 300, source: 'maas', uid: 'fb', atMs: clock.now, ref: 'futbolcu' });
  taxLedgerWrite(b, db, FieldValue, { amount: 200, source: 'maas', uid: 'mn', atMs: clock.now, ref: 'menajer' });
  taxLedgerWrite(b, db, FieldValue, { amount: 12_345, source: 'piyango', uid: 'talihli', atMs: clock.now });
  await b.commit();
  const r = await readStateReport(db, { todayKey: '2026-10-22' });
  // v127: maaş vergileri işe göre ayrı kalem (Sanayi: işçi · Kültür: futbolcu / menajer)
  assert.equal(r.today.in.vergi_maasIsci, 500);
  assert.equal(r.today.in.vergi_maasFutbolcu, 300);
  assert.equal(r.today.in.vergi_maasMenajer, 200);
  assert.equal(r.today.in.vergi_piyango, 12_345);
});

test('v123 index.js: fabrika işçisi, menajer maaşı ve piyango kazancı vergilendirilir; SMS vergiyi söyler', () => {
  const src = fsV123.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const fab = src.slice(src.indexOf('export const produceAtFactory'), src.indexOf('export const resignFromFactory'));
  assert.ok(fab.includes("workerTax = splitSalaryTax(salary, 'isci')"));
  assert.ok(fab.includes('increment(workerTax.net)'), 'işçiye net');
  assert.ok(fab.includes("source: 'maas'"));
  assert.ok(fab.includes('increment(-ownerPay)'), 'patron yine tam maaşı öder');
  const man = src.slice(src.indexOf('menajer maaşından %10 vergi'), src.indexOf('menajer maaşından %10 vergi') + 2600);
  assert.ok(man.includes('increment(mTax.net)') && man.includes("source: 'maas'") && man.includes('mTaxNote'));
  const lot = src.slice(src.indexOf('async function resolveStuckLotteryAndChampionship'), src.indexOf('async function resolveStuckLotteryAndChampionship') + 6000);
  assert.ok(lot.includes('splitLotteryTax(lottery.jackpot, lotRates)'), 'v127: piyango gününün oranı');
  assert.ok(lot.includes("source: 'piyango'"));
  assert.ok(/pctText\(lotteryTaxRate\(lotRates\)\)\} piyango vergisi/.test(lot), 'SMS bilgilendirir (v127: güncel oran)');
  assert.ok(lot.includes('splitIncomeForDebt(\n            winnerSnap.data()?.debtToState,\n            lotTax.net'), 'borç kesintisi net üzerinden');
});
