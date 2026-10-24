// v126 — oyunun gazinosu kasaları → devlet (functions/gameCasinoVault.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { vaultWrite, settleGameCasinoVaults, VAULT_SHARDS } from '../gameCasinoVault.js';
import { STATE_IN } from '../stateTreasury.js';
import { SLOT_GAME_COST, GAME_SLOT_STATE_CUT } from '../casinoRules.js';

const ledgerIn = async (db, day) => {
  const snap = await db.collection('stateLedger').where('dayKey', '==', day).get();
  const acc = {};
  snap.docs.forEach((d) => {
    for (const [c, n] of Object.entries(d.data().in || {})) acc[c] = (acc[c] || 0) + Number(n || 0);
  });
  return acc;
};
const balanceOf = async (db, kind) => {
  let b = 0;
  for (let i = 0; i < VAULT_SHARDS; i++) b += Number((await db.doc(`gameCasinoVault/${kind}_s${i}`).get()).data()?.balance || 0);
  return b;
};
const write = async (db, kind, delta, shard) => {
  const b = db.batch();
  vaultWrite(b, db, FieldValue, kind, { delta, shard });
  await b.commit();
};

test('slot: 1.600 çevirme, 100 devlete (v127)', () => {
  assert.equal(SLOT_GAME_COST, 1600);
  assert.equal(GAME_SLOT_STATE_CUT, 100);
  assert.ok(STATE_IN.gazino_slot && STATE_IN.gazino_piyango && STATE_IN.gazino_rulet && STATE_IN.gazino_onNumara);
});

test('kasa: artıdaysa gece devlete (yeni güne) yatar ve 0\'dan devam eder; eksideyse devlete gitmez, eksiden devam eder; kasalar ayrı', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  // gün 1: slot 3 çevirme, rulet +5.000 (iki parçada), 10 Numara −3.000
  for (let i = 0; i < 3; i++) await write(db, 'slot', 200, i);
  await write(db, 'rulet', 8000, 1);
  await write(db, 'rulet', -3000, 4);
  await write(db, 'onNumara', 2000, 2);
  await write(db, 'onNumara', -5000, 7);

  const r1 = await settleGameCasinoVaults(db, FieldValue, { dateKey: '2026-10-25' });
  assert.equal(r1.slot.deposit, 600);
  assert.equal(r1.rulet.deposit, 5000);
  assert.equal(r1.onNumara.deposit, 0);
  assert.equal(r1.onNumara.carry, -3000);
  assert.deepEqual(await ledgerIn(db, '2026-10-25'), { gazino_slot: 600, gazino_rulet: 5000 });
  assert.equal(await balanceOf(db, 'rulet'), 0);
  assert.equal(await balanceOf(db, 'onNumara'), -3000, 'zarar yeni güne taşındı');

  // aynı gece tekrar çalışırsa hiçbir şey olmaz (idempotent)
  const again = await settleGameCasinoVaults(db, FieldValue, { dateKey: '2026-10-25' });
  assert.ok(again.slot.skipped && again.rulet.skipped && again.onNumara.skipped);
  assert.deepEqual(await ledgerIn(db, '2026-10-25'), { gazino_slot: 600, gazino_rulet: 5000 });

  // gün 2: 10 Numara +4.000 → önce −3.000 kapanır, devlete 1.000; rulet −2.000 → devlete 0
  await write(db, 'onNumara', 4000, 5);
  await write(db, 'rulet', -2000, 3);
  const r2 = await settleGameCasinoVaults(db, FieldValue, { dateKey: '2026-10-26' });
  assert.equal(r2.onNumara.deposit, 1000);
  assert.equal(r2.rulet.deposit, 0);
  assert.equal(r2.slot.deposit, 0);
  assert.deepEqual(await ledgerIn(db, '2026-10-26'), { gazino_onNumara: 1000 });
  assert.equal(await balanceOf(db, 'onNumara'), 0);
  assert.equal(await balanceOf(db, 'rulet'), -2000);
});

test('index.js: slot/rulet/10 Numara kasaya yazar, gece kasalar kapanır, piyango kârı devlete', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const slot = src.slice(src.indexOf('export const spinSlot'), src.indexOf('export const spinRoulette'));
  assert.ok(slot.includes("vaultWrite(tx, db, admin.firestore.FieldValue, 'slot', { delta: GAME_SLOT_STATE_CUT"));
  const rul = src.slice(src.indexOf('export const spinRoulette')).slice(0, 2500);
  assert.ok(rul.includes("'rulet', { delta: nb.total - payout"));
  assert.ok(src.includes("'onNumara', { delta: stakes"));
  assert.ok(src.includes("'onNumara', { delta: -back"));
  assert.ok(src.includes("'onNumara', { delta: -paid"));
  assert.ok(src.includes("settleGameCasinoVaults(db, admin.firestore.FieldValue, { dateKey })"));
  assert.ok(src.includes("cat: 'gazino_piyango'"));
  // belediye raporu: gece tahsil edilen fabrika vergisi yeni güne
  assert.ok(src.includes("source: 'fabrika', uid: f.id, dayKey: dateKey"));
});

test('zarar birikir: −3.000 kapanan kasa ertesi gün −4.000 daha yaparsa −7.000; sonra +10.000 → devlete 3.000', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  await write(db, 'onNumara', -3000, 3);
  const d1 = await settleGameCasinoVaults(db, FieldValue, { dateKey: '2026-10-25' });
  assert.equal(d1.onNumara.carry, -3000);
  assert.equal(d1.onNumara.deposit, 0);
  // yeni günün işlemleri farklı parçalara dağılır
  await write(db, 'onNumara', -1500, 6);
  await write(db, 'onNumara', -2500, 9);
  const d2 = await settleGameCasinoVaults(db, FieldValue, { dateKey: '2026-10-26' });
  assert.equal(d2.onNumara.balance, -7000);
  assert.equal(d2.onNumara.carry, -7000);
  assert.equal(d2.onNumara.deposit, 0);
  assert.equal(await balanceOf(db, 'onNumara'), -7000);
  assert.deepEqual(await ledgerIn(db, '2026-10-26'), {}, 'devlete para gitmedi');
  // rulet kasası bu zarardan etkilenmez
  assert.equal(await balanceOf(db, 'rulet'), 0);
  await write(db, 'rulet', 1000, 0);
  await write(db, 'onNumara', 10000, 2);
  const d3 = await settleGameCasinoVaults(db, FieldValue, { dateKey: '2026-10-27' });
  assert.equal(d3.onNumara.deposit, 3000);
  assert.equal(d3.rulet.deposit, 1000);
  assert.deepEqual(await ledgerIn(db, '2026-10-27'), { gazino_onNumara: 3000, gazino_rulet: 1000 });
  assert.equal(await balanceOf(db, 'onNumara'), 0);
});
