// v75 — SOKAK DÖVÜŞÜ: 3 raunt (2 kazanan alır), raunt 60 sn.
// Kontrol: ◀ ▶ yürü (rakibin tersine basılı tut = BLOK) · ⤴ zıpla · 👊 yumruk · 🦵 tekme
import { IN, has, clamp, r1, PCOL, drawHud, drawBanner, rrect } from './common.js';

const W = 320;
const H = 180;
const GROUND = 158;
const ROUND_S = 60;
const MOVES = {
  punch: { dur: 0.26, on: 0.08, off: 0.16, range: 30, dmg: 6, stun: 0.24, push: 70 },
  kick: { dur: 0.42, on: 0.16, off: 0.28, range: 42, dmg: 11, stun: 0.36, push: 120 },
};

function newRound(s) {
  s.f = [
    { x: 100, y: GROUND, vy: 0, hp: 100, act: '', at: 0, hit: false, stun: 0, face: 1, block: false, walk: 0 },
    { x: W - 100, y: GROUND, vy: 0, hp: 100, act: '', at: 0, hit: false, stun: 0, face: -1, block: false, walk: 0 },
  ];
  s.t = ROUND_S;
  s.pause = 1.5;
  s.msg = `RAUNT ${s.round}`;
  s.fx = [];
}

