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
  angel: { b: '<g transform="translate(29,0) scale(0.82,1)"><g fill="#fff" stroke="#d9e2ee" stroke-width="3"><path d="M110,290 Q-30,180 -20,360 Q10,430 100,380 Z"/><path d="M210,290 Q350,180 340,360 Q310,430 220,380 Z"/></g><path d="M100,300 Q20,240 0,330 M104,330 Q40,300 10,380 M220,300 Q300,240 320,330 M216,330 Q280,300 310,380" stroke="#d9e2ee" stroke-width="3" fill="none"/></g>' },
  jet: { b: '<g fill="#b8c2d0" stroke="#6b7685" stroke-width="3"><rect x="56" y="272" width="34" height="110" rx="14"/><rect x="230" y="272" width="34" height="110" rx="14"/></g><rect x="62" y="290" width="22" height="8" rx="3" fill="#ff2e88"/><rect x="236" y="290" width="22" height="8" rx="3" fill="#ff2e88"/><path d="M63,384 L73,440 L83,384 Z M237,384 L247,440 L257,384 Z" fill="#ff8a1a"/><path d="M68,384 L73,418 L78,384 Z M242,384 L247,418 L252,384 Z" fill="#ffe566"/>' },
  royal: { b: cape('#a3122f', '#5c0a1b'), f: '<ellipse cx="160" cy="268" rx="64" ry="15" fill="#f4f1ea"/><circle cx="130" cy="268" r="3" fill="#222"/><circle cx="160" cy="276" r="3" fill="#222"/><circle cx="190" cy="268" r="3" fill="#222"/>' + clasp },
  dragonw: { b: `<g transform="translate(40,0) scale(0.75,1)">${dragonWing}<g transform="translate(320,0) scale(-1,1)">${dragonWing}</g></g>` },
  ring: { b: '<ellipse cx="160" cy="560" rx="96" ry="20" fill="none" stroke="#22d3ee" stroke-width="10" opacity=".25"/><ellipse cx="160" cy="560" rx="96" ry="20" fill="none" stroke="#22d3ee" stroke-width="4"/><ellipse cx="160" cy="556" rx="118" ry="26" fill="none" stroke="#ff2e88" stroke-width="3" opacity=".8"/>' },
  spark: { b: [star(70, 230, 6, '#ffe566'), star(256, 190, 5, '#fff6a8'), star(46, 380, 4, '#ffd23f'), star(278, 330, 6, '#ffe566'), star(96, 120, 4, '#fff6a8'), star(232, 450, 5, '#ffd23f'), star(60, 520, 4, '#ffe566'), star(272, 520, 3, '#fff6a8')].join('') },
  fire: { b: '<ellipse cx="160" cy="560" rx="100" ry="16" fill="#ff6a1a" opacity=".25"/>' + [60, 96, 132, 172, 212, 252].map((x, i) => flame(x, 60 + ((i * 37) % 50), '#ff6a1a', '#ffd23f')).join('') },
};

// avatar.acc → { back, front } SVG; çakışan avatar parçaları (şapka, yüz/boyun aksesuarı) gizlenir
export function accLayers(acc) {
  const out = { back: '', front: '', hideHat: false, hideFace: false, hideNeck: false };
  if (!acc || typeof acc !== 'object') return out;
  for (const slot of ['aura', 'back', 'neck', 'face', 'head']) {
    const id = acc[slot];
    const meta = ACC_MAP[id];
    const art = ACC_ART[id];
    if (!meta || meta.slot !== slot || !art) continue;
    out.back += art.b || '';
    out.front += art.f || '';
    if (slot === 'head') out.hideHat = true;
    if (slot === 'face') out.hideFace = true;
    if (slot === 'neck') out.hideNeck = true;
  }
  return out;
}

