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
  for (const src of Object.keys(TAX_SOURCES)) {
    assert.equal(r.today.in[`vergi_${src}`], 100, src);
    assert.ok(STATE_IN[`vergi_${src}`], `${src} için rapor etiketi var`);
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