export default {
  id: 'dovus',
  title: 'Sokak Dövüşü',
  emoji: '🥊',
  desc: '3 raunt, 2 raunt alan kazanır. Rakibin tersine basılı tutarak blok yap!',
  how: '◀ ▶ yürü (geri = blok) · ⤴ zıpla · 👊 yumruk · 🦵 tekme',
  min: 2,
  max: 2,
  selfKey: 'f',
  W,
  H,
  controls: { left: ['L', 'R'], right: ['U', 'A', 'B'], labels: { U: '⤴', A: '👊', B: '🦵' } },
  create(names) {
    const s = { names, round: 1, wins: [0, 0], over: false };
    newRound(s);
    return s;
  },
  step(s, inputs, dt) {
    if (s.over) return;
    s.fx = (s.fx || []).map((e) => ({ ...e, t: e.t - dt })).filter((e) => e.t > 0);
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0) {
        if (s._next === 'round') {
          s.round += 1;
          s._next = '';
          newRound(s);
        } else s.msg = '';
      }
      return;
    }
    s.t = Math.max(0, s.t - dt);
    const [a, b] = s.f;
    a.face = b.x >= a.x ? 1 : -1;
    b.face = -a.face;
    // v75: iki dövüşçü EŞZAMANLI işlenir (sıra avantajı olmasın):
    // 1) blok durumları · 2) saldırı zamanlayıcıları + isabetler toplanır · 3) uygulanır · 4) hareket
    const moves = s.f.map((f, i) => {
      const inp = inputs[i] || 0;
      return { inp, move: (has(inp, IN.R) ? 1 : 0) - (has(inp, IN.L) ? 1 : 0), onGround: f.y >= GROUND - 0.5 };
    });
    s.f.forEach((f, i) => {
      f.stun = Math.max(0, f.stun - dt);
      const { move, onGround } = moves[i];
      f.block = onGround && !f.act && f.stun <= 0 && move !== 0 && move === -f.face;
    });
    const hits = [];
    s.f.forEach((f, i) => {
      const o = s.f[1 - i];
      if (!f.act) return;
      f.at += dt;
      const m = MOVES[f.act];
      if (!f.hit && f.at >= m.on && f.at <= m.off) {
        const reach = (o.x - f.x) * f.face;
        if (reach > 0 && reach < m.range + 10 && Math.abs(o.y - f.y) < 38) {
          f.hit = true;
          hits.push({ i, m, kind: f.act, blocked: o.block });
        }
      }
    });
    hits.forEach(({ i, m, kind, blocked }) => {
      const f = s.f[i];
      const o = s.f[1 - i];
      o.hp = Math.max(0, o.hp - (blocked ? 1 : m.dmg));
      o.stun = Math.max(o.stun, blocked ? 0.08 : m.stun);
      if (!blocked && !hits.some((h) => h.i === 1 - i)) {
        o.act = ''; // isabet alan saldırısını yarıda keser (karşılıklı vuruşta ikisi de sürer)
        o.at = 0;
      }
      o.x = clamp(o.x + f.face * (blocked ? m.push * 0.12 : m.push * 0.25), 16, W - 16);
      s.fx.push({ x: r1(f.x + f.face * (m.range - 4)), y: r1(f.y - (kind === 'kick' ? 26 : 38)), t: 0.22, b: blocked ? 1 : 0 });
    });
    s.f.forEach((f, i) => {
      const { inp, move, onGround } = moves[i];
      if (f.act && f.at >= MOVES[f.act].dur) {
        f.act = '';
        f.at = 0;
      }
      if (!f.act && f.stun <= 0) {
        if (has(inp, IN.A)) {
          f.act = 'punch';
          f.at = 0;
          f.hit = false;
        } else if (has(inp, IN.B)) {
          f.act = 'kick';
          f.at = 0;
          f.hit = false;
        }
      }
      const canMove = f.stun <= 0 && (!f.act || !onGround);
      const speed = f.block ? 45 : 85;
      if (canMove && move) {
        f.x += move * speed * dt;
        f.walk += dt * 8;
      }
      if (has(inp, IN.U) && onGround && f.stun <= 0 && !f.act) f.vy = -250;
      f.vy += 800 * dt;
      f.y = Math.min(GROUND, f.y + f.vy * dt);
      if (f.y >= GROUND) f.vy = 0;
      f.x = clamp(f.x, 16, W - 16);
    });
    // iç içe geçmesinler
    const gap = b.x - a.x;
    if (Math.abs(gap) < 22 && Math.abs(a.y - b.y) < 30) {
      const push = (22 - Math.abs(gap)) / 2;
      const sgn = gap >= 0 ? 1 : -1;
      a.x = clamp(a.x - sgn * push, 16, W - 16);
      b.x = clamp(b.x + sgn * push, 16, W - 16);
    }
    // raunt sonu
    const ko = a.hp <= 0 || b.hp <= 0;
    if ((ko || s.t <= 0) && !s._pred) {
      let w = -1;
      if (a.hp !== b.hp) w = a.hp > b.hp ? 0 : 1;
      if (w >= 0) s.wins[w] += 1;
      if (s.wins[0] >= 2 || s.wins[1] >= 2 || s.round >= 3) {
        s.over = true;
        const fw = s.wins[0] === s.wins[1] ? -1 : s.wins[0] > s.wins[1] ? 0 : 1;
        s.msg = fw < 0 ? 'BERABERE' : `${s.names[fw]} KAZANDI`;
      } else {
        s.msg = ko ? 'NAKAVT!' : w < 0 ? 'BERABERE' : 'SÜRE BİTTİ';
        s._next = 'round';
        s.pause = 1.8;
      }
    }
    s.f.forEach((f) => {
      f.x = r1(f.x);
      f.y = r1(f.y);
      f.at = Math.round(f.at * 1000) / 1000;
    });
  },
  result(s) {
    if (!s.over) return null;
    return { winner: s.wins[0] === s.wins[1] ? -1 : s.wins[0] > s.wins[1] ? 0 : 1, text: `${s.wins[0]} – ${s.wins[1]}` };
  },
  bot(s, i, mem) {
    const f = s.f[i];
    const o = s.f[1 - i];
    const dist = Math.abs(o.x - f.x);
    const toward = o.x > f.x ? IN.R : IN.L;
    const away = o.x > f.x ? IN.L : IN.R;
    mem.cd = (mem.cd || 0) - 1 / 60;
    mem.hold = (mem.hold || 0) - 1 / 60;
    if (mem.hold > 0) return mem.bits || 0;
    let bits = 0;
    const oAttacking = o.act && o.at < (o.act === 'kick' ? 0.28 : 0.16);
    if (oAttacking && dist < 52 && Math.random() < 0.45) {
      bits = away; // blok
      mem.hold = 0.25;
    } else if (dist > 38) {
      bits = toward;
      if (Math.random() < 0.006) bits |= IN.U;
    } else if (mem.cd <= 0) {
      bits = Math.random() < 0.62 ? IN.A : IN.B;
      mem.cd = 0.35 + Math.random() * 0.55;
    } else if (dist < 20) {
      bits = away;
    }
    mem.bits = bits;
    return bits;
  },
  render(c, s, me) {
    // arka plan: gece sokağı
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120a24');
    g.addColorStop(1, '#2a1640');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // binalar
    for (let i = 0; i < 9; i++) {
      const bw = 34;
      const bh = 50 + ((i * 37) % 50);
      c.fillStyle = i % 2 ? '#1c1236' : '#22163f';
      c.fillRect(i * 36, GROUND - bh - 10, bw, bh);
      c.fillStyle = 'rgba(255,214,102,0.5)';
      for (let y = GROUND - bh; y < GROUND - 16; y += 10) for (let x = i * 36 + 5; x < i * 36 + bw - 4; x += 8) if ((x + y + i) % 3) c.fillRect(x, y, 3, 4);
    }
    // neon tabela
    c.save();
    c.shadowColor = '#ff4fd8';
    c.shadowBlur = 8;
    c.strokeStyle = '#ff4fd8';
    c.lineWidth = 1.5;
    rrect(c, W / 2 - 36, 30, 72, 16, 4);
    c.stroke();
    c.fillStyle = '#ff9bea';
    c.font = 'bold 9px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('NEON ŞEHİR', W / 2, 38);
    c.restore();
    // zemin
    c.fillStyle = '#3a3448';
    c.fillRect(0, GROUND, W, H - GROUND);
    c.fillStyle = '#4a4458';
    c.fillRect(0, GROUND, W, 3);
    // can barları
    s.f.forEach((f, i) => {
      const x = i === 0 ? 6 : W - 6 - 120;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(x, 24, 120, 7);
      c.fillStyle = f.hp > 30 ? PCOL[i] : '#ff5252';
      const w = (f.hp / 100) * 118;
      c.fillRect(i === 0 ? x + 1 : x + 1 + (118 - w), 25, w, 5);
      for (let k = 0; k < s.wins[i]; k++) {
        c.fillStyle = '#ffe14d';
        c.beginPath();
        c.arc(i === 0 ? x + 4 + k * 8 : x + 116 - k * 8, 36, 2.5, 0, Math.PI * 2);
        c.fill();
      }
    });
    // dövüşçüler
    s.f.forEach((f, i) => drawFighter(c, f, i, i === me));
    // vuruş efektleri
    (s.fx || []).forEach((e) => {
      c.save();
      c.globalAlpha = Math.min(1, e.t / 0.12);
      c.fillStyle = e.b ? '#9fdcff' : '#ffe14d';
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = k % 2 ? 4 : 9;
        c.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
      }
      c.fill();
      c.restore();
    });
    drawHud(c, W, { left: s.names[0], right: s.names[1], center: `⏱ ${Math.ceil(s.t)}`, me });
    if (s.msg) drawBanner(c, W, H, s.msg, s.over ? `Raunt: ${s.wins[0]} – ${s.wins[1]}` : '');
  },
};

