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
  const kk = fresh.find((g) => g?.name === 'Kara Kartallar');
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
