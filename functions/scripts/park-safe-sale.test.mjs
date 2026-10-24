// v103 — Parkta güvenli yasaklı madde satışı (index.js'teki GERÇEK kod, sahte Firestore).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { goldTag } from '../moneyLog.js';
import { crimeLockedBySuspicion, CRIME_LOCK_TEXT } from '../policeRules.js';

const src = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
const a = src.indexOf('const PARK_SAFE_SELL_PRICE');
const b = src.indexOf('export const sellContrabandAtPark');
assert.ok(a > 0 && b > a);
const code = src.slice(a, b) + '\nreturn { sellContrabandSafe };';

class HttpsError extends Error {
  constructor(c, m) {
    super(m);
    this.code = c;
  }
}
function setup({ inGang = true, day = '2026-10-20' } = {}) {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const calls = [];
  const gangFunctions = { system: { onContrabandHarac: async (uid, amt, ref) => (calls.push([uid, amt, ref]), inGang ? { credited: amt, gangName: 'X' } : { credited: 0, burned: amt }) } };
  const splitIncomeForDebt = (debt, amount) => {
    if (!(debt > 0)) return { goldDelta: amount, debtDelta: 0 };
    const repay = Math.min(Math.floor(amount / 2), debt);
    return { goldDelta: amount - repay, debtDelta: -repay };
  };
  const fns = new Function('db', 'admin', 'HttpsError', 'istanbulDateKey', 'splitIncomeForDebt', 'goldTag', 'gangFunctions', 'advanceOnboardingStep', 'crimeLockedBySuspicion', 'CRIME_LOCK_TEXT', code)(
    db, { firestore: { FieldValue, Timestamp } }, HttpsError, () => day, splitIncomeForDebt, goldTag, gangFunctions, async () => {}, crimeLockedBySuspicion, CRIME_LOCK_TEXT
  );
  S('users/u1', { gold: 0, suspicion: 30 });
  S('users/u1/inventory/yasakliMadde', { quantity: 12 });
  return { S, G, fns, calls };
}

test('güvenli satış: +2.500, şüphe değişmez, çeteye 500; günde en fazla 10', async () => {
  const { G, fns, calls } = setup();
  for (let i = 0; i < 10; i++) await fns.sellContrabandSafe('u1');
  assert.equal(G('users/u1').gold, 25_000);
  assert.equal(G('users/u1').suspicion, 30);
  assert.equal(G('users/u1/inventory/yasakliMadde').quantity, 2);
  assert.deepEqual(G('users/u1').parkSafeSales, { day: '2026-10-20', count: 10 });
  assert.equal(calls.length, 10);
  assert.equal(calls[0][1], 500);
  await assert.rejects(fns.sellContrabandSafe('u1'), /bugünlük bitti/);
  assert.equal(G('users/u1/inventory/yasakliMadde').quantity, 2);
});

test('yeni gün hakkı yeniler; çetesizde 500 gitmez; malı olmayan satamaz', async () => {
  const { S, G, fns } = setup({ inGang: false, day: '2026-10-21' });
  S('users/u1', { gold: 0, parkSafeSales: { day: '2026-10-20', count: 10 } });
  const r = await fns.sellContrabandSafe('u1');
  assert.equal(r.safeUsed, 1);
  assert.equal(r.gangCredited, false);
  S('users/u1/inventory/yasakliMadde', { quantity: 0 });
  await assert.rejects(fns.sellContrabandSafe('u1'), /Yeterli malınız yok/);
  assert.equal(G('users/u1').gold, 2500);
});

test('v123: şüphe 50+ iken güvenli satış da yapılamaz (mal ve hak yerinde kalır); 49 satabilir', async () => {
  const { S, G, fns, calls } = setup();
  S('users/u1', { gold: 0, suspicion: 50 });
  await assert.rejects(fns.sellContrabandSafe('u1'), /Şüphen 50\+ iken suç işleyemezsin/);
  assert.equal(G('users/u1/inventory/yasakliMadde').quantity, 12);
  assert.equal(G('users/u1').parkSafeSales, undefined);
  assert.equal(calls.length, 0);
  S('users/u1', { gold: 0, suspicion: 49 });
  await fns.sellContrabandSafe('u1');
  assert.equal(G('users/u1/inventory/yasakliMadde').quantity, 11);
});
