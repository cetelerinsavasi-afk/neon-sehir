// v75 — Oyun salonu ortak yardımcıları. Girdi bitleri tüm oyunlarda aynıdır.
// v79: D (aşağı) eklendi (joystick'li oyunlar), 4 oyuncu rengi, N kişilik HUD,
//      ağ yumuşatmasında tam sayı/olay alanları ASLA ara değere çekilmez.
export const IN = { L: 1, R: 2, U: 4, A: 8, B: 16, D: 32 };
export const IN_MASK = 63;
export const has = (bits, b) => (bits & b) !== 0;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const r1 = (v) => Math.round(v * 10) / 10;
export const r2 = (v) => Math.round(v * 100) / 100;
export const PCOL = ['#19e8ff', '#ff4fd8', '#ffd23f', '#6dff9c']; // oyuncu 1–4
export const PNAME_COL = PCOL;
export const TAU = Math.PI * 2;

// Ağda iki cihazın aynı sonucu bulması için deterministik "rastgele" (0..1).
// Tohum: oyun durumundaki sayaçlar (ör. s.tick) — Math.random() ağlı oyunlarda kullanılmaz.
export function rnd(seed) {
  let x = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function rrect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

// Üst bilgi şeridi: iki oyuncu adı/skoru + ortada süre/metin
export function drawHud(c, W, { left, right, center, me }) {
  c.save();
  c.font = 'bold 9px system-ui, sans-serif';
  c.textBaseline = 'middle';
  const pill = (x, text, color, align, mine) => {
    const w = Math.min(130, c.measureText(text).width + 14);
    const px = align === 'left' ? x : x - w;
    rrect(c, px, 4, w, 15, 7);
    c.fillStyle = 'rgba(5,8,16,0.72)';
    c.fill();
    c.lineWidth = mine ? 1.5 : 1;
    c.strokeStyle = color;
    c.stroke();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.fillText(text, px + w / 2, 12, w - 8);
  };
  pill(4, left, PCOL[0], 'left', me === 0);
  pill(W - 4, right, PCOL[1], 'right', me === 1);
  if (center) {
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#fff';
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 3;
    c.strokeText(center, W / 2, 12);
    c.fillText(center, W / 2, 12);
  }
  c.restore();
}

// v79 — 2–4 oyunculu üst şerit: her oyuncu için renkli küçük etiket (ad + değer).
//   items: [{ text, dead }] (oyuncu sırasıyla) · center: ortadaki metin
export function drawHudN(c, W, items, { center, me, y = 4 } = {}) {
  c.save();
  c.font = 'bold 8px system-ui, sans-serif';
  c.textBaseline = 'middle';
  const n = items.length;
  const gap = 4;
  const cw = center ? 44 : 0;
  const slotW = Math.min(96, (W - 8 - cw - gap * (n - 1)) / n);
  const total = slotW * n + gap * (n - 1) + (center ? cw + gap : 0);
  let x = (W - total) / 2;
  items.forEach((it, i) => {
    if (center && i === Math.ceil(n / 2)) x += cw + gap;
    rrect(c, x, y, slotW, 13, 6);
    c.fillStyle = it.dead ? 'rgba(40,10,16,0.75)' : 'rgba(5,8,16,0.75)';
    c.fill();
    c.lineWidth = i === me ? 1.6 : 0.9;
    c.strokeStyle = PCOL[i];
    c.globalAlpha = it.dead ? 0.5 : 1;
    c.stroke();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.fillText(it.text, x + slotW / 2, y + 7, slotW - 6);
    c.globalAlpha = 1;
    x += slotW + gap;
  });
  if (center) {
    c.font = 'bold 10px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#fff';
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 3;
    const cx = (W - total) / 2 + Math.ceil(n / 2) * (slotW + gap) + cw / 2;
    c.strokeText(center, cx, y + 7);
    c.fillText(center, cx, y + 7);
  }
  c.restore();
}

export function drawBanner(c, W, H, text, sub) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillRect(0, H / 2 - 24, W, sub ? 46 : 34);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffe14d';
  c.font = 'bold 18px system-ui, sans-serif';
  c.fillText(text, W / 2, H / 2 - 8, W - 20);
  if (sub) {
    c.fillStyle = '#fff';
    c.font = '9px system-ui, sans-serif';
    c.fillText(sub, W / 2, H / 2 + 12, W - 20);
  }
  c.restore();
}

