// v218 test sayfası: Dengeli + çene tipi, kafa tipleri, 100 kostüm — önden / yandan / arkadan aynı anda
import * as THREE from 'three';
import { Avatar3D, setAvatar3DStyle } from '../src/components/City/avatar3d.js';
import { getAvatarLook3D } from '../src/lib/avatar3dView.js';
import { LOOKS, LOOK_CATS } from '../functions/cosmeticsData.js';

setAvatar3DStyle('cene');
const BASE = [
  ['Deri ceket', { hairStyle: 'short', clothing: 'leather', clothColor: '#1b1b1f', neckAcc: 'chain', facialHair: 'short', eyebrowShape: 'thick', mouthShape: 'smirk' }],
  ['Uzun saç', { gender: 'kadin', hairStyle: 'long', hairColor: '#1a1210', clothing: 'trenchcoat', clothColor: '#5a3b2a', neckAcc: 'none', eyelash: 'natural', skin: '#e0b090' }],
  ['Takım', { hairStyle: 'slick', hairColor: '#111', clothing: 'suit', clothColor: '#14161c', faceAcc: 'sunglasses', facialHair: 'goatee', skin: '#a8714f' }],
  ['Kapüşonlu', { hairStyle: 'undercut', hairColor: '#3a2a1c', clothing: 'hoodie', clothColor: '#2a2f45', neckAcc: 'none', build: 'iri' }],
  ['At kuyruğu', { gender: 'kadin', hairStyle: 'ponytail', hairColor: '#6b3a1e', clothing: 'tanktop', clothColor: '#111', neckAcc: 'chain', build: 'zayif', eyelash: 'natural' }],
  ['Şapkalı', { hairStyle: 'curly', hairColor: '#1a1a1a', clothing: 'vest', clothColor: '#30363f', hat: 'cap', hatColor: '#c0392b', skin: '#6e4a33' }],
];
const FACES = [['oval', 'Oval'], ['round', 'Yuvarlak'], ['square', 'Köşeli Çene'], ['heart', 'Sivri Çene'], ['long', 'Uzun'], ['diamond', 'Elmacık']];
let bi = 0;
let face = 'oval';
let look = '';
let pose = 'idle';
let close = false;
let yaw = 0.35;

const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const cats = Object.fromEntries(LOOK_CATS.map((c) => [c.id, c]));
const opts = ['<option value="">— Kostümsüz —</option>'].concat(LOOK_CATS.map((c) => `<optgroup label="${c.icon} ${c.name}">${LOOKS.filter((l) => l.cat === c.id).map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}</optgroup>`));
document.body.append($(`<div id="ui">
  <div class="row"><span class="lbl">Avatar</span><span id="avs" class="row"></span></div>
  <div class="row"><span class="lbl">Kafa tipi</span><span id="faces" class="row"></span></div>
  <div class="row"><span class="lbl">Kostüm</span><select id="look">${opts.join('')}</select><button id="prev">◀</button><button id="next">▶</button></div>
  <div class="row"><span class="lbl">Poz</span><span id="poses" class="row"></span></div>
</div>`));
void cats;
const grid = $(`<div id="grid"></div>`);
document.body.append(grid);
const btn = (txt, on, act) => { const b = $(`<button>${txt}</button>`); b.onclick = act; if (on) b.classList.add('on'); return b; };
const sel = document.getElementById('look');
sel.onchange = () => { look = sel.value; load(); };
const step = (d) => {
  const ids = ['', ...LOOKS.map((l) => l.id)];
  look = ids[(ids.indexOf(look) + d + ids.length) % ids.length];
  sel.value = look;
  load();
};
document.getElementById('prev').onclick = () => step(-1);
document.getElementById('next').onclick = () => step(1);
function ui() {
  document.getElementById('avs').replaceChildren(...BASE.map(([n], i) => btn(n, i === bi, () => { bi = i; ui(); load(); })));
  document.getElementById('faces').replaceChildren(...FACES.map(([k, n]) => btn(n, k === face, () => { face = k; ui(); load(); })));
  document.getElementById('poses').replaceChildren(...[['idle', 'Dur'], ['walk', 'Yürü'], ['dans', 'Dans'], ['selam', 'Selam'], ['close', 'Yakın / Boy']].map(([k, n]) =>
    btn(n, k === pose || (k === 'close' && close), () => { if (k === 'close') close = !close; else pose = k; t0 = performance.now(); ui(); })));
}
let t0 = performance.now();
const VIEWS = [['Önden', 0], ['Yandan', Math.PI / 2], ['Arkadan', Math.PI]];
const canvas = document.createElement('canvas');
grid.append(canvas);
const labels = $(`<div id="labs">${VIEWS.map(([n]) => `<div>${n}</div>`).join('')}</div>`);
grid.append(labels);
const r = new THREE.WebGLRenderer({ canvas, antialias: true });
r.outputColorSpace = THREE.SRGBColorSpace;
r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 50);
const cells = VIEWS.map(() => ({ scene: new THREE.Scene(), m: null }));
let tok = 0;
async function load() {
  const my = ++tok;
  const av = { ...BASE[bi][1], faceShape: face, ...(look ? { look } : {}) };
  const lk = await getAvatarLook3D(av, 'hi');
  if (my !== tok || !lk) return;
  for (const c of cells) {
    if (c.m) c.scene.remove(c.m.root);
    c.m = new Avatar3D(lk);
    c.scene.add(c.m.root);
  }
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: yaw }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (drag) yaw = drag.y + (e.clientX - drag.x) * 0.012; });
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('pointercancel', () => (drag = null));
let last = performance.now();
let walkT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const W = grid.clientWidth;
  const H = grid.clientHeight;
  const pr = r.getPixelRatio();
  if (canvas.width !== Math.round(W * pr) || canvas.height !== Math.round(H * pr)) r.setSize(W, H, false);
  const n = VIEWS.length;
  const cw = W / n;
  labels.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  r.setScissorTest(true);
  if (pose === 'walk') walkT += dt;
  const t = (now - t0) / 1000;
  cells.forEach((c, i) => {
    const x = i * cw;
    r.setViewport(x + 2, 2, cw - 4, H - 4);
    r.setScissor(x + 2, 2, cw - 4, H - 4);
    r.setClearColor('#161c2e');
    r.clear();
    if (!c.m) return;
    c.m.root.rotation.y = yaw + VIEWS[i][1];
    const em = pose === 'dans' || pose === 'selam' ? { kind: pose, e: 0.3 + (t % 2.6) } : null;
    c.m.pose({ dt, t: now / 1000, walkT, walk: pose === 'walk', emote: em });
    cam.aspect = (cw - 4) / (H - 4);
    const tall = close ? 0.9 : 2.2;
    const ty = close ? 1.38 : 1.0;
    cam.position.set(0, ty + 0.06, tall / 2 / Math.tan(THREE.MathUtils.degToRad(12)) / Math.min(1, cam.aspect / 0.5));
    cam.lookAt(0, ty, 0);
    cam.updateProjectionMatrix();
    r.render(c.scene, cam);
  });
}
ui();
load();
requestAnimationFrame(frame);
