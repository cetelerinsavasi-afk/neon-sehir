// v78 — Evcil hayvan & aksesuar (functions/cosmetics.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createCosmetics } from '../cosmetics.js';
import { PETS, ACCESSORIES, cleanEquipped, priceOf } from '../cosmeticsData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function setup(user = {}) {
  const db = new FakeFirestore({ yieldEvery: false });
  const G = (p) => db._store.get(p)?.data;
  const c = createCosmetics({ db, FieldValue, HttpsError });
  return { db, G, c, init: () => db.doc('users/ali').set({ gold: 290_000, emerald: 60, avatar: { gender: 'erkek', hat: 'fedora' }, ...user }) };
}

test('katalog fiyat kuralı: 1 ürün 100.000 altın, 1 ürün 200.000 altın, zümrüt 200/150/100/50 + diğerleri 2-40', () => {
  for (const list of [PETS, ACCESSORIES]) {
    const gold = list.filter((x) => x.gold).map((x) => x.gold).sort((a, b) => a - b);
    assert.deepEqual(gold, [100_000, 200_000]);
    const gems = list.filter((x) => x.gem).map((x) => x.gem).sort((a, b) => b - a);
    assert.deepEqual(gems.slice(0, 4), [200, 150, 100, 50]);
    gems.slice(4).forEach((g) => assert.ok(g >= 2 && g <= 40, `${g} 2-40 arası`));
    assert.equal(new Set(list.map((x) => x.id)).size, list.length, 'kimlikler tekil');
  }
});

test('satın al: zümrüt/altın düşer, ürün sahiplenilir ve avatara kuşanılır; ikinci kez alınamaz', async () => {
  const h = setup();
  await h.init();
  await h.c.action('ali', { op: 'buy', kind: 'pet', id: 'papagan' });
  let u = h.G('users/ali');
  assert.equal(u.emerald, 40);
  assert.ok(u.cosmetics.pets.papagan);
  assert.deepEqual(u.avatar.pet, { id: 'papagan', leash: true, leashColor: '#ff2e88' });
  assert.equal(u.avatar.hat, 'fedora', 'avatarın geri kalanı korunur');
  await assert.rejects(h.c.action('ali', { op: 'buy', kind: 'pet', id: 'papagan' }), (e) => e.code === 'already-exists');
  await h.c.action('ali', { op: 'buy', kind: 'acc', id: 'foil' });
  u = h.G('users/ali');
  assert.equal(u.gold, 190_000);
  assert.deepEqual(u.avatar.acc, { head: 'foil' });
  // yetersiz bakiye
  await assert.rejects(h.c.action('ali', { op: 'buy', kind: 'acc', id: 'fire' }), /Yetersiz zümrüt/);
  await assert.rejects(h.c.action('ali', { op: 'buy', kind: 'acc', id: 'mustache' }), /Yetersiz altın/);
  assert.equal(priceOf(ACCESSORIES.find((a) => a.id === 'mustache')).amount, 200_000);
});

test('satın alınmayan ürün kuşanılamaz; çıkar / tasma rengi', async () => {
  const h = setup({ cosmetics: { pets: { golden: 1 }, accs: { halo: 1, hero: 1 } } });
  await h.init();
  await assert.rejects(h.c.action('ali', { op: 'equip', kind: 'pet', id: 'ejder' }), /satın almalısın/);
  await h.c.action('ali', { op: 'equip', kind: 'pet', id: 'golden' });
  await h.c.action('ali', { op: 'equip', kind: 'acc', id: 'halo' });
  await h.c.action('ali', { op: 'equip', kind: 'acc', id: 'hero' });
  assert.deepEqual(h.G('users/ali').avatar.acc, { head: 'halo', back: 'hero' });
  await h.c.action('ali', { op: 'leash', on: false });
  assert.equal(h.G('users/ali').avatar.pet.leash, false);
  await h.c.action('ali', { op: 'leash', color: '#22d3ee' });
  assert.deepEqual(h.G('users/ali').avatar.pet, { id: 'golden', leash: true, leashColor: '#22d3ee' });
  await assert.rejects(h.c.action('ali', { op: 'leash', color: '#123456' }), /Geçersiz tasma/);
  await h.c.action('ali', { op: 'unequip', kind: 'acc', slot: 'head' });
  assert.deepEqual(h.G('users/ali').avatar.acc, { back: 'hero' });
  await h.c.action('ali', { op: 'unequip', kind: 'pet' });
  assert.equal(h.G('users/ali').avatar.pet, undefined);
});

test('cleanEquipped: avatar düzenlenince sadece sahip olunan, geçerli kuşanılanlar kalır', () => {
  const cos = { pets: { tilki: 1 }, accs: { crown: 1 } };
  const out = cleanEquipped({ pet: { id: 'tilki', leashColor: '#evil"/>' }, acc: { head: 'crown', back: 'royal', face: 'crown' } }, cos);
  assert.deepEqual(out, { acc: { head: 'crown' }, pet: { id: 'tilki', leash: true, leashColor: '#ff2e88' } });
  assert.deepEqual(cleanEquipped({ pet: { id: 'aslan' } }, cos), {}, 'sahip olunmayan hayvan düşer');
});