function drawFighter(c, f, i, mine) {
  const d = f.face;
  const x = f.x;
  const y = f.y;
  const col = PCOL[i];
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // gölge
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(x, GROUND + 2, 13, 3, 0, 0, Math.PI * 2);
  c.fill();
  const stunned = f.stun > 0.05;
  const lean = stunned ? -d * 4 : 0;
  const hipY = y - 22;
  const neckY = y - 44;
  const sw = Math.sin(f.walk) * 5;
  // bacaklar
  c.strokeStyle = '#2b2b3a';
  c.lineWidth = 5;
  const kicking = f.act === 'kick' && f.at > 0.1 && f.at < 0.34;
  c.beginPath();
  c.moveTo(x + lean, hipY);
  c.lineTo(x - d * 6 - sw * 0.5, y);
  c.stroke();
  c.beginPath();
  c.moveTo(x + lean, hipY);
  if (kicking) c.lineTo(x + d * 30, hipY - 4);
  else c.lineTo(x + d * 6 + sw * 0.5, y);
  c.stroke();
  // gövde
  c.strokeStyle = col;
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(x + lean, hipY);
  c.lineTo(x + lean * 1.5, neckY + 4);
  c.stroke();
  // kollar
  c.strokeStyle = '#e0a47a';
  c.lineWidth = 4;
  const punching = f.act === 'punch' && f.at > 0.04 && f.at < 0.2;
  const sx = x + lean * 1.5;
  const sy = neckY + 8;
  if (f.block) {
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx + d * 8, sy - 8);
    c.lineTo(sx + d * 6, sy - 16);
    c.stroke();
  } else {
    c.beginPath();
    c.moveTo(sx, sy);
    if (punching) c.lineTo(sx + d * 26, sy - 2);
    else {
      c.lineTo(sx + d * 9, sy + 6);
      c.lineTo(sx + d * 12, sy - 4);
    }
    c.stroke();
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx - d * 4, sy + 8);
    c.lineTo(sx + d * 4, sy + 2);
    c.stroke();
  }
  // eldiven
  c.fillStyle = '#e53935';
  const gx = f.block ? sx + d * 6 : punching ? sx + d * 26 : sx + d * 12;
  const gy = f.block ? sy - 16 : punching ? sy - 2 : sy - 4;
  c.beginPath();
  c.arc(gx, gy, 3.6, 0, Math.PI * 2);
  c.fill();
  // kafa
  c.fillStyle = '#f0b48a';
  c.beginPath();
  c.arc(x + lean * 1.8, neckY - 6, 8, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = col;
  c.fillRect(x + lean * 1.8 - 8, neckY - 12, 16, 3); // bandana
  c.fillStyle = '#111';
  c.fillRect(x + lean * 1.8 + d * 3, neckY - 8, 2, 2);
  if (mine) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x, neckY - 20);
    c.lineTo(x - 4, neckY - 26);
    c.lineTo(x + 4, neckY - 26);
    c.fill();
  }
  c.restore();
}
