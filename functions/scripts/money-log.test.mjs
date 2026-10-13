// v92 — Profil › Günlük rapor (functions/moneyLog.js)
// Çalıştır: node --test functions/scripts/money-log.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { goldTag, tagSource, tagEntries, recordGoldChange, cleanupMoneyLog, realizeSale, realizeBankWithdraw } from '../moneyLog.js';

test('etiket: kaynak + benzersiz ek; geçersiz kaynak "diger"', () => {
  const a = goldTag('menu');
  const b = goldTag('menu');
  assert.notEqual(a, b);
  assert.equal(tagSource(a), 'menu');
  assert.equal(tagSource('???'), 'diger');
  assert.equal(tagSource(goldTag('a b/c')), 'abc');
});

test('altın farkı günlük özete kaynağıyla yazılır; etiketsiz değişim "diger" olur', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const G = (p) => db._store.get(p)?.data;
  const at = Date.UTC(2026, 9, 12, 21, 30); // İstanbul 13 Ekim 00:30
  const t1 = goldTag('menu');
  await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 1000 }, after: { gold: 900, goldTag: t1 }, atMs: at });
  await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 900, goldTag: t1 }, after: { gold: 950, goldTag: goldTag('garson') }, atMs: at });
  // etiket değişmeden altın değişti (etiketsiz yazma) → diger
  await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 950, goldTag: 'garson|x' }, after: { gold: 1950, goldTag: 'garson|x' }, atMs: at });
  // altın değişmedi → yazılmaz
  assert.equal(await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 1950 }, after: { gold: 1950, xp: 3 }, atMs: at }), null);
  const d = G('moneyLog/u1_2026-10-13');
  assert.equal(d.uid, 'u1');
  assert.equal(d.in, 1050);
  assert.equal(d.out, 100);
  assert.equal(d.by.menu.out, 100);
  assert.equal(d.by.garson.in, 50);
  assert.equal(d.by.diger.in, 1000);
  assert.equal(d.n, 3);
});

test('eski günler temizlenir (bugün + önceki 2 gün kalır)', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, v) => db._store.set(p, { data: v, version: 1 });
  ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].forEach((day) => S(`moneyLog/u1_${day}`, { uid: 'u1', day, in: 1, out: 0 }));
  const r = await cleanupMoneyLog({ db, now: Date.UTC(2026, 9, 13, 9) });
  assert.equal(r.days, 2);
  assert.ok(db._store.get('moneyLog/u1_2026-10-11'));
  assert.equal(db._store.get('moneyLog/u1_2026-10-10'), undefined);
});

test('v92.3 yatırım: anapara rapora girmez, sadece kâr/zarar + komisyon + faiz', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const G = (p) => db._store.get(p)?.data;
  const at = Date.UTC(2026, 9, 13, 9);
  // etiket kalemleri
  const tz = goldTag('yatirim', { yatirimKz: -250, komisyon: -48, bos: 0 });
  assert.equal(tagSource(tz), 'yatirim');
  assert.deepEqual(tagEntries(tz), [['yatirimKz', -250], ['komisyon', -48]]);
  assert.deepEqual(tagEntries(goldTag('yatirim', {})), []);
  assert.equal(tagEntries(goldTag('menu')), null);
  // alım (−5000) → yazılmaz
  const r1 = await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 10000 }, after: { gold: 5000, goldTag: goldTag('yatirim', {}) }, atMs: at });
  assert.equal(r1.skipped, true);
  assert.equal(G('moneyLog/u1_2026-10-13'), undefined);
  // satış: 5000 maliyet, 4800 brüt, 48 komisyon → cebe 4752 girer; raporda −200 zarar, −48 komisyon
  const s = realizeSale({ cost: 5000, have: 2, units: 2, gross: 4800 });
  assert.deepEqual(s, { pnl: -200, newCost: 0 });
  await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 5000 }, after: { gold: 9752, goldTag: goldTag('yatirim', { yatirimKz: s.pnl, komisyon: -48 }) }, atMs: at });
  // banka: 1000 anapara 1100 bakiye, 550 çek → 50 faiz
  const b = realizeBankWithdraw({ principal: 1000, balance: 1100, amount: 550 });
  assert.deepEqual(b, { interest: 50, newPrincipal: 500 });
  await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 9752 }, after: { gold: 10302, goldTag: goldTag('banka', { faiz: b.interest }) }, atMs: at });
  const d = G('moneyLog/u1_2026-10-13');
  assert.equal(d.in, 50);
  assert.equal(d.out, 248);
  assert.equal(d.by.yatirimKz.out, 200);
  assert.equal(d.by.komisyon.out, 48);
  assert.equal(d.by.faiz.in, 50);
  assert.equal(d.by.yatirim, undefined);
  assert.equal(d.n, 2);
});

test('v92.3 kısmi satış ortalama maliyetle; kâr da yazılır', () => {
  // 4 adet 1000 maliyet; 1 adet 400'e satıldı → +150 kâr, kalan maliyet 750
  assert.deepEqual(realizeSale({ cost: 1000, have: 4, units: 1, gross: 400 }), { pnl: 150, newCost: 750 });
  // banka: faiz yokken çekim → 0
  assert.deepEqual(realizeBankWithdraw({ principal: 800, balance: 800, amount: 300 }), { interest: 0, newPrincipal: 500 });
  // tamamı çekilince anapara sıfırlanır
  assert.deepEqual(realizeBankWithdraw({ principal: 800, balance: 900, amount: 900 }), { interest: 100, newPrincipal: 0 });
});
