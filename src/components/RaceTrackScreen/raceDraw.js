// =============================================================================
// v78 — Yarış araçlarının çizimi (canvas). Fizik değil, sadece görüntü.
//   drawCarTop  — üstten görünüm (garaj kartları, araç seçimi)
//   drawCarRear — arkadan görünüm (yarışta oyuncu ve rakip)
// Araç tipleri/renkleri functions/raceSim.js → RACE_CAR_LOOKS.
// =============================================================================

export const shade = (h, a) => {
  const n = parseInt(h.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
export const rr = (c, x, y, w, h, r) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

// Üstten görünüm, burun yukarı. k: { type, col, L, W, st?, wing?, seat? }
export function drawCarTop(c, k, o = {}) {
  const L = k.L;
  const W = k.W;
  const h = L / 2;
  const w = W / 2;
  const T = k.type;
  c.save();
  c.fillStyle = 'rgba(0,0,0,.45)';
  c.beginPath();
  c.ellipse(3, 4, w * 1.1, h * 1.02, 0, 0, 7);
  c.fill();
  c.fillStyle = '#08080a';
  const ww = W * 0.2;
  const wl = L * 0.2;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) c.fillRect(sx * (w - 1) - ww / 2, sy * L * 0.3 - wl / 2, ww, wl);
  const nose = { vint: 0.62, conv: 0.7, hatch: 0.8, truck: 0.84, coupe: 0.7, sedan: 0.76, muscle: 0.8, gt: 0.66, super: 0.68, race: 0.74 }[T] || 0.7;
  const nw = w * nose;
  const tw = w * (T === 'hatch' ? 0.82 : 0.78);
  c.beginPath();
  c.moveTo(-nw, -h);
  c.quadraticCurveTo(0, -h - L * 0.04, nw, -h);
  c.bezierCurveTo(w, -h, w, -h * 0.5, w, -h * 0.2);
  c.lineTo(w, h * 0.5);
  c.bezierCurveTo(w, h * 0.95, tw, h, tw * 0.9, h);
  c.lineTo(-tw * 0.9, h);
  c.bezierCurveTo(-tw, h, -w, h * 0.95, -w, h * 0.5);
  c.lineTo(-w, -h * 0.2);
  c.bezierCurveTo(-w, -h * 0.5, -w, -h, -nw, -h);
  c.closePath();
  const g = c.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, shade(k.col, -0.4));
  g.addColorStop(0.5, shade(k.col, 0.14));
  g.addColorStop(1, shade(k.col, -0.4));
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,.55)';
  c.lineWidth = 1;
  c.stroke();
  if (k.st) {
    const n = k.st.length;
    const sw = T === 'race' ? W * 0.07 : W * 0.09;
    k.st.forEach((s, i) => {
      c.fillStyle = s;
      c.fillRect((i - (n - 1) / 2) * sw * (T === 'race' ? 1 : 1.6) - sw / 2, -h, sw, T === 'race' ? h * 0.9 : L * 0.97);
    });
  }
  if (T === 'vint' || T === 'conv') {
    c.fillStyle = '#a9cbe0';
    c.fillRect(-w * 0.78, -h * 0.18, W * 0.78, 2.5);
    c.fillStyle = k.seat || '#d9d2c4';
    rr(c, -w * 0.8, -h * 0.02, w * 0.74, h * 0.42, 3);
    c.fill();
    rr(c, w * 0.06, -h * 0.02, w * 0.74, h * 0.42, 3);
    c.fill();
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(-w * 0.42, -h * 0.1, 3, 0, 7);
    c.fill();
    if (T === 'vint') {
      c.fillStyle = shade(k.col, 0.1);
      c.fillRect(-w * 0.9, h * 0.55, W * 0.9, h * 0.3);
    }
  } else {
    const off = (T === 'hatch' ? -0.03 : T === 'sedan' || T === 'truck' ? 0 : 0.12) * h;
    c.save();
    c.translate(0, off);
    if (T === 'truck') {
      c.translate(0, -h * 0.12);
      c.scale(1, 0.62);
    }
    c.fillStyle = '#0a101c';
    c.beginPath();
    c.moveTo(-w * 0.74, -h * 0.16);
    c.lineTo(-w * 0.56, -h * 0.44);
    c.lineTo(w * 0.56, -h * 0.44);
    c.lineTo(w * 0.74, -h * 0.16);
    c.lineTo(w * 0.72, h * 0.4);
    c.lineTo(w * 0.56, h * 0.52);
    c.lineTo(-w * 0.56, h * 0.52);
    c.lineTo(-w * 0.72, h * 0.4);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(120,170,230,.28)';
    c.fillRect(-w * 0.5, -h * 0.4, w * 0.35, h * 0.14);
    const rg = c.createLinearGradient(-w, 0, w, 0);
    rg.addColorStop(0, shade(k.col, -0.2));
    rg.addColorStop(0.5, shade(k.col, 0.2));
    rg.addColorStop(1, shade(k.col, -0.2));
    c.fillStyle = rg;
    rr(c, -w * 0.58, -h * 0.14, w * 1.16, h * 0.44, 4);
    c.fill();
    c.restore();
    if (T === 'truck') {
      c.fillStyle = shade(k.col, -0.55);
      rr(c, -w * 0.82, h * 0.12, W * 0.82, h * 0.8, 3);
      c.fill();
      c.strokeStyle = shade(k.col, 0.1);
      c.lineWidth = 1.5;
      c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.4)';
      for (let i = 1; i < 5; i++) {
        c.beginPath();
        c.moveTo(-w * 0.8, h * 0.12 + i * h * 0.16);
        c.lineTo(w * 0.8, h * 0.12 + i * h * 0.16);
        c.stroke();
      }
    }
    if (T === 'muscle') {
      c.fillStyle = 'rgba(255,255,255,.12)';
      c.fillRect(-w * 0.55, -h * 0.62, w * 0.4, h * 0.16);
      c.fillRect(w * 0.15, -h * 0.62, w * 0.4, h * 0.16);
    }
    if (T === 'super' || T === 'race' || T === 'gt') {
      c.fillStyle = 'rgba(0,0,0,.4)';
      c.fillRect(-w * 0.5, -h * 0.7, w * 0.28, h * 0.14);
      c.fillRect(w * 0.22, -h * 0.7, w * 0.28, h * 0.14);
    }
  }
  c.fillStyle = '#fff6c8';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(s * w * 0.68, -h + 3, T === 'vint' ? 4 : 3.4, 2.2, 0, 0, 7);
    c.fill();
  }
  c.fillStyle = o.br ? '#ff3030' : '#b01818';
  for (const s of [-1, 1]) c.fillRect(s * w * 0.7 - 3, h - 2.5, 6, 2.5);
  if (k.wing) {
    c.fillStyle = '#101014';
    c.fillRect(-w * 0.5, h - 6, 3, 6);
    c.fillRect(w * 0.5 - 3, h - 6, 3, 6);
    c.fillRect(-w * 1.04, h - 2, W * 1.04, 6);
    c.fillStyle = T === 'race' ? '#a00' : '#2a2a30';
    c.fillRect(-w * 1.06, h - 3, 3, 8);
    c.fillRect(w * 1.06 - 3, h - 3, 3, 8);
  }
  c.restore();
}