// Ağdan gelen iki anlık görüntü arasında SADECE konum gibi sürekli sayıları
// yumuşatır. Skor, süre sayaçları, tur, can, olay listeleri vb. "skip" ile
// verilen anahtarlar ve '_' ile başlayanlar doğrudan yeni durumdan alınır
// (v79: eskiden skor da ara değere çekiliyor, tabloda "0.73" görünüyordu).
export const NO_LERP = new Set(['sc', 'wins', 'round', 'over', 'win', 'msg', 'names', 'pause', 'lap', 'laps', 'rank', 'alive', 'dead', 'out', 'hp', 'fx', 'bul', 'tick', 'seed', 'place', 'done', 'hold', 'cnt', 'grid', 'i', 'g', 'ph', 'pw', 't', 'cd', 'kick', 'act', 'at', 'hit', 'stun', 'face', 'block', 'walk', 'bomb', 'fuse', 'boost', 'ammo', 'inv', 'pos', 'fin']);
export function lerpState(a, b, t, skip = NO_LERP) {
  if (typeof a === 'number' && typeof b === 'number') {
    // büyük sıçramalar (ışınlanma, yeniden doğma, ekran sarması) yumuşatılmaz
    if (Math.abs(b - a) > 60) return b;
    return a + (b - a) * t;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return b.map((v, i) => lerpState(a[i], v, t, skip));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    const out = {};
    for (const k of Object.keys(b)) {
      if (k.startsWith('_') || skip.has(k)) out[k] = b[k];
      else if (k === 'a' && typeof a[k] === 'number' && typeof b[k] === 'number') out[k] = lerpAng(a[k], b[k], t); // açı
      else out[k] = lerpState(a[k], b[k], t, skip);
    }
    return out;
  }
  return b;
}

// Açı yumuşatma (−π..π sarmasını dikkate alır)
export function lerpAng(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}
export const angNorm = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

// v86 — BOT ZORLUĞU. 'hard' = eski botlar (değişmeden). 'easy' = aynı bot
// beyni, ama girdisi insan acemiliğine çekilir (tüm oyunlarda ortak):
//   • tepki gecikmesi (~0,25 sn): bot olanı biraz geç görür
//   • ara ara duraksama: ~2 sn'de bir ~0,4 sn hiçbir şey yapmaz
//   • aksiyon tuşu (şut/ateş/yumruk/zıplama...) basışlarının bir kısmını kaçırır
//     (basış BÜTÜN olarak atlanır — tuşa basılı tutmayı bozmaz)
// game.easy = { actions: maske, miss: 0..1, skill: sayı } ile oyun başına ayar.
export const BOT_LEVELS = [
  { key: 'easy', label: 'Kolay', emoji: '🙂' },
  { key: 'hard', label: 'Zor', emoji: '😈' },
];
export function softenBotInput(raw, mem, cfg = {}) {
  const e = mem.__easy || (mem.__easy = { q: [], idle: 0, prev: 0, skip: 0, n: 0 });
  e.n += 1;
  const actions = cfg.actions ?? IN.A | IN.B;
  const miss = cfg.miss ?? 0.45;
  const delay = cfg.delay ?? 15; // kare (60 fps)
  e.q.push(raw | 0);
  let out = e.q.length > delay ? e.q.shift() : 0;
  if (e.idle > 0) {
    e.idle -= 1;
    e.prev = 0;
    return 0;
  }
  if (Math.random() < (cfg.pause ?? 1 / 120)) {
    e.idle = 18 + Math.floor(Math.random() * 14);
    e.prev = 0;
    return 0;
  }
  // yeni basılan aksiyon tuşları: bir kısmı tamamen kaçırılır (bırakılana kadar)
  const pressed = out & actions & ~e.prev;
  for (const bit of [IN.A, IN.B, IN.U, IN.D, IN.L, IN.R]) {
    if (!(actions & bit)) continue;
    if (pressed & bit) {
      if (Math.random() < miss) e.skip |= bit;
      else e.skip &= ~bit;
    }
    if (!(out & bit)) e.skip &= ~bit;
  }
  e.prev = out;
  out &= ~e.skip;
  return out;
}
