// =============================================================================
// v78 — Evcil hayvan & aksesuar ÇİZİMLERİ (sadece istemci)
// Katalog/fiyat: functions/cosmeticsData.js. Burada:
//   ACC_ART  — aksesuar SVG katmanları (avatarla aynı 320×580 koordinatı):
//              b = avatarın ARKASI (pelerin, kanat, aura), f = ÖNÜ (şapka, gözlük…)
//              Hepsi 0…320 genişliğine sığar → avatar görsel oranı değişmez.
//   drawPet  — evcil hayvanın canvas çizimi (yan görünüm, sağa bakar)
//   drawOwnerPet — mekânlarda avatarın yanında yürüyen hayvan + tasma;
//              papağan/baykuş/martı sahibi durunca omzuna konar.
// Kimlikler sunucuda doğrulanır (avatar.acc / avatar.pet); bilinmeyen kimlik
// çizilmez, SVG'ye kullanıcı metni girmez.
// =============================================================================
import { PET_MAP, ACC_MAP } from '../../functions/cosmeticsData.js';

// --- Aksesuarlar --------------------------------------------------------------
const cape = (a, b) =>
  `<path d="M86,262 L24,498 Q160,540 296,498 L234,262 Z" fill="${a}"/><path d="M86,262 L24,498 Q60,508 90,508 L120,262 Z" fill="${b}" opacity=".5"/><path d="M234,262 L296,498 Q262,506 236,506 L206,262 Z" fill="#000" opacity=".18"/>`;
const clasp =
  '<circle cx="104" cy="272" r="6" fill="#d4af37"/><circle cx="216" cy="272" r="6" fill="#d4af37"/><path d="M110,274 Q160,296 210,274" stroke="#d4af37" stroke-width="3" fill="none"/>';
const dragonWing =
  '<path d="M104,290 L-30,190 L-10,280 L-50,300 L0,350 L-30,420 L110,390 Z" fill="#7a0f1f" stroke="#3b0710" stroke-width="3"/><path d="M104,290 L-30,190 M104,300 L-50,300 M106,320 L0,350 M108,350 L-30,420" stroke="#3b0710" stroke-width="2.5" opacity=".7"/>';
const sesame = [...Array(14)]
  .map((_, i) => {
    const a = (i / 14) * 6.283;
    const x = (160 + Math.cos(a) * 62).toFixed(1);
    const y = (88 + Math.sin(a) * 22).toFixed(1);
    return `<ellipse cx="${x}" cy="${y}" rx="3.5" ry="1.8" fill="#f7e7c4" transform="rotate(${i * 25} ${x} ${y})"/>`;
  })
  .join('');
const star = (x, y, r, fill) =>
  `<path d="M${x},${y - r * 1.6} L${x + r * 0.5},${y - r * 0.5} L${x + r * 1.6},${y} L${x + r * 0.5},${y + r * 0.5} L${x},${y + r * 1.6} L${x - r * 0.5},${y + r * 0.5} L${x - r * 1.6},${y} L${x - r * 0.5},${y - r * 0.5} Z" fill="${fill}"/>`;
const flame = (x, h, c1, c2) =>
  `<path d="M${x - 16},562 Q${x - 20},${562 - h * 0.5} ${x},${562 - h} Q${x + 4},${562 - h * 0.6} ${x + 14},${562 - h * 0.7} Q${x + 22},${562 - h * 0.3} ${x + 16},562 Z" fill="${c1}"/><path d="M${x - 8},562 Q${x - 8},${562 - h * 0.4} ${x + 2},${562 - h * 0.62} Q${x + 10},${562 - h * 0.3} ${x + 8},562 Z" fill="${c2}"/>`;