// Arkadan görünüm (yarış kamerası). o: { fl: nitro alevi 0-1, br: fren }
export function drawCarRear(c, k, o = {}) {
  const W = k.W;
  const w = W / 2;
  const T = k.type;
  const col = k.col;
  const bh = T === 'truck' ? 22 : T === 'vint' ? 18 : 15;
  const ch = { vint: 36, conv: 27, hatch: 34, truck: 38, coupe: 28, sedan: 30, muscle: 27, gt: 26, super: 24, race: 25 }[T] || 28;
  const tn = T === 'truck';
  c.save();
  c.fillStyle = 'rgba(0,0,0,.5)';
  c.beginPath();
  c.ellipse(0, 0, w * 1.05, 5, 0, 0, 7);
  c.fill();
  c.fillStyle = '#07070a';
  for (const s of [-1, 1]) c.fillRect(s * (w - 1) - 3, -11, 6, 11);
  if (k.wing) {
    c.fillStyle = '#0d0d11';
    c.fillRect(-w * 0.55, -ch - 6, 3, ch - bh);
    c.fillRect(w * 0.55 - 3, -ch - 6, 3, ch - bh);
  }
  if (T === 'vint' || T === 'conv') {
    c.fillStyle = k.seat || '#cfc8b8';
    rr(c, -w * 0.7, -bh - 14, w * 0.55, 12, 3);
    c.fill();
    rr(c, w * 0.15, -bh - 14, w * 0.55, 12, 3);
    c.fill();
  } else {
    c.fillStyle = '#0a101c';
    c.beginPath();
    c.moveTo(-w * 0.9, -bh - 2);
    c.lineTo(-w * (tn ? 0.55 : 0.68), -ch);
    c.lineTo(w * (tn ? 0.55 : 0.68), -ch);
    c.lineTo(w * 0.9, -bh - 2);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(120,170,230,.22)';
    c.fillRect(-w * 0.5, -ch + 4, w * 0.3, 6);
    c.fillStyle = shade(col, 0.12);
    c.fillRect(-w * (tn ? 0.58 : 0.72), -ch - 2, w * (tn ? 1.16 : 1.44), 3);
  }
  const g = c.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, shade(col, -0.42));
  g.addColorStop(0.5, shade(col, 0.18));
  g.addColorStop(1, shade(col, -0.42));
  c.fillStyle = g;
  rr(c, -w, -bh - 3, W, bh, 4);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,.12)';
  c.fillRect(-w + 3, -bh - 2, W - 6, 2);
  if (k.wing) {
    c.fillStyle = '#0d0d11';
    c.fillRect(-w * 1.04, -ch - 9, W * 1.04, 4);
    c.fillStyle = T === 'race' ? '#a00' : '#222';
    c.fillRect(-w * 1.06, -ch - 15, 3, 13);
    c.fillRect(w * 1.06 - 3, -ch - 15, 3, 13);
  }
  c.fillStyle = '#14141a';
  rr(c, -w * 0.95, -7, W * 0.95, 5, 2);
  c.fill();
  c.fillStyle = '#e6e6e6';
  c.fillRect(-6, -11, 12, 4);
  c.fillStyle = o.br ? '#ff3b3b' : '#b01818';
  if (T === 'gt' || T === 'super' || T === 'race') c.fillRect(-w * 0.78, -bh - 0.5, W * 0.78, 2.6);
  else for (const s of [-1, 1]) c.fillRect(s * w * 0.62 - 4, -bh + 1, 8, 3.5);
  c.fillStyle = '#303036';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(s * w * 0.42, -4, 2.6, 0, 7);
    c.fill();
  }
  c.globalCompositeOperation = 'lighter';
  if (o.br)
    for (const s of [-1, 1]) {
      const x = s * w * 0.62;
      const y = -bh + 3;
      const gr = c.createRadialGradient(x, y, 0, x, y, 18);
      gr.addColorStop(0, 'rgba(255,50,50,.6)');
      gr.addColorStop(1, 'rgba(255,50,50,0)');
      c.fillStyle = gr;
      c.fillRect(x - 18, y - 18, 36, 36);
    }
  if (o.fl > 0.03)
    for (const s of [-1, 1]) {
      const r = (9 + Math.random() * 9) * o.fl + 3;
      const x = s * w * 0.42;
      const gr = c.createRadialGradient(x, -4, 0, x, -4, r);
      gr.addColorStop(0, 'rgba(255,255,255,.95)');
      gr.addColorStop(0.35, 'rgba(90,210,255,.75)');
      gr.addColorStop(1, 'rgba(255,43,214,0)');
      c.fillStyle = gr;
      c.fillRect(x - r, -4 - r, 2 * r, 2 * r);
    }
  c.restore();
}