// --- Evcil hayvan çizimi -----------------------------------------------------------
// s: prototip boyu (piksel, avatar ~160 px iken). k:'q' dört ayaklı · 'b' kuş
export const PET_ART = {
  hamster: { k: 'q', c: '#d9a066', c2: '#f4e2c8', s: 26, ear: 'rd', tail: 'no', cheek: 1 },
  sokak: { k: 'q', c: '#c98f4a', c2: '#e8c79a', leg: '#a9722f', s: 44, ear: 'pt', tail: 'lg', stripe: '#8a5a22' },
  hindi: { k: 'b', c: '#8a5a34', c2: '#c0392b', beak: '#f2b632', fan: 1, s: 52 },
  tavsan: { k: 'q', c: '#f1ece4', c2: '#f7d4dc', s: 36, ear: 'lg', tail: 'sh' },
  golden: { k: 'q', c: '#e0b05a', c2: '#f0d29a', ec: '#a9722f', s: 54, ear: 'dr', tail: 'lg' },
  karakedi: { k: 'q', c: '#1d1d26', c2: '#33334a', s: 44, ear: 'pt', tail: 'lg', eye: '#ffd23f' },
  marti: { k: 'b', c: '#f4f6f8', c2: '#9aa5b1', beak: '#f2b632', s: 46 },
  dalmacyali: { k: 'q', c: '#f4f4f4', c2: '#ffffff', ec: '#222', s: 52, ear: 'dr', tail: 'lg', spots: '#151515' },
  baykus: { k: 'b', c: '#8a6a4a', c2: '#e8d8b8', beak: '#e2a92a', owl: 1, s: 42 },
  penguen: { k: 'b', c: '#1b2230', c2: '#fff', wc: '#0c1018', belly: 1, beak: '#f59e0b', s: 44 },
  tilki: { k: 'q', c: '#e8782a', c2: '#fff3e0', leg: '#3a2418', s: 48, ear: 'pt', tail: 'fl' },
  papagan: { k: 'b', c: '#e63946', c2: '#2a9df4', beak: '#222', long: 1, s: 48 },
  maymun: { k: 'q', c: '#7a4a2a', c2: '#e8c9a0', s: 48, ear: 'rd', tail: 'cu' },
  panda: { k: 'q', c: '#f5f5f5', c2: '#fff', leg: '#111', ec: '#111', patch: '#111', s: 56, ear: 'rd', tail: 'sh' },
  zengin: { k: 'q', c: '#2b2b33', c2: '#d4af37', s: 46, ear: 'pt', tail: 'lg', monocle: 1, hat: 1 },
  bulldog: { k: 'q', c: '#c9a27a', c2: '#f1e2cc', ec: '#7a5a3a', s: 50, ear: 'rd', tail: 'sh', jowl: 1, chain: 1, shades: 1 },
  midilli: { k: 'q', c: '#fff', c2: '#ffd0ec', glow: '#ff9ad5', horn: '#ffd23f', rainbow: 1, s: 70, ear: 'pt', tail: 'fl' },
  aslan: { k: 'q', c: '#d9a441', c2: '#f1d29a', mane: '#8a4b12', s: 66, ear: 'rd', tail: 'lg' },
  kurt: { k: 'q', c: '#101826', c2: '#22d3ee', stripe: '#22d3ee', glow: '#22d3ee', s: 64, ear: 'pt', tail: 'fl', eye: '#22d3ee' },
  ejder: { k: 'q', c: '#2fae5f', c2: '#f4d27a', wing: '#1d7a42', horn: '#f4d27a', fire: 1, s: 62, ear: 'pt', tail: 'lg' },
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

function quad(c, p, s, st, t, collar) {
  const leg = p.leg || p.c;
  const wag = Math.sin(t / 160) * 0.25;
  const ec = p.ec || p.c;
  if (p.wing) {
    c.fillStyle = p.wing;
    c.save();
    c.translate(-0.05 * s, -0.55 * s);
    c.rotate(-0.9 + Math.sin(t / 200) * 0.25);
    c.beginPath();
    c.ellipse(-0.05 * s, -0.3 * s, 0.1 * s, 0.36 * s, 0, 0, 7);
    c.fill();
    c.restore();
  }
  c.strokeStyle = p.c;
  c.fillStyle = p.c;
  c.lineCap = 'round';
  c.save();
  c.translate(-0.4 * s, -0.45 * s);
  c.rotate(wag);
  if (p.tail === 'lg') {
    c.lineWidth = s * 0.08;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(-0.2 * s, -0.05 * s, -0.25 * s, -0.3 * s);
    c.stroke();
  } else if (p.tail === 'cu') {
    c.lineWidth = s * 0.07;
    c.beginPath();
    c.arc(-0.12 * s, -0.12 * s, 0.12 * s, 0.4, Math.PI * 1.9);
    c.stroke();
  } else if (p.tail === 'fl') {
    c.beginPath();
    c.ellipse(-0.2 * s, -0.1 * s, 0.22 * s, 0.1 * s, -0.5, 0, 7);
    c.fill();
    c.fillStyle = p.c2;
    c.beginPath();
    c.ellipse(-0.3 * s, -0.17 * s, 0.08 * s, 0.05 * s, -0.5, 0, 7);
    c.fill();
  } else if (p.tail === 'sh') {
    c.beginPath();
    c.arc(-0.04 * s, -0.04 * s, 0.07 * s, 0, 7);
    c.fill();
  }
  c.restore();
  c.fillStyle = leg;
  [[-0.3, 1], [-0.15, -1], [0.18, -1], [0.32, 1]].forEach(([lx, sg]) => {
    const lf = Math.max(0, sg * st) * 0.07 * s;
    rr(c, lx * s - 0.045 * s, -0.3 * s - lf, 0.09 * s, 0.3 * s, 0.03 * s);
    c.fill();
  });
  // gövde (hafif hacim gölgesi)
  const g = c.createLinearGradient(0, -0.65 * s, 0, -0.19 * s);
  g.addColorStop(0, shadeHex(p.c, 0.12));
  g.addColorStop(1, shadeHex(p.c, -0.18));
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, -0.42 * s, 0.42 * s, 0.23 * s, 0, 0, 7);
  c.fill();
  c.fillStyle = p.c2;
  c.globalAlpha = 0.55;
  c.beginPath();
  c.ellipse(0.05 * s, -0.3 * s, 0.26 * s, 0.09 * s, 0, 0, 7);
  c.fill();
  c.globalAlpha = 1;
  if (p.spots) {
    c.fillStyle = p.spots;
    [[-0.22, -0.5, 0.05], [-0.05, -0.56, 0.04], [0.12, -0.45, 0.05], [-0.28, -0.36, 0.035], [0.25, -0.52, 0.03]].forEach(([x, y, r]) => {
      c.beginPath();
      c.arc(x * s, y * s, r * s, 0, 7);
      c.fill();
    });
  }
  if (p.stripe) {
    c.strokeStyle = p.stripe;
    c.lineWidth = s * 0.04;
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(i * 0.14 * s, -0.63 * s);
      c.lineTo(i * 0.14 * s + 0.03 * s, -0.46 * s);
      c.stroke();
    }
  }
  if (p.patch) {
    c.fillStyle = p.patch;
    c.beginPath();
    c.ellipse(0.2 * s, -0.44 * s, 0.1 * s, 0.19 * s, 0, 0, 7);
    c.fill();
  }
  if (p.mane) {
    c.fillStyle = p.mane;
    c.beginPath();
    c.arc(0.36 * s, -0.6 * s, 0.27 * s, 0, 7);
    c.fill();
  }
  if (p.rainbow)
    for (let i = 0; i < 5; i++) {
      c.strokeStyle = `hsl(${(t / 8 + i * 50) % 360},90%,60%)`;
      c.lineWidth = s * 0.05;
      c.beginPath();
      c.moveTo(0.28 * s, -0.78 * s + i * 0.035 * s);
      c.quadraticCurveTo(0.1 * s, -0.7 * s + i * 0.03 * s, 0.02 * s + i * 0.02 * s, -0.5 * s);
      c.stroke();
    }
  c.fillStyle = ec;
  if (p.ear === 'pt') {
    c.beginPath();
    c.moveTo(0.28 * s, -0.76 * s);
    c.lineTo(0.3 * s, -0.98 * s);
    c.lineTo(0.43 * s, -0.78 * s);
    c.fill();
    c.beginPath();
    c.moveTo(0.4 * s, -0.78 * s);
    c.lineTo(0.5 * s, -0.96 * s);
    c.lineTo(0.55 * s, -0.74 * s);
    c.fill();
  } else if (p.ear === 'rd') {
    c.beginPath();
    c.arc(0.3 * s, -0.8 * s, 0.07 * s, 0, 7);
    c.arc(0.5 * s, -0.8 * s, 0.07 * s, 0, 7);
    c.fill();
  } else if (p.ear === 'lg') {
    c.beginPath();
    c.ellipse(0.33 * s, -0.95 * s, 0.045 * s, 0.17 * s, -0.1, 0, 7);
    c.ellipse(0.45 * s, -0.95 * s, 0.045 * s, 0.17 * s, 0.15, 0, 7);
    c.fill();
  } else if (p.ear === 'dr') {
    c.beginPath();
    c.ellipse(0.3 * s, -0.62 * s, 0.06 * s, 0.13 * s, 0.1, 0, 7);
    c.fill();
  }
  // baş
  const hg = c.createRadialGradient(0.36 * s, -0.7 * s, 0.02 * s, 0.4 * s, -0.62 * s, 0.22 * s);
  hg.addColorStop(0, shadeHex(p.c, 0.18));
  hg.addColorStop(1, p.c);
  c.fillStyle = hg;
  c.beginPath();
  c.arc(0.4 * s, -0.62 * s, 0.19 * s, 0, 7);
  c.fill();
  if (p.jowl) {
    c.fillStyle = p.c2;
    c.beginPath();
    c.ellipse(0.5 * s, -0.5 * s, 0.14 * s, 0.09 * s, 0, 0, 7);
    c.fill();
  }
  if (p.horn) {
    c.fillStyle = p.horn;
    c.beginPath();
    c.moveTo(0.4 * s, -0.8 * s);
    c.lineTo(0.5 * s, -1.1 * s);
    c.lineTo(0.5 * s, -0.78 * s);
    c.fill();
  }
  c.fillStyle = p.c2;
  c.beginPath();
  c.ellipse(0.56 * s, -0.58 * s, 0.1 * s, 0.07 * s, 0, 0, 7);
  c.fill();
  if (p.cheek) {
    c.fillStyle = 'rgba(255,140,160,.55)';
    c.beginPath();
    c.arc(0.44 * s, -0.55 * s, 0.06 * s, 0, 7);
    c.fill();
  }
  if (p.patch) {
    c.fillStyle = p.patch;
    c.beginPath();
    c.ellipse(0.46 * s, -0.67 * s, 0.05 * s, 0.035 * s, 0, 0, 7);
    c.fill();
  }
  // burun + göz (parıltılı)
  c.fillStyle = '#1a1210';
  c.beginPath();
  c.arc(0.64 * s, -0.6 * s, 0.025 * s, 0, 7);
  c.fill();
  c.fillStyle = p.eye || '#111';
  c.beginPath();
  c.arc(0.46 * s, -0.67 * s, 0.026 * s, 0, 7);
  c.fill();
  if (p.eye) {
    c.fillStyle = '#111';
    c.fillRect(0.455 * s, -0.69 * s, 0.01 * s, 0.04 * s);
  }
  c.fillStyle = 'rgba(255,255,255,.9)';
  c.beginPath();
  c.arc(0.468 * s, -0.678 * s, 0.009 * s, 0, 7);
  c.fill();
  if (p.shades) {
    c.fillStyle = '#0d0d0d';
    rr(c, 0.4 * s, -0.71 * s, 0.14 * s, 0.06 * s, 0.02 * s);
    c.fill();
  }
  if (p.fire && t % 2400 < 900)
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i % 2 ? '#ffd23f' : '#ff6a1a';
      c.beginPath();
      c.arc(0.7 * s + i * 0.08 * s, -0.58 * s - i * 0.01 * s, (0.05 - 0.012 * i) * s, 0, 7);
      c.fill();
    }
  if (p.monocle) {
    c.strokeStyle = '#ffd23f';
    c.lineWidth = Math.max(1, s * 0.03);
    c.beginPath();
    c.arc(0.47 * s, -0.67 * s, 0.06 * s, 0, 7);
    c.moveTo(0.5 * s, -0.62 * s);
    c.lineTo(0.5 * s, -0.45 * s);
    c.stroke();
  }
  if (p.hat) {
    c.fillStyle = '#111';
    rr(c, 0.3 * s, -0.86 * s, 0.2 * s, 0.05 * s, 0.02 * s);
    c.fill();
    rr(c, 0.34 * s, -1.02 * s, 0.12 * s, 0.17 * s, 0.02 * s);
    c.fill();
    c.fillStyle = '#d4af37';
    c.fillRect(0.34 * s, -0.9 * s, 0.12 * s, 0.03 * s);
  }
  if (collar || p.chain) {
    c.strokeStyle = p.chain ? '#d4af37' : collar;
    c.lineWidth = Math.max(1.5, s * 0.045);
    c.beginPath();
    c.ellipse(0.31 * s, -0.52 * s, 0.05 * s, 0.13 * s, -0.35, 0, 7);
    c.stroke();
    if (p.chain) {
      c.fillStyle = '#d4af37';
      c.beginPath();
      c.arc(0.34 * s, -0.4 * s, 0.035 * s, 0, 7);
      c.fill();
    }
  }
}

function bird(c, p, s, st, t, flying) {
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
  else quad(c, p, s, st, t, collar);
  c.restore();
}

export const isPerchPet = (id) => Boolean(PET_MAP[id]?.perch);
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
    const px = st.x + (flip ? -1 : 1) * 0.31 * size;
    const py = st.y - 0.52 * size;
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
