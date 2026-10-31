// v137 — ev hayvanı ayarı (petSet) + veri modülü
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { ITEM_PRICES } from '../houseCatalogData.js';
import { ANIMALS, PET_TINTS, cleanPetConfig, petLines, petName, petTintOf, petTintsKey } from '../animalData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

test('hayvan verisi: her hayvanın fiyatı var, iyileri zümrüt; renk seçenekleri', () => {
  for (const a of ANIMALS) {
    assert.ok(ITEM_PRICES[a.k], a.k);
    assert.ok(PET_TINTS[petTintsKey(a.k)], a.k);
  }
  assert.equal(ITEM_PRICES.hy_midilli.t, 'gem');
  assert.equal(ITEM_PRICES.hy_hamster.t, 'gold');
  assert.equal(petTintOf('hy_golden', 0), null, 'doğal renk');
  assert.deepEqual(petTintOf('hy_golden', 1), { c: '#1d1d26', c2: '#3a3a48' });
  assert.deepEqual(cleanPetConfig({ n: ' <b>Karabaş</b> ', l: ['a', '', ''], mv: 'uç' }), { n: 'bKarabaş/b', l: ['a'], mv: 'hareket' });
  assert.equal(petName('hy_golden', null), 'Golden Köpek');
  assert.ok(petLines('hy_golden', null).length === 3);
  assert.deepEqual(petLines('hy_golden', { l: [] }), []);
});

test('petSet: sadece satın alınmış hayvan, sahibi; odada olmayan ayarlar temizlenir', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const houses = createHouses({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, isAdmin: () => false, assertCanSpeak: async () => {}, isFriend: async () => false });
  db._store.set('houses/h1', { data: { ownerUid: 'u1', items: [{ i: 'a1', k: 'hy_golden', x: 0, z: 0, p: 1 }, { i: 'a2', k: 'hy_sokak', x: 1, z: 0 }], pets: { old: { n: 'x' } } }, version: 1 });
  const act = (uid, data) => houses.houseAction({ auth: { uid }, data });
  await act('u1', { op: 'petSet', houseId: 'h1', i: 'a1', cfg: { n: 'Karabaş', l: ['Hav!'], mv: 'serbest' } });
  assert.deepEqual(db._get('houses/h1').pets, { a1: { n: 'Karabaş', l: ['Hav!'], mv: 'serbest' } });
  await assert.rejects(act('u1', { op: 'petSet', houseId: 'h1', i: 'a2', cfg: {} }), /pet-trial/);
  await assert.rejects(act('u2', { op: 'petSet', houseId: 'h1', i: 'a1', cfg: {} }), /senin değil/);
  await assert.rejects(act('u1', { op: 'petSet', houseId: 'h1', i: 'zz', cfg: {} }), /pet-unsaved/);
});
