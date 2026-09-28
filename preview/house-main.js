// SADECE önizleme — 3D ev motorunu Firebase olmadan test eder.
import { createHouseEngine, getThumb } from '../src/components/HouseScreen/houseEngine.js';
import { CATALOG } from '../src/components/HouseScreen/houseCatalog.js';
import { DEFAULT_AVATAR } from '../src/lib/avatarShapes.js';

const q = new URLSearchParams(location.search);
const eng = createHouseEngine(document.getElementById('m'), { canEdit: true, selfUid: 'me' });
window.eng = eng;
const L = (i, k, x, z, r = 0, c = 0, o) => ({ i, k, x, z, r, c, ...(o !== undefined ? { o } : {}) });
const demo = {
  wall: q.get('wall') || 'boya_antrasit', floor: q.get('floor') || 'parke_ceviz',
  items: q.get('all') ? CATALOG.map((d, n) => L('x' + n, d.k, -8 + (n % 12) * 1.45, -6 + Math.floor(n / 12) * 1.6, 0, 0)) : [
    L('a', 'sofa3', -3, 1, 4, 0), L('b', 'tvstand', -3, -3.2, 0, 1, true), L('c', 'tcoffee', -3, -0.6, 0, 2),
    L('d', 'rug', -3, -0.8, 0, 0), L('e', 'armchair', -5.2, -0.8, 2, 1), L('f', 'lamp', -5.4, 1.6), L('g', 'plantb', -0.9, 1.6),
    L('h', 'gunrack', -6.5, -7, 0), L('i', 'neon1', -2.5, -7, 0, 0), L('j', 'car_super', 5, -3.5, 1, 0), L('k', 'car_muscle', 2, -3.5, 0, 3),
    L('l', 'moto_sport', 7.5, 0.5, 2, 7), L('m', 'moto_chopper', 7.5, 2.2, 2, 1), L('n', 'wall4', 0.6, 2.5, 2), L('o', 'painting', -9, -2, 2, 2),
    L('p', 'chandelier', -3, -1), L('q', 'bar', -6, 5, 4), L('r', 'stool', -6.5, 4.1), L('s', 'stool', -5.5, 4.1), L('t', 'pool', 3.5, 4.5, 0),
    L('u', 'jukebox', -8.3, 3, 2), L('v', 'aquarium', 1.3, -6.6, 0), L('w', 'toolwall', 5, -7, 0), L('x', 'tires', 8.3, -6.3), L('y', 'window', -9, 3, 2),
  ],
};
eng.setDesign(demo, { force: true });
eng.setSelf({ uid: 'me', name: 'Patron', avatar: DEFAULT_AVATAR });
eng.setOthers([
  { uid: 'o1', displayName: 'Ali', x: -1.5, z: 3.5, avatar: { ...DEFAULT_AVATAR, gender: 'kadin', hairStyle: 'long', clothColor: '#8a1d1d', skin: '#e0ac69' } },
  { uid: 'o2', displayName: 'Veli', x: 0, z: 0, seat: 'a:0', avatar: { ...DEFAULT_AVATAR, clothColor: '#1d3d5c' } },
]);
if (q.get('mode') === 'walk') eng.setMode('walk');
if (q.get('solo')) {
  const ks = q.get('solo').split(',');
  eng.setDesign({ wall: 'boya_antrasit', floor: 'beton', items: ks.map((k, n) => L('s' + n, k, (n - (ks.length - 1) / 2) * Number(q.get('gap') || 3), 0, Number(q.get('r') || 1), Number(q.get('ti') || 0))) }, { force: true });
  eng.setOthers([]);
  eng.setView({ az: 0.6, el: 0.35, dist: Number(q.get('d') || 7), tx: 0, tz: 0 });
}
setTimeout(() => { eng.say('o1', 'Ev çok güzel olmuş!'); eng.say('me', 'Hoş geldiniz 😎'); }, 800);
if (q.get('thumbs')) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#223;display:flex;flex-wrap:wrap;gap:4px;z-index:99';
  document.body.appendChild(box);
  CATALOG.forEach((d) => { const im = new Image(); im.src = getThumb(d.k, 0); im.title = d.k; im.style.width = '110px'; im.style.background = '#334'; box.appendChild(im); });
}
window.ready = true;
