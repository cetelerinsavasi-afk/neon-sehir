// v79 — DRIFT YARIŞI (2–4 kişi) — eski "Neon Yarış"ın yerine. Pistin tamamı
// ekranda (4 kişide herkes birbirini görür). Araba kendi gaz verir; ◀ ▶
// direksiyon, 🌀 drift (virajda kayarak dön → nitro dolar), 🔥 nitro.
// Pistteki ok işaretleri anlık hız verir. 5 tur, ilk bitiren kazanır.
import { IN, has, clamp, r1, r2, PCOL, drawHudN, drawBanner, rnd, angNorm, TAU } from './common.js';

const W = 320;
const H = 180;
const HALF = 11;
const LAPS = 5;
const LIMIT_S = 200;
const VMAX = 96;
const VOFF = 52;
const ACC = 120;
const CR = 4.5; // çarpışma yarıçapı
const CTRL = [
  [44, 46],
  [150, 36],
  [262, 44],
  [298, 86],
  [268, 126],
  [206, 108],
  [156, 146],
  [92, 164],
  [34, 142],
  [24, 96],
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
const PATH = catmull(CTRL, 10);
const N = PATH.length;
const PADS = [12, 47, 78]; // hız okları (yol indeksleri)

function segDist(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1);
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}
function nearest(c) {
  let best = Infinity;
  let bi = c.i;
  for (let k = -5; k <= 6; k++) {
    const i = (c.i + k + N) % N;
    const d = segDist(c.x, c.y, PATH[i], PATH[(i + 1) % N]);
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return { d: best, i: bi };
}
const dirAt = (i) => {
  const a = PATH[i % N];
  const b = PATH[(i + 1) % N];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
};
const prog = (c) => c.lap * N + c.i;

export default {
  id: 'yaris',
  title: 'Drift Yarışı',
  emoji: '🏎️',
  desc: '5 tur, ilk bitiren kazanır! Virajda drift at, nitroyu doldur, oklardan hız al.',
  how: '◀ ▶ direksiyon · 🌀 drift · 🔥 nitro',
  min: 2,
  max: 4,
  W,
  H,
  controls: { left: ['L', 'R'], right: ['B', 'A'], labels: { A: '🔥', B: '🌀' } },
  noLerp: ['nitro', 'drift'],
  create(names) {
    const a = dirAt(0);
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    const nx = -fy;
    const ny = fx;
    const p = names.map((_, i) => {
      const row = Math.floor(i / 2);
      const side = i % 2 ? 1 : -1;
      return { x: r1(PATH[0][0] - fx * (8 + row * 14) + nx * side * 5), y: r1(PATH[0][1] - fy * (8 + row * 14) + ny * side * 5), a: r2(a), vx: 0, vy: 0, i: N - 1, lap: -1, cp: 1, nitro: 0.3, boost: 0, drift: 0, fin: 0, pin: 0 };
    });
    return { names, seed: Math.floor(Math.random() * 1e9), p, t: 0, pause: 3, msg: '', over: false, win: -1, place: [] };
  },
  step(s, inputs, dt) {
    if (s.over) return;
    if (s.pause > 0) {
      s.pause -= dt;
      s.msg = s.pause > 2 ? '3' : s.pause > 1 ? '2' : s.pause > 0.15 ? '1' : 'BAŞLA!';
      if (s.pause <= 0) s.msg = '';
      return;
    }
    s.t += dt;
    s.p.forEach((c, k) => {
      const inp = inputs[k] || 0;
      const nitroPress = has(inp, IN.A) && !has(c.pin, IN.A);
      c.pin = inp;
      if (c.fin) {
        c.vx *= 1 - 2 * dt;
        c.vy *= 1 - 2 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        return;
      }
      const near = nearest(c);
      const onTrack = near.d < HALF;
      const steer = (has(inp, IN.R) ? 1 : 0) - (has(inp, IN.L) ? 1 : 0);
      const drifting = has(inp, IN.B) && steer !== 0;
      c.drift = drifting ? 1 : 0;
      const fx = Math.cos(c.a);
      const fy = Math.sin(c.a);
      let fwd = c.vx * fx + c.vy * fy;
      let lat = -c.vx * fy + c.vy * fx;
      const turn = (drifting ? 4.4 : 3.1) * clamp(Math.abs(fwd) / 60, 0.25, 1);
      c.a = angNorm(c.a + steer * turn * dt);
      c.boost = Math.max(0, c.boost - dt);
      if (nitroPress && c.nitro >= 1) {
        c.nitro = 0;
        c.boost = 1.3;
      }
      const vmax = (onTrack ? VMAX : VOFF) * (c.boost > 0 ? 1.5 : 1);
      fwd += (fwd < vmax ? ACC * (c.boost > 0 ? 1.8 : 1) : -ACC * 1.5) * dt;
      lat *= 1 - (drifting ? 2.2 : onTrack ? 9 : 6) * dt; // tutuş: drift'te kayar
      const nfx = Math.cos(c.a);
      const nfy = Math.sin(c.a);
      c.vx = nfx * fwd - nfy * lat;
      c.vy = nfy * fwd + nfx * lat;
      if (drifting && Math.abs(fwd) > 55) c.nitro = Math.min(1, c.nitro + 0.42 * dt);
      else c.nitro = Math.min(1, c.nitro + 0.03 * dt);
      c.x = clamp(c.x + c.vx * dt, 4, W - 4);
      c.y = clamp(c.y + c.vy * dt, 22, H - 4);
      // ilerleme / tur
      const before = c.i;
      c.i = near.i;
      if (c.i > N * 0.4 && c.i < N * 0.7) c.cp = 1;
      if (before > N * 0.85 && c.i < N * 0.15 && c.cp) {
        c.lap += 1;
        c.cp = 0;
        if (c.lap >= LAPS && !c.fin && !s._pred) {
          c.fin = 1;
          s.place.push(k);
        }
      }
      // hız okları
      for (const pi of PADS) if (c.i === pi && onTrack && c.boost < 0.5) c.boost = Math.max(c.boost, 0.7);
    });
    // araç çarpışmaları
    for (let a = 0; a < s.p.length; a++)
      for (let b = a + 1; b < s.p.length; b++) {
        const A = s.p[a];
        const B = s.p[b];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy);
        if (d <= 0 || d >= CR * 2) continue;
        const nx = dx / d;
        const ny = dy / d;
        const o = (CR * 2 - d) / 2;
        A.x -= nx * o;
        A.y -= ny * o;
        B.x += nx * o;
        B.y += ny * o;
        const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
        if (rel < 0) {
          A.vx += rel * nx * 0.8;
          A.vy += rel * ny * 0.8;
          B.vx -= rel * nx * 0.8;
          B.vy -= rel * ny * 0.8;
        }
      }
    s.p.forEach((c) => {
      c.x = r1(c.x);
      c.y = r1(c.y);
      c.vx = r1(c.vx);
      c.vy = r1(c.vy);
      c.a = r2(c.a);
      c.nitro = r2(c.nitro);
    });
    if (!s._pred) {
      if (s.place.length) {
        s.over = true;
        s.win = s.place[0];
      } else if (s.t >= LIMIT_S) {
        s.over = true;
        s.win = s.p.reduce((b, c, i) => (prog(c) > prog(s.p[b]) ? i : b), 0);
      }
      if (s.over) s.msg = `${s.names[s.win]} KAZANDI`;
    }
  },
  result(s) {
    if (!s.over) return null;
    const order = s.p.map((c, i) => i).sort((a, b) => (s.place.indexOf(a) + 1 || 99) - (s.place.indexOf(b) + 1 || 99) || prog(s.p[b]) - prog(s.p[a]));
    return { winner: s.win, text: order.map((i, k) => `${k + 1}. ${s.names[i]}`).join('  ') };
  },
  bot(s, i, mem) {
    const c = s.p[i];
    if (!c || s.pause > 0 || c.fin) return 0;
    mem.t = (mem.t || 0) + 1;
    const sd = s.seed || 1;
    mem.skill = mem.skill ?? 0.8 + rnd(sd + i * 31 + 7) * 0.18;
    // her turda farklı çizgi (iç/dış) → sıralama değişir
    if (mem.lap !== c.lap) {
      mem.lap = c.lap;
      mem.lane = (rnd(sd + i * 977 + c.lap * 13) - 0.5) * 12;
    }
    const look = 4 + Math.floor(Math.hypot(c.vx, c.vy) / 30);
    const ti = (c.i + look) % N;
    const ta = dirAt(ti);
    const tx = PATH[ti][0] - Math.sin(ta) * mem.lane;
    const ty = PATH[ti][1] + Math.cos(ta) * mem.lane;
    const want = Math.atan2(ty - c.y, tx - c.x);
    const d = angNorm(want - c.a) + (rnd(sd + mem.t * 3 + i) - 0.5) * (1 - mem.skill) * 2.4;
    let bits = 0;
    if (d > 0.06) bits |= IN.R;
    if (d < -0.06) bits |= IN.L;
    // keskin virajda drift
    const bend = Math.abs(angNorm(dirAt(c.i + 12) - dirAt(c.i)));
    if (Math.abs(d) > 0.35 || (bend > 1 && Math.abs(d) > 0.15)) bits |= IN.B;
    // düzlükte nitro
    if (c.nitro >= 1 && bend < 0.3 && Math.abs(d) < 0.15 && rnd(sd + mem.t + i * 13) < 0.08 * mem.skill) bits |= IN.A;
    return bits;
  },
  render(c, s, me) {
    // çim
    c.fillStyle = '#123a1c';
    c.fillRect(0, 0, W, H);
    for (let k = 0; k < 60; k++) {
      c.fillStyle = 'rgba(255,255,255,0.03)';
      c.fillRect((k * 53) % W, (k * 37) % H, 6, 2);
    }
    const trace = () => {
      c.beginPath();
      PATH.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
    };
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // bordür (kırmızı-beyaz)
    trace();
    c.strokeStyle = '#eee';
    c.lineWidth = HALF * 2 + 5;
    c.stroke();
    c.setLineDash([6, 6]);
    trace();
    c.strokeStyle = '#d7263d';
    c.stroke();
    c.setLineDash([]);
    // asfalt
    trace();
    c.strokeStyle = '#2b2d3a';
    c.lineWidth = HALF * 2;
    c.stroke();
    c.setLineDash([4, 6]);
    trace();
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 1;
    c.stroke();
    c.setLineDash([]);
    // başlangıç çizgisi
    const a0 = dirAt(0);
    c.save();
    c.translate(PATH[0][0], PATH[0][1]);
    c.rotate(a0);
    for (let k = -HALF; k < HALF; k += 3)
      for (let j = 0; j < 2; j++) {
        c.fillStyle = ((k + HALF) / 3 + j) % 2 ? '#fff' : '#111';
        c.fillRect(-2 + j * 2, k, 2, 3);
      }
    c.restore();
    // hız okları
    for (const pi of PADS) {
      const a = dirAt(pi);
      c.save();
      c.translate(PATH[pi][0], PATH[pi][1]);
      c.rotate(a);
      c.fillStyle = 'rgba(255,210,63,0.85)';
      for (let k = 0; k < 2; k++) {
        c.beginPath();
        c.moveTo(-4 + k * 5, -5);
        c.lineTo(1 + k * 5, 0);
        c.lineTo(-4 + k * 5, 5);
        c.lineTo(-2 + k * 5, 0);
        c.fill();
      }
      c.restore();
    }
    // arabalar
    s.p.forEach((car, i) => {
      c.save();
      c.translate(car.x, car.y);
      c.rotate(car.a);
      if (car.boost > 0) {
        c.fillStyle = Math.floor(s.t * 30) % 2 ? '#ffd23f' : '#ff6a1a';
        c.beginPath();
        c.moveTo(-5, -2);
        c.lineTo(-11, 0);
        c.lineTo(-5, 2);
        c.fill();
      }
      if (car.drift) {
        c.fillStyle = 'rgba(220,220,220,0.35)';
        c.beginPath();
        c.arc(-6, -3, 2.5, 0, TAU);
        c.arc(-6, 3, 2.5, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#111';
      c.fillRect(-4, -3.6, 2.5, 1.4);
      c.fillRect(-4, 2.2, 2.5, 1.4);
      c.fillRect(2, -3.6, 2.5, 1.4);
      c.fillRect(2, 2.2, 2.5, 1.4);
      c.fillStyle = PCOL[i];
      c.fillRect(-5, -2.6, 10, 5.2);
      c.fillStyle = 'rgba(10,20,40,0.85)';
      c.fillRect(0, -2, 2.6, 4);
      if (i === me) {
        c.strokeStyle = '#fff';
        c.lineWidth = 0.9;
        c.strokeRect(-5.5, -3.1, 11, 6.2);
      }
      c.restore();
    });
    // üst şerit: sıralama + tur
    const order = s.p.map((_, i) => i).sort((a, b) => (s.place.indexOf(a) + 1 || 99) - (s.place.indexOf(b) + 1 || 99) || prog(s.p[b]) - prog(s.p[a]));
    const rank = order.indexOf(me) + 1;
    const mine = s.p[me];
    drawHudN(
      c,
      W,
      s.p.map((car, i) => ({ text: `${order.indexOf(i) + 1}. ${s.names[i]}` })),
      { center: `Tur ${clamp((mine?.lap ?? 0) + 1, 1, LAPS)}/${LAPS}`, me, y: 3 }
    );
    // nitro çubuğu (benim)
    if (mine) {
      c.fillStyle = 'rgba(5,8,16,0.75)';
      c.fillRect(W - 66, H - 12, 60, 7);
      c.fillStyle = mine.nitro >= 1 ? '#ffd23f' : '#ff6a1a';
      c.fillRect(W - 65, H - 11, 58 * mine.nitro, 5);
      c.font = 'bold 7px system-ui, sans-serif';
      c.textAlign = 'right';
      c.fillStyle = '#fff';
      c.fillText(mine.nitro >= 1 ? '🔥 NİTRO HAZIR' : 'NİTRO', W - 68, H - 6);
      c.textAlign = 'left';
      c.font = 'bold 10px system-ui, sans-serif';
      c.fillText(`${rank}.`, 6, H - 6);
    }
    if (s.msg) drawBanner(c, W, H, s.msg, s.over ? '' : s.pause > 0 ? 'Virajda 🌀 drift → nitro dolar' : '');
  },
};
