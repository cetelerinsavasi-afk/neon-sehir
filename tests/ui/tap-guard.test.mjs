// v187 — dokunup vazgeçme (src/lib/tapGuard.js). Çalıştır: node --test tests/ui/tap-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTapGuard, guardTarget, installTapGuard, SLOP } from '../../src/lib/tapGuard.js';

// --- minik sahte DOM: closest / contains / getBoundingClientRect --------------------
function matchOne(el, sel) {
  sel = sel.trim();
  const not = [...sel.matchAll(/:not\(\[type="([^"]+)"\]\)/g)].map((m) => m[1]);
  sel = sel.replace(/:not\([^)]*\)/g, '');
  const m = sel.match(/^([a-z]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i);
  if (!m) return false;
  const [, tag, cls, attrs] = m;
  if (tag && el.tag !== tag) return false;
  for (const c of cls.split('.').filter(Boolean)) if (!el.cls.includes(c)) return false;
  for (const a of attrs.match(/\[[^\]]+\]/g) || []) {
    const [, k, v] = a.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (!(k in el.attrs)) return false;
    if (v != null && el.attrs[k] !== v) return false;
  }
  if (not.length && not.includes(el.attrs.type)) return false;
  return true;
}
function node(tag, { cls = [], attrs = {}, rect = null, parent = null } = {}) {
  const el = {
    tag,
    cls,
    attrs,
    parentElement: parent,
    getBoundingClientRect: () => rect || parent?.getBoundingClientRect(),
    closest(selector) {
      for (let e = el; e; e = e.parentElement) if (selector.split(',').some((s) => matchOne(e, s))) return e;
      return null;
    },
    contains(other) {
      for (let e = other; e; e = e.parentElement) if (e === el) return true;
      return false;
    },
  };
  return el;
}
const RECT = { left: 100, right: 200, top: 100, bottom: 140 };
const ev = (type, target, x, y, extra = {}) => ({
  type,
  target,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  detail: 1,
  prevented: false,
  stopped: false,
  preventDefault() {
    this.prevented = true;
  },
  stopPropagation() {
    this.stopped = true;
  },
  stopImmediatePropagation() {
    this.stopped = true;
  },
  ...extra,
});
function press(g, target, path, { clickTarget = target, extra = {} } = {}) {
  const [x0, y0] = path[0];
  g.onDown(ev('pointerdown', target, x0, y0, extra));
  for (const [x, y] of path.slice(1)) g.onMove(ev('pointermove', target, x, y, extra));
  const [x1, y1] = path.at(-1);
  g.onUp(ev('pointerup', target, x1, y1, extra));
  const c = ev('click', clickTarget, x1, y1, { detail: extra.detail ?? 1 });
  g.onClick(c);
  return c;
}
const root = node('div', { attrs: { id: 'root' } });
const btn = node('button', { cls: ['bs-buy'], rect: RECT, parent: root });
const label = node('span', { parent: btn });

test('parmak butonda kalkarsa tıklama aynen geçer', () => {
  const c = press(createTapGuard(), label, [[150, 120], [155, 122], [160, 125]]);
  assert.equal(c.prevented, false);
  assert.equal(c.stopped, false);
});

test('parmak butonun dışına kayıp kalkarsa tıklama yutulur', () => {
  const c = press(createTapGuard(), label, [[150, 120], [150, 160], [150, 200]]);
  assert.equal(c.prevented, true);
  assert.equal(c.stopped, true);
});

test('dışarı çıkıp geri gelse de iptal (Android / iOS düğmeleri gibi)', () => {
  const c = press(createTapGuard(), btn, [[150, 120], [260, 120], [150, 120]]);
  assert.equal(c.prevented, true);
});

test(`kenarda ${SLOP} px pay: titreyen parmak iptal etmez`, () => {
  const c = press(createTapGuard(), btn, [[195, 120], [200 + SLOP - 1, 120]]);
  assert.equal(c.prevented, false);
});

test('fare ile tıklama hiç etkilenmez', () => {
  const c = press(createTapGuard(), btn, [[150, 120], [400, 400]], { extra: { pointerType: 'mouse' } });
  assert.equal(c.prevented, false);
});

test('klavye tıklaması (detail 0) etkilenmez', () => {
  const g = createTapGuard();
  g.onDown(ev('pointerdown', btn, 150, 120));
  g.onMove(ev('pointermove', btn, 400, 400));
  g.onUp(ev('pointerup', btn, 400, 400));
  const c = ev('click', btn, 0, 0, { detail: 0 });
  g.onClick(c);
  assert.equal(c.prevented, false);
});

test('kaydırma (pointercancel) sonrası durum temizlenir', () => {
  const g = createTapGuard();
  g.onDown(ev('pointerdown', btn, 150, 120));
  g.onMove(ev('pointermove', btn, 150, 300));
  g.onCancel(ev('pointercancel', btn, 150, 300));
  const c = ev('click', btn, 150, 120);
  g.onClick(c);
  assert.equal(c.prevented, false);
  assert.equal(g._state().press, null);
});

test('başka bir öğeye gelen tıklama yutulmaz', () => {
  const other = node('button', { rect: { left: 0, right: 50, top: 0, bottom: 50 }, parent: root });
  const c = press(createTapGuard(), btn, [[150, 120], [150, 300]], { clickTarget: other });
  assert.equal(c.prevented, false);
});

test('bayat kayıt: 1 sn sonra gelen tıklama yutulmaz', () => {
  let t = 0;
  const g = createTapGuard({ now: () => t });
  g.onDown(ev('pointerdown', btn, 150, 120));
  g.onMove(ev('pointermove', btn, 150, 300));
  g.onUp(ev('pointerup', btn, 150, 300));
  t = 1500;
  const c = ev('click', btn, 150, 120);
  g.onClick(c);
  assert.equal(c.prevented, false);
});

test('ikinci parmak basışı iptal eder', () => {
  const g = createTapGuard();
  g.onDown(ev('pointerdown', btn, 150, 120));
  g.onDown(ev('pointerdown', root, 10, 10, { pointerId: 2, isPrimary: false }));
  g.onUp(ev('pointerup', btn, 150, 120));
  const c = ev('click', btn, 150, 120);
  g.onClick(c);
  assert.equal(c.prevented, true, 'iki parmak (yakınlaştırma) bir basış değildir');
});

// --- OYUN İÇİ KONTROLLER: hiç izlenmez ---------------------------------------------
for (const [ad, mk] of [
  ['basılı tutma butonu (gaz/fren) [data-hold]', () => node('button', { attrs: { 'data-hold': '' }, rect: RECT, parent: root })],
  ['şehir sürüş tuşları .cs-drive', () => node('button', { rect: RECT, parent: node('div', { cls: ['cs-drive'], parent: root }) })],
  ['direksiyon .cs-steer', () => node('div', { cls: ['cs-steer'], attrs: { role: 'button' }, rect: RECT, parent: root })],
  ['arcade .gs-runner', () => node('button', { rect: RECT, parent: node('div', { cls: ['gs-runner'], parent: root }) })],
  ['piyano / davul .pn-panel', () => node('button', { rect: RECT, parent: node('div', { cls: ['pn-panel'], parent: root }) })],
  ['slot çevir .slot-spin-btn', () => node('button', { cls: ['slot-spin-btn'], rect: RECT, parent: root })],
  ['yarış vites .race-gear-btn', () => node('button', { cls: ['race-gear-btn'], rect: RECT, parent: root })],
  ['yarış zar .race-roll-btn', () => node('button', { cls: ['race-roll-btn'], rect: RECT, parent: root })],
  ['tuval (3D / oyun sahnesi)', () => node('canvas', { rect: RECT, parent: root })],
  ['muaf öğe [data-tap-instant]', () => node('button', { attrs: { 'data-tap-instant': '' }, rect: RECT, parent: root })],
  ['yazı alanı', () => node('input', { attrs: { type: 'text' }, rect: RECT, parent: node('label', { parent: root }) })],
]) {
  test(`dokunulmaz: ${ad}`, () => {
    const el = mk();
    assert.equal(guardTarget(el), null);
    const c = press(createTapGuard(), el, [[150, 120], [150, 300]]);
    assert.equal(c.prevented, false);
  });
}

test('izlenen arayüz öğeleri: buton, bağlantı, role=button, sekme, etiket', () => {
  assert.equal(guardTarget(label), btn);
  assert.ok(guardTarget(node('a', { attrs: { href: '#' }, parent: root })));
  assert.ok(guardTarget(node('div', { attrs: { role: 'button' }, parent: root })));
  assert.ok(guardTarget(node('div', { attrs: { role: 'tab' }, parent: root })));
  assert.ok(guardTarget(node('label', { parent: root })));
  assert.equal(guardTarget(node('div', { parent: root })), null, 'düz div izlenmez');
});

test('kurulum: pencereye yakalama aşamasında bir kez takılır', () => {
  const added = [];
  const win = { addEventListener: (t, f, o) => added.push([t, o]) };
  assert.ok(installTapGuard(win));
  assert.equal(installTapGuard(win), null, 'ikinci kez takılmaz');
  assert.deepEqual(added.map(([t]) => t).sort(), ['click', 'pointercancel', 'pointerdown', 'pointermove', 'pointerup']);
  assert.ok(added.every(([, o]) => o.capture === true));
  assert.equal(added.find(([t]) => t === 'click')[1].passive, undefined, 'click pasif değil (preventDefault çalışsın)');
});
