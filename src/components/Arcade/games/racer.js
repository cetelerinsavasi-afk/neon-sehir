// v75 — NEON YARIŞ: kuşbakışı pist, 4 tur. Kamera kendi arabanı izler.
// Kontrol: ◀ ▶ direksiyon · ⛽ gaz · 🛑 fren/geri
import { IN, has, clamp, r1, PCOL, drawHud, drawBanner, rrect } from './common.js';

const W = 320;
const H = 180;
const WW = 540; // dünya
const WH = 320;
const HALF = 19; // pist yarı genişliği
const LAPS = 4;
const LIMIT_S = 240;
const CTRL = [
  [70, 70], [250, 42], [450, 66], [490, 150], [430, 205], [335, 168], [255, 214], [310, 268], [160, 280], [58, 228], [84, 145],
];

function catmull(points, per) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}
const PATH = catmull(CTRL, 8);
const N = PATH.length;

function segDist(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1);
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}
function trackDist(car) {
  let best = Infinity;
  for (let k = -4; k <= 4; k++) {
    const i = (car.i + k + N) % N;
    best = Math.min(best, segDist(car.x, car.y, PATH[i], PATH[(i + 1) % N]));
  }
  return best;
}
const angNorm = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const progress = (c) => c.lap * N + c.i;

