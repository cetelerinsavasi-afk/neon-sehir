// v77 — mekân ziyaret sayacı (functions/visits.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createVisits } from '../visits.js';

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const G = (p) => db._store.get(p)?.data;
  const clock = { now: Date.UTC(2026, 9, 7, 9) }; // 12:00 İstanbul
  const visits = createVisits({ db, FieldValue, now: () => clock.now });
  return { db, G, clock, visits };
}

test('ziyaret: bir hesap bir mekâna günde 1 kez sayılır, gün 00:00 da döner', async () => {
  const h = setup();
  for (let i = 0; i < 5; i++) {
    await h.visits.recordVenueVisit('ali', { venue: 'camii' });
    h.clock.now += 3600_000; // saatler sonra yine girse de
  }
  await h.visits.recordVenueVisit('veli', { venue: 'camii' });
  assert.equal(h.G('venueVisits/2026-10-07_camii').count, 2, 'ali 1 + veli 1');
  await h.visits.recordVenueVisit('ali', { venue: 'banka' });
  assert.equal(h.G('venueVisits/2026-10-07_banka').count, 1, 'başka mekân ayrı sayılır');
  // geçersiz mekân yok sayılır
  await h.visits.recordVenueVisit('ali', { venue: 'yok' });
  assert.equal(h.G('venueVisits/2026-10-07_yok'), undefined);
  // gece yarısından sonra yeni gün → yeniden sayılır
  h.clock.now = Date.UTC(2026, 9, 7, 21, 5); // 00:05 İstanbul (8 Ekim)
  await h.visits.recordVenueVisit('ali', { venue: 'camii' });
  await h.visits.recordVenueVisit('ali', { venue: 'camii' });
  assert.equal(h.G('venueVisits/2026-10-08_camii').count, 1);
});

test('ziyaret: herkese açık ev ve işletmeler sayılır (sahibi dahil), gizli ev sayılmaz', async () => {
  const h = setup();
  await h.visits.recordHouseVisit('sahip', 'e1', { name: 'Kafem', ownerName: 'Sahip', privacy: 'friends', biz: { type: 'cafe' } });
  await h.visits.recordHouseVisit('ali', 'e1', { name: 'Kafem', ownerName: 'Sahip', privacy: 'friends', biz: { type: 'cafe' } });
  await h.visits.recordHouseVisit('ali', 'e1', { name: 'Kafem', ownerName: 'Sahip', privacy: 'friends', biz: { type: 'cafe' } });
  const v = h.G('venueVisits/2026-10-07_h_e1');
  assert.equal(v.count, 2);
  assert.equal(v.kind, 'house');
  assert.equal(v.bizType, 'cafe');
  assert.equal(v.houseId, 'e1');
  await h.visits.recordHouseVisit('ali', 'e2', { name: 'Gizli', privacy: 'private' });
  assert.equal(h.G('venueVisits/2026-10-07_h_e2'), undefined);
});
