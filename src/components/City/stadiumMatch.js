// =============================================================================
// v149 — STADYUMDA CANLI MAÇ (cihazda). Prototipten (neon-sehir-stadyum) aktarıldı.
// Maç belgesindeki zaman çizelgesi (timeline + topa sahip olma noktaları) gerçek
// zamana yayılır (18:00 → 19:00 = 0 → 90. dk): top, 6+6 oyuncu ve hakem sahada
// buna göre hareket eder; goller doğru anda olur, skor ekranı güncellenir.
//   • Her şey oyuncunun cihazında hesaplanır — sunucuya / Firestore'a hiçbir yazma
//     ya da ek okuma yok. Herkes başka bir maçı izleyebilir; oyuncuların sahadaki
//     yeri cihazdan cihaza farklı olabilir (skor ve goller aynıdır).
// =============================================================================
import * as THREE from 'three';
import { computeLiveMatchState } from '../FutbolScreen/futbolLiveMatch';
import { pitchStateAt, teamDots } from '../FutbolScreen/futbolPitchScript';

const toMs = (ts) => (ts?.toMillis ? ts.toMillis() : typeof ts === 'number' ? ts : ts ? Date.parse(ts) : null);
const SKINS = ['#c68863', '#8d5524', '#e0ac69', '#f1c27d', '#a86b43'];
const HAIRS = [['short', '#2b2118'], ['kel', '#121212'], ['undercut', '#3a2a1a'], ['wavy', '#6b4a2a'], ['afro', '#1a120c'], ['mohawk', '#2b2118']];

function footballer(shirt, i, keeper, shorts) {
  const [hairStyle, hairColor] = HAIRS[i % HAIRS.length];
  return { gender: 'erkek', skin: SKINS[(i * 3) % SKINS.length], hairStyle, hairColor, clothing: keeper ? 'hoodie' : 'tanktop', clothColor: shirt, neckAcc: 'none', pantsColor: shorts, shoeColor: '#f4f6fa', shoeStyle: 'spor', hat: 'none' };
}

// maçın canlı durumu + 1 maç dakikasının gerçek saniyesi (spm)
// v154 — fotoğraf için: maçtaki futbolcuların / hakemin görünüşü (canlıdakiyle aynı)
export function matchAvatar(side, i, hc = '#ff3fa0', ac = '#19e8ff') {
  if (side === 'ref') return { ...footballer('#111216', 4, false, '#111216'), shoeColor: '#111216' };
  const gk = i === 0;
  return footballer(gk ? (side === 'home' ? '#ffd23f' : '#39ff88') : side === 'home' ? hc : ac, i + (side === 'home' ? 0 : 2), gk, gk ? '#1b1e29' : '#f4f6fa');
}

export function liveState(match, now = Date.now()) {
  if (!match) return { phase: 'none' };
  const st = computeLiveMatchState(match, now);
  if (st.phase !== 'live') return st;
  const start = toMs(match.matchStartAt);
  const end = toMs(match.playEndAt) || toMs(match.revealAt) || (start ? start + 3_600_000 : null);
  const spm = start && end ? (end - start) / 1000 / 90 : 40;
  return { ...st, spm };
}

