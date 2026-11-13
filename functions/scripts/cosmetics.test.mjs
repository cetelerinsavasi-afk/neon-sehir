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

test('v79 kaydet: önizlemedeki görünüm tek seferde kuşanılır, sahip olunmayanlar atlanır', async () => {
  const h = setup({ cosmetics: { pets: { golden: 1, tavsan: 1 }, accs: { crown: 1, monocle: 1 } }, avatar: { gender: 'erkek', hat: 'fedora', pet: { id: 'tavsan' }, acc: { face: 'monocle' } } });
  await h.init();
  const r = await h.c.action('ali', { op: 'save', pet: { id: 'golden', leash: false, leashColor: '#22d3ee' }, acc: { head: 'crown', back: 'angel' } });
  assert.deepEqual(r.skipped, ['angel']);
  const u = h.G('users/ali');
  assert.deepEqual(u.avatar.pet, { id: 'golden', leash: false, leashColor: '#22d3ee' });
  assert.deepEqual(u.avatar.acc, { head: 'crown' }, 'monokl çıkarıldı, sahip olunmayan melek kanadı yazılmadı');
  assert.equal(u.avatar.hat, 'fedora');
  // hepsini çıkar
  await h.c.action('ali', { op: 'save', pet: null, acc: {} });
  assert.equal(h.G('users/ali').avatar.pet, undefined);
  assert.equal(h.G('users/ali').avatar.acc, undefined);
  // geçersiz kimlik / yuva
  await assert.rejects(h.c.action('ali', { op: 'save', pet: { id: 'yok' } }), /Geçersiz/);
  await assert.rejects(h.c.action('ali', { op: 'save', acc: { face: 'crown' } }), /Geçersiz/);
  // satın alınmamış hayvan denenip kaydedilirse mevcut hayvan KALIR
  await h.c.action('ali', { op: 'save', pet: { id: 'tavsan' }, acc: { face: 'monocle' } });
  const r2 = await h.c.action('ali', { op: 'save', pet: { id: 'aslan' }, acc: { face: 'visor', head: 'crown' } });
  assert.deepEqual(r2.skipped, ['aslan', 'visor']);
  assert.equal(h.G('users/ali').avatar.pet.id, 'tavsan');
  assert.deepEqual(h.G('users/ali').avatar.acc, { face: 'monocle', head: 'crown' });
  // renk paletten değilse varsayılan
  await h.c.action('ali', { op: 'save', pet: { id: 'golden', leashColor: 'red;}' } });
  assert.equal(h.G('users/ali').avatar.pet.leashColor, '#ff2e88');
});

// v160 — KOSTÜMLER (hazır tipler)
test('v160 kostüm: zümrütle al + renklerle kuşan, renk değiştir, çıkar; aksesuar kaydı kostüme dokunmaz', async () => {
  const { LOOKS, LOOK_MAP } = await import('../cosmeticsData.js');
  assert.equal(LOOKS.length, 100);
  const prices = LOOKS.map((l) => l.gem);
  assert.equal(Math.min(...prices), 10, 'en ucuzu 10 zümrüt');
  assert.equal(Math.max(...prices), 200, 'en pahalısı 200 zümrüt');
  assert.ok(LOOKS.filter((l) => l.r === 'l').every((l) => l.gem >= 120), 'efsaneviler pahalı');
  const h = setup({ emerald: 40, cosmetics: { accs: { crown: 1 } }, avatar: { gender: 'erkek', hat: 'fedora', acc: { head: 'crown' } } });
  await h.init();
  // yetersiz zümrüt
  await assert.rejects(h.c.action('ali', { op: 'buy', kind: 'look', id: 'zeus' }), /Yetersiz zümrüt/);
  await assert.rejects(h.c.action('ali', { op: 'buy', kind: 'look', id: 'yok' }), /Geçersiz/);
  // al (30 zümrüt) + renk; bozuk renk ayıklanır
  const volt = LOOK_MAP.volt;
  await h.c.action('ali', { op: 'buy', kind: 'look', id: 'volt', tint: { 0: '#C81D3F', 1: 'red"/>', s: '#6b4226', 7: '#ffffff' } });
  let u = h.G('users/ali');
  assert.equal(u.emerald, 40 - volt.gem);
  assert.ok(u.cosmetics.looks.volt);
  assert.equal(u.avatar.look, 'volt');
  assert.deepEqual(u.avatar.lookTint, { 0: '#c81d3f', s: '#6b4226' });
  assert.deepEqual(u.avatar.acc, { head: 'crown' }, 'aksesuar korunur');
  await assert.rejects(h.c.action('ali', { op: 'buy', kind: 'look', id: 'volt' }), /zaten sende/);
  // renk değiştir (ücretsiz)
  await h.c.action('ali', { op: 'lookTint', tint: { 1: '#22d3ee' } });
  assert.deepEqual(h.G('users/ali').avatar.lookTint, { 1: '#22d3ee' });
  // aksesuar Kaydet'i kostümü çıkarmaz
  await h.c.action('ali', { op: 'save', pet: null, acc: {} });
  assert.equal(h.G('users/ali').avatar.look, 'volt');
  assert.equal(h.G('users/ali').avatar.acc, undefined);
  // sahip olunmayan kuşanılamaz
  await assert.rejects(h.c.action('ali', { op: 'equip', kind: 'look', id: 'zeus' }), /Önce satın almalısın/);
  // çıkar
  await h.c.action('ali', { op: 'unequip', kind: 'look' });
  u = h.G('users/ali');
  assert.equal(u.avatar.look, undefined);
  assert.equal(u.avatar.lookTint, undefined);
  await assert.rejects(h.c.action('ali', { op: 'lookTint', tint: { 0: '#ffffff' } }), /Önce bir kostüm/);
  // tekrar kuşan
  await h.c.action('ali', { op: 'equip', kind: 'look', id: 'volt' });
  assert.equal(h.G('users/ali').avatar.look, 'volt');
  // avatar düzenleme (setAvatar → cleanEquipped) kostümü korur; satın alınmayan kostüm düşer
  assert.deepEqual(cleanEquipped({ look: 'volt', lookTint: { 0: '#AABBCC' } }, { looks: { volt: 1 } }), { look: 'volt', lookTint: { 0: '#aabbcc' } });
  assert.deepEqual(cleanEquipped({ look: 'zeus' }, { looks: { volt: 1 } }), {});
});
