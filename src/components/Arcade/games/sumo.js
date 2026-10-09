// v79 — SUMO (2–4 kişi): yuvarlak minder, rakipleri alandan it! Joystick ile
// hareket (kaygan), ⚡ ile hamle (ani atılış, kısa bekleme). Mindere son kalan
// raundu alır; 2 raunt alan kazanır. Raunt uzarsa minder yavaşça daralır.
import { IN, has, r1, r2, PCOL, drawHudN, drawBanner, TAU, rnd } from './common.js';

const W = 320;
const H = 180;
const CX = 160;
const CY = 100;
const R0 = 72;
const RMIN = 4;
const MAX_ROUNDS = 5;
const PR = 11;
const ACC = 300;
const DRAG = 2.4;
const DASH = 230;
const WIN_ROUNDS = 2;

function newRound(s) {
  const n = s.p.length;
  s.p.forEach((p, i) => {
    const a = (i / n) * TAU + (n === 2 ? 0 : Math.PI / 4);
    p.x = r1(CX + Math.cos(a) * 40);
    p.y = r1(CY + Math.sin(a) * 34);
    p.vx = 0;
    p.vy = 0;
    p.out = 0;
    p.fall = 0;
    p.dash = 0;
    p.cd = 0;
    p.face = r2(Math.atan2(CY - p.y, CX - p.x));
  });
  s.ring = R0;
  s.rt = 0;
  s.pause = 1.6;
  s.msg = `RAUNT ${s.round}`;
}

