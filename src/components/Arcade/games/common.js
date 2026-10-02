// v75 — Oyun salonu ortak yardımcıları. Girdi bitleri tüm oyunlarda aynıdır.
export const IN = { L: 1, R: 2, U: 4, A: 8, B: 16 };
export const has = (bits, b) => (bits & b) !== 0;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const r1 = (v) => Math.round(v * 10) / 10;
export const PCOL = ['#19e8ff', '#ff4fd8']; // oyuncu 1 / oyuncu 2

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

export function drawBanner(c, W, H, text, sub) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillRect(0, H / 2 - 24, W, sub ? 46 : 34);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffe14d';
  c.font = 'bold 18px system-ui, sans-serif';
  c.fillText(text, W / 2, H / 2 - 8);
  if (sub) {
    c.fillStyle = '#fff';
    c.font = '9px system-ui, sans-serif';
    c.fillText(sub, W / 2, H / 2 + 12);
  }
  c.restore();
}

// Ağdan gelen iki anlık görüntü arasında sayısal alanları yumuşatır (konuk tarafı)
export function lerpState(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return b.map((v, i) => lerpState(a[i], v, t));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    const out = {};
    for (const k of Object.keys(b)) out[k] = k.startsWith('_') ? b[k] : lerpState(a[k], b[k], t);
    return out;
  }
  return b;
}