// Melek kanadı: kemik eğrisi boyunca dizilmiş, üst üste binen tüy katmanları
// (uzun birincil tüyler → orta tüyler → kısa örtü tüyleri). Sol kanat
// çizilir, sağ kanat aynalanır. Tamamı 0…320 genişliğinde kalır.
const angelWing = (() => {
  const P0 = [116, 290];
  const P1 = [56, 196];
  const P2 = [30, 186];
  const bone = (t) => {
    const u = 1 - t;
    return [u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]];
  };
  const f1 = (n) => n.toFixed(1);
  const feather = (x, y, deg, len, w, fill, stroke) => {
    const r = (deg * Math.PI) / 180;
    const cx = x + Math.cos(r) * len * 0.5;
    const cy = y + Math.sin(r) * len * 0.5;
    const qx = x + Math.cos(r) * len * 0.92;
    const qy = y + Math.sin(r) * len * 0.92;
    return `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(len / 2)}" ry="${f1(w / 2)}" transform="rotate(${f1(deg)} ${f1(cx)} ${f1(cy)})" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><path d="M${f1(x)},${f1(y)} L${f1(qx)},${f1(qy)}" stroke="${stroke}" stroke-width="1" opacity=".7"/>`;
  };
  let out = '<ellipse cx="66" cy="300" rx="62" ry="120" fill="#fff6c8" opacity=".18"/>';
  // birincil (uzun) tüyler — uca doğru uzar
  for (let i = 9; i >= 0; i--) {
    const t = 0.3 + (i / 9) * 0.7;
    const [x, y] = bone(t);
    out += feather(x, y, 84 + t * 16, 70 + t * 128, 24, '#eef3fa', '#c3cfe2');
  }
  // orta tüyler
  for (let i = 8; i >= 0; i--) {
    const t = 0.08 + (i / 8) * 0.86;
    const [x, y] = bone(t);
    out += feather(x, y, 80 + t * 14, 52 + t * 58, 22, '#f6f9fd', '#cfd9ea');
  }
  // örtü tüyleri (kısa, kemik boyunca)
  for (let i = 12; i >= 0; i--) {
    const t = i / 12;
    const [x, y] = bone(t);
    out += feather(x, y + 4, 70 + t * 30, 30 + t * 18, 18, '#ffffff', '#d8e1ee');
  }
  // kemik / üst kenar
  const pts = Array.from({ length: 13 }, (_, i) => bone(i / 12));
  out += `<path d="M${pts.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' L')}" stroke="#ffffff" stroke-width="12" fill="none" stroke-linecap="round"/>`;
  out += `<path d="M${pts.map((q) => `${f1(q[0])},${f1(q[1] - 5)}`).join(' L')}" stroke="#d8e1ee" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  return out;
})();

export const ACC_ART = {
  simit: { f: `<ellipse cx="160" cy="88" rx="62" ry="22" fill="none" stroke="#b9722a" stroke-width="20"/><ellipse cx="160" cy="88" rx="62" ry="22" fill="none" stroke="#d99a4a" stroke-width="12"/><ellipse cx="148" cy="80" rx="22" ry="5" fill="#f0c27a" opacity=".55"/>${sesame}` },
  foil: { f: '<path d="M160,18 L110,122 L210,122 Z" fill="#cfd6df" stroke="#8b95a3" stroke-width="2"/><path d="M160,18 L146,122" stroke="#fff" stroke-width="4" opacity=".7"/><path d="M160,18 L176,122" stroke="#8b95a3" stroke-width="3"/><path d="M128,84 L146,96 M182,70 L194,92" stroke="#fff" stroke-width="2" opacity=".6"/>' },
  chef: { f: '<g fill="#fff" stroke="#d5dbe3" stroke-width="2"><circle cx="124" cy="70" r="28"/><circle cx="160" cy="54" r="32"/><circle cx="196" cy="70" r="28"/><rect x="118" y="78" width="84" height="48" rx="6"/></g><rect x="118" y="108" width="84" height="6" fill="#e5e9ef"/>' },
  horns: { f: '<path d="M114,112 Q96,70 120,48 Q118,84 134,104 Z" fill="#d7263d"/><path d="M206,112 Q224,70 200,48 Q202,84 186,104 Z" fill="#d7263d"/><path d="M118,96 Q110,74 120,56" stroke="#ff7a8a" stroke-width="3" fill="none" opacity=".7"/><path d="M202,96 Q210,74 200,56" stroke="#ff7a8a" stroke-width="3" fill="none" opacity=".7"/>' },
  catears: { f: '<path d="M108,138 Q160,70 212,138" fill="none" stroke="#ff2e88" stroke-width="8" stroke-linecap="round"/><path d="M110,110 L118,66 L146,92 Z" fill="#ff2e88"/><path d="M210,110 L202,66 L174,92 Z" fill="#ff2e88"/><path d="M121,98 L124,80 L136,91 Z" fill="#ffb3d6"/><path d="M199,98 L196,80 L184,91 Z" fill="#ffb3d6"/>' },
  halo: { f: '<ellipse cx="160" cy="62" rx="50" ry="12" fill="none" stroke="#fff6a8" stroke-width="14" opacity=".35"/><ellipse cx="160" cy="62" rx="50" ry="12" fill="none" stroke="#ffe566" stroke-width="5"/>' },
  crown: { f: '<path d="M100,122 L112,52 L136,92 L160,34 L184,92 L208,52 L220,122 Z" fill="#ffd23f" stroke="#b8860b" stroke-width="3"/><path d="M112,60 L120,112 M160,44 L160,112 M208,60 L200,112" stroke="#fff3b0" stroke-width="2" opacity=".55"/><rect x="100" y="112" width="120" height="14" rx="4" fill="#e6b422" stroke="#b8860b" stroke-width="2"/><circle cx="160" cy="48" r="6" fill="#ff2e88"/><circle cx="112" cy="64" r="5" fill="#22d3ee"/><circle cx="208" cy="64" r="5" fill="#22d3ee"/><circle cx="160" cy="119" r="5" fill="#ef4444"/><circle cx="130" cy="119" r="3.5" fill="#22d3ee"/><circle cx="190" cy="119" r="3.5" fill="#22d3ee"/>' },
  mustache: { f: '<path d="M160,206 Q140,192 116,204 Q108,212 118,214 Q140,210 160,214 Q180,210 202,214 Q212,212 204,204 Q180,192 160,206 Z" fill="#161616"/><path d="M118,212 Q108,216 106,206" stroke="#161616" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M202,212 Q212,216 214,206" stroke="#161616" stroke-width="5" fill="none" stroke-linecap="round"/>' },
  pixel: { f: '<g fill="#0d0d0d"><rect x="112" y="158" width="96" height="8"/><rect x="118" y="166" width="32" height="16"/><rect x="170" y="166" width="32" height="16"/><rect x="150" y="166" width="20" height="6"/></g><g fill="#fff" opacity=".9"><rect x="122" y="168" width="6" height="6"/><rect x="128" y="174" width="6" height="6"/><rect x="174" y="168" width="6" height="6"/><rect x="180" y="174" width="6" height="6"/></g>' },
  monocle: { f: '<circle cx="178" cy="168" r="17" fill="rgba(180,230,255,.25)" stroke="#ffd23f" stroke-width="3"/><path d="M190,181 Q204,230 192,268" stroke="#ffd23f" stroke-width="2" fill="none"/>' },
  visor: { f: '<rect x="108" y="156" width="104" height="26" rx="12" fill="#06202b" stroke="#22d3ee" stroke-width="3"/><rect x="116" y="165" width="88" height="8" rx="4" fill="#22d3ee" opacity=".85"/><path d="M108,168 L98,160 M212,168 L222,160" stroke="#22d3ee" stroke-width="3"/>' },
  diamond: { f: '<path d="M126,258 Q160,300 194,258" stroke="#e5e7eb" stroke-width="3" fill="none"/><path d="M160,296 L148,306 L160,326 L172,306 Z" fill="#7ef9ff" stroke="#22d3ee" stroke-width="2"/><path d="M148,306 L172,306" stroke="#fff" stroke-width="1.5"/><circle cx="154" cy="302" r="2" fill="#fff"/>' },
  medal: { f: '<path d="M132,258 L152,300 M188,258 L168,300" stroke="#c81d3f" stroke-width="8"/><path d="M132,258 L152,300 M188,258 L168,300" stroke="#ffd23f" stroke-width="2"/><circle cx="160" cy="312" r="17" fill="#e6b422" stroke="#b8860b" stroke-width="3"/>' + star(160, 312, 6, '#fff3b0') },
  hero: { b: cape('#1fd1f0', '#0a7a99'), f: '<circle cx="104" cy="270" r="6" fill="#ffd23f"/><circle cx="216" cy="270" r="6" fill="#ffd23f"/>' },
  kilim: { b: cape('#8c2f1b', '#5a1a0f') + `<path d="M36,440 ${'l16,-18 l16,18 '.repeat(8)}" stroke="#f2c14e" stroke-width="5" fill="none"/><path d="M36,472 ${'l16,-18 l16,18 '.repeat(8)}" stroke="#e8e6df" stroke-width="5" fill="none"/>`, f: clasp },
  angel: { b: `<g>${angelWing}</g><g transform="translate(320,0) scale(-1,1)">${angelWing}</g>` },
  jet: { b: '<g fill="#b8c2d0" stroke="#6b7685" stroke-width="3"><rect x="56" y="272" width="34" height="110" rx="14"/><rect x="230" y="272" width="34" height="110" rx="14"/></g><rect x="62" y="290" width="22" height="8" rx="3" fill="#ff2e88"/><rect x="236" y="290" width="22" height="8" rx="3" fill="#ff2e88"/><path d="M63,384 L73,440 L83,384 Z M237,384 L247,440 L257,384 Z" fill="#ff8a1a"/><path d="M68,384 L73,418 L78,384 Z M242,384 L247,418 L252,384 Z" fill="#ffe566"/>' },
  royal: { b: cape('#a3122f', '#5c0a1b'), f: '<ellipse cx="160" cy="268" rx="64" ry="15" fill="#f4f1ea"/><circle cx="130" cy="268" r="3" fill="#222"/><circle cx="160" cy="276" r="3" fill="#222"/><circle cx="190" cy="268" r="3" fill="#222"/>' + clasp },
  dragonw: { b: `<g transform="translate(40,0) scale(0.75,1)">${dragonWing}<g transform="translate(320,0) scale(-1,1)">${dragonWing}</g></g>` },
  ring: { b: '<ellipse cx="160" cy="560" rx="96" ry="20" fill="none" stroke="#22d3ee" stroke-width="10" opacity=".25"/><ellipse cx="160" cy="560" rx="96" ry="20" fill="none" stroke="#22d3ee" stroke-width="4"/><ellipse cx="160" cy="556" rx="118" ry="26" fill="none" stroke="#ff2e88" stroke-width="3" opacity=".8"/>' },
  spark: { b: [star(70, 230, 6, '#ffe566'), star(256, 190, 5, '#fff6a8'), star(46, 380, 4, '#ffd23f'), star(278, 330, 6, '#ffe566'), star(96, 120, 4, '#fff6a8'), star(232, 450, 5, '#ffd23f'), star(60, 520, 4, '#ffe566'), star(272, 520, 3, '#fff6a8')].join('') },
  fire: { b: '<ellipse cx="160" cy="560" rx="100" ry="16" fill="#ff6a1a" opacity=".25"/>' + [60, 96, 132, 172, 212, 252].map((x, i) => flame(x, 60 + ((i * 37) % 50), '#ff6a1a', '#ffd23f')).join('') },
};

// avatar.acc → { back, front } SVG; çakışan avatar parçaları (şapka, yüz/boyun aksesuarı) gizlenir
// animAura: canvas dünyaları yıldız tozunu kendisi canlandırır (drawAuraFx) →
// SVG'deki sabit yıldızlar çizilmez.
export function accLayers(acc, { animAura = false } = {}) {
  const out = { back: '', front: '', hideHat: false, hideFace: false, hideNeck: false };
  if (!acc || typeof acc !== 'object') return out;
  for (const slot of ['aura', 'back', 'neck', 'face', 'head']) {
    const id = acc[slot];
    const meta = ACC_MAP[id];
    const art = ACC_ART[id];
    if (!meta || meta.slot !== slot || !art) continue;
    if (animAura && id === 'spark') continue;
    out.back += art.b || '';
    out.front += art.f || '';
    if (slot === 'head') out.hideHat = true;
    if (slot === 'face') out.hideFace = true;
    if (slot === 'neck') out.hideNeck = true;
  }
  return out;
}

// --- Evcil hayvan çizimi -----------------------------------------------------------
// s: prototip boyu (piksel, avatar ~160 px iken).
// k: 'q' dört ayaklı · 'm' iki ayak üstünde yürüyen · 'b' kuş
// v79: dört ayaklılar yeniden çizildi (göğüs/kalça hacmi, boyun, burun tipi,
//      bacak salınımı, gövdeye bağlı kuyruk, desenler gövdeye kırpılır,
//      sarkık köpek kulakları başın ÖNÜNDE). Tavşan, hamster ve panda artık
//      maymun gibi iki ayak üstünde yürür (form).
//   snout: 'dog' uzun burun · 'cat' kısa · 'fox' sivri · 'flat' basık · 'horse' at
//   ear:   'pt' sivri · 'rd' yuvarlak · 'dr' sarkık (köpek) · 'lg' uzun (tavşan)
//   tail:  'lg' ince uzun · 'fe' tüylü (golden) · 'fl' kabarık · 'sh' kısa
export const PET_ART = {
  hamster: { k: 'm', form: 'hamster', c: '#d9944a', c2: '#fbeedd', s: 34 },
  sokak: { k: 'q', c: '#c98f4a', c2: '#f1dcb8', s: 44, ear: 'pt', tail: 'lg', snout: 'cat', tabby: '#8a5a22', eye: '#9bd34a' },
  hindi: { k: 'b', c: '#8a5a34', c2: '#c0392b', beak: '#f2b632', fan: 1, s: 52 },
  tavsan: { k: 'm', form: 'rabbit', c: '#f1ece4', c2: '#ffffff', ec: '#f7c3cf', s: 44 },
  golden: { k: 'q', c: '#e2ae58', c2: '#f6deae', ec: '#b97a32', s: 54, ear: 'dr', tail: 'fe', snout: 'dog', fluff: 1 },
  karakedi: { k: 'q', c: '#1d1d26', c2: '#2c2c3c', s: 44, ear: 'pt', tail: 'lg', snout: 'cat', eye: '#ffd23f', inner: '#4a3a4a' },
  marti: { k: 'b', c: '#f4f6f8', c2: '#9aa5b1', beak: '#f2b632', s: 46 },
  dalmacyali: { k: 'q', c: '#f6f6f4', c2: '#ffffff', ec: '#1c1c1c', s: 54, ear: 'dr', tail: 'lg', snout: 'dog', spots: '#151515', lean: 1 },
  baykus: { k: 'b', c: '#8a6a4a', c2: '#e8d8b8', beak: '#e2a92a', owl: 1, s: 42 },
  penguen: { k: 'b', c: '#1b2230', c2: '#fff', wc: '#0c1018', belly: 1, beak: '#f59e0b', s: 44 },
  tilki: { k: 'q', c: '#e8782a', c2: '#fff6ea', leg: '#3a2418', s: 48, ear: 'pt', tail: 'fl', snout: 'fox', tip: '#fff6ea', inner: '#3a2418', lean: 1 },
  papagan: { k: 'b', parrot: 1, c: '#e3262f', c2: '#1f6fd6', yel: '#ffcc1a', grn: '#2fae5f', beak: '#f1e6d0', s: 52 },
  maymun: { k: 'm', form: 'monkey', c: '#7a4a2a', c2: '#e8c9a0', s: 48 },
  panda: { k: 'm', form: 'panda', c: '#f7f7f5', c2: '#ffffff', dark: '#15151a', s: 60 },
  zengin: { k: 'q', c: '#2b2b33', c2: '#d4af37', s: 46, ear: 'pt', tail: 'lg', snout: 'cat', eye: '#9bd34a', monocle: 1, hat: 1 },
  bulldog: { k: 'q', c: '#c9a27a', c2: '#f4e6d2', ec: '#8a6440', s: 50, ear: 'rd', tail: 'sh', snout: 'flat', stocky: 1, chain: 1, shades: 1 },
  midilli: { k: 'q', c: '#ffffff', c2: '#ffd0ec', glow: '#ff9ad5', horn: '#ffd23f', rainbow: 1, s: 70, ear: 'pt', tail: 'fl', snout: 'horse', tip: '#ff9ad5', hoof: '#f2b8d8', flat: 1, lean: 1 },
  aslan: { k: 'q', c: '#d9a441', c2: '#f3dca8', mane: '#8a4b12', s: 66, ear: 'rd', tail: 'lg', snout: 'cat', tuft: '#8a4b12', big: 1 },
  kurt: { k: 'q', c: '#101826', c2: '#1d3a4a', stripe: '#22d3ee', glow: '#22d3ee', s: 64, ear: 'pt', tail: 'fl', snout: 'fox', eye: '#22d3ee', tip: '#22d3ee', inner: '#22d3ee', lean: 1 },
  ejder: { k: 'q', c: '#2fae5f', c2: '#f4d27a', wing: '#1d7a42', horn: '#f4d27a', fire: 1, s: 62, ear: 'pt', tail: 'lg', snout: 'dog', spikes: '#f4d27a', scales: 1 },
};

const shadeHex = (h, a) => {
  const n = parseInt(h.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const rr = (c, x, y, w, h, r) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};
const disc = (c, x, y, r) => {
  c.beginPath();
  c.arc(x, y, r, 0, 7);
  c.fill();
};
const oval = (c, x, y, rx, ry, rot = 0) => {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, 7);
  c.fill();
};
// parlak göz (renkli: kedi gözü — dikey göz bebeği)
function eyeAt(c, x, y, r, col) {
  if (col) {
    c.fillStyle = col;
    oval(c, x, y, r * 1.1, r);
    c.fillStyle = '#111';
    oval(c, x + r * 0.15, y, r * 0.32, r * 0.85);
  } else {
    c.fillStyle = '#121014';
    disc(c, x, y, r);
  }
  c.fillStyle = 'rgba(255,255,255,.92)';
  disc(c, x + r * 0.35, y - r * 0.35, r * 0.36);
}
// tasma: boynun SADECE görünen (bize bakan) yarısından geçen bant + künye.
// Halkanın arka yarısı boynun arkasında kaldığı için hiç çizilmez.
function collarBand(c, s, x1, y1, x2, y2, col, gold) {
  const main = gold ? '#d4af37' : col;
  const w = Math.max(1.5, s * 0.055);
  const mx = ((x1 + x2) / 2 + 0.035) * s;
  const my = ((y1 + y2) / 2 + 0.01) * s;
  c.lineCap = 'butt';
  c.strokeStyle = 'rgba(0,0,0,.28)';
  c.lineWidth = w + Math.max(1, s * 0.012);
  c.beginPath();
  c.moveTo(x1 * s, y1 * s);
  c.quadraticCurveTo(mx, my, x2 * s, y2 * s);
  c.stroke();
  c.strokeStyle = main;
  c.lineWidth = w;
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.35)';
  c.lineWidth = Math.max(0.6, w * 0.25);
  c.beginPath();
  c.moveTo((x1 + 0.012) * s, (y1 - 0.01) * s);
  c.quadraticCurveTo(mx + s * 0.01, my - s * 0.012, (x2 + 0.012) * s, (y2 - 0.012) * s);
  c.stroke();
  c.fillStyle = '#ffd23f';
  disc(c, x2 * s - s * 0.01, y2 * s + s * (gold ? 0.045 : 0.03), s * (gold ? 0.045 : 0.026));
}
// dört ayaklıda tasmanın iki ucu: boynun üst-arka kenarından alt-ön kenarına
const quadHead = (p) => ({
  hx: p?.snout === 'horse' ? 0.44 : 0.42,
  hy: p?.snout === 'horse' ? -0.86 : p?.stocky ? -0.66 : -0.74,
  hr: p?.big ? 0.18 : p?.stocky ? 0.19 : 0.16,
});
function QUAD_COLLAR(p) {
  const { hx, hy, hr } = quadHead(p);
  return [hx - 0.19, hy + 0.06, hx - 0.07, hy + hr + 0.07];
}

// --- Dört ayaklı (yan görünüm, sağa bakar; zemin y=0) -------------------------------
function quad(c, p, s, st, t, collar) {
  const S = (v) => v * s;
  const leg = p.leg || p.c;
  const farLeg = shadeHex(leg[0] === '#' ? leg : '#888888', -0.22);
  const ec = p.ec || p.c;
  const lean = p.lean ? 0.9 : p.stocky ? 1.12 : 1;
  const hipY = -0.42;
  const legLen = p.stocky ? 0.36 : 0.42;
  const by = p.stocky ? -0.4 : -0.46; // gövde merkezi
  const { hx, hy, hr } = quadHead(p); // baş merkezi / yarıçapı

  // ejder kanadı (arkada)
  if (p.wing) {
    c.fillStyle = p.wing;
    c.save();
    c.translate(S(-0.02), S(by - 0.12));
    c.rotate(-0.5 + Math.sin(t / 200) * 0.2);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(S(-0.12), S(-0.5));
    c.quadraticCurveTo(S(-0.2), S(-0.3), S(-0.42), S(-0.32));
    c.quadraticCurveTo(S(-0.3), S(-0.16), S(-0.36), S(-0.04));
    c.quadraticCurveTo(S(-0.18), S(-0.06), 0, 0);
    c.fill();
    c.strokeStyle = shadeHex(p.wing, -0.35);
    c.lineWidth = S(0.018);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(S(-0.12), S(-0.5));
    c.moveTo(0, 0);
    c.lineTo(S(-0.42), S(-0.32));
    c.moveTo(0, 0);
    c.lineTo(S(-0.36), S(-0.04));
    c.stroke();
    c.restore();
  }

  // kuyruk (gövdeye bağlı, sallanır)
  const wag = Math.sin(t / 160) * 0.22;
  const tx0 = -0.36 * lean;
  c.save();
  c.translate(S(tx0), S(by - 0.04));
  c.rotate(wag);
  c.fillStyle = p.c;
  c.strokeStyle = p.c;
  c.lineCap = 'round';
  if (p.tail === 'lg') {
    // incelen eğri
    for (let i = 0; i < 3; i++) {
      c.lineWidth = S(0.075 - i * 0.022);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(S(-0.18), S(0.02), S(-0.22), S(-0.16 - i * 0.02), S(-0.26 + i * 0.01), S(-0.34 + i * 0.01));
      c.stroke();
    }
    if (p.tuft) {
      c.fillStyle = p.tuft;
      oval(c, S(-0.26), S(-0.36), S(0.05), S(0.07), -0.4);
    }
    if (p.spikes) {
      c.fillStyle = p.spikes;
      c.beginPath();
      c.moveTo(S(-0.22), S(-0.3));
      c.lineTo(S(-0.3), S(-0.46));
      c.lineTo(S(-0.3), S(-0.28));
      c.fill();
    }
  } else if (p.tail === 'fe') {
    // golden: kökte ince, aşağı-arkaya sarkıp ucu hafif kalkan tüylü kuyruk
    c.beginPath();
    c.moveTo(0, S(-0.035));
    c.bezierCurveTo(S(-0.14), S(-0.06), S(-0.26), S(0.0), S(-0.34), S(0.1));
    c.quadraticCurveTo(S(-0.38), S(0.16), S(-0.42), S(0.13));
    c.quadraticCurveTo(S(-0.36), S(0.2), S(-0.28), S(0.18));
    c.quadraticCurveTo(S(-0.26), S(0.22), S(-0.2), S(0.17));
    c.quadraticCurveTo(S(-0.16), S(0.2), S(-0.12), S(0.13));
    c.bezierCurveTo(S(-0.08), S(0.08), S(-0.03), S(0.05), 0, S(0.035));
    c.fill();
    c.fillStyle = p.c2;
    c.globalAlpha = 0.55;
    c.beginPath();
    c.moveTo(S(-0.12), S(0.1));
    c.quadraticCurveTo(S(-0.26), S(0.14), S(-0.36), S(0.14));
    c.quadraticCurveTo(S(-0.26), S(0.19), S(-0.14), S(0.13));
    c.fill();
    c.globalAlpha = 1;
  } else if (p.tail === 'fl' && p.rainbow) {
    // midilli: gökkuşağı renkli, dalgalanan kuyruk telleri
    const sway = Math.sin(t / 260) * 0.04;
    for (let i = 0; i < 6; i++) {
      c.strokeStyle = `hsl(${(t / 8 + i * 55) % 360},90%,${i % 2 ? 70 : 62}%)`;
      c.lineWidth = S(0.05 - i * 0.004);
      c.beginPath();
      c.moveTo(S(0.01), S(-0.04 + i * 0.012));
      c.bezierCurveTo(S(-0.2), S(-0.12 + i * 0.02), S(-0.3 + sway), S(0.04 + i * 0.03), S(-0.36 + i * 0.02 + sway), S(0.22 + i * 0.012));
      c.stroke();
    }
  } else if (p.tail === 'fl') {
    // kabarık (tilki/kurt/midilli): kökte ince, ortada şişkin, uçta renkli
    c.beginPath();
    c.moveTo(0, S(-0.05));
    c.bezierCurveTo(S(-0.18), S(-0.16), S(-0.5), S(-0.14), S(-0.58), S(0.06));
    c.bezierCurveTo(S(-0.44), S(0.12), S(-0.24), S(0.1), 0, S(0.05));
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = p.tip || p.c2;
    oval(c, S(-0.56), S(0.02), S(0.12), S(0.12));
    c.restore();
  } else if (p.tail === 'sh') {
    disc(c, S(-0.02), S(-0.03), S(0.055));
  }
  c.restore();

  // bacaklar: kalça/omuzdan sallanır, uzak bacaklar koyu
  const drawLeg = (lx, phase, col, front) => {
    const a = st * 0.38 * phase;
    c.save();
    c.translate(S(lx), S(hipY));
    c.rotate(a);
    c.fillStyle = col;
    const w0 = p.stocky ? 0.13 : 0.11;
    const w1 = p.stocky ? 0.1 : p.lean ? 0.06 : 0.075;
    c.beginPath();
    c.moveTo(S(-w0 / 2), 0);
    c.lineTo(S(w0 / 2), 0);
    if (!front) c.quadraticCurveTo(S(w0 / 2 + 0.03), S(legLen * 0.5), S(w1 / 2), S(legLen - 0.03));
    else c.lineTo(S(w1 / 2), S(legLen - 0.03));
    c.lineTo(S(-w1 / 2), S(legLen - 0.03));
    c.closePath();
    c.fill();
    // pati / toynak
    c.fillStyle = p.hoof || col;
    oval(c, S(0.02), S(legLen - 0.03), S(w1 * 0.8), S(0.035));
    c.restore();
  };
  const backX = -0.27 * lean;
  const frontX = 0.24 * lean;
  drawLeg(backX + 0.09, -1, farLeg, false);
  drawLeg(frontX + 0.08, 1, farLeg, true);

  // gövde: göğüs + karın + kalça hacmi
  const bodyPath = () => {
    c.beginPath();
    c.ellipse(0, S(by), S(0.36 * lean), S(p.stocky ? 0.2 : 0.18), 0, 0, 7);
    c.moveTo(S(frontX + 0.2), S(by - 0.02));
    c.ellipse(S(frontX), S(by - 0.02), S(p.stocky ? 0.22 : 0.19), S(p.stocky ? 0.22 : 0.19), 0, 0, 7);
    c.moveTo(S(backX + 0.18), S(by));
    c.ellipse(S(backX), S(by), S(0.17), S(0.18), 0, 0, 7);
    // boyun
    c.moveTo(S(frontX - 0.06), S(by - 0.1));
    c.lineTo(S(hx - 0.14), S(hy - 0.02));
    c.lineTo(S(hx + 0.06), S(hy + 0.08));
    c.lineTo(S(frontX + 0.16), S(by + 0.04));
    c.closePath();
  };
  if (p.flat) c.fillStyle = p.c;
  else {
    const g = c.createLinearGradient(0, S(by - 0.24), 0, S(by + 0.2));
    g.addColorStop(0, shadeHex(p.c, 0.14));
    g.addColorStop(1, shadeHex(p.c, -0.16));
    c.fillStyle = g;
  }
  bodyPath();
  c.fill('nonzero');
  // desenler gövdeye kırpılır
  c.save();
  bodyPath();
  c.clip('nonzero');
  c.fillStyle = p.c2;
  c.globalAlpha = p.flat ? 0.5 : 0.7;
  oval(c, S(0.05), S(by + 0.15), S(0.34 * lean), S(0.1));
  if (p.fluff || p.snout === 'fox' || p.snout === 'cat') oval(c, S(frontX + 0.08), S(by + 0.02), S(0.12), S(0.15));
  c.globalAlpha = 1;
  if (p.spots) {
    c.fillStyle = p.spots;
    [[-0.3, -0.56, 0.045], [-0.12, -0.6, 0.035], [0.04, -0.52, 0.05], [0.18, -0.6, 0.03], [-0.22, -0.42, 0.035], [0.26, -0.45, 0.04], [-0.04, -0.38, 0.03], [0.32, -0.66, 0.03], [-0.38, -0.46, 0.03], [0.1, -0.42, 0.025], [0.36, -0.8, 0.025]].forEach(([x, y, r]) => disc(c, S(x), S(y), S(r)));
  }
  if (p.tabby) {
    c.strokeStyle = p.tabby;
    c.lineWidth = S(0.035);
    for (let i = -3; i <= 2; i++) {
      c.beginPath();
      c.moveTo(S(i * 0.11), S(by - 0.22));
      c.quadraticCurveTo(S(i * 0.11 + 0.04), S(by - 0.08), S(i * 0.11 - 0.01), S(by + 0.02));
      c.stroke();
    }
  }
  if (p.stripe) {
    c.strokeStyle = p.stripe;
    c.lineWidth = S(0.03);
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(S(i * 0.13), S(by - 0.22));
      c.lineTo(S(i * 0.13 + 0.05), S(by - 0.04));
      c.stroke();
    }
  }
  if (p.scales) {
    c.fillStyle = p.c2;
    c.globalAlpha = 0.35;
    for (let i = -3; i <= 3; i++) disc(c, S(i * 0.1), S(by - 0.16 + (i % 2) * 0.03), S(0.03));
    c.globalAlpha = 1;
  }
  if (p.rainbow)
    for (let i = 0; i < 5; i++) {
      c.strokeStyle = `hsl(${(t / 8 + i * 50) % 360},90%,62%)`;
      c.lineWidth = S(0.05);
      c.beginPath();
      c.moveTo(S(hx - 0.12 + i * 0.02), S(hy - 0.14 + i * 0.03));
      c.quadraticCurveTo(S(hx - 0.28), S(hy + 0.06), S(frontX - 0.14 + i * 0.02), S(by - 0.06));
      c.stroke();
    }
  c.restore();
  // ejder sırt dikenleri
  if (p.spikes) {
    c.fillStyle = p.spikes;
    for (let i = -3; i <= 2; i++) {
      const x0 = i * 0.11;
      const yTop = by - (i >= 1 ? 0.2 : 0.18);
      c.beginPath();
      c.moveTo(S(x0 - 0.04), S(yTop + 0.02));
      c.lineTo(S(x0), S(yTop - 0.07));
      c.lineTo(S(x0 + 0.04), S(yTop + 0.02));
      c.fill();
    }
  }
  // yakın bacaklar
  drawLeg(backX, 1, leg, false);
  drawLeg(frontX, -1, leg, true);

  // aslan yelesi (başın arkasında, dalgalı)
  if (p.mane) {
    c.fillStyle = p.mane;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      disc(c, S(hx - 0.02 + Math.cos(a) * 0.2), S(hy + 0.02 + Math.sin(a) * 0.22), S(0.09));
    }
    disc(c, S(hx - 0.02), S(hy + 0.02), S(0.22));
  }
  // arkadaki kulak (sivri/yuvarlak)
  c.fillStyle = shadeHex(ec, -0.25);
  if (p.ear === 'pt') {
    c.beginPath();
    c.moveTo(S(hx - 0.14), S(hy - 0.06));
    c.lineTo(S(hx - 0.13), S(hy - 0.3));
    c.lineTo(S(hx - 0.01), S(hy - 0.12));
    c.fill();
  } else if (p.ear === 'rd') disc(c, S(hx - 0.1), S(hy - 0.13), S(0.06));

  // baş
  if (p.flat) c.fillStyle = p.c;
  else {
    const hg = c.createRadialGradient(S(hx - 0.03), S(hy - 0.06), S(0.02), S(hx), S(hy), S(hr + 0.04));
    hg.addColorStop(0, shadeHex(p.c, 0.2));
    hg.addColorStop(1, p.c);
    c.fillStyle = hg;
  }
  disc(c, S(hx), S(hy), S(hr));

  // burun / ağız bölgesi
  const sn = p.snout;
  let nose = [hx + 0.2, hy + 0.02];
  if (sn === 'dog') {
    c.fillStyle = p.c;
    oval(c, S(hx + 0.13), S(hy + 0.05), S(0.13), S(0.085), 0.08);
    c.fillStyle = p.c2;
    oval(c, S(hx + 0.15), S(hy + 0.09), S(0.1), S(0.05), 0.08);
    nose = [hx + 0.26, hy + 0.02];
    c.strokeStyle = 'rgba(40,20,10,.55)';
    c.lineWidth = Math.max(1, S(0.014));
    c.beginPath();
    c.moveTo(S(nose[0] - 0.01), S(nose[1] + 0.04));
    c.quadraticCurveTo(S(hx + 0.18), S(hy + 0.13), S(hx + 0.1), S(hy + 0.1));
    c.stroke();
  } else if (sn === 'fox') {
    c.fillStyle = p.c;
    c.beginPath();
    c.moveTo(S(hx + 0.04), S(hy - 0.08));
    c.quadraticCurveTo(S(hx + 0.2), S(hy - 0.02), S(hx + 0.3), S(hy + 0.04));
    c.quadraticCurveTo(S(hx + 0.2), S(hy + 0.12), S(hx + 0.02), S(hy + 0.12));
    c.fill();
    c.fillStyle = p.c2;
    c.beginPath();
    c.moveTo(S(hx - 0.06), S(hy + 0.04));
    c.quadraticCurveTo(S(hx + 0.14), S(hy + 0.02), S(hx + 0.29), S(hy + 0.05));
    c.quadraticCurveTo(S(hx + 0.16), S(hy + 0.15), S(hx - 0.02), S(hy + 0.15));
    c.fill();
    nose = [hx + 0.3, hy + 0.035];
  } else if (sn === 'flat') {
    c.fillStyle = p.c2;
    oval(c, S(hx + 0.1), S(hy + 0.08), S(0.14), S(0.1));
    c.strokeStyle = 'rgba(80,50,30,.5)';
    c.lineWidth = Math.max(1, S(0.014));
    c.beginPath();
    c.arc(S(hx + 0.06), S(hy + 0.02), S(0.1), 0.3, 1.4);
    c.stroke();
    nose = [hx + 0.18, hy + 0.02];
  } else if (sn === 'horse') {
    c.fillStyle = p.c;
    oval(c, S(hx + 0.13), S(hy + 0.08), S(0.15), S(0.09), 0.45);
    c.fillStyle = p.c2;
    oval(c, S(hx + 0.22), S(hy + 0.15), S(0.07), S(0.055), 0.45);
    nose = null;
    c.fillStyle = 'rgba(120,60,90,.6)';
    disc(c, S(hx + 0.24), S(hy + 0.13), S(0.015));
  } else {
    // kedi / aslan: kısa ağız + bıyık
    c.fillStyle = p.c2;
    oval(c, S(hx + 0.11), S(hy + 0.06), S(p.big ? 0.1 : 0.08), S(p.big ? 0.07 : 0.055));
    nose = [hx + 0.16, hy + 0.025];
  }
  if (nose) {
    c.fillStyle = sn === 'cat' && !p.big ? '#e88a9a' : '#1a1210';
    oval(c, S(nose[0]), S(nose[1]), S(sn === 'dog' ? 0.035 : 0.025), S(sn === 'dog' ? 0.026 : 0.02));
  }
  if (sn === 'cat') {
    c.strokeStyle = 'rgba(255,255,255,.6)';
    c.lineWidth = Math.max(0.6, S(0.007));
    for (const dy of [-0.01, 0.02]) {
      c.beginPath();
      c.moveTo(S(hx + 0.12), S(hy + 0.06 + dy));
      c.lineTo(S(hx + 0.27), S(hy + 0.04 + dy * 2));
      c.stroke();
    }
  }
  if (p.jowl || sn === 'flat') {
    c.fillStyle = p.c2;
    oval(c, S(hx + 0.06), S(hy + 0.14), S(0.1), S(0.06));
  }

  // önteki kulak
  if (p.ear === 'pt') {
    c.fillStyle = ec;
    c.beginPath();
    c.moveTo(S(hx - 0.08), S(hy - 0.1));
    c.lineTo(S(hx - 0.02), S(hy - 0.33));
    c.lineTo(S(hx + 0.07), S(hy - 0.12));
    c.fill();
    c.fillStyle = p.inner || '#f2a7b8';
    c.globalAlpha = 0.8;
    c.beginPath();
    c.moveTo(S(hx - 0.05), S(hy - 0.13));
    c.lineTo(S(hx - 0.02), S(hy - 0.27));
    c.lineTo(S(hx + 0.03), S(hy - 0.13));
    c.fill();
    c.globalAlpha = 1;
  } else if (p.ear === 'rd') {
    c.fillStyle = ec;
    disc(c, S(hx - 0.02), S(hy - hr + 0.01), S(0.065));
    c.fillStyle = p.c2;
    disc(c, S(hx - 0.02), S(hy - hr + 0.015), S(0.03));
  } else if (p.ear === 'dr') {
    // v79: sarkık köpek kulağı — başın önünde, tepe-arkadan aşağı sarkar
    const flop = Math.sin(t / 140) * (st ? 0.12 : 0.03);
    c.save();
    c.translate(S(hx - 0.07), S(hy - 0.12));
    c.rotate(0.25 + flop);
    c.fillStyle = ec;
    c.beginPath();
    c.moveTo(S(-0.04), 0);
    c.quadraticCurveTo(S(0.07), S(-0.03), S(0.07), S(0.06));
    c.quadraticCurveTo(S(0.08), S(0.2), S(0.01), S(0.23));
    c.quadraticCurveTo(S(-0.07), S(0.22), S(-0.07), S(0.1));
    c.quadraticCurveTo(S(-0.07), S(0.03), S(-0.04), 0);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,.18)';
    oval(c, S(0.0), S(0.12), S(0.025), S(0.07));
    c.restore();
  }

  // göz
  eyeAt(c, S(hx + 0.06), S(hy - 0.04), S(p.eye ? 0.032 : 0.028), p.eye);
  if (sn === 'dog' || sn === 'flat') {
    c.strokeStyle = 'rgba(40,20,10,.35)';
    c.lineWidth = Math.max(0.8, S(0.01));
    c.beginPath();
    c.arc(S(hx + 0.06), S(hy - 0.075), S(0.03), Math.PI * 1.15, Math.PI * 1.85);
    c.stroke();
  }
  if (p.horn) {
    c.fillStyle = p.horn;
    c.beginPath();
    c.moveTo(S(hx - 0.02), S(hy - hr + 0.03));
    c.lineTo(S(hx + 0.08), S(hy - hr - 0.24));
    c.lineTo(S(hx + 0.07), S(hy - hr + 0.03));
    c.fill();
    if (p.snout === 'horse') {
      c.strokeStyle = 'rgba(180,120,0,.6)';
      c.lineWidth = S(0.01);
      for (let i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo(S(hx + 0.0 + i * 0.02), S(hy - hr - i * 0.06 + 0.04));
        c.lineTo(S(hx + 0.07), S(hy - hr - i * 0.06 + 0.02));
        c.stroke();
      }
    }
  }
  if (p.shades) {
    c.fillStyle = '#0d0d0d';
    rr(c, S(hx - 0.01), S(hy - 0.08), S(0.15), S(0.06), S(0.02));
    c.fill();
  }
  if (p.fire && t % 2400 < 900)
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i % 2 ? '#ffd23f' : '#ff6a1a';
      disc(c, S(nose[0] + 0.06 + i * 0.08), S(nose[1] + i * 0.01), S(0.05 - 0.012 * i));
    }
  if (p.monocle) {
    c.strokeStyle = '#ffd23f';
    c.lineWidth = Math.max(1, S(0.022));
    c.beginPath();
    c.arc(S(hx + 0.06), S(hy - 0.04), S(0.055), 0, 7);
    c.moveTo(S(hx + 0.08), S(hy + 0.01));
    c.lineTo(S(hx + 0.08), S(hy + 0.16));
    c.stroke();
  }
  if (p.hat) {
    c.fillStyle = '#111';
    rr(c, S(hx - 0.12), S(hy - hr - 0.02), S(0.22), S(0.05), S(0.02));
    c.fill();
    rr(c, S(hx - 0.07), S(hy - hr - 0.18), S(0.13), S(0.17), S(0.02));
    c.fill();
    c.fillStyle = '#d4af37';
    c.fillRect(S(hx - 0.07), S(hy - hr - 0.06), S(0.13), S(0.03));
  }
  if (collar || p.chain) collarBand(c, s, ...QUAD_COLLAR(p), collar, p.chain);
}

// --- İki ayak üstünde yürüyenler (maymun, tavşan, hamster, panda) ------------------
// Yan/üç çeyrek görünüm, sağa bakar. Her formun ölçüleri BIPED_FORMS'ta.
const BIPED_FORMS = {
  //       bacak  bacak-gen ayak   gövde-y  gövde-rx ry    baş-y  baş-r  kol    kol-gen
  monkey: { L: 0.38, lw: 0.09, fl: 0.07, by: -0.62, rx: 0.17, ry: 0.25, hy: -1.0, hr: 0.17, al: 0.34, aw: 0.07 },
  rabbit: { L: 0.16, lw: 0.1, fl: 0.13, by: -0.38, rx: 0.18, ry: 0.23, hy: -0.74, hr: 0.15, al: 0.15, aw: 0.06 },
  hamster: { L: 0.08, lw: 0.08, fl: 0.06, by: -0.32, rx: 0.25, ry: 0.27, hy: -0.68, hr: 0.19, al: 0.1, aw: 0.06 },
  panda: { L: 0.18, lw: 0.13, fl: 0.08, by: -0.44, rx: 0.25, ry: 0.28, hy: -0.9, hr: 0.21, al: 0.24, aw: 0.11 },
};
export const bipedNeck = (form) => {
  const f = BIPED_FORMS[form] || BIPED_FORMS.monkey;
  return [0.02, f.hy + f.hr * 0.95];
};

function biped(c, p, s, st, t, collar) {
  const S = (v) => v * s;
  const F = BIPED_FORMS[p.form] || BIPED_FORMS.monkey;
  const form = p.form || 'monkey';
  const isPanda = form === 'panda';
  const limb = isPanda ? p.dark : p.c;
  const limbFar = shadeHex(isPanda ? '#2a2a30' : p.c, isPanda ? -0.3 : -0.25);
  const hipY = F.by + F.ry * 0.62;
  const shY = F.by - F.ry * 0.6;
  const hx = 0.04;

  // maymun kuyruğu (arkada kıvrık)
  if (form === 'monkey') {
    c.strokeStyle = p.c;
    c.lineCap = 'round';
    c.lineWidth = S(0.06);
    c.beginPath();
    c.moveTo(S(-0.12), S(-0.45));
    c.quadraticCurveTo(S(-0.42), S(-0.4 + Math.sin(t / 300) * 0.04), S(-0.36), S(-0.72));
    c.arc(S(-0.29), S(-0.72), S(0.07), Math.PI, Math.PI * 2.3);
    c.stroke();
  }

  const legFn = (ox, ang, col) => {
    c.save();
    c.translate(S(ox), S(hipY));
    c.rotate(ang);
    c.fillStyle = col;
    rr(c, S(-F.lw / 2), S(-0.04), S(F.lw), S(F.L + 0.04), S(F.lw / 2));
    c.fill();
    // ayak (tavşanın uzun arka ayağı)
    c.fillStyle = form === 'monkey' ? p.c2 : col;
    oval(c, S(F.fl * 0.45), S(F.L), S(F.fl), S(form === 'rabbit' ? 0.04 : 0.035));
    if (form === 'rabbit' || form === 'hamster') {
      c.fillStyle = 'rgba(255,190,200,.55)';
      oval(c, S(F.fl * 0.6), S(F.L + 0.01), S(F.fl * 0.45), S(0.015));
    }
    c.restore();
  };
  const armFn = (ox, ang, col) => {
    c.save();
    c.translate(S(ox), S(shY));
    c.rotate(ang);
    c.fillStyle = col;
    rr(c, S(-F.aw / 2), 0, S(F.aw), S(F.al), S(F.aw / 2));
    c.fill();
    c.fillStyle = form === 'monkey' ? p.c2 : col;
    disc(c, 0, S(F.al), S(F.aw * 0.62));
    c.restore();
  };
  const swing = form === 'monkey' ? 0.35 : form === 'panda' ? 0.3 : 0.45;
  legFn(-F.rx * 0.3, -st * swing, limbFar);
  armFn(-F.rx * 0.35, -0.15 + st * 0.4, limbFar);

  // tavşan ponpon kuyruğu (gövdenin arkasında)
  if (form === 'rabbit') {
    c.fillStyle = '#ffffff';
    disc(c, S(-F.rx - 0.02), S(F.by + 0.1), S(0.075));
  }
  if (form === 'panda') {
    c.fillStyle = p.c;
    disc(c, S(-F.rx + 0.02), S(F.by + 0.16), S(0.05));
  }

  // gövde
  if (form === 'rabbit') {
    // armut gövde
    const g = c.createLinearGradient(0, S(F.by - F.ry), 0, S(F.by + F.ry));
    g.addColorStop(0, shadeHex(p.c, 0.3));
    g.addColorStop(1, shadeHex(p.c, -0.1));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(S(0), S(F.by - F.ry));
    c.bezierCurveTo(S(F.rx * 0.8), S(F.by - F.ry), S(F.rx * 1.25), S(F.by + F.ry * 0.9), S(0.02), S(F.by + F.ry));
    c.bezierCurveTo(S(-F.rx * 1.35), S(F.by + F.ry), S(-F.rx * 1.0), S(F.by - F.ry), S(0), S(F.by - F.ry));
    c.fill();
  } else {
    const g = c.createLinearGradient(0, S(F.by - F.ry), 0, S(F.by + F.ry));
    g.addColorStop(0, shadeHex(p.c, 0.14));
    g.addColorStop(1, shadeHex(p.c, -0.14));
    c.fillStyle = g;
    oval(c, 0, S(F.by), S(F.rx), S(F.ry));
  }
  // karın
  c.fillStyle = p.c2;
  if (form === 'monkey') oval(c, S(0.06), S(-0.58), S(0.09), S(0.17));
  else if (form === 'hamster') oval(c, S(0.06), S(F.by + 0.04), S(F.rx * 0.65), S(F.ry * 0.72));
  else if (form === 'rabbit') oval(c, S(0.05), S(F.by + 0.06), S(F.rx * 0.55), S(F.ry * 0.6));
  // panda: siyah omuz kuşağı
  if (isPanda) {
    c.save();
    oval(c, 0, S(F.by), S(F.rx), S(F.ry)); // yol
    c.beginPath();
    c.ellipse(0, S(F.by), S(F.rx), S(F.ry), 0, 0, 7);
    c.clip();
    c.fillStyle = p.dark;
    c.beginPath();
    c.ellipse(S(-0.02), S(F.by - F.ry * 0.55), S(F.rx * 1.1), S(F.ry * 0.32), -0.12, 0, 7);
    c.fill();
    c.restore();
  }
  legFn(F.rx * 0.25, st * swing, limb);

  // baş
  const hy = F.hy;
  const hr = F.hr;
  const hxx = hx;
  // kulaklar (arkada)
  if (form === 'rabbit') {
    const twitch = Math.sin(t / 700) * 0.06;
    const ear = (ex, rot, col, inner) => {
      c.save();
      c.translate(S(ex), S(hy - hr * 0.7));
      c.rotate(rot);
      c.fillStyle = col;
      oval(c, 0, S(-0.17), S(0.055), S(0.19));
      if (inner) {
        c.fillStyle = p.ec;
        oval(c, S(0.006), S(-0.16), S(0.028), S(0.14));
      }
      c.restore();
    };
    ear(hxx - 0.06, -0.28 + twitch, shadeHex(p.c, -0.12), false);
    ear(hxx + 0.03, -0.08 - twitch, p.c, true);
  } else if (form === 'hamster') {
    c.fillStyle = shadeHex(p.c, -0.1);
    disc(c, S(hxx - 0.1), S(hy - hr * 0.82), S(0.055));
    disc(c, S(hxx + 0.1), S(hy - hr * 0.85), S(0.055));
    c.fillStyle = '#f2a7a0';
    disc(c, S(hxx - 0.1), S(hy - hr * 0.82), S(0.028));
    disc(c, S(hxx + 0.1), S(hy - hr * 0.85), S(0.028));
  } else if (isPanda) {
    c.fillStyle = p.dark;
    disc(c, S(hxx - 0.15), S(hy - hr * 0.78), S(0.075));
    disc(c, S(hxx + 0.14), S(hy - hr * 0.8), S(0.075));
  } else {
    c.fillStyle = p.c;
    disc(c, S(hxx - 0.16), S(hy), S(0.065));
    c.fillStyle = p.c2;
    disc(c, S(hxx - 0.16), S(hy), S(0.035));
  }
  // kafa
  const hg = c.createRadialGradient(S(hxx - 0.04), S(hy - 0.06), S(0.02), S(hxx), S(hy), S(hr + 0.04));
  hg.addColorStop(0, shadeHex(p.c, 0.22));
  hg.addColorStop(1, p.c);
  c.fillStyle = hg;
  if (form === 'hamster') oval(c, S(hxx), S(hy + 0.02), S(hr * 1.08), S(hr * 0.98));
  else disc(c, S(hxx), S(hy), S(hr));

  // yüz
  const eyeY = hy - hr * 0.12;
  const e1 = hxx + hr * 0.18;
  const e2 = hxx + hr * 0.6;
  if (form === 'monkey') {
    c.fillStyle = p.c2;
    oval(c, S(hxx + 0.07), S(hy + 0.03), S(0.11), S(0.1));
    eyeAt(c, S(hxx + 0.05), S(hy - 0.02), S(0.02));
    eyeAt(c, S(hxx + 0.12), S(hy - 0.02), S(0.02));
    c.strokeStyle = shadeHex(p.c, -0.25);
    c.lineWidth = Math.max(1, S(0.02));
    c.beginPath();
    c.arc(S(hxx + 0.1), S(hy + 0.05), S(0.04), 0.2, Math.PI - 0.2);
    c.stroke();
  } else if (form === 'rabbit') {
    c.fillStyle = p.c2;
    oval(c, S(hxx + hr * 0.62), S(hy + hr * 0.32), S(hr * 0.42), S(hr * 0.3));
    eyeAt(c, S(e1), S(eyeY), S(0.026));
    eyeAt(c, S(e2), S(eyeY), S(0.022));
    c.fillStyle = '#f08aa0';
    c.beginPath();
    c.moveTo(S(hxx + hr * 0.6), S(hy + hr * 0.18));
    c.lineTo(S(hxx + hr * 0.84), S(hy + hr * 0.18));
    c.lineTo(S(hxx + hr * 0.72), S(hy + hr * 0.32));
    c.fill();
    c.strokeStyle = 'rgba(120,100,100,.45)';
    c.lineWidth = Math.max(0.6, S(0.008));
    for (const d of [-0.02, 0.02]) {
      c.beginPath();
      c.moveTo(S(hxx + hr * 0.75), S(hy + hr * 0.3 + d));
      c.lineTo(S(hxx + hr * 1.5), S(hy + hr * 0.24 + d * 2));
      c.stroke();
    }
    c.fillStyle = 'rgba(255,150,170,.35)';
    disc(c, S(hxx + hr * 0.15), S(hy + hr * 0.35), S(0.035));
  } else if (form === 'hamster') {
    // dolu yanaklar
    c.fillStyle = p.c2;
    oval(c, S(hxx + hr * 0.15), S(hy + hr * 0.45), S(hr * 0.55), S(hr * 0.42));
    oval(c, S(hxx + hr * 0.78), S(hy + hr * 0.42), S(hr * 0.42), S(hr * 0.38));
    c.fillStyle = 'rgba(255,140,160,.45)';
    disc(c, S(hxx + hr * 0.05), S(hy + hr * 0.4), S(0.04));
    eyeAt(c, S(e1 - 0.01), S(eyeY - 0.01), S(0.03));
    eyeAt(c, S(e2 + 0.01), S(eyeY - 0.01), S(0.026));
    c.fillStyle = '#e88a8a';
    oval(c, S(hxx + hr * 0.5), S(hy + hr * 0.2), S(0.022), S(0.016));
    c.strokeStyle = 'rgba(90,60,40,.4)';
    c.lineWidth = Math.max(0.6, S(0.008));
    for (const d of [-0.015, 0.015]) {
      c.beginPath();
      c.moveTo(S(hxx + hr * 0.6), S(hy + hr * 0.28 + d));
      c.lineTo(S(hxx + hr * 1.3), S(hy + hr * 0.2 + d * 2));
      c.stroke();
    }
    // ön dişler
    c.fillStyle = '#fff';
    c.fillRect(S(hxx + hr * 0.45), S(hy + hr * 0.32), S(0.024), S(0.03));
  } else if (isPanda) {
    // göz lekeleri (gözyaşı şekli, dışa eğik)
    c.fillStyle = p.dark;
    oval(c, S(e1 - 0.01), S(eyeY + 0.01), S(0.05), S(0.065), 0.5);
    oval(c, S(e2 + 0.03), S(eyeY + 0.01), S(0.045), S(0.06), -0.5);
    c.fillStyle = '#fff';
    disc(c, S(e1), S(eyeY - 0.005), S(0.02));
    disc(c, S(e2 + 0.02), S(eyeY - 0.005), S(0.018));
    c.fillStyle = '#111';
    disc(c, S(e1 + 0.003), S(eyeY - 0.003), S(0.012));
    disc(c, S(e2 + 0.023), S(eyeY - 0.003), S(0.011));
    // ağız bölgesi + burun
    c.fillStyle = p.c2;
    oval(c, S(hxx + hr * 0.55), S(hy + hr * 0.45), S(hr * 0.42), S(hr * 0.3));
    c.fillStyle = p.dark;
    oval(c, S(hxx + hr * 0.62), S(hy + hr * 0.3), S(0.035), S(0.024));
    c.strokeStyle = p.dark;
    c.lineWidth = Math.max(0.8, S(0.012));
    c.beginPath();
    c.moveTo(S(hxx + hr * 0.62), S(hy + hr * 0.38));
    c.lineTo(S(hxx + hr * 0.62), S(hy + hr * 0.5));
    c.arc(S(hxx + hr * 0.52), S(hy + hr * 0.5), S(hr * 0.1), 0, Math.PI * 0.8);
    c.stroke();
  }
  if (collar) {
    const [nx, ny] = bipedNeck(form);
    c.strokeStyle = collar;
    c.lineWidth = Math.max(1.5, S(0.04));
    c.beginPath();
    c.ellipse(S(nx), S(ny), S(Math.min(0.13, F.rx * 0.6)), S(0.03), 0, 0, Math.PI);
    c.stroke();
    c.fillStyle = '#ffd23f';
    disc(c, S(nx + 0.04), S(ny + 0.05), S(0.022));
  }
  // ön kol (panda: bambu tutar gibi hafif önde)
  armFn(F.rx * 0.35, 0.15 - st * 0.4, limb);
}

// v79: papağan (kırmızı ara/makao) — beyaz yüz maskesi, kıvrık fildişi gaga,
// kanatta sarı-yeşil örtü tüyleri + mavi uç tüyleri, uzun kırmızı-mavi kuyruk,
// gri ayaklar (iki parmak önde). Uçarken iki kanat açılıp çırpar.
function parrot(c, p, s, st, t, flying) {
  const S = (v) => v * s;
  const red = p.c;
  const blue = p.c2;
  // ayakta: kısa bacak, gövde yere yakın (her şey 0.09 aşağı; ayaklar telafi edilir)
  const drop = flying ? 0 : 0.09;
  c.save();
  c.translate(0, S(drop));
  const lean = flying ? -0.75 : -0.28;
  // kuyruk (uzun, incelen; altta mavi, üstte kırmızı)
  const tailSway = Math.sin(t / 380) * 0.03;
  const tail = (len, w, col) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(S(-0.02), S(-0.36));
    c.quadraticCurveTo(S(-0.2), S(-0.18), S(-len * 0.72 + tailSway), S(flying ? -0.2 : -0.1));
    c.lineTo(S(-len * 0.72 - 0.02 + tailSway), S(flying ? -0.18 : -0.075));
    c.quadraticCurveTo(S(-0.2 + w), S(-0.12), S(0.06), S(-0.3));
    c.fill();
  };
  tail(0.62, 0.02, blue);
  tail(0.5, 0.05, red);
  // ayaklar (gri, zigodaktil)
  if (!flying) {
    c.save();
    c.translate(0, S(-drop));
    c.strokeStyle = '#6b6f78';
    c.lineCap = 'round';
    c.lineWidth = S(0.035);
    for (const g of [-1, 1]) {
      const fx = g * 0.04 + st * g * 0.03;
      c.beginPath();
      c.moveTo(S(fx), S(-0.11));
      c.lineTo(S(fx), S(-0.02));
      c.moveTo(S(fx), S(-0.02));
      c.lineTo(S(fx + 0.06), S(0));
      c.moveTo(S(fx), S(-0.02));
      c.lineTo(S(fx - 0.05), S(0));
      c.stroke();
    }
    c.restore();
  }
  // arka kanat (uçarken görünür)
  const flap = flying ? Math.sin(t / 60) * 0.55 : 0;
  const wing = (rot, far) => {
    c.save();
    c.translate(S(0.0), S(-0.6));
    c.rotate(rot);
    const path = () => {
      c.beginPath();
      c.moveTo(S(0.06), S(-0.02));
      c.quadraticCurveTo(S(0.08), S(0.2), S(-0.06), S(0.42));
      c.lineTo(S(-0.12), S(0.46));
      c.quadraticCurveTo(S(-0.14), S(0.18), S(-0.06), S(-0.02));
      c.closePath();
    };
    path();
    c.fillStyle = far ? shadeHex(blue, -0.3) : blue;
    c.fill();
    c.save();
    path();
    c.clip();
    // örtü tüyleri: kırmızı omuz → sarı → yeşil uç
    c.fillStyle = far ? shadeHex(red, -0.3) : red;
    oval(c, S(0), S(0.02), S(0.12), S(0.08));
    c.fillStyle = far ? shadeHex(p.yel, -0.3) : p.yel;
    oval(c, S(-0.01), S(0.13), S(0.11), S(0.07), 0.2);
    c.fillStyle = far ? shadeHex(p.grn, -0.3) : p.grn;
    oval(c, S(-0.03), S(0.2), S(0.1), S(0.035), 0.25);
    // tüy çizgileri
    c.strokeStyle = 'rgba(0,0,30,.35)';
    c.lineWidth = Math.max(0.6, S(0.008));
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(S(0.04 - i * 0.035), S(0.24));
      c.lineTo(S(-0.04 - i * 0.03), S(0.44));
      c.stroke();
    }
    c.restore();
    c.restore();
  };
  // uçarken kanatlar yukarı-arkaya açılır ve çırpar
  if (flying) wing(2.75 + flap, true);
  // gövde
  c.save();
  c.translate(S(0.02), S(-0.48));
  c.rotate(lean);
  const g = c.createLinearGradient(S(-0.17), 0, S(0.17), 0);
  g.addColorStop(0, shadeHex(red, -0.22));
  g.addColorStop(0.6, red);
  g.addColorStop(1, shadeHex(red, 0.12));
  c.fillStyle = g;
  oval(c, 0, 0, S(0.16), S(0.27));
  c.restore();
  // yakın kanat (katlı ya da çırpan)
  wing(flying ? 2.45 + flap : 0.18 + Math.sin(t / 500) * 0.02, false);
  // baş
  const hx = 0.12;
  const hy = -0.8;
  const hg = c.createRadialGradient(S(hx - 0.02), S(hy - 0.04), S(0.02), S(hx), S(hy), S(0.15));
  hg.addColorStop(0, shadeHex(red, 0.18));
  hg.addColorStop(1, red);
  c.fillStyle = hg;
  disc(c, S(hx), S(hy), S(0.13));
  // beyaz yüz maskesi + ince kırmızı tüy çizgileri
  c.fillStyle = '#fbf6f0';
  oval(c, S(hx + 0.065), S(hy + 0.005), S(0.07), S(0.055), -0.2);
  c.strokeStyle = 'rgba(200,40,50,.5)';
  c.lineWidth = Math.max(0.5, S(0.006));
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(S(hx + 0.03), S(hy + 0.015 + i * 0.014));
    c.lineTo(S(hx + 0.09), S(hy + 0.005 + i * 0.014));
    c.stroke();
  }
  // göz (açık sarı iris)
  c.fillStyle = '#f4e9a0';
  disc(c, S(hx + 0.055), S(hy - 0.02), S(0.026));
  c.fillStyle = '#111';
  disc(c, S(hx + 0.058), S(hy - 0.02), S(0.014));
  c.fillStyle = 'rgba(255,255,255,.9)';
  disc(c, S(hx + 0.063), S(hy - 0.026), S(0.006));
  // gaga: üstte kıvrık fildişi kanca, altta koyu çene
  c.fillStyle = '#26221f';
  c.beginPath();
  c.moveTo(S(hx + 0.1), S(hy + 0.04));
  c.quadraticCurveTo(S(hx + 0.17), S(hy + 0.05), S(hx + 0.18), S(hy + 0.09));
  c.quadraticCurveTo(S(hx + 0.13), S(hy + 0.1), S(hx + 0.1), S(hy + 0.07));
  c.fill();
  c.fillStyle = p.beak;
  c.beginPath();
  c.moveTo(S(hx + 0.1), S(hy - 0.045));
  c.bezierCurveTo(S(hx + 0.2), S(hy - 0.06), S(hx + 0.25), S(hy + 0.02), S(hx + 0.2), S(hy + 0.11));
  c.quadraticCurveTo(S(hx + 0.19), S(hy + 0.05), S(hx + 0.15), S(hy + 0.045));
  c.quadraticCurveTo(S(hx + 0.12), S(hy + 0.05), S(hx + 0.1), S(hy + 0.04));
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(60,40,30,.35)';
  c.beginPath();
  c.moveTo(S(hx + 0.1), S(hy - 0.045));
  c.quadraticCurveTo(S(hx + 0.12), S(hy), S(hx + 0.1), S(hy + 0.04));
  c.lineTo(S(hx + 0.115), S(hy + 0.04));
  c.quadraticCurveTo(S(hx + 0.13), S(hy), S(hx + 0.11), S(hy - 0.045));
  c.fill();
  c.fillStyle = 'rgba(255,255,255,.5)';
  oval(c, S(hx + 0.16), S(hy - 0.035), S(0.03), S(0.01), 0.3);
  c.restore();
}

function bird(c, p, s, st, t, flying) {
  if (p.parrot) return parrot(c, p, s, st, t, flying);
  c.strokeStyle = '#f59e0b';
  c.lineWidth = s * 0.04;
  c.lineCap = 'round';
  if (!flying)
    for (const g of [1, -1]) {
      c.beginPath();
      c.moveTo(g * 0.05 * s, -0.2 * s);
      c.lineTo(g * 0.05 * s + g * st * 0.06 * s, 0);
      c.stroke();
    }
  if (p.fan)
    for (let i = -3; i <= 3; i++) {
      c.fillStyle = i % 2 ? '#a0522d' : '#7a3f1f';
      c.save();
      c.translate(-0.1 * s, -0.5 * s);
      c.rotate(-1.5 + i * 0.24);
      c.beginPath();
      c.ellipse(0, -0.28 * s, 0.07 * s, 0.28 * s, 0, 0, 7);
      c.fill();
      c.restore();
    }
  else if (p.long) {
    c.fillStyle = p.c2;
    c.save();
    c.translate(-0.1 * s, -0.3 * s);
    c.rotate(0.5);
    c.fillRect(-0.04 * s, 0, 0.08 * s, 0.36 * s);
    c.restore();
  } else {
    c.fillStyle = p.c2;
    c.beginPath();
    c.moveTo(-0.12 * s, -0.3 * s);
    c.lineTo(-0.34 * s, -0.2 * s);
    c.lineTo(-0.1 * s, -0.18 * s);
    c.fill();
  }
  const g = c.createLinearGradient(0, -0.7 * s, 0, -0.1 * s);
  g.addColorStop(0, shadeHex(p.c, 0.12));
  g.addColorStop(1, shadeHex(p.c, -0.15));
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, -0.4 * s, 0.2 * s, 0.3 * s, 0, 0, 7);
  c.fill();
  if (p.belly || p.owl) {
    c.fillStyle = p.c2;
    c.beginPath();
    c.ellipse(0.06 * s, -0.38 * s, 0.13 * s, 0.24 * s, 0, 0, 7);
    c.fill();
  }
  if (p.owl) {
    c.strokeStyle = shadeHex(p.c, -0.2);
    c.lineWidth = s * 0.02;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(0.06 * s, -0.42 * s + i * 0.08 * s, 0.05 * s, 0.2, Math.PI - 0.2);
      c.stroke();
    }
  }
  // kanat: uçarken çırpar
  const flap = flying ? Math.sin(t / 55) * 0.9 : Math.sin(t / 120) * (st ? 0.15 : 0.04);
  c.fillStyle = p.wc || p.c2;
  c.save();
  c.translate(-0.04 * s, -0.5 * s);
  c.rotate(0.15 + flap);
  c.beginPath();
  c.ellipse(0, 0.1 * s, 0.07 * s, 0.22 * s, 0, 0, 7);
  c.fill();
  c.restore();
  c.fillStyle = p.c;
  c.beginPath();
  c.arc(0.1 * s, -0.76 * s, p.owl ? 0.16 * s : 0.13 * s, 0, 7);
  c.fill();
  if (p.owl) {
    c.fillStyle = p.c;
    c.beginPath();
    c.moveTo(0, -0.86 * s);
    c.lineTo(0.02 * s, -0.98 * s);
    c.lineTo(0.08 * s, -0.88 * s);
    c.moveTo(0.14 * s, -0.88 * s);
    c.lineTo(0.2 * s, -0.98 * s);
    c.lineTo(0.22 * s, -0.86 * s);
    c.fill();
    c.fillStyle = '#fff6d0';
    c.beginPath();
    c.arc(0.06 * s, -0.78 * s, 0.055 * s, 0, 7);
    c.arc(0.17 * s, -0.78 * s, 0.055 * s, 0, 7);
    c.fill();
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(0.07 * s, -0.78 * s, 0.028 * s, 0, 7);
    c.arc(0.18 * s, -0.78 * s, 0.028 * s, 0, 7);
    c.fill();
    c.fillStyle = p.beak;
    c.beginPath();
    c.moveTo(0.1 * s, -0.74 * s);
    c.lineTo(0.14 * s, -0.74 * s);
    c.lineTo(0.12 * s, -0.68 * s);
    c.fill();
    return;
  }
  if (p.fan) {
    c.fillStyle = p.c2;
    c.beginPath();
    c.ellipse(0.2 * s, -0.64 * s, 0.03 * s, 0.06 * s, 0, 0, 7);
    c.fill();
  }
  c.fillStyle = p.beak;
  c.beginPath();
  c.moveTo(0.21 * s, -0.78 * s);
  c.lineTo(0.34 * s, -0.74 * s);
  c.lineTo(0.21 * s, -0.7 * s);
  c.fill();
  c.fillStyle = '#111';
  c.beginPath();
  c.arc(0.14 * s, -0.8 * s, 0.022 * s, 0, 7);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,.9)';
  c.beginPath();
  c.arc(0.146 * s, -0.806 * s, 0.008 * s, 0, 7);
  c.fill();
}

// x,y = zemin noktası. size: piksel boyu (yoksa prototip boyu). opts: { moving, flip, flying, collar }
export function drawPet(c, id, x, y, t, { moving = false, flip = false, flying = false, collar = null, size = null } = {}) {
  const p = PET_ART[id];
  if (!p) return;
  const s = size || p.s;
  c.save();
  c.translate(x, y);
  if (flip) c.scale(-1, 1);
  if (!flying) {
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath();
    c.ellipse(0, 2, s * 0.5, s * 0.1, 0, 0, 7);
    c.fill();
  }
  if (p.glow) {
    c.shadowColor = p.glow;
    c.shadowBlur = Math.max(6, s * 0.25);
  }
  const st = moving ? Math.sin(t / 85) : 0;
  c.translate(0, moving && !flying ? -Math.abs(Math.sin(t / 85)) * s * 0.05 : Math.sin(t / 450) * s * 0.012);
  if (p.k === 'b') bird(c, p, s, st, t, flying);
  else if (p.k === 'm') biped(c, p, s, st, t, collar);
  else quad(c, p, s, st, t, collar);
  c.restore();
}

export const isPerchPet = (id) => Boolean(PET_MAP[id]?.perch);
// tasma halkasının hayvan üzerindeki yeri (boy oranı, sağa bakarken)
export const petCollarAt = (id) => {
  const p = PET_ART[id];
  if (p?.k === 'm') {
    const [nx, ny] = bipedNeck(p.form);
    return [nx + 0.04, ny + 0.05];
  }
  // dört ayaklı: künyenin yeri (quad() içindeki collarBand ile aynı)
  const [, , x2, y2] = QUAD_COLLAR(p);
  return [x2 - 0.01, y2 + 0.03];
};
export const petMeta = (id) => PET_MAP[id] || null;

// Oyun içi boy: prototipteki hayvanlar biraz büyüktü → %72'si.
// avatarH: ekrandaki avatar boyu (prototipte 159 px)
export const petSizeFor = (id, avatarH) => (PET_ART[id]?.s || 40) * 0.72 * (avatarH / 159);

// --- Avatarın yanındaki hayvan (canvas dünyaları) ----------------------------------
const followers = new Map(); // anahtar → { x, y, f, t, moving, flying }
export function drawOwnerPet(ctx, { key, x, baseY, facing, h, w, pet, moving = false, isStatic = false, now = performance.now() }) {
  const id = pet?.id;
  if (!PET_ART[id]) return;
  const dir = facing === 'left' ? -1 : 1;
  const size = petSizeFor(id, h);
  const perch = isPerchPet(id);
  const shoulder = { x: x - dir * w * 0.2, y: baseY - h * 0.73 };
  const ground = { x: x + dir * (w * 0.62 + size * 0.35), y: baseY + 6 };
  let st = followers.get(key);
  if (isStatic || !st) {
    st = { x: perch ? shoulder.x : ground.x, y: perch ? shoulder.y : ground.y, f: dir, t: now, moving: false };
    if (!isStatic) followers.set(key, st);
    if (followers.size > 200) followers.delete(followers.keys().next().value);
  }
  const dt = Math.min(0.1, Math.max(0, (now - st.t) / 1000));
  st.t = now;
  let tx;
  let ty;
  let flying = false;
  if (perch && !moving) {
    tx = shoulder.x;
    ty = shoulder.y;
  } else if (perch) {
    // sahibi yürürken başının üstünde süzülür
    flying = true;
    tx = x - dir * w * 0.35 + Math.sin(now / 420) * w * 0.15;
    ty = baseY - h * 1.02 + Math.sin(now / 260) * 6;
  } else {
    tx = ground.x;
    ty = ground.y;
  }
  if (!isStatic) {
    const k = Math.min(1, dt * (perch ? 5 : 3.5));
    const dx = tx - st.x;
    const dy = ty - st.y;
    st.x += dx * k;
    st.y += dy * k;
    const sp = Math.hypot(dx, dy) * k / Math.max(dt, 0.001);
    st.moving = sp > 14;
    if (Math.abs(dx) > 3) st.f = dx > 0 ? 1 : -1;
    if (perch && !moving && Math.hypot(dx, dy) > 4) flying = true;
  } else {
    st.f = perch ? dir : dir;
  }
  const flip = perch && !flying ? dir < 0 : st.f < 0;
  // tasma (kuşlarda yok)
  if (pet.leash !== false && !perch) {
    const hx = x + dir * w * 0.3;
    const hy = baseY - h * 0.42;
    const [cx, cy] = petCollarAt(id);
    const px = st.x + (flip ? -1 : 1) * cx * size;
    const py = st.y + cy * size;
    ctx.save();
    ctx.strokeStyle = pet.leashColor || '#ff2e88';
    ctx.shadowColor = pet.leashColor || '#ff2e88';
    ctx.shadowBlur = 5;
    ctx.lineWidth = Math.max(1.5, h / 70);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo((hx + px) / 2, Math.max(hy, py) + h * 0.12, px, py);
    ctx.stroke();
    ctx.restore();
  }
  drawPet(ctx, id, st.x, st.y, now, {
    moving: st.moving && !flying,
    flip,
    flying,
    collar: pet.leash !== false && !perch ? pet.leashColor || '#ff2e88' : null,
    size,
  });
}

// --- Canlı aura efektleri (canvas) — örnekteki yıldız tozu ---------------------------
// x, baseY: avatarın ayak noktası · h: ekrandaki avatar boyu
export function drawAuraFx(ctx, acc, x, baseY, h, now = performance.now()) {
  if (acc?.aura !== 'spark') return;
  const k = h / 159;
  ctx.save();
  ctx.fillStyle = '#ffe566';
  ctx.shadowColor = '#ffd23f';
  ctx.shadowBlur = 8 * k;
  for (let i = 0; i < 12; i++) {
    const a = now / 900 + i * 0.52;
    const r = (44 + Math.sin(now / 500 + i) * 8) * k;
    const sx = x + Math.cos(a) * r;
    const sy = baseY - h * 0.5 + Math.sin(a * 1.3 + i) * h * 0.45;
    const z = (2 + Math.abs(Math.sin(now / 200 + i)) * 3) * k;
    ctx.beginPath();
    ctx.moveTo(sx, sy - z * 1.6);
    ctx.lineTo(sx + z * 0.5, sy - z * 0.5);
    ctx.lineTo(sx + z * 1.6, sy);
    ctx.lineTo(sx + z * 0.5, sy + z * 0.5);
    ctx.lineTo(sx, sy + z * 1.6);
    ctx.lineTo(sx - z * 0.5, sy + z * 0.5);
    ctx.lineTo(sx - z * 1.6, sy);
    ctx.lineTo(sx - z * 0.5, sy - z * 0.5);
    ctx.fill();
  }
  ctx.restore();
}