export default {
  id: 'sumo',
  title: 'Sumo',
  emoji: '🤼',
  desc: 'Rakiplerini minderden it! Hamleyle atıl, kenarda dikkat et. 2 raunt alan kazanır.',
  how: 'Joystick: hareket · ⚡ hamle (atıl)',
  min: 2,
  max: 4,
  W,
  H,
  controls: { stick: true, left: [], right: ['A'], big: ['A'], labels: { A: '⚡' } },
  noLerp: ['ring'],
  create(names) {
    const s = { names, seed: Math.floor(Math.random() * 1e9), round: 1, wins: names.map(() => 0), p: names.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, out: 0, fall: 0, dash: 0, cd: 0, pin: 0, face: 0 })), over: false, win: -1, ring: R0, rt: 0, pause: 0, msg: '' };
    newRound(s);
    return s;
  },
  step(s, inputs, dt) {
    if (s.over) return;
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0) {
        if (s._next && !s._pred) {
          s._next = 0;
          s.round += 1;
          newRound(s);
        } else s.msg = '';
      }
      return;
    }
    s.rt += dt;
    if (s.rt > 12) s.ring = Math.max(RMIN, s.ring - (s.rt > 30 ? 6 : 3.2) * dt); // uzayan raunt: minder daralır (sonunda biri düşer)
    s.p.forEach((p, i) => {
      const inp = inputs[i] || 0;
      const press = has(inp, IN.A) && !has(p.pin, IN.A);
      p.pin = inp;
      if (p.out) {
        p.fall = Math.min(1, p.fall + dt * 2);
        return;
      }
      p.cd = Math.max(0, p.cd - dt);
      p.dash = Math.max(0, p.dash - dt);
      let mx = (has(inp, IN.R) ? 1 : 0) - (has(inp, IN.L) ? 1 : 0);
      let my = (has(inp, IN.D) ? 1 : 0) - (has(inp, IN.U) ? 1 : 0);
      const l = Math.hypot(mx, my);
      if (l) {
        mx /= l;
        my /= l;
        p.face = r2(Math.atan2(my, mx));
      }
      p.vx += mx * ACC * dt;
      p.vy += my * ACC * dt;
      if (press && p.cd <= 0) {
        p.vx += Math.cos(p.face) * DASH;
        p.vy += Math.sin(p.face) * DASH;
        p.dash = 0.28;
        p.cd = 1.1;
      }
      p.vx *= 1 - DRAG * dt;
      p.vy *= 1 - DRAG * dt;
      const sp = Math.hypot(p.vx, p.vy);
      const cap = p.dash > 0 ? 320 : 120;
      if (sp > cap) {
        p.vx *= cap / sp;
        p.vy *= cap / sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    });
    // çarpışmalar: hamle yapan "ağır"dır (daha çok iter, daha az itilir)
    for (let a = 0; a < s.p.length; a++)
      for (let b = a + 1; b < s.p.length; b++) {
        const A = s.p[a];
        const B = s.p[b];
        if (A.out || B.out) continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy);
        if (d <= 0 || d >= PR * 2) continue;
        const nx = dx / d;
        const ny = dy / d;
        const mA = A.dash > 0 ? 3 : 1;
        const mB = B.dash > 0 ? 3 : 1;
        const overlap = PR * 2 - d;
        A.x -= nx * overlap * (mB / (mA + mB));
        A.y -= ny * overlap * (mB / (mA + mB));
        B.x += nx * overlap * (mA / (mA + mB));
        B.y += ny * overlap * (mA / (mA + mB));
        const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
        if (rel < 0) {
          const j = (-(1 + 0.9) * rel) / (1 / mA + 1 / mB);
          A.vx -= (j / mA) * nx;
          A.vy -= (j / mA) * ny;
          B.vx += (j / mB) * nx;
          B.vy += (j / mB) * ny;
        }
      }
    // minderden çıkan
    s.p.forEach((p) => {
      if (!p.out && Math.hypot(p.x - CX, p.y - CY) > s.ring + (s.ring > 30 ? PR * 0.4 : 0)) p.out = 1;
      p.x = r1(p.x);
      p.y = r1(p.y);
      p.vx = r1(p.vx);
      p.vy = r1(p.vy);
    });
    if (!s._pred) {
      const alive = s.p.map((p, i) => (p.out ? -1 : i)).filter((i) => i >= 0);
      if (alive.length <= 1) {
        const w = alive[0] ?? -1;
        if (w >= 0) s.wins[w] += 1;
        let champ = s.wins.findIndex((v) => v >= WIN_ROUNDS);
        if (champ < 0 && s.round >= MAX_ROUNDS) {
          const best = Math.max(...s.wins);
          const tops = s.wins.map((v, j) => (v === best ? j : -1)).filter((j) => j >= 0);
          champ = tops.length === 1 ? tops[0] : -1;
          if (champ < 0) {
            s.over = true;
            s.win = -1;
            s.msg = 'BERABERE';
          }
        }
        if (s.over) {
          /* 5 raunt bitti, berabere */
        } else if (champ >= 0) {
          s.over = true;
          s.win = champ;
          s.msg = `${s.names[champ]} ŞAMPİYON!`;
        } else {
          s.msg = w >= 0 ? `${s.names[w]} raundu aldı!` : 'BERABERE';
          s._next = 1;
          s.pause = 1.8;
        }
      }
    }
    s.ring = r1(s.ring);
  },
  result(s) {
    if (!s.over) return null;
    return { winner: s.win, text: s.p.map((_, i) => `${s.names[i]} ${s.wins[i]}`).join(' · ') };
  },
  bot(s, i, mem) {
    const p = s.p[i];
    if (!p || p.out || s.pause > 0) return 0;
    mem.t = (mem.t || 0) + 1;
    let tgt = null;
    let best = Infinity;
    s.p.forEach((o, j) => {
      if (j === i || o.out) return;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < best) {
        best = d;
        tgt = o;
      }
    });
    if (!tgt) return 0;
    const dc = Math.hypot(p.x - CX, p.y - CY);
    let gx;
    let gy;
    if (dc > s.ring - 16) {
      // kenardayım: merkeze dön
      gx = CX - p.x;
      gy = CY - p.y;
    } else {
      // rakibin arkasına (merkez tarafına) geçip onu kenara doğru it
      const ox = tgt.x - CX;
      const oy = tgt.y - CY;
      const ol = Math.hypot(ox, oy) || 1;
      const bx = tgt.x - (ox / ol) * 14;
      const by = tgt.y - (oy / ol) * 14;
      gx = (best > 26 ? bx : tgt.x) - p.x;
      gy = (best > 26 ? by : tgt.y) - p.y;
    }
    // küçük titreme (insan gibi)
    mem.ag = mem.ag ?? 0.25 + rnd((s.seed || 1) + i * 53) * 0.6; // saldırganlık
    const wob = Math.sin(mem.t / (14 + i * 3) + i * 2 + (s.seed % 7)) * 0.35;
    const a = Math.atan2(gy, gx) + wob;
    let bits = 0;
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    if (ox > 0.38) bits |= IN.R;
    if (ox < -0.38) bits |= IN.L;
    if (oy > 0.38) bits |= IN.D;
    if (oy < -0.38) bits |= IN.U;
    const toT = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    const aligned = Math.abs(Math.atan2(Math.sin(toT - p.face), Math.cos(toT - p.face))) < 0.5;
    const tgtEdge = Math.hypot(tgt.x - CX, tgt.y - CY) > s.ring * 0.45;
    if (best < 40 && aligned && p.cd <= 0 && dc < s.ring - 8 && (tgtEdge || rnd((s.seed || 1) + mem.t * 7 + i) < mem.ag * 0.08)) bits |= IN.A;
    return bits;
  },
  render(c, s, me) {
    c.fillStyle = '#1a0f0a';
    c.fillRect(0, 0, W, H);
    // tribün ışıkları
    for (let k = 0; k < 30; k++) {
      c.fillStyle = `rgba(255,${180 + (k % 3) * 25},120,0.08)`;
      c.fillRect((k * 41) % W, (k * 23) % 40 + 18, 3, 3);
    }
    // minder
    c.fillStyle = '#c9a46a';
    c.beginPath();
    c.ellipse(CX, CY, R0 + 12, R0 + 6, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#e2c48c';
    c.beginPath();
    c.arc(CX, CY, s.ring, 0, TAU);
    c.fill();
    c.strokeStyle = '#7a4e22';
    c.lineWidth = 3;
    c.stroke();
    if (s.ring < R0 - 1) {
      c.strokeStyle = 'rgba(255,60,60,0.5)';
      c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.beginPath();
      c.arc(CX, CY, R0, 0, TAU);
      c.stroke();
      c.setLineDash([]);
    }
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(CX - 10, CY - 8);
    c.lineTo(CX - 10, CY + 8);
    c.moveTo(CX + 10, CY - 8);
    c.lineTo(CX + 10, CY + 8);
    c.stroke();
    // güreşçiler (düşenler küçülerek kaybolur)
    s.p.forEach((p, i) => {
      const sc = p.out ? Math.max(0.2, 1 - p.fall * 0.8) : 1;
      c.save();
      c.translate(p.x, p.y);
      c.scale(sc, sc);
      c.globalAlpha = p.out ? 1 - p.fall * 0.7 : 1;
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath();
      c.ellipse(0, PR - 2, PR, 4, 0, 0, TAU);
      c.fill();
      if (p.dash > 0) {
        c.strokeStyle = PCOL[i];
        c.lineWidth = 2;
        c.beginPath();
        c.arc(0, 0, PR + 3, 0, TAU);
        c.stroke();
      }
      // gövde
      c.fillStyle = '#f2c79c';
      c.beginPath();
      c.arc(0, 0, PR, 0, TAU);
      c.fill();
      // kuşak (mawashi)
      c.fillStyle = PCOL[i];
      c.fillRect(-PR, 1, PR * 2, 5);
      // yüz yönü
      c.rotate(p.face);
      c.fillStyle = '#2a1a10';
      c.beginPath();
      c.arc(PR * 0.45, -3, 1.6, 0, TAU);
      c.arc(PR * 0.45, 3, 1.6, 0, TAU);
      c.fill();
      c.fillStyle = '#1a0f0a';
      c.beginPath();
      c.arc(-PR * 0.35, 0, 3.5, 0, TAU); // topuz
      c.fill();
      c.restore();
      if (i === me && !p.out) {
        c.fillStyle = PCOL[i];
        c.beginPath();
        c.moveTo(p.x, p.y - PR - 3);
        c.lineTo(p.x - 3, p.y - PR - 8);
        c.lineTo(p.x + 3, p.y - PR - 8);
        c.fill();
      }
      if (i === me && p.cd > 0 && !p.out) {
        c.strokeStyle = 'rgba(255,255,255,0.6)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(p.x, p.y, PR + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.cd / 1.1));
        c.stroke();
      }
    });
    drawHudN(
      c,
      W,
      s.p.map((p, i) => ({ text: `${s.names[i]} ${'★'.repeat(s.wins[i])}`, dead: p.out })),
      { center: `R${s.round}`, me, y: 3 }
    );
    if (s.msg) drawBanner(c, W, H, s.msg, s.over ? '' : s.pause > 0 && s.round === 1 ? 'Joystick: hareket · ⚡ hamle' : '');
  },
};
