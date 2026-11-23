// v187 — araç modifiye: yarış şeridi her araçta gövdeye oturur; oyuncu kapı numarası eklediğinde
// aracın fabrika numarası gizlenir. Çalıştır: node --test tests/city/arac-modifiye.test.mjs
// Gerçek 3D model three.js ile kurulur (çizim yok), şerit parçalarının altından gövdeye ışın atılır.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Vite gibi uzantısız göreli içe aktarmaları .js'e çöz
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[cm]?jsx?$/.test(spec)) return next(spec + '.js', ctx);
    throw e;
  }
}`));
// tuval yok: yazı dokuları boş çizilir
const ctx2d = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : /Gradient$/.test(String(k)) ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document ??= { createElement: () => ({ getContext: () => ctx2d }) };

const THREE = await import('three');
const V = await import('../../src/components/City/vehicles.js');

function parts(model) {
  const stripes = [];
  const shells = [];
  const numbers = [];
  model.body.updateWorldMatrix(true, true);
  model.body.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const p = g.parameters || {};
    if (o.userData.raceStripe) stripes.push(o);
    else if (g.type === 'ExtrudeGeometry') shells.push(o);
    // kapı numarası rozetleri: kare (0,40 / 0,42 m) dokulu düzlem; plakalar dikdörtgen
    else if (g.type === 'PlaneGeometry' && o.material?.map && Math.abs(p.width - p.height) < 1e-6 && p.width >= 0.39 && p.width <= 0.43) numbers.push(o);
  });
  return { stripes, shells, numbers };
}

// şeridin alt yüzü ile en yakın gövde yüzeyi arasındaki dikey fark (+ havada, − gömük).
// Aracın boyunca 3 cm arayla, iki şeridin iki kenarında yukarıdan ışın atılır.
function gaps(model) {
  const { stripes, shells } = parts(model);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const L = model.spec.L;
  const out = [];
  for (let x = -L / 2; x <= L / 2; x += 0.03) {
    for (const z of [-0.245, -0.075, 0.075, 0.245]) {
      ray.set(model.body.localToWorld(new THREE.Vector3(x, 4, z)), down);
      const top = ray.intersectObjects(stripes, false)[0];
      if (!top) continue;
      const bottom = top.point.y - 0.0065;
      let best = null;
      for (const h of ray.intersectObjects(shells, false)) {
        const d = bottom - h.point.y;
        if (best == null || Math.abs(d) < Math.abs(best)) best = d;
      }
      out.push(best == null ? 9 : best);
    }
  }
  return { n: out.length, max: Math.max(...out), min: Math.min(...out) };
}

const CARS = V.VEHICLES.map((v) => v.id);

test('10 galeri aracının hepsi denendi', () => {
  assert.equal(CARS.length, 10);
});

for (const id of CARS) {
  for (const [ad, extra] of [
    ['fabrika', {}],
    ['açık tavan + yüksek süspansiyon + büyük jant', { roof: 'acik', ride: 0.15, wheelScale: 1.2 }],
    ['kapalı tavan', { roof: 'kapali' }],
  ]) {
    test(`yarış şeridi gövdeye oturur: #${id} ${V.VEHICLE_BY_ID[id].name} (${ad})`, () => {
      const base = V.defaultCarConfig(id);
      const g = gaps(V.buildCarModel(id, { ...base, ...extra, roof: extra.roof || base.roof, livery: 'yaris' }));
      assert.ok(g.n > 40, 'şerit çizildi');
      assert.equal(parts(V.buildCarModel(id, { ...base, livery: 'yaris' })).stripes.length, 1, 'tek örgü');
      assert.ok(g.max <= 0.012, `havada kalan yer var: ${g.max.toFixed(3)} m`);
      assert.ok(g.min >= -0.004, `gövdeye gömülen yer var: ${g.min.toFixed(3)} m`);
    });
  }
}

test('şeritsiz araçta şerit yok', () => {
  assert.equal(parts(V.buildCarModel(5, V.defaultCarConfig(5))).stripes.length, 0);
});

// GT Yarış Arabası (#9) fabrikadan 77 numaralı gelir
const num = (cfg) => parts(V.buildCarModel(9, { ...V.defaultCarConfig(9), ...cfg })).numbers.length;

test('kapı numarası: fabrika numarası tek başına (2 yan)', () => {
  assert.equal(num({}), 2);
});

test('kapı numarası: oyuncu numara ekleyince fabrika numarası gizlenir (yine 2 yan, üst üste binmez)', () => {
  assert.equal(num({ sideNo: '12' }), 2);
});

test('kapı numarası: yarış şeridinin varsayılan 77si de fabrika numarasıyla çakışmaz', () => {
  assert.equal(num({ livery: 'yaris' }), 2);
  assert.equal(num({ livery: 'yaris', sideNo: '5' }), 2);
});

test('kapı numarası: numara kaldırılınca fabrika numarası geri gelir', () => {
  assert.equal(num({ sideNo: '' }), 2);
  const withNo = parts(V.buildCarModel(9, { ...V.defaultCarConfig(9), sideNo: '12' })).numbers.map((m) => m.material.map);
  const factory = parts(V.buildCarModel(9, V.defaultCarConfig(9))).numbers.map((m) => m.material.map);
  assert.notEqual(withNo[0], factory[0], 'farklı doku: oyuncunun numarası');
});

test('kapı numarası: numarasız sivil araçta numara yok', () => {
  assert.equal(parts(V.buildCarModel(5, V.defaultCarConfig(5))).numbers.length, 0);
});
