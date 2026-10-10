// v79 — BOYA SAVAŞI (2–4 kişi): geçtiğin yer senin rengine boyanır. 60 saniyede
// en çok alanı boyayan kazanır. 🎨 = etrafına boya bombası (bekleme süreli).
// Izgara durumda tek bir metin (her hücre '0'–'4'): ağda küçük kalır.
import { IN, has, r1, PCOL, drawHudN, drawBanner, rnd, TAU } from './common.js';

const W = 320;
const H = 180;
const TOPY = 20;
const CELL = 10;
const GW = 32;
const GH = 16;
const PR = 6;
const SPEED = 74;
const MATCH_S = 60;
const SPLASH_R = 2; // 5×5
const SPLASH_CD = 5;
const TINT = ['#121625', '#0f5d6b', '#6b1a5c', '#6b5a14', '#1d6b3a'];

const setCell = (g, cx, cy, v) => (cx < 0 || cy < 0 || cx >= GW || cy >= GH ? g : g.slice(0, cy * GW + cx) + v + g.slice(cy * GW + cx + 1));
function paintAt(s, x, y, i) {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor((y - TOPY) / CELL);
  const v = String(i + 1);
  if (cx >= 0 && cy >= 0 && cx < GW && cy < GH && s.grid[cy * GW + cx] !== v) s.grid = setCell(s.grid, cx, cy, v);
}
function counts(s) {
  const c = s.p.map(() => 0);
  for (const ch of s.grid) if (ch !== '0') c[Number(ch) - 1] += 1;
  return c;
}

