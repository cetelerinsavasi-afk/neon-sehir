// v191 — şehir ağ katmanı (src/components/City/cityNet.js): kalabalıkta kasma düzeltmesi.
// Bir oyuncu hareket edince motora SADECE o oyuncu gider (eskiden hücredeki herkes yeniden gidiyordu:
// 10 kişide kayıt başına 10, 100 kişide 100 iş). Sahte RTDB ile, gerçek Firebase'e bağlanmadan.
// Çalıştır: node --test tests/city/city-net-load.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadCityNet, simulate } from './_rtdbStub.mjs';

const FILE = fileURLToPath(new URL('../../src/components/City/cityNet.js', import.meta.url));

for (const players of [10, 60]) {
  test(`${players} oyuncu: kayıt başına motora ~1 güncelleme gider`, async () => {
    const { createCityNet, cellOf, fake } = await loadCityNet(FILE);
    const r = await simulate(createCityNet, cellOf, fake, { players, ms: 1600 });
    assert.ok(r.writes > players * 3, `yazım ${r.writes}`);
    assert.ok(r.perWrite <= 1.3, `kayıt başına ${r.perWrite} güncelleme (eski kod ≈ ${players})`);
    assert.ok(r.onPlayerCalls >= r.writes * 0.8, `güncellemeler kaybolmamalı: ${r.onPlayerCalls}/${r.writes}`);
  });
}

test('resync: engel kalkınca herkes yeniden gönderilir', async () => {
  const { createCityNet, cellOf, fake } = await loadCityNet(FILE);
  fake.data.set('city/u/a', { n: 'A', a: '{}' });
  const seen = [];
  const net = createCityNet({ uid: 'me', name: 'Ben', avatar: {}, onPlayer: (id) => seen.push(id), onPlayerGone: () => {}, onCar: () => {}, onCarGone: () => {} });
  net.tick({ x: 1, z: 1, p: 'w' }, null);
  await new Promise((r) => setTimeout(r, 30));
  await fake.set({ path: `city/p/${cellOf(1, 1)}/a` }, { x: 2, z: 2, p: 'w', t: fake.serverTimestamp() });
  await new Promise((r) => setTimeout(r, 150));
  const n0 = seen.length;
  assert.ok(n0 >= 1);
  await new Promise((r) => setTimeout(r, 1700)); // süpürme (1,5 sn) değişmeyen kaydı tekrar göndermez
  assert.equal(seen.length, n0);
  net.resync();
  assert.equal(seen.length, n0 + 1);
  net.stop();
});

// ---------------------------------------------------------------------------------------------
// v192 — RTDB indirme maliyeti: kalabalıkta seyrek yazım, arabadayken seyrek kişi kaydı, araba
// kaydında sadece değişen alanlar (modifiye JSON'u her konumda gitmez)
// ---------------------------------------------------------------------------------------------
import { crowdBandwidth } from './_rtdbStub.mjs';

test('sürerken: araba kaydı modifiyeyi her seferinde göndermez, kişi kaydı ~3 sn de bir', async () => {
  const { createCityNet, fake } = await loadCityNet(FILE);
  const writes = [];
  const origSet = fake.set;
  const origUpd = fake.update;
  fake.set = async (r, v) => (writes.push({ op: 'set', path: r.path, v }), origSet(r, v));
  fake.update = async (r, v) => (writes.push({ op: 'update', path: r.path, v }), origUpd(r, v));
  const net = createCityNet({ uid: 'me', name: 'Ben', avatar: {}, onPlayer: () => {}, onPlayerGone: () => {}, onCar: () => {}, onCarGone: () => {} });
  const mods = JSON.stringify({ paint: '#ff2e88', rim: '#c9ccd2' });
  let x = 5;
  for (let i = 0; i < 40; i++) {
    x += 0.8;
    net.tick({ x, z: 5, l: 0, m: 0, p: 'd' }, { m: mods, ct: Date.now(), v: 5, x, z: 5, y: 0.1, s: 8, st: 0, d: 1 });
    await new Promise((r) => setTimeout(r, 100));
  }
  net.stop();
  const car = writes.filter((w) => w.path.startsWith('city/c/'));
  const carFull = car.filter((w) => w.op === 'set');
  const carPatch = car.filter((w) => w.op === 'update');
  assert.ok(carPatch.length >= 8, `konum güncellemeleri: ${carPatch.length}`);
  assert.ok(carFull.length <= 2, `tam araba kaydı (modifiyeli) ${carFull.length} kez`);
  assert.ok(carPatch.every((w) => w.v.m === undefined && w.v.v === undefined), 'güncellemede modifiye yok');
  assert.equal(fake.data.get(car[0].path)?.m, undefined, 'stop sonrası kayıt silindi'); // stop() drop eder
  const me = writes.filter((w) => w.path.startsWith('city/p/') && w.op === 'set');
  assert.ok(me.length <= 3, `4 sn sürüşte kişi kaydı ${me.length} kez (eskiden ~18)`);
});

test('kalabalık (60 kişi, herkes aynı yerde): kişi başı inen veri sınırlı', async () => {
  const { createCityNet, fake } = await loadCityNet(FILE);
  const r = await crowdBandwidth(createCityNet, fake, { n: 60, ms: 2500 });
  // v191 bu senaryoda ~3,2 MB/sn; v192 ~1 MB/sn civarı
  assert.ok(r.bytesPerSec < 1_800_000, `${r.bytesPerSec} bayt/sn`);
});