export default {
  id: 'yaris',
  title: 'Neon Yarış',
  emoji: '🏎️',
  desc: '4 tur, ilk bitiren kazanır. Pistten çıkarsan yavaşlarsın!',
  W,
  H,
  controls: { left: ['L', 'R'], right: ['B', 'A'], labels: { A: '⛽', B: '🛑' } },
  create(names) {
    const p0 = PATH[0];
    const p1 = PATH[2];
    const a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const car = (side) => ({ x: r1(p0[0] - Math.cos(a) * 10 + nx * side * 8), y: r1(p0[1] - Math.sin(a) * 10 + ny * side * 8), a, v: 0, i: 0, lap: 0, done: 0 });
    return { names, c: [car(-1), car(1)], t: 0, pause: 3, msg: '', over: false, win: -1 };
  },
  step(s, inputs, dt) {
    if (s.over) return;
    if (s.pause > 0) {
      s.pause -= dt;
      return;
    }
    s.t += dt;
    s.c.forEach((c, idx) => {
      const inp = inputs[idx] || 0;
      const steer = (has(inp, IN.R) ? 1 : 0) - (has(inp, IN.L) ? 1 : 0);
      if (has(inp, IN.A)) c.v += 150 * dt;
      if (has(inp, IN.B)) c.v -= 230 * dt;
      c.v -= c.v * 0.55 * dt;
      const off = trackDist(c) > HALF;
      if (off) {
        c.v -= c.v * 2.4 * dt;
        c.v = Math.min(c.v, 75);
      }
      c.v = clamp(c.v, -45, 178);
      c.a = angNorm(c.a + steer * 2.7 * dt * clamp(c.v / 70, -1, 1));
      c.x = clamp(c.x + Math.cos(c.a) * c.v * dt, 6, WW - 6);
      c.y = clamp(c.y + Math.sin(c.a) * c.v * dt, 6, WH - 6);
      // tur takibi: önümüzdeki 10 noktadan en yakını
      let best = c.i;
      let bd = Infinity;
      for (let k = 0; k <= 10; k++) {
        const j = c.i + k;
        const p = PATH[j % N];
        const d = Math.hypot(c.x - p[0], c.y - p[1]);
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      if (bd < HALF * 2.2 && best !== c.i) {
        if (best >= N) c.lap += 1;
        c.i = best % N;
      }
      if (c.lap >= LAPS && !c.done) c.done = r1(s.t);
    });
    // arabalar çarpışır
    const [a, b] = s.c;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 13 && d > 0) {
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      const push = (14 - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      // sadece birbirine doğru giderken hafif yavaşlat (yan yana yapışıp sürünmesinler)
      const rel = (Math.cos(b.a) * b.v - Math.cos(a.a) * a.v) * nx + (Math.sin(b.a) * b.v - Math.sin(a.a) * a.v) * ny;
      if (rel < 0) {
        a.v *= 0.97;
        b.v *= 0.97;
      }
    }
    const finished = s.c.findIndex((c) => c.done);
    if (finished >= 0 || s.t >= LIMIT_S) {
      s.over = true;
      s.win = finished >= 0 ? finished : progress(a) === progress(b) ? -1 : progress(a) > progress(b) ? 0 : 1;
      s.msg = s.win < 0 ? 'BERABERE' : `${s.names[s.win]} KAZANDI`;
    }
    s.c.forEach((c) => {
      c.x = r1(c.x);
      c.y = r1(c.y);
      c.v = r1(c.v);
      c.a = Math.round(c.a * 1000) / 1000;
    });
    s.t = Math.round(s.t * 1000) / 1000;
  },
  result(s) {
    if (!s.over) return null;
    return { winner: s.win, text: s.win >= 0 ? `${s.names[s.win]} · ${s.t.toFixed(1)} sn` : '' };
  },
  lerp(a, b, t) {
    // açılar en kısa yoldan
    const out = { ...b, c: b.c.map((cb, k) => {
      const ca = a.c[k];
      return { ...cb, x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t, a: ca.a + angNorm(cb.a - ca.a) * t };
    }) };
    return out;
  },
  bot(s, i, mem) {
    const c = s.c[i];
    const tgt = PATH[(c.i + 5) % N];
    const nxt = PATH[(c.i + 6) % N];
    // her bot kendi şeridinde (birbirine girmesin): hedefe dik yönde ±7 px
    const ta = Math.atan2(nxt[1] - tgt[1], nxt[0] - tgt[0]);
    if (mem.lap !== c.lap || mem.lane == null) {
      mem.lap = c.lap;
      mem.lane = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 5); // her turda şerit değiştirir
    }
    const lane = mem.lane;
    const tx = tgt[0] - Math.sin(ta) * lane;
    const ty = tgt[1] + Math.cos(ta) * lane;
    const want = Math.atan2(ty - c.y, tx - c.x);
    mem.noise = (mem.noise || 0) * 0.98 + (Math.random() - 0.5) * 0.02;
    const diff = angNorm(want - c.a + mem.noise);
    let bits = 0;
    if (diff > 0.08) bits |= IN.R;
    if (diff < -0.08) bits |= IN.L;
    if (Math.abs(diff) < 0.75 || c.v < 70) bits |= IN.A;
    else if (c.v > 120) bits |= IN.B;
    return bits;
  },
  render(c, s, me) {
    const meCar = s.c[me] || s.c[0];
    const cx = clamp(meCar.x - W / 2, 0, WW - W);
    const cy = clamp(meCar.y - H / 2, 0, WH - H);
    c.save();
    c.fillStyle = '#1d5c2a';
    c.fillRect(0, 0, W, H);
    c.translate(-cx, -cy);
    // çim desen
    c.fillStyle = '#226a31';
    for (let x = 0; x < WW; x += 40) for (let y = 0; y < WH; y += 40) if (((x + y) / 40) % 2 === 0) c.fillRect(x, y, 40, 40);
    // pist
    const path = () => {
      c.beginPath();
      PATH.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      c.closePath();
    };
    c.lineJoin = 'round';
    c.lineCap = 'round';
    path();
    c.strokeStyle = '#e8e8e8';
    c.lineWidth = HALF * 2 + 6;
    c.stroke();
    c.setLineDash([8, 8]);
    path();
    c.strokeStyle = '#d32f2f';
    c.stroke();
    c.setLineDash([]);
    path();
    c.strokeStyle = '#3b3f48';
    c.lineWidth = HALF * 2;
    c.stroke();
    c.setLineDash([6, 8]);
    path();
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 1;
    c.stroke();
    c.setLineDash([]);
    // start/bitiş çizgisi
    const p0 = PATH[0];
    const p1 = PATH[1];
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    c.save();
    c.translate(p0[0], p0[1]);
    c.rotate(ang);
    for (let k = -HALF; k < HALF; k += 4) for (let m = 0; m < 2; m++) {
      c.fillStyle = (k / 4 + m) % 2 ? '#fff' : '#111';
      c.fillRect(m * 4 - 4, k, 4, 4);
    }
    c.restore();
    // arabalar
    s.c.forEach((car, i) => {
      c.save();
      c.translate(car.x, car.y);
      c.rotate(car.a);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      rrect(c, -8, -4, 18, 10, 3);
      c.fill();
      c.fillStyle = PCOL[i];
      rrect(c, -9, -5, 18, 10, 3);
      c.fill();
      c.fillStyle = '#0b1020';
      c.fillRect(-1, -4, 5, 8);
      c.fillStyle = '#fffbd0';
      c.fillRect(8, -4, 1.5, 2.5);
      c.fillRect(8, 1.5, 1.5, 2.5);
      c.restore();
      c.font = 'bold 6px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillStyle = i === me ? '#ffe14d' : '#fff';
      c.fillText(s.names[i], car.x, car.y - 9);
    });
    c.restore();
    // mini harita
    const mw = 70;
    const mh = (mw * WH) / WW;
    const mx = W - mw - 4;
    const my = H - mh - 4;
    c.fillStyle = 'rgba(0,0,0,0.45)';
    rrect(c, mx - 2, my - 2, mw + 4, mh + 4, 4);
    c.fill();
    c.beginPath();
    PATH.forEach((p, k) => (k ? c.lineTo(mx + (p[0] / WW) * mw, my + (p[1] / WH) * mh) : c.moveTo(mx + (p[0] / WW) * mw, my + (p[1] / WH) * mh)));
    c.closePath();
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 2;
    c.stroke();
    s.c.forEach((car, i) => {
      c.fillStyle = PCOL[i];
      c.beginPath();
      c.arc(mx + (car.x / WW) * mw, my + (car.y / WH) * mh, 2.5, 0, Math.PI * 2);
      c.fill();
    });
    const pos = progress(s.c[me] || s.c[0]) >= progress(s.c[1 - (me || 0)]) ? 1 : 2;
    const myLap = Math.min(LAPS, (s.c[me] || s.c[0]).lap + 1);
    drawHud(c, W, { left: s.names[0], right: s.names[1], center: `Tur ${myLap}/${LAPS} · ${pos}.`, me });
    if (s.pause > 0) drawBanner(c, W, H, String(Math.ceil(s.pause)), 'Hazır ol!');
    else if (s.t < 0.8) drawBanner(c, W, H, 'BAŞLA!', '');
    if (s.msg) drawBanner(c, W, H, s.msg, s.over ? (s.win >= 0 ? `${s.t.toFixed(1)} sn` : '') : '');
  },
};