export function createStadiumMatch({ scene, layer, Fig, group, info, groundY, onGoal }) {
  const { L, W } = info.pitch;
  const root = new THREE.Group();
  scene.add(root);
  const center = group.localToWorld(new THREE.Vector3());

  // top (siyah benekli) + gölgesi
  const ballTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#f7f7f7';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#1b1b1b';
    for (const [x, y] of [[16, 16], [48, 20], [30, 44], [56, 52], [6, 50]]) {
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5 }));
  ball.castShadow = true;
  root.add(ball);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  root.add(shadow);

  let match = null;
  let players = [];
  let ref = null;
  let lastBoard = '';
  const announced = new Set();
  let prevBall = null;
  let ballSpd = 0;
  let celebrated = '';
  const sx = L / 100;
  const sz = W / 64;
  const toPitch = (p) => ({ x: (p.x - 50) * sx, z: (p.y - 32) * sz });
  const tmp = new THREE.Vector3();
  const toWorld = (x, z) => group.localToWorld(tmp.set(x, 0, z));

  function clearFigs() {
    players.forEach((p) => p.f.dispose(scene));
    players = [];
    ref?.f.dispose(scene);
    ref = null;
  }
  const npc = (id, avatar) => {
    const f = new Fig(scene, layer, { id, name: '', avatar, npc: true });
    f.label.style.display = 'none';
    return f;
  };
  function spawn(m) {
    clearFigs();
    const hc = m.homeColor || '#ff3fa0';
    const ac = m.awayColor || '#19e8ff';
    ['home', 'away'].forEach((side) => {
        for (let i = 0; i < 6; i++) {
        const av = matchAvatar(side, i, hc, ac);
        players.push({ f: npc(`mac_${side}_${i}`, av), side, i, x: null, z: null, vx: 0, vz: 0, kick: 0, dive: 0 });
      }
    });
    ref = { f: npc('mac_hakem', matchAvatar('ref', 0)), x: null, z: null, vx: 0, vz: 0, kick: 0, dive: 0 };
  }
  function setMatch(m) {
    match = m || null;
    announced.clear();
    lastBoard = '';
    celebrated = '';
    prevBall = null;
    if (!match) {
      clearFigs();
      return;
    }
    spawn(match);
    // açılış anında zaten atılmış goller tekrar duyurulmaz
    (liveState(match, Date.now()).events || []).forEach((e) => e.type === 'goal' && announced.add(`${e.minute}_${e.team}`));
  }
  // hedefe doğru yumuşak hızlanma
  function steer(p, tx, tz, maxV, dt, k = 5) {
    if (p.x == null) {
      p.x = tx;
      p.z = tz;
    }
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    const v = Math.min(maxV, d * 2.2);
    const wx = d > 0.01 ? (dx / d) * v : 0;
    const wz = d > 0.01 ? (dz / d) * v : 0;
    const a = Math.min(1, dt * k);
    p.vx += (wx - p.vx) * a;
    p.vz += (wz - p.vz) * a;
  }
  const camRight = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const spin = new THREE.Quaternion();

  function update(dt, camera, now, px, pz) {
    dt = Math.min(dt, 0.1);
    const near = Math.hypot(px - center.x, pz - center.z) < 110;
    root.visible = near && Boolean(match);
    const st = liveState(match, Date.now());
    const live = st.phase === 'live' && !st.isOver;
    players.forEach((p) => (p.f.group.visible = near && live));
    if (ref) ref.f.group.visible = near && live;
    const minute = live ? Math.min(90, Math.floor(st.elapsedMinute) + 1) : null;
    let banner = '';
    let lastGoal = null;
    if (live) {
      (st.events || []).forEach((e) => {
        if (e.type === 'goal') lastGoal = e;
      });
      if (lastGoal && (st.elapsedMinute - lastGoal.minute) * st.spm < 6) banner = 'GOOOL!';
    }
    const board = { home: match?.homeName || 'EV', away: match?.awayName || 'DEP', hs: st.homeScore ?? 0, as: st.awayScore ?? 0, min: minute, phase: st.phase, banner };
    const key = JSON.stringify(board);
    if (key !== lastBoard && info.scoreboard) {
      lastBoard = key;
      info.scoreboard(match ? board : null);
    }
    if (!root.visible || !live) {
      ball.visible = false;
      shadow.visible = false;
      return;
    }
    ball.visible = true;
    shadow.visible = true;
    if (lastGoal) {
      const gk = `${lastGoal.minute}_${lastGoal.team}`;
      if (!announced.has(gk)) {
        announced.add(gk);
        onGoal?.({ team: lastGoal.team, name: lastGoal.team === 'home' ? board.home : board.away, home: board.home, away: board.away, hs: st.homeScore, as: st.awayScore, scorer: lastGoal.scorerName || null });
      }
    }
    const t = st.elapsedMinute;
    const spm = st.spm;
    const cur = pitchStateAt(match.timeline, match.possessionCheckpoints, t, spm);
    const LOOK = 0.55; // sn ileriyi tahmin (pas alıcısı topa koşar)
    const ahead = pitchStateAt(match.timeline, match.possessionCheckpoints, Math.min(90, t + LOOK / spm), spm);
    const b = toPitch(cur.ball);
    const b2 = toPitch(ahead.ball);
    let bvx = 0;
    let bvz = 0;
    if (prevBall) {
      bvx = (b.x - prevBall.x) / dt;
      bvz = (b.z - prevBall.z) / dt;
    }
    const bv = Math.hypot(bvx, bvz);
    const kicked = prevBall && bv > 6 && bv > ballSpd * 1.8 + 2;
    ballSpd += (bv - ballSpd) * Math.min(1, dt * 10);
    prevBall = { x: b.x, z: b.z };
    const passV = Math.hypot(b2.x - b.x, b2.z - b.z) / LOOK;
    const field = players.filter((p) => p.i !== 0 && p.x != null);
    const nearest = (pt, list, skip) => {
      let best = null;
      let bd = Infinity;
      list.forEach((p) => {
        if (p === skip) return;
        const d = Math.hypot(p.x - pt.x, p.z - pt.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      });
      return [best, bd];
    };
    const [carrier, cd] = nearest(b, field);
    const hasBall = carrier && cd < 3.5 && passV < 9;
    const receiver = passV > 5 ? nearest(b2, hasBall ? field.filter((p) => p.side === carrier.side) : field, hasBall ? carrier : null)[0] : null;
    const defSide = hasBall ? (carrier.side === 'home' ? 'away' : 'home') : null;
    const presser = defSide ? nearest(b, field.filter((p) => p.side === defSide && p !== receiver))[0] : null;
    const sinceGoal = lastGoal ? (t - lastGoal.minute) * spm : 99;
    const celeb = lastGoal && sinceGoal > 0.7 && sinceGoal < 3.9 ? lastGoal.team : null;
    if (celeb) {
      const ck = `${lastGoal.minute}_${lastGoal.team}`;
      if (celebrated !== ck) {
        celebrated = ck;
        players.forEach((p) => p.side === celeb && p.i !== 0 && p.f.playEmote('zipla'));
      }
    }
    const kickoff = { home: teamDots('home', { x: 50, y: 32 }), away: teamDots('away', { x: 50, y: 32 }) };
    const shape = { home: teamDots('home', cur.ball), away: teamDots('away', cur.ball) };
    const hx = L / 2;
    const hz = W / 2;
    players.forEach((p) => {
      const home = toPitch(shape[p.side][p.i]);
      let tx = home.x + Math.sin(now / 1700 + p.i * 2.1 + (p.side === 'home' ? 0 : 1)) * 0.9;
      let tz = home.z + Math.cos(now / 1900 + p.i * 1.3) * 0.7;
      let v = 4.6;
      let k = 4.5;
      p.dive = 0;
      if (p.i === 0) {
        // kaleci: çizgisinde, topu izler; şutta uzanır
        tx = p.side === 'home' ? -hx + 0.9 : hx - 0.9;
        tz = Math.max(-2.6, Math.min(2.6, b.z * 0.35));
        v = 5;
        if (cur.attackSide && cur.attackSide !== p.side && (cur.phase === 'shot' || (cur.phase === 'attack' && cur.danger > 0.85))) {
          tz = Math.max(-3.2, Math.min(3.2, b2.z));
          v = 9;
          k = 9;
          if (cur.phase === 'shot') p.dive = Math.sign(b2.z - p.z) || 1;
        }
      } else if (celeb) {
        if (p.side === celeb) {
          // gol sevinci: köşe bayrağında toplanır
          const cx = (celeb === 'home' ? 1 : -1) * (hx - 2.5);
          const cz = (cur.ball.y >= 32 ? 1 : -1) * (hz - 2.5);
          tx = cx + Math.cos(p.i * 1.3) * 1.4;
          tz = cz + Math.sin(p.i * 1.3) * 1.4;
          v = 7.4;
        } else {
          const kp = toPitch(kickoff[p.side][p.i]);
          tx = kp.x;
          tz = kp.z;
          v = 2.2;
        }
      } else if (p === carrier && hasBall) {
        // top sürücü: topun hemen arkasında
        const dx = b2.x - b.x;
        const dz = b2.z - b.z;
        const d = Math.hypot(dx, dz);
        const back = p.side === 'home' ? -1 : 1;
        tx = b.x + (d > 0.2 ? (-dx / d) * 0.5 : back * 0.5);
        tz = b.z + (d > 0.2 ? (-dz / d) * 0.5 : 0);
        v = 7.4;
        k = 8;
      } else if (p === receiver) {
        tx = b2.x;
        tz = b2.z;
        v = 7.6;
        k = 7;
      } else if (p === presser) {
        const gx = (p.side === 'home' ? -hx : hx) - b.x;
        const gz = -b.z;
        const d = Math.hypot(gx, gz) || 1;
        tx = b.x + (gx / d) * 1.4;
        tz = b.z + (gz / d) * 1.4;
        v = 6.6;
        k = 6;
      }
      tx = Math.max(-hx - 0.6, Math.min(hx + 0.6, tx));
      tz = Math.max(-hz - 0.8, Math.min(hz + 0.8, tz));
      steer(p, tx, tz, v, dt, k);
      if (kicked && Math.hypot(p.x - b.x, p.z - b.z) < 2.6) p.kick = 0.28;
    });
    if (ref) steer(ref, b.x * 0.7 - 3, Math.max(-hz + 1, Math.min(hz - 1, b.z * 0.5 - 5)), 5.2, dt, 3.5);
    // çarpışmasın (yakın oyuncular birbirini iter)
    const all = ref ? [...players, ref] : players;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const c = all[j];
        if (a.x == null || c.x == null) continue;
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 0.85) {
          const push = (0.85 - d) * 0.5;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          c.x += (dx / d) * push;
          c.z += (dz / d) * push;
        }
      }
    }
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    all.forEach((p) => {
      if (p.x == null) return;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const w = toWorld(p.x, p.z);
      const f = p.f;
      f.x = w.x;
      f.z = w.z;
      f.y = groundY(w.x, w.z);
      const sp = Math.hypot(p.vx, p.vz);
      f.moving = sp > 0.5;
      f.run = sp > 3.6;
      const side = p.vx * camRight.x + p.vz * camRight.z;
      if (Math.abs(side) > 0.15) f.facingLeft = side < 0;
      f.update(dt, camera, now);
      if (p.kick > 0) {
        p.kick = Math.max(0, p.kick - dt);
        const kk = Math.sin((1 - p.kick / 0.28) * Math.PI);
        f.pivot.position.y += kk * 0.1;
        f.pivot.rotation.z += kk * 0.22 * (f.facingLeft ? 1 : -1);
      }
      if (p.dive) {
        f.pivot.rotation.z += p.dive * 0.9 * (side < 0 ? -1 : 1);
        f.pivot.position.y += 0.15;
      }
    });
    // top: şutta havalanır, hızlı paslarda hafif zıplar, yuvarlanır
    const bw = toWorld(b.x, b.z).clone();
    let lift = 0;
    if (cur.phase === 'shot') {
      const k = Math.min(1, Math.max(0, ((t - cur.event.minute) * spm) / 0.7));
      lift = Math.sin(k * Math.PI) * (cur.variant === 'wide' ? 2.4 : cur.variant === 'goal' ? 1.2 : 0.9);
    } else if (ballSpd > 11) lift = Math.min(0.9, (ballSpd - 11) * 0.08);
    const gy = groundY(bw.x, bw.z);
    ball.position.set(bw.x, gy + 0.2 + lift, bw.z);
    if (bv > 0.05) {
      axis.set(bvz, 0, -bvx).normalize();
      spin.setFromAxisAngle(axis, (bv * dt) / 0.2);
      ball.quaternion.premultiply(spin);
    }
    shadow.position.set(bw.x, gy + 0.03, bw.z);
    shadow.material.opacity = 0.35 / (1 + lift);
  }

  function dispose() {
    clearFigs();
    scene.remove(root);
    ball.geometry.dispose();
    ball.material.dispose();
    ballTex.dispose();
    shadow.geometry.dispose();
    shadow.material.dispose();
  }
  function state() {
    const st = liveState(match, Date.now());
    return { phase: st.phase, minute: st.elapsedMinute ?? null, hs: st.homeScore ?? 0, as: st.awayScore ?? 0, home: match?.homeName, away: match?.awayName };
  }
  // v154 — fotoğraf: deklanşör anındaki futbolcular + hakem + top (dünya koordinatı)
  const r2 = (v) => Math.round(v * 100) / 100;
  function snap() {
    if (!match || !root.visible || !ball.visible) return null;
    const fig = (f) => [r2(f.x), r2(f.z), f.facingLeft ? 1 : 0, f.moving ? 1 : 0, Math.floor(f.walkT / 0.16) % 2 ? 1 : 0];
    return {
      hc: match.homeColor || '#ff3fa0',
      ac: match.awayColor || '#19e8ff',
      p: players.filter((p) => p.x != null && p.f.group.visible).map((p) => [p.side === 'home' ? 0 : 1, p.i, ...fig(p.f)]),
      ...(ref && ref.x != null ? { r: fig(ref.f) } : {}),
      b: [r2(ball.position.x), r2(ball.position.y), r2(ball.position.z)],
    };
  }
  // fotoğraf karesi çizilirken canlı maç gizlenir (yerine fotoğraftaki an çizilir)
  const liveObjects = () => [root, ...players.map((p) => p.f.group), ...(ref ? [ref.f.group] : [])];
  return { setMatch, update, dispose, hasMatch: () => Boolean(match), state, snap, liveObjects, matchId: () => match?.id || null };
}