export default {
  id: 'boya',
  title: 'Boya Savaşı',
  emoji: '🎨',
  desc: 'Geçtiğin yer senin rengin olur. 60 saniyede en çok alanı boya! Rakibin boyasının üstünden geç.',
  easy: { actions: IN.A, miss: 0.5 }, // v86: kolay bot
  how: 'Joystick: gez · 🎨 boya bombası',
  min: 2,
  max: 4,
  W,
  H,
  controls: { stick: true, left: [], right: ['A'], big: ['A'], labels: { A: '🎨' } },
  noLerp: ['grid', 'sp'],
  create(names) {
    const spots = [
      [30, TOPY + 30],
      [W - 30, H - 30],
      [W - 30, TOPY + 30],
      [30, H - 30],
    ];
    return {
      names,
      seed: Math.floor(Math.random() * 1e9),
      grid: '0'.repeat(GW * GH),
      p: names.map((_, i) => ({ x: spots[i % 4][0], y: spots[i % 4][1], cd: 2, pin: 0, run: 0, a: 0 })),
      sp: [],
      t: MATCH_S,
      pause: 2,
      msg: 'BOYA!',
      over: false,
      win: -1,
      tick: 0,
    };
  },
  step(s, inputs, dt) {
    if (s.over) return;
    s.sp = (s.sp || []).map((e) => ({ ...e, t: Math.round((e.t - dt) * 100) / 100 })).filter((e) => e.t > 0);
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0) s.msg = '';
      return;
    }
    s.tick += 1;
    s.t = Math.max(0, s.t - dt);
    s.p.forEach((p, i) => {
      const inp = inputs[i] || 0;
      const press = has(inp, IN.A) && !has(p.pin, IN.A);
      p.pin = inp;
      p.cd = Math.max(0, p.cd - dt);
      let mx = (has(inp, IN.R) ? 1 : 0) - (has(inp, IN.L) ? 1 : 0);
      let my = (has(inp, IN.D) ? 1 : 0) - (has(inp, IN.U) ? 1 : 0);
      const l = Math.hypot(mx, my);
      if (l) {
        mx /= l;
        my /= l;
        p.run += dt;
        p.a = Math.round(Math.atan2(my, mx) * 100) / 100;
      }
      p.x = Math.max(PR, Math.min(W - PR, p.x + mx * SPEED * dt));
      p.y = Math.max(TOPY + PR, Math.min(H - PR, p.y + my * SPEED * dt));
      if (!s._pred) {
        paintAt(s, p.x, p.y, i);
        paintAt(s, p.x + PR * 0.6, p.y, i);
        paintAt(s, p.x - PR * 0.6, p.y, i);
        paintAt(s, p.x, p.y + PR * 0.6, i);
        paintAt(s, p.x, p.y - PR * 0.6, i);
        if (press && p.cd <= 0) {
          p.cd = SPLASH_CD;
          const cx = Math.floor(p.x / CELL);
          const cy = Math.floor((p.y - TOPY) / CELL);
          for (let dy = -SPLASH_R; dy <= SPLASH_R; dy++)
            for (let dx = -SPLASH_R; dx <= SPLASH_R; dx++) if (Math.abs(dx) + Math.abs(dy) <= SPLASH_R + 1) s.grid = setCell(s.grid, cx + dx, cy + dy, String(i + 1));
          s.sp.push({ x: r1(p.x), y: r1(p.y), t: 0.4, o: i });
        }
      }
      p.x = r1(p.x);
      p.y = r1(p.y);
    });
    if (s.t <= 0 && !s._pred) {
      s.over = true;
      const c = counts(s);
      const best = Math.max(...c);
      const tops = c.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
      s.win = tops.length === 1 ? tops[0] : -1;
      s.msg = s.win >= 0 ? `${s.names[s.win]} KAZANDI` : 'BERABERE';
    }
  },
  result(s) {
    if (!s.over) return null;
    const c = counts(s);
    const total = GW * GH;
    return { winner: s.win, text: s.p.map((_, i) => `${s.names[i]} %${Math.round((c[i] / total) * 100)}`).join(' · ') };
  },
  bot(s, i, mem) {
    const p = s.p[i];
    if (!p || s.pause > 0) return 0;
    mem.t = (mem.t || 0) + 1;
    const mine = String(i + 1);
    // her ~0,7 sn'de yakındaki "bana ait olmayan" en dolu bölgeyi hedefle
    if (!mem.tx || mem.t % 42 === 0 || Math.hypot(mem.tx - p.x, mem.ty - p.y) < 8) {
      let best = -1;
      for (let k = 0; k < 14; k++) {
        const cx = Math.floor(rnd((s.seed || 1) + mem.t * 13 + k * 7 + i) * GW);
        const cy = Math.floor(rnd((s.seed || 1) + mem.t * 17 + k * 11 + i * 3) * GH);
        let score = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const ch = s.grid[(cy + dy) * GW + (cx + dx)];
            if (ch && ch !== mine) score += ch === '0' ? 1 : 1.6; // rakip boyası daha değerli
          }
        const x = cx * CELL + CELL / 2;
        const y = TOPY + cy * CELL + CELL / 2;
        score -= Math.hypot(x - p.x, y - p.y) / 60;
        if (score > best) {
          best = score;
          mem.tx = x;
          mem.ty = y;
        }
      }
    }
    const a = Math.atan2(mem.ty - p.y, mem.tx - p.x) + Math.sin(mem.t / 23 + i) * 0.3;
    let bits = 0;
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    if (ox > 0.38) bits |= IN.R;
    if (ox < -0.38) bits |= IN.L;
    if (oy > 0.38) bits |= IN.D;
    if (oy < -0.38) bits |= IN.U;
    if (p.cd <= 0) {
      // etrafta yabancı hücre çoksa bomba
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor((p.y - TOPY) / CELL);
      let foreign = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (s.grid[(cy + dy) * GW + (cx + dx)] && s.grid[(cy + dy) * GW + (cx + dx)] !== mine) foreign += 1;
      if (foreign > 13) bits |= IN.A;
    }
    return bits;
  },
  render(c, s, me) {
    c.fillStyle = '#080a12';
    c.fillRect(0, 0, W, H);
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const v = Number(s.grid[y * GW + x] || 0);
        c.fillStyle = TINT[v];
        c.fillRect(x * CELL, TOPY + y * CELL, CELL - 0.5, CELL - 0.5);
        if (v) {
          c.fillStyle = PCOL[v - 1];
          c.globalAlpha = 0.35;
          c.fillRect(x * CELL + 2, TOPY + y * CELL + 2, CELL - 4.5, CELL - 4.5);
          c.globalAlpha = 1;
        }
      }
    for (const e of s.sp || []) {
      c.strokeStyle = PCOL[e.o];
      c.globalAlpha = e.t * 2.2;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(e.x, e.y, (0.4 - e.t) * 70 + 6, 0, TAU);
      c.stroke();
      c.globalAlpha = 1;
    }
    s.p.forEach((p, i) => {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.ellipse(p.x, p.y + PR - 1, PR, 2.5, 0, 0, TAU);
      c.fill();
      // boya rulosu
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.a);
      c.fillStyle = '#ddd';
      c.fillRect(PR - 1, -1, 5, 2);
      c.fillStyle = PCOL[i];
      c.fillRect(PR + 3, -5, 3, 10);
      c.restore();
      c.fillStyle = PCOL[i];
      c.beginPath();
      c.arc(p.x, p.y + Math.sin(p.run * 16), PR, 0, TAU);
      c.fill();
      c.strokeStyle = i === me ? '#fff' : 'rgba(0,0,0,0.4)';
      c.lineWidth = i === me ? 1.5 : 1;
      c.stroke();
      if (i === me && p.cd > 0) {
        c.strokeStyle = 'rgba(255,255,255,0.7)';
        c.beginPath();
        c.arc(p.x, p.y, PR + 4, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.cd / SPLASH_CD));
        c.stroke();
      }
    });
    const cnt = counts(s);
    const total = GW * GH;
    drawHudN(
      c,
      W,
      s.p.map((_, i) => ({ text: `${s.names[i]} %${Math.round((cnt[i] / total) * 100)}` })),
      { center: `⏱${Math.ceil(s.t)}`, me, y: 3 }
    );
    if (s.msg) drawBanner(c, W, H, s.msg, s.over ? '' : 'Joystick: gez · 🎨 boya bombası');
  },
};
