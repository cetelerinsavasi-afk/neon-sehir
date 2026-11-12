// v157.4 — karargah ataması (tek seferlik): 2 yeni çete + güce göre hangar yerleri
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

test('v157.4: karargah ataması — en güçlü 2 → 0,3 · sonraki 2 → 1,4 · 2 yeni çete → 2,5; tekrar çalışınca değişmez', async () => {
  const h = await createHarness();
  const names = ['Alfa', 'Beta', 'Gama', 'Delta'];
  const ids = {};
  for (const n of names) ids[n] = (await setupGang(h, { members: 0, name: n })).gangId;
  const pw = { Alfa: 100, Beta: 500, Gama: 300, Delta: 50 };
  for (const n of names) await h.db.doc(`gangWorlds/test/gangs/${ids[n]}`).update({ lastSundayPower: pw[n] });
  const ctx = h.internal.core.makeCtx('test', h.db._get('gangWorlds/test'));
  const r = await h.internal.clock.ensureHqSlots(ctx);
  assert.equal(h.get(`gangs/${ids.Beta}`).hqSlot, 0);
  assert.equal(h.get(`gangs/${ids.Gama}`).hqSlot, 3);
  assert.equal(h.get(`gangs/${ids.Alfa}`).hqSlot, 1);
  assert.equal(h.get(`gangs/${ids.Delta}`).hqSlot, 4);
  const known = new Set(Object.values(ids));
  const fresh = Object.keys(r.slots).filter((id) => !known.has(id)).map((id) => h.get(`gangs/${id}`));
  const kk = fresh.find((g) => g?.name === 'Kara Şahinler'); // v157.9: eski adı Kara Kartallar
  const gk = fresh.find((g) => g?.name === 'Gece Kurtları');
  assert.ok(kk && gk, 'iki yeni çete');
  assert.equal(kk.hqSlot, 2);
  assert.equal(gk.hqSlot, 5);
  assert.equal(kk.memberCount, 0);
  assert.equal(kk.babaId, null);
  assert.equal(kk.status, 'active');
  assert.equal(Object.keys(r.slots).length, 6);
  const again = await h.internal.clock.ensureHqSlots(ctx);
  assert.equal(again.skipped, true);
});

test('v157.9: Kara Kartallar → Kara Şahinler (sadece oyunun kurduğu çete, ad dizini taşınır, tek sefer)', async () => {
  const h = await createHarness();
  const { gangId } = await setupGang(h, { members: 0, name: 'Kara Kartallar' });
  const other = (await setupGang(h, { members: 0, name: 'Alfa' })).gangId;
  const ctx = h.internal.core.makeCtx('test', h.db._get('gangWorlds/test'));
  // atama yapılmadan önce bekler
  const w = await h.internal.clock.renameKaraSahinler(ctx);
  assert.equal(w.waiting, true);
  assert.equal(h.get(`gangs/${gangId}`).name, 'Kara Kartallar');
  await h.db.doc('gangWorlds/test/meta/hqSlots').set({ done: true, slots: { [gangId]: 2, [other]: 0 } });
  const r = await h.internal.clock.renameKaraSahinler(ctx);
  assert.equal(r.renamed, gangId);
  const g = h.get(`gangs/${gangId}`);
  assert.equal(g.name, 'Kara Şahinler');
  const nk = h.internal.core.nameKeyOf('Kara Şahinler');
  assert.equal(g.nameKey, nk);
  assert.equal(h.get(`gangNames/${nk}`).gangId, gangId);
  assert.equal(h.get(`gangNames/${h.internal.core.nameKeyOf('Kara Kartallar')}`), undefined);
  assert.equal(h.get(`gangs/${other}`).name, 'Alfa');
  const again = await h.internal.clock.renameKaraSahinler(ctx);
  assert.equal(again.skipped, true);
});

test('v157.9: kıdemli kadro çete belgesinde (Baba → Sağ Kol → Kıdemli, en çok 7, sadece değişince yazılır)', async () => {
  const h = await createHarness();
  const { gangId } = await setupGang(h, { members: 12, name: 'Alfa' });
  const ctx = h.internal.core.makeCtx('test', h.db._get('gangWorlds/test'));
  await h.internal.core.refreshGangRoster(ctx, gangId);
  const s = h.get(`gangs/${gangId}`).seniors;
  assert.ok(Array.isArray(s) && s.length > 0 && s.length <= 7);
  assert.equal(s[0].rank, 'baba');
  const ORD = { baba: 0, sagkol: 1, kidemli: 2 };
  s.forEach((m, i) => {
    assert.ok(m.rank in ORD);
    if (i) assert.ok(ORD[s[i - 1].rank] <= ORD[m.rank]);
    assert.ok(m.uid && typeof m.name === 'string');
  });
});
