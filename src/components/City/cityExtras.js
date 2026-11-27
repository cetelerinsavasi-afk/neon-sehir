// =============================================================================
// v219 — ŞEHİR EKLERİ (yeni haritayla gelenler): çatıda yürüme / düşme, festival sahnesi ve spor salonu
// 2. katı (yürünebilir bölgeler), HELİKOPTER (pist ortasında; 4 kişilik, aynı anda tek pilot, 10 dk
// kullanılmazsa piste döner), aktivite parkındaki TOPLAR (futbol + basket, birlikte oynanır, sahadan
// çıkmaz), KAYKAY (satın al / kirala, rampalar). Prototipten (harita_duzeni5) aktarıldı; çok oyunculu
// eşitleme (helikopter kilidi + konumu, topların durumu) burada eklendi — RTDB:
//   city/heli        { by: pilot uid | '', x, y, z, yw, t, s1, s2, s3 }  (pilot koltuğu kilidi, park yeri, yolcular)
//   city/ball/{f|b}  { x, y, z, vx, vy, vz, by, t, h?, fl? }            (sadece parkın yakınındakiler dinler)
// Uçan helikopterin anlık konumu pilotun konum kaydında gider (city/p/... › hl), yeni dinleme açılmaz.
// Motor (cityEngine.js) bu modüle kancalarla bağlanır: g (zemin), w (yürünür mü), ys (yükseklik), mv (adım),
// cam, post, after, busy, noVenue, reset, presence, remoteFig, dispose.
// =============================================================================
import * as THREE from 'three';
import { ballTex } from './world/aktivite.js';
import { pistClinic_ } from './world/pist.js';
import { PIST_SPOTS } from './world/pistPlan.js';

export const SKATE = { price: 5000, rentPerMin: 100, slotMs: 60_000 }; // functions/stable.js › SKATE ile aynı

export function installExtras(ctx) {
  const { container, scene, camera, self, me, W, keys, sound, camRay, ring, blockers, camPos, groundY, standY, blockedAt, canStand, freeNear } = ctx;
  const KEYH = [];
  const T = THREE,
    CT = container,
    V = T.Vector3,
    CL = (v, a, b) => (v < a ? a : v > b ? b : v),
    WR = (a) => Math.atan2(Math.sin(a), Math.cos(a)),
    SM = (a, b, t) => {
      t = CL((t - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    },
    NOW = () => performance.now();
  /* ---------- roofs (building tops from blocker boxes) ---------- */
  let RO = null,
    ROt = 0;
  const roofs = () => {
    const now = NOW();
    if (RO && RO.length && now - ROt < 120000) return RO;
    ROt = now;
    const L = [];
    const p = new V(),
      q = new T.Quaternion(),
      s = new V(),
      eu = new T.Euler();
    scene.traverse((o) => {
      if (!o.userData || !o.userData.blocker || !o.geometry || !o.geometry.parameters) return;
      const g = o.geometry.parameters;
      if (g.width == null) return;
      o.updateWorldMatrix(!0, !1);
      o.matrixWorld.decompose(p, q, s);
      eu.setFromQuaternion(q, `YXZ`);
      if (Math.abs(eu.x) > 0.05 || Math.abs(eu.z) > 0.05) return;
      const hw = (g.width * s.x) / 2,
        hd = (g.depth * s.z) / 2,
        hh = (g.height * s.y) / 2;
      if (hw < 1.2 || hd < 1.2 || hh < 0.9 || hw * hd * 4 > 2200) return;
      const y0 = p.y - hh,
        top = p.y + hh + 0.5;
      let gy = 0;
      try {
        gy = groundY(p.x, p.z);
      } catch {}
      if (y0 > gy + 1.5) return;
      L.push({ cx: p.x, cz: p.z, c: Math.cos(eu.y), s: Math.sin(eu.y), hw, hd, y0, top, R: hw + hd });
    });
    RO = L;
    return RO;
  };
  const inR = (r, x, z, m) => {
    const dx = x - r.cx,
      dz = z - r.cz,
      lx = dx * r.c - dz * r.s,
      lz = dx * r.s + dz * r.c;
    return Math.abs(lx) <= r.hw - m && Math.abs(lz) <= r.hd - m;
  };
  const roofAt = (x, z, ym, m) => {
    let b = null;
    for (const r of roofs()) {
      if (r.top > ym || Math.abs(x - r.cx) > r.R || Math.abs(z - r.cz) > r.R || !inR(r, x, z, m)) continue;
      if (!b || r.top > b.top) b = r;
    }
    return b;
  };
  const roofHit = (x, z, m) => {
    let b = null;
    for (const r of roofs()) {
      if (Math.abs(x - r.cx) > r.R + m || Math.abs(z - r.cz) > r.R + m || !inR(r, x, z, -m)) continue;
      if (!b || r.top > b.top) b = r;
    }
    return b;
  };
  /* ---------- walk zones: festival stage + gym 2nd floor ---------- */
  let STY = null;
  const stTop = () => {
    if (STY == null) {
      try {
        STY = groundY(622, -228) + 1.4;
      } catch {
        STY = 6.45;
      }
    }
    return STY;
  };
  const STR = [
      [609.7, 612.3],
      [631.7, 634.3],
    ],
    inSt = (x, z) => z >= -233.05 && z <= -230 && STR.some((a) => x >= a[0] + 0.08 && x <= a[1] - 0.08),
    stRamp = (z) => stTop() - 1.4 + 1.4 * CL((-230 - z) / 3, 0, 1),
    inStage = (x, z) => x >= 605.25 && x <= 638.75 && z >= -246.75 && z <= -232.95,
    stBlk = (x, z) =>
      z < -245.55 ||
      [
        [605.6, -246.6],
        [638.4, -246.6],
        [605.6, -233.4],
        [638.4, -233.4],
        [607, -235],
        [637, -235],
      ].some((p) => Math.hypot(x - p[0], z - p[1]) < 0.75);
  const stG = (x, z, y) => {
    if (x < 600 || x > 645 || z < -250 || z > -228) return null;
    if (inSt(x, z)) {
      const h = stRamp(z);
      return Math.abs(h - y) < 1.1 ? h : null;
    }
    if (inStage(x, z) && y > stTop() - 0.95 && y < stTop() + 2) return stTop();
    return null;
  };
  const stW = (x, z, y) => {
    if (x < 600 || x > 645 || z < -250 || z > -228) return null;
    if (inSt(x, z)) return Math.abs(stRamp(z) - y) < 0.8;
    if (inStage(x, z)) return y > stTop() - 0.8 && !stBlk(x, z);
    return null;
  };
  let SV = null;
  const spL = (x, z) => {
    if (SV === null) {
      SV = W.venues.find((v) => v.type === `spor` && v.lot) || !1;
      if (SV) {
        SV.root.updateMatrixWorld(!0);
        const p = SV.root.getWorldPosition(new V());
        SV.__k = { x: p.x, z: p.z, c: Math.cos(SV.root.rotation.y), s: Math.sin(SV.root.rotation.y) };
      }
    }
    if (!SV) return null;
    const k = SV.__k,
      dx = x - k.x,
      dz = z - k.z;
    if (dx * dx + dz * dz > 260) return null;
    return [dx * k.c - dz * k.s, dx * k.s + dz * k.c];
  };
  const SF = 4.4,
    sIn = (a, b) => a >= -9 && a <= 9 && b >= -12.2 && b <= 1.8,
    sSt = (a, b) => a >= 7.68 && a <= 8.92 && b >= -6.9 && b <= -1.2,
    sRamp = (b) => 0.16 + CL((b + 6.9) / 5.7, 0, 1) * (SF - 0.16),
    sBlk = (a, b) =>
      !(a >= -8.7 && a <= 8.7 && b >= -11.9 && b <= 1.45) ||
      (a >= -3.4 && a <= 6.98 && b >= -10.98 && b <= -3.02) ||
      (a >= 5.2 && b <= -9.05) ||
      Math.hypot(a + 6, b + 8.6) < 1.75 ||
      (a < -8.25 && b < -4.5) ||
      (a < -8.2 && b > -4.2 && b < -1.6) ||
      (a > -7.65 && a < -7.05 && ((b > -11.15 && b < -9.25) || (b > -7.55 && b < -5.65))) ||
      (a < -6.3 && b > 0.35) ||
      (b > -0.85 && b < 1.25 && [-1.4, 0.8, 3, 5.2].some((n) => Math.abs(a - n) < 0.42)) ||
      [
        [-0.3, 0.4],
        [1.9, 0.4],
        [4.1, 0.4],
        [-3.3, 1.2],
        [6.9, 1.2],
        [-3.3, -11.8],
        [4.9, -11.8],
      ].some((q) => Math.hypot(a - q[0], b - q[1]) < 0.38) ||
      (a > 7.45 && a < 7.7 && b > -6.95 && b < -1.25);
  const spG = (x, z, y) => {
    const L = spL(x, z);
    if (!L || !sIn(L[0], L[1])) return null;
    if (sSt(L[0], L[1])) {
      const h = sRamp(L[1]);
      return Math.abs(h - y) < 1.2 ? h : null;
    }
    return y > 2.6 && y < 7.5 ? SF : null;
  };
  const spW = (x, z, y) => {
    const L = spL(x, z);
    if (!L) return null;
    const a = L[0],
      b = L[1];
    if (sSt(a, b)) return Math.abs(sRamp(b) - y) < 0.8;
    if (y > 2.6 && y < 7.5 && sIn(a, b)) return !sBlk(a, b);
    return null;
  };
  const zG = (x, z, y) => {
      const v = stG(x, z, y);
      return v != null ? v : spG(x, z, y);
    },
    zW = (x, z, y) => {
      const v = stW(x, z, y);
      return v != null ? v : spW(x, z, y);
    };
  /* ---------- roof walking / falling ---------- */
  const RF = { roof: null, fall: null, down: null, px: self.x, pz: self.z, vx: 0, vz: 0 };
  let SHK = 0;
  const HX = { on: !1, orb: 0, lcy: 0, ot: 0, cp: null, near: !1 };
  const NX_g = (x, z, y) => {
    const pk = pkG(x, z, y);
    if (pk != null) return pk;
    if (Math.abs(x - 688) < 9 && Math.abs(z + 60) < 9 && Math.hypot(x - HOME.x, z - HOME.z) < 8.3) {
      const py = padY();
      if (Math.abs(py - y) < 1.2) return py;
    }
    const v = zG(x, z, y);
    if (v != null) return v;
    if (RF.roof && !HX.on) {
      const r = roofAt(x, z, y + 0.9, 0.12);
      if (r && Math.abs(r.top - y) < 1) return r.top;
    }
    return null;
  };
  const NX_w = (x, z, y) => {
    const v = zW(x, z, y);
    if (v != null) return v;
    if (RF.roof) {
      const h = roofHit(x, z, 0.22);
      return !(h && h.top > y + 0.9 && h.y0 < y + 1.5);
    }
    return null;
  };
  const startFall = (vy = 0, crash = !1) => {
    RF.fall = { vy, y0: me.y, ym: me.y, t: 0, vx: RF.vx, vz: RF.vz, crash };
    RF.roof = null;
    self.target = null;
    self.path = null;
    ring.visible = !1;
    me.sitting = !1;
    me.setForcePose(`handsup`);
  };
  const NX_ys = (dt, sw) => {
    if (dt > 0) {
      const vx = (self.x - RF.px) / dt,
        vz = (self.z - RF.pz) / dt,
        sp = Math.hypot(vx, vz),
        k = sp > 9 ? 9 / sp : 1;
      RF.vx = RF.vx * 0.5 + vx * k * 0.5;
      RF.vz = RF.vz * 0.5 + vz * k * 0.5;
    }
    RF.px = self.x;
    RF.pz = self.z;
    if (RF.roof) {
      const r = roofAt(self.x, self.z, me.y + 0.9, 0.12);
      if (r && Math.abs(r.top - me.y) < 1) {
        RF.roof = r;
        me.y += (r.top - me.y) * Math.min(1, dt * 14);
        return;
      }
      startFall();
      return;
    }
    const t = standY(self.x, self.z, ctx.walkHint(), me.y);
    if (!sw && !ctx.venue()?.ml && me.y - t > 1.25) {
      startFall();
      return;
    }
    me.y += (t - me.y) * Math.min(1, dt * (sw ? 4 : 12));
  };
  const land = (f, onR, water) => {
    RF.fall = null;
    RF.roof = onR;
    me.setForcePose(null);
    RF.px = self.x;
    RF.pz = self.z;
    RF.vx = RF.vz = 0;
    const h = f.ym - me.y;
    if (water) {
      toast(`💦 Suya düştün!`);
      splash(self.x, me.y + 1, self.z);
      return;
    }
    if (h > 3.2 || f.crash) {
      const dur = f.crash ? 2.4 : CL(0.9 + h * 0.07, 1.3, 3);
      RF.down = { t: 0, dur, side: Math.random() < 0.5 ? -1 : 1 };
      SHK = Math.max(SHK, CL(h / 14, 0.3, 1));
      me.shakeUntil = NOW() + 350;
      if (!f.crash) toast(h > 16 ? `💥 Çok sert düştün!` : `💥 Yere düştün!`);
      dust(self.x, me.y, self.z, CL(h / 9, 0.7, 2));
      thud(CL(h / 18, 0.35, 1));
    }
  };
  const fallStep = (dt) => {
    const f = RF.fall;
    f.t += dt;
    f.vy = Math.max(f.vy - 25 * dt, -50);
    const nx = self.x + f.vx * dt,
      nz = self.z + f.vz * dt,
      h = roofHit(nx, nz, 0.3);
    if (h && h.top > me.y + 0.05 && h.y0 < me.y + 1.6) {
      f.vx *= -0.2;
      f.vz *= -0.2;
    } else {
      self.x = nx;
      self.z = nz;
    }
    const dm = Math.exp(-dt * 0.5);
    f.vx *= dm;
    f.vz *= dm;
    let ny = me.y + f.vy * dt,
      fl = groundY(self.x, self.z),
      onR = null,
      water = !1;
    const zr = zG(self.x, self.z, me.y + 0.05);
    if (zr != null && zr <= me.y + 0.05 && zr > fl) fl = zr;
    const r = roofAt(self.x, self.z, me.y + 0.05, 0.05);
    if (r && r.top > fl) {
      fl = r.top;
      onR = r;
    }
    try {
      const wl = W.waterLevel(self.x, self.z, fl, W.modeAt(self.x, self.z));
      if (wl != null && wl > fl + 0.4) {
        fl = wl - 1;
        water = !0;
        onR = null;
      }
    } catch {}
    if (ny <= fl) {
      me.y = fl;
      land(f, onR, water);
    } else {
      me.y = ny;
      f.ym = Math.max(f.ym, ny);
    }
    me.x = self.x;
    me.z = self.z;
    me.moving = !1;
    ctx.setEye(1.55 + me.y);
    ctx.snap();
    return !0;
  };
  /* ---------- helicopter model ---------- */
  const HM = (() => {
    const root = new T.Group();
    root.name = `neon_heli`;
    const tilt = new T.Group();
    root.add(tilt);
    const M = (c, r = 0.45, m = 0.35, x = {}) => new T.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...x });
    const body = M(`#14396e`, 0.32, 0.5),
      white = M(`#eef2f6`, 0.38, 0.3),
      dark = M(`#1a1d22`, 0.6, 0.5),
      metal = M(`#a7b0ba`, 0.3, 0.85),
      acc = M(`#ffd23f`, 0.4, 0.2),
      seat = M(`#2a2d33`, 0.85, 0.05),
      glass = new T.MeshStandardMaterial({ color: `#9fd4ff`, roughness: 0.05, metalness: 0.2, transparent: !0, opacity: 0.32, depthWrite: !1, side: 2 }),
      red = new T.MeshBasicMaterial({ color: `#ff2030` }),
      grn = new T.MeshBasicMaterial({ color: `#20ff70` }),
      wht = new T.MeshBasicMaterial({ color: `#ffffff` });
    const mats = [body, white, dark, metal, acc, seat];
    mats.forEach((m) => (m.userData.c0 = m.color.clone()));
    const add = (g, m, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, par = tilt, cs = !0) => {
      const o = new T.Mesh(g, m);
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz);
      o.scale.set(sx, sy, sz);
      o.castShadow = cs;
      o.receiveShadow = !0;
      par.add(o);
      return o;
    };
    const SG = (ps, pl, ts, tl) => new T.SphereGeometry(1, 40, 24, ps, pl, ts, tl),
      P2 = Math.PI / 2,
      CX = [1.3, 1.2, 2.6],
      CY = 1.78,
      CZ = 0.25;
    add(SG(0, Math.PI * 2, 0, 0.32), body, 0, CY, CZ, 0, 0, 0, ...CX);
    add(SG(P2 - 1.55, 3.1, 0.32, 1.83), glass, 0, CY, CZ, 0, 0, 0, ...CX, tilt, !1);
    add(SG(P2 + 1.55, Math.PI * 2 - 3.1, 0.32, 1.83), body, 0, CY, CZ, 0, 0, 0, ...CX);
    add(SG(0, Math.PI * 2, 2.15, 0.24), acc, 0, CY, CZ, 0, 0, 0, ...CX);
    add(SG(0, Math.PI * 2, 2.39, Math.PI - 2.39), white, 0, CY, CZ, 0, 0, 0, ...CX);
    add(new T.BoxGeometry(0.07, 0.85, 0.07), dark, 0, CY + 0.62, CZ + 2.2, -0.75);
    for (const sx of [-1, 1]) add(new T.BoxGeometry(0.05, 1.15, 0.06), dark, sx * 1.12, CY + 0.22, CZ + 0.95, 0, 0, sx * -0.18);
    add(new T.BoxGeometry(2.1, 0.08, 3.4), dark, 0, 0.92, 0.3);
    const seats = [
      [-0.55, 1.0, 0.95],
      [0.55, 1.0, 0.95],
      [-0.55, 1.0, -0.45],
      [0.55, 1.0, -0.45],
    ];
    seats.forEach(([x, y, z]) => {
      add(new T.BoxGeometry(0.6, 0.14, 0.58), seat, x, y - 0.07, z);
      add(new T.BoxGeometry(0.6, 0.75, 0.12), seat, x, y + 0.32, z - 0.32, -0.12);
    });
    add(new T.BoxGeometry(1.5, 0.5, 0.25), dark, 0, 1.3, 1.75, -0.5);
    add(new T.BoxGeometry(1.15, 0.62, 2.5), body, 0, 2.95, -0.55);
    add(new T.BoxGeometry(1.0, 0.08, 2.3), acc, 0, 3.27, -0.55);
    for (const sx of [-1, 1]) add(new T.CylinderGeometry(0.13, 0.16, 0.5, 12), dark, sx * 0.3, 2.9, -1.95, P2);
    const boom = add(new T.CylinderGeometry(0.42, 0.18, 6.2, 16), body, 0, 2.05, -4.75, P2);
    add(new T.CylinderGeometry(0.425, 0.425, 0.5, 16), acc, 0, 2.05, -2.45, P2);
    add(new T.BoxGeometry(0.1, 1.7, 1.1), body, 0, 2.75, -7.7, -0.38);
    add(new T.BoxGeometry(0.08, 0.7, 0.7), body, 0, 1.55, -7.55, 0.5);
    add(new T.BoxGeometry(2.3, 0.07, 0.6), body, 0, 2.05, -6.4);
    for (const sx of [-1, 1]) add(new T.BoxGeometry(0.06, 0.5, 0.55), acc, sx * 1.15, 2.05, -6.4);
    const tr = new T.Group();
    tr.position.set(0.2, 2.95, -7.85);
    tilt.add(tr);
    add(new T.CylinderGeometry(0.1, 0.1, 0.18, 10), metal, 0, 0, 0, 0, 0, P2, 1, 1, 1, tr);
    add(new T.BoxGeometry(0.04, 1.6, 0.16), dark, 0.06, 0, 0, 0, 0, 0, 1, 1, 1, tr);
    add(new T.BoxGeometry(0.04, 1.6, 0.16), dark, 0.06, 0, 0, P2, 0, 0, 1, 1, 1, tr);
    add(new T.CylinderGeometry(0.1, 0.12, 0.55, 12), metal, 0, 3.5, -0.1);
    add(new T.CylinderGeometry(0.3, 0.3, 0.18, 16), metal, 0, 3.75, -0.1);
    const rotor = new T.Group();
    rotor.position.set(0, 3.82, -0.1);
    tilt.add(rotor);
    for (let k = 0; k < 4; k++) {
      const g = new T.Group();
      g.rotation.y = k * P2;
      rotor.add(g);
      add(new T.BoxGeometry(5.4, 0.05, 0.32), dark, 2.85, 0, 0, 0, 0, 0, 1, 1, 1, g);
      add(new T.BoxGeometry(0.45, 0.055, 0.33), acc, 5.35, 0, 0, 0, 0, 0, 1, 1, 1, g);
    }
    const blur = new T.Mesh(
      new T.CircleGeometry(5.6, 48),
      new T.MeshBasicMaterial({ color: `#16181c`, transparent: !0, opacity: 0, depthWrite: !1, side: 2 }),
    );
    blur.rotation.x = -P2;
    blur.position.set(0, 3.82, -0.1);
    tilt.add(blur);
    for (const sx of [-1, 1]) {
      add(new T.CylinderGeometry(0.07, 0.07, 4.6, 10), metal, sx * 1.2, 0.08, 0.25, P2);
      add(new T.CylinderGeometry(0.07, 0.07, 0.46, 10), metal, sx * 1.2, 0.24, 2.7, 0.75);
      for (const sz of [-0.75, 1.25]) add(new T.CylinderGeometry(0.055, 0.055, 1.05, 8), metal, sx * 1.05, 0.55, sz, 0, 0, sx * 0.32);
    }
    const navs = [
      add(new T.SphereGeometry(0.09, 10, 8), red, 1.32, 1.75, 0.4, 0, 0, 0, 1, 1, 1, tilt, !1),
      add(new T.SphereGeometry(0.09, 10, 8), grn, -1.32, 1.75, 0.4, 0, 0, 0, 1, 1, 1, tilt, !1),
      add(new T.SphereGeometry(0.08, 10, 8), wht, 0, 2.0, -8.0, 0, 0, 0, 1, 1, 1, tilt, !1),
    ];
    const beacon = add(new T.SphereGeometry(0.13, 10, 8), red, 0, 3.32, -1.9, 0, 0, 0, 1, 1, 1, tilt, !1);
    const cv = document.createElement(`canvas`);
    cv.width = 256;
    cv.height = 64;
    const g2 = cv.getContext(`2d`);
    g2.fillStyle = `#ffffff`;
    g2.font = `900 44px Arial, sans-serif`;
    g2.textAlign = `center`;
    g2.textBaseline = `middle`;
    g2.fillText(`TC-NEON`, 128, 34);
    const tt = new T.CanvasTexture(cv);
    tt.colorSpace = T.SRGBColorSpace;
    const tm = new T.MeshBasicMaterial({ map: tt, transparent: !0, depthWrite: !1 });
    for (const sx of [-1, 1]) {
      const pl = add(new T.PlaneGeometry(2.0, 0.5), tm, sx * 0.36, 2.08, -4.4, 0, sx * P2, 0, 1, 1, 1, tilt, !1);
      pl.renderOrder = 4;
    }
    root.traverse((o) => {
      o.frustumCulled = !0;
    });
    return { root, tilt, rotor, tr, blur, beacon, mats, glass, seats, navs };
  })();
  scene.add(HM.root);
  /* ---------- helicopter state ---------- */
  const HOME = { x: 688, z: -60, yaw: -Math.PI / 2 };
  const H = {
    x: HOME.x,
    z: HOME.z,
    y: 0,
    yaw: HOME.yaw,
    vx: 0,
    vy: 0,
    vz: 0,
    yr: 0,
    rpm: 0,
    eng: !1,
    gnd: !0,
    pit: 0,
    rol: 0,
    wreck: null,
    auto: !1,
    init: !1,
    sc: 1,
  };
  const TC = {};
  // ---------- v219: çok oyunculu helikopter (kilit + park yeri + yolcular) ----------
  const NET = ctx.net;
  const HN = { node: null, mine: !1, saveT: 0, unsub: null, resetT: 0 };
  const PAX = { on: !1, seat: 0 };
  const paxCount = () => [1, 2, 3].filter((k) => HN.node?.[`s${k}`]).length;
  const heliClaim = () =>
    NET.tx(`city/heli`, (cur) => {
      if (cur?.by && cur.by !== ctx.uid) return undefined;
      return { ...(cur || {}), by: ctx.uid, t: NET.TS() };
    }).then((ok) => {
      if (ok) {
        HN.mine = !0;
        NET.onDisc(`city/heli`, { by: ``, x: H.x, y: H.y, z: H.z, yw: WR(H.yaw), t: NET.TS() });
      }
      return ok;
    });
  const heliRelease = (home = !1) => {
    if (!HN.mine) return;
    HN.mine = !1;
    NET.cancelDisc(`city/heli`);
    const p = home ? { x: HOME.x, y: padY(), z: HOME.z, yw: HOME.yaw } : { x: H.x, y: H.y, z: H.z, yw: WR(H.yaw) };
    NET.update(`city/heli`, { by: ``, ...p, t: NET.TS(), s1: ``, s2: ``, s3: `` });
  };
  // uçan helikopterin anlık durumu: pilotun konum kaydı (hl) — "x,y,z,yaw,pit,rol,rpm,gnd,w"
  const hlStr = () => [H.x, H.y, H.z, WR(H.yaw), H.pit, H.rol].map((v) => Math.round(v * 100) / 100).join(`,`) + `,${Math.round(H.rpm * 100) / 100},${H.gnd ? 1 : 0},${H.wreck ? (H.wreck.water ? 2 : 1) : 0}`;
  const parseHl = (str) => {
    const a = String(str || ``).split(`,`).map(Number);
    if (a.length < 9 || a.some((v) => !Number.isFinite(v))) return null;
    return { x: a[0], y: a[1], z: a[2], yaw: a[3], pit: a[4], rol: a[5], rpm: a[6], gnd: a[7] === 1, w: a[8] };
  };
  const remoteHeli = () => {
    const nd = HN.node;
    if (nd?.by && nd.by !== ctx.uid) {
      const st = parseHl(ctx.remoteRec(nd.by)?.hl);
      if (st) return st;
    }
    if (nd && Number.isFinite(nd.x) && Number.isFinite(nd.z)) return { x: nd.x, y: Number.isFinite(nd.y) ? nd.y : padY(), z: nd.z, yaw: Number.isFinite(nd.yw) ? nd.yw : HOME.yaw, pit: 0, rol: 0, rpm: nd.by ? 1 : 0, gnd: !nd.by, w: 0 };
    return { x: HOME.x, y: padY(), z: HOME.z, yaw: HOME.yaw, pit: 0, rol: 0, rpm: 0, gnd: !0, w: 0 };
  };
  const heliNet = (dt) => {
    // pilot: park yerini seyrek kaydet (bağlantı koparsa helikopter son konumda kalır)
    if (HN.mine) {
      HN.saveT -= dt;
      if (HN.saveT <= 0) {
        HN.saveT = 8;
        NET.update(`city/heli`, { x: H.x, y: H.y, z: H.z, yw: WR(H.yaw), t: NET.TS() });
        NET.onDisc(`city/heli`, { by: ``, x: H.x, y: H.y, z: H.z, yw: WR(H.yaw), t: NET.TS() });
      }
      return;
    }
    // 10 dk kullanılmayan helikopter piste döner (gören herhangi bir oyuncu sıfırlar)
    HN.resetT -= dt;
    if (HN.resetT > 0) return;
    HN.resetT = 15;
    const nd = HN.node;
    if (!nd || nd.by || !Number.isFinite(nd.x)) return;
    if (Math.hypot(nd.x - HOME.x, nd.z - HOME.z) < 3) return;
    if (NET.now() - (Number(nd.t) || 0) < 600000) return;
    NET.tx(`city/heli`, (cur) => {
      if (!cur || cur.by || NET.now() - (Number(cur.t) || 0) < 600000) return undefined;
      return { ...cur, x: HOME.x, y: padY(), z: HOME.z, yw: HOME.yaw, t: NET.TS(), s1: ``, s2: ``, s3: `` };
    });
  };
  // yolcu koltukları (1-3): helikopter yerdeyken binilir; uçarken inilirse atlanır (pilottaki gibi)
  const paxBoard = async () => {
    if (PAX.on || HX.on || !H.gnd) return;
    let got = 0;
    const ok = await NET.tx(`city/heli`, (cur) => {
      if (!cur?.by || cur.by === ctx.uid) return undefined;
      got = [1, 2, 3].find((k) => !cur[`s${k}`] || cur[`s${k}`] === ctx.uid) || 0;
      if (!got) return undefined;
      return { ...cur, [`s${got}`]: ctx.uid };
    });
    if (!ok || !got) {
      toast(`🚁 Helikopter dolu`);
      return;
    }
    NET.onDisc(`city/heli/s${got}`, ``);
    PAX.on = !0;
    PAX.seat = got;
    PAX.by = HN.node?.by || ``;
    self.target = null;
    self.path = null;
    ring.visible = !1;
    RF.roof = null;
    pilotSync(got);
    ctx.snap();
    ui();
    toast(`🚁 Yolcu koltuğundasın`);
  };
  const paxExit = () => {
    if (!PAX.on) return;
    const k = PAX.seat;
    PAX.on = !1;
    PAX.seat = 0;
    NET.cancelDisc(`city/heli/s${k}`);
    NET.tx(`city/heli`, (cur) => (cur && cur[`s${k}`] === ctx.uid ? { ...cur, [`s${k}`]: `` } : undefined));
    me.inCar = !1;
    me.sitting = !1;
    me.seatY = null;
    const fl = floorAt(H.x, H.z, H.y);
    const sx = Math.cos(H.yaw);
    const sz = -Math.sin(H.yaw);
    const px = H.x - sx * 3.3;
    const pz = H.z - sz * 3.3;
    self.x = me.x = px;
    self.z = me.z = pz;
    if (!H.gnd && H.y - fl.y > 1.2) {
      me.y = H.y + 0.4;
      RF.vx = H.vx;
      RF.vz = H.vz;
      startFall(0);
      toast(`🪂 Helikopterden atladın!`);
    } else me.y = groundY(px, pz, -1, H.y);
    RF.px = self.x;
    RF.pz = self.z;
    camPos.copy(camera.position);
    ctx.snap();
    ui();
  };
  const paxTick = () => {
    if (!PAX.on) return !1;
    const nd = HN.node;
    // pilot gitti / koltuk elden gitti / helikopter düştü → in
    if (!nd || nd[`s${PAX.seat}`] !== ctx.uid || (H.remoteBoom && !H.gnd)) {
      paxExit();
      return !1;
    }
    pilotSync(PAX.seat);
    return !0;
  };
  const padY = () => {
    try {
      return groundY(HOME.x, HOME.z) + 0.22;
    } catch {
      return 5.27;
    }
  };
  const floorAt = (x, z, y) => {
    let g = groundY(x, z),
      water = !1;
    const r = roofAt(x, z, y + 0.5, 0.9);
    if (r && r.top > g) g = r.top;
    if (Math.hypot(x - HOME.x, z - HOME.z) < 8.4) g = Math.max(g, padY());
    try {
      const wl = W.waterLevel(x, z, g, W.modeAt(x, z));
      if (wl != null && wl > g + 0.2) {
        g = wl;
        water = !0;
      }
    } catch {}
    return { y: g, water };
  };
  const bodyHit = (x, z, y) => {
    for (const r of roofs()) {
      if (r.top <= y + 0.35 || r.y0 > y + 4.8 || Math.abs(x - r.cx) > r.R + 4.2 || Math.abs(z - r.cz) > r.R + 4.2) continue;
      if (inR(r, x, z, -3.6)) return r;
    }
    return null;
  };
  const char = (on) => {
    HM.mats.forEach((m) => {
      m.color.copy(on ? new T.Color(`#1c1918`) : m.userData.c0);
    });
    HM.glass.opacity = on ? 0.12 : 0.32;
    HM.navs.forEach((n) => (n.visible = !on));
  };
  const placeHeli = () => {
    HM.root.position.set(H.x, H.y, H.z);
    HM.root.rotation.y = H.yaw;
    HM.tilt.rotation.set(H.pit, 0, H.rol);
    HM.root.scale.setScalar(H.sc * 1.3);
  };
  const respawn = () => {
    H.wreck = null;
    char(!1);
    Object.assign(H, { x: HOME.x, z: HOME.z, yaw: HOME.yaw, vx: 0, vy: 0, vz: 0, yr: 0, rpm: 0, eng: !1, gnd: !0, pit: 0, rol: 0, auto: !1, sc: 0.01 });
    H.y = padY();
    HM.rotor.visible = !0;
    HM.blur.visible = !0;
    placeHeli();
  };
  const seatWorld = (k = 0) => {
    HM.root.updateMatrixWorld(!0);
    const s = new V(...HM.seats[k] || HM.seats[0]);
    HM.tilt.localToWorld(s);
    return s;
  };
  const pilotSync = (k = 0) => {
    HM.root.updateMatrixWorld(!0);
    const s = new V(...HM.seats[k] || HM.seats[0]);
    HM.tilt.localToWorld(s);
    me.x = s.x;
    me.z = s.z;
    me.y = H.y;
    me.seatY = s.y - 0.1;
    me.inCar = !0;
    me.sitting = !0;
    me.carYaw = H.yaw;
    me.group.visible = !0;
    me.moving = !1;
    self.x = H.x;
    self.z = H.z;
  };
  const rotSpin = (dt) => {
    const r = H.rpm;
    HM.rotor.rotation.y -= r * r * dt * 26 + r * dt * 4;
    HM.tr.rotation.x += r * dt * 48;
    HM.blur.material.opacity = r > 0.55 ? (r - 0.55) * 0.42 : 0;
  };
  const heliTick = (dt) => {
    dt = Math.min(dt, 0.05);
    rotSpin(dt);
    if (!H.init) {
      H.init = !0;
      H.y = padY();
      placeHeli();
    }
    // v219: helikopteri başkası uçuruyor / park yeri ağdan → yumuşak takip (simülasyon pilotta)
    if (!HN.mine && !H.wreck) {
      if (H.sc < 1) H.sc = Math.min(1, H.sc + dt * 1.6);
      const st = remoteHeli();
      if (st) {
        const k = Math.min(1, dt * 9);
        H.x += (st.x - H.x) * k;
        H.y += (st.y - H.y) * k;
        H.z += (st.z - H.z) * k;
        H.yaw += WR(st.yaw - H.yaw) * k;
        H.pit += (st.pit - H.pit) * k;
        H.rol += (st.rol - H.rol) * k;
        H.rpm += (st.rpm - H.rpm) * Math.min(1, dt * 3);
        H.gnd = st.gnd;
        H.vx = H.vz = H.vy = 0;
        if (st.w && !H.remoteBoom) {
          H.remoteBoom = !0;
          explode(H.x, H.y + 1.6, H.z, st.w === 2);
        } else if (!st.w) H.remoteBoom = !1;
      }
      placeHeli();
      return;
    }
    if (H.sc < 1) H.sc = Math.min(1, H.sc + dt * 1.6);
    if (H.wreck) {
      wreckTick(dt);
      return;
    }
    if (!HX.on && H.gnd && H.rpm <= 0 && !H.auto) {
      H.sc < 1 && placeHeli();
      if (HN.mine && !paxCount()) heliRelease(); // v219: pilot indi, motor durdu → kilit bırakılır, park yeri kaydedilir
      return;
    }
    const pil = HX.on;
    let fwd = 0,
      turn = 0,
      lift = 0,
      str = 0;
    if (pil) {
      const k = keys;
      fwd = (k.KeyW || k.ArrowUp || TC.f ? 1 : 0) - (k.KeyS || k.ArrowDown || TC.b ? 1 : 0);
      turn = (k.KeyA || k.ArrowLeft || TC.l ? 1 : 0) - (k.KeyD || k.ArrowRight || TC.r ? 1 : 0);
      lift = (k.Space || k.KeyR || TC.u ? 1 : 0) - (k.ShiftLeft || k.ShiftRight || k.KeyC || k.KeyV || TC.d ? 1 : 0);
      str = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
    } else if (H.auto) lift = -1;
    H.rpm = CL(H.rpm + (H.eng ? 0.42 : -0.28) * dt, 0, 1);
    const fly = H.rpm > 0.9;
    if (H.gnd) {
      const f = floorAt(H.x, H.z, H.y + 0.3);
      H.y += (f.y - H.y) * Math.min(1, dt * 10);
      H.vx *= Math.exp(-dt * 6);
      H.vz *= Math.exp(-dt * 6);
      H.vy = 0;
      H.yr += ((fly ? turn * 0.8 : 0) - H.yr) * Math.min(1, dt * 3);
      H.yaw += H.yr * dt;
      H.pit += (0 - H.pit) * Math.min(1, dt * 4);
      H.rol += (0 - H.rol) * Math.min(1, dt * 4);
      if (fly && lift > 0) {
        H.gnd = !1;
        H.vy = 2.5;
      }
    } else {
      H.yr += (turn * 1.35 - H.yr) * Math.min(1, dt * 3.5);
      H.yaw += H.yr * dt;
      const sx = Math.sin(H.yaw),
        sz = Math.cos(H.yaw),
        rx = -Math.cos(H.yaw),
        rz = Math.sin(H.yaw),
        SP = 34;
      const tx = (sx * fwd + rx * str * 0.55) * SP * (fly ? 1 : 0),
        tz = (sz * fwd + rz * str * 0.55) * SP * (fly ? 1 : 0),
        ak = Math.min(1, dt * (fwd || str ? 0.85 : 0.6));
      H.vx += (tx - H.vx) * ak;
      H.vz += (tz - H.vz) * ak;
      if (fly) {
        const ty = lift > 0 ? 8.5 : lift < 0 ? (H.auto ? -3 : -7) : 0;
        H.vy += (ty - H.vy) * Math.min(1, dt * 2.2);
      } else H.vy = Math.max(H.vy - 9.8 * dt * (1 - H.rpm * 0.7), -40);
      if (H.y > 240 && H.vy > 0) H.vy *= 0.9;
      let nx = H.x + H.vx * dt,
        nz = H.z + H.vz * dt,
        ny = H.y + H.vy * dt;
      const hs = Math.hypot(H.vx, H.vz);
      if (bodyHit(nx, nz, ny)) {
        if (hs > 9.5 || Math.abs(H.vy) > 9) {
          crash();
          return;
        }
        if (!bodyHit(H.x, H.z, ny)) {
          nx = H.x;
          nz = H.z;
        } else {
          nx = H.x;
          nz = H.z;
          ny = H.y;
        }
        H.vx *= -0.25;
        H.vz *= -0.25;
        SHK = Math.max(SHK, 0.3);
        thud(0.4);
      }
      const f = floorAt(nx, nz, Math.max(ny, H.y));
      if (ny <= f.y) {
        const imp = -H.vy;
        if (f.water) {
          crash(`water`);
          return;
        }
        if (imp > 8.5 || (hs > 15 && imp > 0.5)) {
          crash();
          return;
        }
        ny = f.y;
        H.vy = 0;
        if (lift <= 0 && hs < 7) {
          H.gnd = !0;
          H.auto = !1;
          if (imp > 3) SHK = Math.max(SHK, 0.25);
        } else {
          H.vx *= 0.7;
          H.vz *= 0.7;
        }
      }
      H.x = nx;
      H.z = nz;
      H.y = ny;
      const fs = H.vx * sx + H.vz * sz,
        ss = H.vx * rx + H.vz * rz;
      H.pit += (CL((fs / SP) * 0.3, -0.25, 0.32) - H.pit) * Math.min(1, dt * 3);
      H.rol += (CL(-H.yr * 0.22 + (ss / SP) * 0.3, -0.42, 0.42) - H.rol) * Math.min(1, dt * 3);
    }
    placeHeli();
  };
  const wreckTick = (dt) => {
    const W = H.wreck;
    W.t += dt;
    if (!W.done) {
      W.vy -= 22 * dt;
      H.x += W.vx * dt;
      H.z += W.vz * dt;
      H.y += W.vy * dt;
      H.yaw += W.spin * dt;
      W.spin *= Math.exp(-dt * 0.8);
      const f = floorAt(H.x, H.z, H.y + 2),
        ty = f.y - (W.water ? 2.4 : 0);
      if (H.y <= ty) {
        H.y = ty;
        W.done = !0;
        W.vx = W.vz = 0;
        if (!W.water) {
          SHK = Math.max(SHK, 0.35);
          dust(H.x, ty, H.z, 2);
        }
      }
    }
    H.rpm = Math.max(0, H.rpm - dt * 0.7);
    H.rol += (0.5 - H.rol) * Math.min(1, dt * 2);
    H.pit += (0.18 - H.pit) * Math.min(1, dt * 2);
    if (!W.water && W.t < 9) {
      W.fe = (W.fe || 0) - dt;
      if (W.fe <= 0) {
        W.fe = 0.07;
        fire(H.x + (Math.random() - 0.5) * 2.4, H.y + 1 + Math.random(), H.z + (Math.random() - 0.5) * 2.4, 1.6 + Math.random() * 1.6, 0.7);
      }
    }
    if (W.t < 11) {
      W.se = (W.se || 0) - dt;
      if (W.se <= 0) {
        W.se = W.water ? 0.25 : 0.11;
        smoke(H.x + (Math.random() - 0.5) * 2, H.y + (W.water ? 2.4 : 1.6), H.z + (Math.random() - 0.5) * 2, W.water ? `#dfe8ee` : null);
      }
    }
    if (W.t > 13) {
      respawn();
      toast(`🚁 Yeni helikopter piste indi`);
      if (HN.mine) heliRelease(!0);
    }
    placeHeli();
  };
  /* ---------- fx ---------- */
  const FX = [];
  const gt = (st) => {
    const c = document.createElement(`canvas`);
    c.width = c.height = 64;
    const g = c.getContext(`2d`),
      gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    st.forEach((s) => gr.addColorStop(s[0], s[1]));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  };
  const FT = gt([
      [0, `rgba(255,255,225,1)`],
      [0.22, `rgba(255,210,80,.95)`],
      [0.55, `rgba(255,96,20,.6)`],
      [1, `rgba(120,20,0,0)`],
    ]),
    ST = gt([
      [0, `rgba(255,255,255,.85)`],
      [0.55, `rgba(255,255,255,.4)`],
      [1, `rgba(255,255,255,0)`],
    ]);
  const spr = (tex, add, col) => {
    const m = new T.SpriteMaterial({
      map: tex,
      transparent: !0,
      depthWrite: !1,
      blending: add ? T.AdditiveBlending : T.NormalBlending,
      color: col || `#ffffff`,
    });
    const s = new T.Sprite(m);
    s.renderOrder = 6;
    scene.add(s);
    return s;
  };
  const fire = (x, y, z, s1, d) => {
    const s = spr(FT, !0);
    s.position.set(x, y, z);
    FX.push({ o: s, t: 0, d, s0: s1 * 0.4, s1, v: new V((Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.5), fade: 1 });
  };
  const smoke = (x, y, z, col) => {
    const s = spr(ST, !1, col || `#3b3836`);
    s.position.set(x, y, z);
    FX.push({
      o: s,
      t: 0,
      d: 4 + Math.random() * 2,
      s0: 1.2,
      s1: 7 + Math.random() * 4,
      v: new V((Math.random() - 0.5) * 0.8, 2.4 + Math.random() * 1.4, (Math.random() - 0.5) * 0.8),
      fade: 0.7,
    });
  };
  const dust = (x, y, z, k) => {
    for (let i = 0; i < 10; i++) {
      const s = spr(ST, !1, `#c8b89a`);
      const a = (i / 10) * Math.PI * 2;
      s.position.set(x, y + 0.25, z);
      FX.push({
        o: s,
        t: 0,
        d: 1.1 + Math.random() * 0.5,
        s0: 0.4 * k,
        s1: 2.2 * k,
        v: new V(Math.cos(a) * 3 * k, 0.6 + Math.random(), Math.sin(a) * 3 * k),
        fade: 0.55,
        drag: 3,
      });
    }
  };
  const splash = (x, y, z) => {
    for (let i = 0; i < 16; i++) {
      const s = spr(ST, !1, `#e9f6ff`);
      const a = Math.random() * Math.PI * 2,
        r = Math.random() * 3;
      s.position.set(x, y, z);
      FX.push({
        o: s,
        t: 0,
        d: 1 + Math.random() * 0.6,
        s0: 0.6,
        s1: 2.6,
        v: new V(Math.cos(a) * r, 5 + Math.random() * 5, Math.sin(a) * r),
        fade: 0.8,
        g: 14,
      });
    }
  };
  const debM = new T.MeshStandardMaterial({ color: `#1f1c1b`, roughness: 0.9, metalness: 0.3 });
  const explode = (x, y, z, water) => {
    if (water) {
      splash(x, y, z);
      for (let i = 0; i < 8; i++) smoke(x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 3, `#dfe8ee`);
    } else {
      for (let i = 0; i < 22; i++) {
        const s = spr(FT, !0),
          th = Math.random() * Math.PI * 2,
          ph = Math.random() * 1.3,
          sp = 4 + Math.random() * 9;
        s.position.set(x, y, z);
        FX.push({
          o: s,
          t: 0,
          d: 0.8 + Math.random() * 0.7,
          s0: 1.5,
          s1: 5 + Math.random() * 5,
          v: new V(Math.cos(th) * Math.sin(ph) * sp, Math.cos(ph) * sp * 0.8 + 1, Math.sin(th) * Math.sin(ph) * sp),
          fade: 1,
          drag: 2.2,
        });
      }
      for (let i = 0; i < 12; i++) smoke(x + (Math.random() - 0.5) * 3, y + Math.random() * 2, z + (Math.random() - 0.5) * 3);
      for (let i = 0; i < 14; i++) {
        const b = new T.Mesh(new T.BoxGeometry(0.2 + Math.random() * 0.5, 0.08 + Math.random() * 0.2, 0.2 + Math.random() * 0.6), debM);
        b.position.set(x, y, z);
        b.castShadow = !0;
        scene.add(b);
        const th = Math.random() * Math.PI * 2,
          sp = 5 + Math.random() * 9;
        FX.push({
          o: b,
          t: 0,
          d: 6,
          deb: !0,
          v: new V(Math.cos(th) * sp, 5 + Math.random() * 9, Math.sin(th) * sp),
          w: new V(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        });
      }
    }
    SHK = Math.max(SHK, 1);
    boom(water);
  };
  const fxTick = (dt) => {
    for (let i = FX.length - 1; i >= 0; i--) {
      const f = FX[i];
      f.t += dt;
      const k = f.t / f.d;
      if (k >= 1) {
        scene.remove(f.o);
        f.o.geometry && !f.o.isSprite && f.o.geometry.dispose();
        f.o.material && f.o.material !== debM && f.o.material.dispose?.();
        FX.splice(i, 1);
        continue;
      }
      if (f.light) {
        f.o.intensity = k < 0.08 ? (k / 0.08) * 90 : 90 * (1 - SM(0.08, 1, k));
        continue;
      }
      if (f.deb) {
        f.v.y -= 22 * dt;
        f.o.position.addScaledVector(f.v, dt);
        f.o.rotation.x += f.w.x * dt;
        f.o.rotation.y += f.w.y * dt;
        const gy = groundY(f.o.position.x, f.o.position.z);
        if (f.o.position.y < gy + 0.05) {
          f.o.position.y = gy + 0.05;
          f.v.multiplyScalar(0.35);
          f.v.y = Math.abs(f.v.y) * 0.4;
          f.w.multiplyScalar(0.5);
        }
        continue;
      }
      if (f.drag) f.v.multiplyScalar(Math.exp(-dt * f.drag));
      if (f.g) f.v.y -= f.g * dt;
      f.o.position.addScaledVector(f.v, dt);
      const sc = f.s0 + (f.s1 - f.s0) * Math.sqrt(k);
      f.o.scale.set(sc, sc, 1);
      f.o.material.opacity = f.fade * (1 - k) * (k < 0.1 ? k / 0.1 : 1);
    }
  };
  /* ---------- audio ---------- */
  let AC = null,
    AU = null;
  const actx = () => {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      AC.resume?.();
    } catch {
      AC = null;
    }
    return AC;
  };
  const noiseBuf = (s) => {
    const b = AC.createBuffer(1, AC.sampleRate * s, AC.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };
  const aStart = () => {
    if (AU || !actx()) return;
    try {
      const src = AC.createBufferSource();
      src.buffer = noiseBuf(2);
      src.loop = !0;
      const lp = AC.createBiquadFilter();
      lp.type = `lowpass`;
      lp.frequency.value = 360;
      const ch = AC.createGain();
      ch.gain.value = 0.5;
      const lfo = AC.createOscillator();
      lfo.frequency.value = 1;
      const lg = AC.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(ch.gain);
      const tu = AC.createOscillator();
      tu.type = `sawtooth`;
      tu.frequency.value = 200;
      const tl = AC.createBiquadFilter();
      tl.type = `lowpass`;
      tl.frequency.value = 1500;
      const tg = AC.createGain();
      tg.gain.value = 0.02;
      const mg = AC.createGain();
      mg.gain.value = 0;
      src.connect(lp).connect(ch).connect(mg);
      tu.connect(tl).connect(tg).connect(mg);
      mg.connect(AC.destination);
      src.start();
      lfo.start();
      tu.start();
      AU = { mg, lfo, tu };
    } catch {
      AU = null;
    }
  };
  const aTick = () => {
    if (!AU) return;
    const d = HX.on ? 0 : Math.hypot(H.x - camera.position.x, H.y - camera.position.y, H.z - camera.position.z),
      v = ((sound.muted ? 0 : 1) * H.rpm * 0.3) / (1 + d / 20),
      t = AC.currentTime;
    AU.mg.gain.setTargetAtTime(v, t, 0.08);
    AU.lfo.frequency.setTargetAtTime(2 + H.rpm * 15, t, 0.1);
    AU.tu.frequency.setTargetAtTime(160 + H.rpm * 720, t, 0.25);
  };
  const boom = (w) => {
    if (!AC || sound.muted) return;
    try {
      const s = AC.createBufferSource();
      s.buffer = noiseBuf(2.2);
      const lp = AC.createBiquadFilter();
      lp.type = `lowpass`;
      lp.frequency.setValueAtTime(w ? 1800 : 900, AC.currentTime);
      lp.frequency.exponentialRampToValueAtTime(80, AC.currentTime + 2);
      const g = AC.createGain();
      g.gain.setValueAtTime(1.1, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 2.1);
      s.connect(lp).connect(g).connect(AC.destination);
      s.start();
    } catch {}
  };
  const thud = (k) => {
    if (!AC || sound.muted) return;
    try {
      const o = AC.createOscillator(),
        g = AC.createGain(),
        t = AC.currentTime;
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
      g.gain.setValueAtTime(0.55 * k, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(AC.destination);
      o.start();
      o.stop(t + 0.32);
    } catch {}
  };
  /* ---------- UI ---------- */
  try {
    CT.querySelectorAll(`.nx-b,.nx-hud,.nx-pad,.nx-toast`).forEach((n) => n.remove());
    document.getElementById(`nx-css`)?.remove();
  } catch {}
  const css = document.createElement(`style`);
  css.id = `nx-css`;
  css.textContent = `.nx-b{position:absolute;z-index:80;pointer-events:auto;user-select:none;-webkit-user-select:none;touch-action:none;font:700 14px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#ffe9a8;background:rgba(8,10,18,.84);border:1.5px solid rgba(255,210,63,.65);border-radius:999px;padding:10px 18px;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.45)}
.nx-b:active{transform:scale(.96)}.nx-board{left:50%;bottom:150px;translate:-50% 0;font-size:15px;padding:12px 22px}.nx-hide{display:none!important}
.nx-hud{position:absolute;z-index:80;top:104px;left:50%;translate:-50% 0;pointer-events:none;text-align:center;font:600 12.5px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#dff9ff;background:rgba(8,10,18,.72);border:1px solid rgba(25,232,255,.35);border-radius:12px;padding:7px 14px;white-space:nowrap}
.nx-hud b{color:#ffe9a8}.nx-hud small{display:block;opacity:.75;font-weight:500;margin-top:3px}
.nx-pad{position:absolute;z-index:80;bottom:112px;display:grid;gap:6px;pointer-events:none}.nx-pad .nx-b{position:static;width:54px;height:54px;padding:0;font-size:20px;display:flex;align-items:center;justify-content:center;border-radius:14px}
.nx-pl{left:84px;grid-template-columns:repeat(3,54px)}.nx-pr{right:84px;grid-template-columns:72px}.nx-pr .nx-b{width:72px;font-size:12px;flex-direction:column;line-height:1.1}
.nx-exit{right:14px;top:200px}.nx-toast{position:absolute;z-index:85;top:150px;left:50%;translate:-50% 0;pointer-events:none;font:800 18px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.7);background:rgba(200,20,30,.0);opacity:0;transition:opacity .35s}.nx-toast.on{opacity:1}`;
  document.head.appendChild(css);
  const el = (t, c, x) => {
    const d = document.createElement(t);
    c && (d.className = c);
    x != null && (d.textContent = x);
    return d;
  };
  const stop = (ev) => {
    ev.stopPropagation();
  };
  const bBtn = el(`button`, `nx-b nx-board nx-hide`, `🚁 Helikoptere bin · F`);
  bBtn.addEventListener(`pointerdown`, stop);
  bBtn.addEventListener(`click`, (ev) => {
    ev.stopPropagation();
    HX.board();
  });
  CT.appendChild(bBtn);
  const hud = el(`div`, `nx-hud nx-hide`);
  CT.appendChild(hud);
  const xBtn = el(`button`, `nx-b nx-exit nx-hide`, `🚪 İn · F`);
  xBtn.addEventListener(`pointerdown`, stop);
  xBtn.addEventListener(`click`, (ev) => {
    ev.stopPropagation();
    PAX.on ? paxExit() : HX.exit();
  });
  CT.appendChild(xBtn);
  const mk = (par, k, txt) => {
    const b = el(`button`, `nx-b`);
    b.innerHTML = txt;
    const on = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        TC[k] = 1;
        try {
          b.setPointerCapture(ev.pointerId);
        } catch {}
      },
      off = (ev) => {
        ev.stopPropagation();
        TC[k] = 0;
      };
    b.addEventListener(`pointerdown`, on);
    [`pointerup`, `pointercancel`, `lostpointercapture`].forEach((n) => b.addEventListener(n, off));
    b.addEventListener(`contextmenu`, (ev) => ev.preventDefault());
    par.appendChild(b);
    return b;
  };
  const pl = el(`div`, `nx-pad nx-pl nx-hide`),
    pr = el(`div`, `nx-pad nx-pr nx-hide`);
  const sp = () => {
    const s = el(`span`);
    pl.appendChild(s);
  };
  sp();
  mk(pl, `f`, `▲`);
  sp();
  mk(pl, `l`, `◀`);
  mk(pl, `b`, `▼`);
  mk(pl, `r`, `▶`);
  mk(pr, `u`, `⤒<br>YÜKSEL`);
  mk(pr, `d`, `⤓<br>ALÇAL`);
  CT.appendChild(pl);
  CT.appendChild(pr);
  const skL = el(`div`, `nx-pad nx-pl nx-sk nx-hide`),
    skR = el(`div`, `nx-pad nx-pr nx-sk nx-hide`);
  {
    const s2 = () => skL.appendChild(el(`span`));
    s2();
    mk(skL, `f`, `▲`);
    s2();
    mk(skL, `l`, `◀`);
    mk(skL, `b`, `▼`);
    mk(skL, `r`, `▶`);
    mk(skR, `u`, `🛹<br>ZIPLA`);
    mk(skR, `d`, `🌀<br>FLIP`);
  }
  CT.appendChild(skL);
  CT.appendChild(skR);
  const toastEl = el(`div`, `nx-toast`);
  CT.appendChild(toastEl);
  let tT = 0;
  const toast = (m) => {
    toastEl.textContent = m;
    toastEl.classList.add(`on`);
    clearTimeout(tT);
    tT = setTimeout(() => toastEl.classList.remove(`on`), 2600);
  };
  const show = (n, v) => n.classList.toggle(`nx-hide`, !v);
  const ui = () => {
    show(hud, HX.on);
    show(xBtn, HX.on || PAX.on);
    show(pl, HX.on);
    show(pr, HX.on);
    const other = HN.node?.by && HN.node.by !== ctx.uid;
    bBtn.textContent = other ? (H.gnd ? `🚁 Yolcu ol · F` : `🚁 Helikopter havada`) : `🚁 Helikoptere bin · F`;
    show(bBtn, !HX.on && !PAX.on && HX.near && (!other || H.gnd));
  };
  let hudT = 0;
  const hudTick = (dt) => {
    if (!HX.on) return;
    hudT -= dt;
    if (hudT > 0) return;
    hudT = 0.12;
    const f = floorAt(H.x, H.z, H.y),
      alt = Math.max(0, H.y - f.y),
      kmh = Math.round(Math.hypot(H.vx, H.vz) * 3.6),
      st = H.rpm < 0.9 ? `Rotor ısınıyor %${Math.round((H.rpm / 0.9) * 100)}` : H.gnd ? `Kalkışa hazır · Space` : `Uçuşta`;
    const coarse = matchMedia(`(pointer: coarse)`).matches;
    hud.innerHTML = `🚁 <b>TC-NEON</b> · İrtifa <b>${alt.toFixed(0)} m</b> · Hız <b>${kmh} km/s</b> · ${st} · 👥 ${1 + paxCount()}/4<small>${coarse ? `Sol pad: ileri/geri/dön · Sağ: yüksel/alçal` : `W/S ileri-geri · A/D dön · Space yüksel · Shift/C alçal · Q/E yanlama · F in`}</small>`;
  };
  /* ---------- board / exit / crash ---------- */
  HX.board = async () => {
    if (HX.on || HX.busy || PAX.on || H.wreck || ctx.driving() || self.ride || self.seat || RF.fall || RF.down) return;
    if (ctx.guest) {
      toast(`🚁 Helikopter için giriş yapmalısın`);
      return;
    }
    const nd = HN.node;
    if (nd?.by && nd.by !== ctx.uid) {
      // pilot var → yolcu ol
      paxBoard();
      return;
    }
    HX.busy = !0;
    const ok = await heliClaim();
    HX.busy = !1;
    if (!ok) {
      toast(`🚁 Helikopteri şu an başkası kullanıyor`);
      return;
    }
    if (HX.on || H.wreck || ctx.driving() || self.ride || self.seat || RF.fall || RF.down) {
      heliRelease();
      return;
    }
    HX.on = !0;
    H.eng = !0;
    H.auto = !1;
    RF.roof = null;
    self.target = null;
    self.path = null;
    ring.visible = !1;
    me.setForcePose(null);
    HX.orb = 0;
    HX.lcy = self.camYaw;
    HX.cp = null;
    self.camPitch = Math.max(self.camPitch, 0.3);
    try {
      document.activeElement?.blur?.();
    } catch {}
    aStart();
    pilotSync();
    ctx.snap();
    ui();
    toast(`🚁 Motor çalışıyor…`);
  };
  HX.exit = () => {
    if (!HX.on) return;
    const fl = floorAt(H.x, H.z, H.y),
      air = !H.gnd && H.y - fl.y > 1.2,
      sx = Math.cos(H.yaw),
      sz = -Math.sin(H.yaw);
    HX.on = !1;
    me.inCar = !1;
    me.sitting = !1;
    me.seatY = null;
    let px = H.x + sx * 3.3,
      pz = H.z + sz * 3.3;
    if (air) {
      self.x = px;
      self.z = pz;
      me.x = px;
      me.z = pz;
      me.y = H.y + 0.4;
      RF.vx = H.vx;
      RF.vz = H.vz;
      startFall(Math.min(H.vy, 2));
      H.auto = !0;
      toast(`🪂 Helikopterden atladın!`);
    } else {
      H.eng = !1;
      H.auto = !1;
      const hr = roofAt(H.x, H.z, H.y + 0.8, 0.3);
      if (hr && Math.abs(hr.top - H.y) < 1) {
        const ok = (x, z) => inR(hr, x, z, 0.35);
        if (!ok(px, pz)) {
          px = H.x - sx * 3.3;
          pz = H.z - sz * 3.3;
        }
        if (!ok(px, pz)) {
          px = H.x + Math.sin(H.yaw) * 4;
          pz = H.z + Math.cos(H.yaw) * 4;
        }
        if (!ok(px, pz)) {
          px = H.x - Math.sin(H.yaw) * 4.5;
          pz = H.z - Math.cos(H.yaw) * 4.5;
        }
        RF.roof = hr;
        me.y = hr.top;
      } else {
        let ok = !blockedAt(px, pz);
        if (!ok) {
          px = H.x - sx * 3.3;
          pz = H.z - sz * 3.3;
          ok = !blockedAt(px, pz);
        }
        if (!ok) {
          const k = freeNear(px, pz);
          k && ((px = k.x), (pz = k.z));
        }
        me.y = groundY(px, pz, -1, H.y);
      }
      self.x = px;
      self.z = pz;
      me.x = px;
      me.z = pz;
    }
    self.camYaw = H.yaw + Math.PI * 0.85;
    self.target = null;
    self.path = null;
    RF.px = self.x;
    RF.pz = self.z;
    camPos.copy(camera.position);
    ctx.snap();
    ui();
  };
  const crash = (why) => {
    const w = why === `water`,
      px = H.x,
      py = H.y,
      pz = H.z;
    explode(px, py + 1.6, pz, w);
    if (HX.on) {
      HX.on = !1;
      me.inCar = !1;
      me.sitting = !1;
      me.seatY = null;
      self.x = px;
      self.z = pz;
      me.x = px;
      me.z = pz;
      me.y = py + 1.2;
      RF.vx = H.vx * 0.45 + (Math.random() - 0.5) * 6;
      RF.vz = H.vz * 0.45 + (Math.random() - 0.5) * 6;
      startFall(w ? 1 : 7.5, !w);
      self.camYaw = H.yaw + Math.PI * 0.85;
      camPos.copy(camera.position);
      ctx.snap();
    }
    H.eng = !1;
    H.auto = !1;
    H.gnd = !1;
    H.wreck = { t: 0, vy: Math.min(H.vy, 0) + (w ? 0 : 4), vx: H.vx * 0.3, vz: H.vz * 0.3, water: w, spin: (Math.random() - 0.5) * 2.5 };
    char(!w);
    toast(w ? `💥 Helikopter suya çakıldı!` : `💥 Helikopter çarptı ve patladı!`);
    ui();
  };
  HX.cam = (dt) => {
    if (!HX.on) return !1;
    const dy = WR(self.camYaw - HX.lcy);
    HX.lcy = self.camYaw;
    if (Math.abs(dy) > 1e-4) {
      HX.orb += dy;
      HX.ot = NOW();
    } else if (NOW() - HX.ot > 2200) HX.orb *= Math.exp(-dt * 1.3);
    const yw = H.yaw + Math.PI + HX.orb,
      pt = CL(0.12 + self.camPitch * 0.55, 0.04, 1.15),
      dist = 15 + CL((self.camDist - 1.8) / 14.2, 0, 1) * 30,
      tx = H.x,
      ty = H.y + 2.8,
      tz = H.z;
    let cx = tx + Math.sin(yw) * Math.cos(pt) * dist,
      cy = ty + Math.sin(pt) * dist,
      cz = tz + Math.cos(yw) * Math.cos(pt) * dist;
    const o = new V(tx, ty, tz),
      d = new V(cx - tx, cy - ty, cz - tz),
      L = d.length();
    d.normalize();
    camRay.set(o, d);
    camRay.far = L;
    const hit = camRay.intersectObjects(blockers, !1);
    if (hit.length) {
      const q = Math.max(5, hit[0].distance - 0.8);
      cx = tx + d.x * q;
      cy = ty + d.y * q;
      cz = tz + d.z * q;
    }
    const gy = groundY(cx, cz) + 1.2;
    if (cy < gy) cy = gy;
    const tgt = new V(cx, cy, cz);
    if (ctx.isFirst() || !HX.cp) HX.cp = tgt;
    else HX.cp.lerp(tgt, 1 - Math.exp(-dt * 6));
    camera.position.copy(HX.cp);
    camera.lookAt(tx + Math.sin(H.yaw) * 3, ty + 0.3, tz + Math.cos(H.yaw) * 3);
    const fv = 62 + CL(Math.hypot(H.vx, H.vz) / 34, 0, 1) * 10;
    if (Math.abs(camera.fov - fv) > 0.05) {
      camera.fov += (fv - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
    camPos.copy(camera.position);
    return !0;
  };
  /* ---------- hooks ---------- */
  const NX_mv = (dt) => {
    try {
      heliTick(dt);
      fxTick(dt);
      aTick();
      hudTick(dt);
      try {
        ballsTick(dt);
        try {
          const C = pistClinic_();
          if (C) {
            const ins = Math.abs(self.x - C.x) < C.W / 2 - 0.1 && Math.abs(self.z - C.z) < C.D / 2 - 0.1;
            if (ins !== C.ins) {
              C.ins = ins;
              C.roof.forEach((m) => (m.visible = !ins));
              C.mat.transparent = ins;
              C.mat.opacity = ins ? 0.18 : 1;
              C.mat.depthWrite = !ins;
              C.mat.needsUpdate = !0;
            }
          }
        } catch {}
        actTick();
        skRentTick();
      } catch (err) {
        console.warn(`[park]`, err);
      }
      heliNet(dt);
      const nr2 =
        !HX.on &&
        !PAX.on &&
        !H.wreck &&
        H.sc >= 1 &&
        !ctx.driving() &&
        !self.ride &&
        !self.seat &&
        !RF.fall &&
        !RF.down &&
        !ctx.venue() &&
        Math.hypot(self.x - H.x, self.z - H.z) < 7.5 &&
        Math.abs(me.y - H.y) < 2.5;
      if (nr2 !== HX.near) {
        HX.near = nr2;
        ui();
      }
    } catch (err) {
      console.warn(`[heli]`, err);
    }
    if (HX.on) {
      pilotSync();
      return !0;
    }
    if (paxTick()) return !0;
    if (SK.on) {
      const r = skStep(dt);
      return r ?? !0;
    }
    if (RF.fall) return fallStep(dt);
    if (RF.down) {
      RF.down.t += dt;
      if (RF.down.t >= RF.down.dur) RF.down = null;
      me.moving = !1;
      return !0;
    }
    return !1;
  };
  const NX_cam = (dt) => HX.cam(dt);
  const NX_post = (dt) => {
    const pv = me.pivot;
    if (!pv) return;
    skPost();
    const M3 = me.m3 && me.m3.root.visible ? me.m3 : null;
    if (M3) {
      const r = M3.root;
      if (RF.fall) {
        r.rotation.z = Math.sin(RF.fall.t * 9) * 0.3;
        M3.arms.forEach((q) => {
          q.sh.rotation.x = -2.7 + Math.sin(RF.fall.t * 14 + q.sx) * 0.35;
          q.el.rotation.x = -0.2;
        });
        M3.legs.forEach((q, i) => {
          q.hip.rotation.x = Math.sin(RF.fall.t * 11 + i * 3) * 0.5;
        });
      } else if (RF.down) {
        const d = RF.down,
          t = d.t,
          k = t < 0.22 ? SM(0, 0.22, t) : t > d.dur - 0.45 ? 1 - SM(d.dur - 0.45, d.dur, t) : 1;
        r.rotation.order = `YXZ`;
        r.rotation.x = -1.5 * k;
        r.position.y += 0.18 * k;
      }
    }
    if (HX.on && me.plane) {
      me.plane.scale.x *= 1.3;
      me.plane.scale.y *= 1.3;
      me.plane.position.y += 0.18;
    }
    if (RF.fall) pv.rotation.z = Math.sin(RF.fall.t * 9) * 0.35;
    else if (RF.down) {
      const d = RF.down,
        t = d.t,
        k = t < 0.22 ? SM(0, 0.22, t) : t > d.dur - 0.45 ? 1 - SM(d.dur - 0.45, d.dur, t) : 1;
      pv.rotation.z = d.side * 1.45 * k;
      pv.position.y += 0.42 * k;
    }
  };
  const NX_after = (dt) => {
    if (SHK > 0.002) {
      camera.position.x += (Math.random() - 0.5) * SHK * 0.6;
      camera.position.y += (Math.random() - 0.5) * SHK * 0.6;
      camera.position.z += (Math.random() - 0.5) * SHK * 0.6;
      SHK *= Math.exp(-dt * 4.5);
    }
  };
  const NX_busy = () => SK.on || HX.on || !!RF.fall || !!RF.down;
  const NX_noVenue = () => HX.on || !!RF.roof || !!RF.fall;
  const NX_reset = () => {
    SK.on = !1;
    board.visible = !1;
    BB.held = !1;
    if (HX.on) {
      HX.on = !1;
      me.inCar = !1;
      me.sitting = !1;
      me.seatY = null;
      H.eng = !1;
      H.auto = !H.gnd;
    }
    RF.fall = null;
    RF.down = null;
    RF.roof = null;
    me.setForcePose(null);
    ui();
  };
  const onKey = (ev) => {
    const t = ev.target;
    if (t && (t.tagName === `INPUT` || t.tagName === `TEXTAREA` || t.isContentEditable)) return;
    if (ev.code === `KeyF` && !ev.repeat) {
      if (HX.on) HX.exit();
      else if (PAX.on) paxExit();
      else if (HX.near) HX.board();
    }
    if (HX.on && (ev.code === `Space` || ev.code.startsWith(`Arrow`))) ev.preventDefault();
  };
  window.addEventListener(`keydown`, onKey);
  KEYH.push([`keydown`, onKey]);
  /* ---------- PARK: ramps ---------- */
  const pkH = (x, z) => {
    const lx = x + 80,
      lz = z - 80;
    if (lx < 10.6 || lx > 30 || lz < -10.45 || lz > 10.45) return null;
    let h = 0;
    const R = 3.2;
    if (lx >= 11 && lx <= 29) {
      if (lz <= -7 && lz >= -9.8) {
        const d = -7 - lz;
        h = R - Math.sqrt(R * R - d * d);
      } else if (lz < -9.8) h = 1.65;
      if (lz >= 7 && lz <= 9.8) {
        const d = lz - 7;
        h = R - Math.sqrt(R * R - d * d);
      } else if (lz > 9.8) h = 1.65;
    }
    if (lz >= -2.5 && lz <= 2.5) {
      if (lx >= 16 && lx <= 18) h = Math.max(h, (lx - 16) * 0.3);
      else if (lx > 18 && lx < 22) h = Math.max(h, 0.6);
      else if (lx >= 22 && lx <= 24) h = Math.max(h, (24 - lx) * 0.3);
    }
    if (lz >= -5 && lz <= -2 && lx >= 25.5 && lx <= 27.5) h = Math.max(h, (lx - 25.5) * 0.375);
    return h;
  };
  const PKY = 0.13,
    pkG = (x, z, y) => {
      const h = pkH(x, z);
      if (h == null || h < 0.002) return null;
      const g = PKY + h;
      return Math.abs(g - y) < 1.4 ? g : null;
    };
  const gH = (x, z) => {
    const h = pkH(x, z);
    return h != null ? PKY + h : groundY(x, z);
  };
  /* ---------- balls ---------- */
  const mkBall = (tex, r) => {
    const m = new T.Mesh(new T.SphereGeometry(r, 24, 16), new T.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    m.castShadow = !0;
    scene.add(m);
    return m;
  };
  const FB = { x: -100.5, z: 80, y: 0.24, vx: 0, vy: 0, vz: 0, r: 0.11, m: mkBall(ballTex(`f`), 0.11), home: [-100.5, 80], cd: 0, goalT: 0 },
    FBB = { x0: -109.75, x1: -91.25, z0: 72.95, z1: 87.05 };
  const BB = { x: -80, z: 80, y: 0.25, vx: 0, vy: 0, vz: 0, r: 0.12, m: mkBall(ballTex(`b`), 0.12), held: !1, fly: null, home: [-80, 80], cd: 0 },
    BBB = { x0: -88.55, x1: -71.45, z0: 72.45, z1: 87.55 };
  const ballPhys = (b, B, dt, goal) => {
    b.vy -= 9.8 * dt;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.y += b.vy * dt;
    const gy = PKY + b.r;
    if (b.y < gy) {
      b.y = gy;
      if (b.vy < -1.2) {
        b.vy = -b.vy * 0.55;
      } else b.vy = 0;
      const f = Math.exp(-dt * (b === FB ? 0.9 : 1.4));
      b.vx *= f;
      b.vz *= f;
    }
    if (goal && goal(b)) return;
    if (b.x < B.x0 + b.r) {
      b.x = B.x0 + b.r;
      b.vx = Math.abs(b.vx) * 0.55;
    }
    if (b.x > B.x1 - b.r) {
      b.x = B.x1 - b.r;
      b.vx = -Math.abs(b.vx) * 0.55;
    }
    if (b.z < B.z0 + b.r) {
      b.z = B.z0 + b.r;
      b.vz = Math.abs(b.vz) * 0.55;
    }
    if (b.z > B.z1 - b.r) {
      b.z = B.z1 - b.r;
      b.vz = -Math.abs(b.vz) * 0.55;
    }
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.01) {
      b.m.rotation.x += (b.vz / b.r) * dt;
      b.m.rotation.z -= (b.vx / b.r) * dt;
    }
    b.m.position.set(b.x, b.y, b.z);
  };
  const fbGoal = (b) => {
    if (FB.goalT > 0) return !1;
    const inMouth = b.z > 78.45 && b.z < 81.55 && b.y < 2.05;
    if (inMouth && (b.x < -109.5 || b.x > -91.5)) {
      FB.goalT = 2.2;
      b.vx *= 0.15;
      b.vz *= 0.15;
      toast(`⚽ GOOOL!`);
      thud(0.5);
      return !1;
    }
    return !1;
  };
  let PVX = 0,
    PVZ = 0,
    PPX = self.x,
    PPZ = self.z;
  // ---------- v219: topların eşitlenmesi (sadece parkın yakınındakiler dinler) ----------
  const BN = { unsub: null, sendT: { f: 0, b: 0 }, moving: { f: !1, b: !1 } };
  const ballOf = (k) => (k === `f` ? FB : BB);
  const r2 = (v) => Math.round(v * 100) / 100;
  const ballSend = (k, extra = {}) => {
    if (ctx.guest) return;
    const b = ballOf(k);
    BN.sendT[k] = NOW();
    BN.moving[k] = !0;
    NET.set(`city/ball/${k}`, { x: r2(b.x), y: r2(b.y), z: r2(b.z), vx: r2(b.vx), vy: r2(b.vy), vz: r2(b.vz), by: ctx.uid, t: NET.TS(), ...extra });
  };
  const ballRecv = (k, v) => {
    if (!v || v.by === ctx.uid || !Number.isFinite(v.x)) return;
    const b = ballOf(k);
    const lag = CL((NET.now() - (Number(v.t) || NET.now())) / 1000, 0, 1.5);
    if (k === `b`) {
      BB.remoteHold = v.h && v.h !== ctx.uid ? v.h : null;
      if (BB.remoteHold) BB.held = !1;
      if (v.fl) {
        const f = String(v.fl).split(`,`).map(Number);
        if (f.length >= 11 && f.every(Number.isFinite)) {
          BB.held = !1;
          BB.remoteHold = null;
          BB.fly = { t: lag, T: f[0], x0: f[1], y0: f[2], z0: f[3], x1: f[4], z1: f[5], y1: f[6], apex: f[7], make: f[8] === 1, pts: f[9], ra: f[10] };
          return;
        }
      }
      BB.fly = null;
    }
    Object.assign(b, { x: v.x, y: v.y, z: v.z, vx: v.vx || 0, vy: v.vy || 0, vz: v.vz || 0 });
    // gecikme kadar ileri sar (top herkeste aynı yerde dursun)
    const B = k === `f` ? FBB : BBB;
    for (let tt = lag; tt > 0.0001; tt -= 0.05) ballPhys(b, B, Math.min(0.05, tt), k === `f` ? fbGoal : null);
    b.m.position.set(b.x, b.y, b.z);
  };
  const ballNet = () => {
    const far = Math.hypot(self.x + 80, self.z - 80);
    if (!BN.unsub && far < 90) {
      BN.unsub = [NET.sub(`city/ball/f`, (v) => ballRecv(`f`, v)), NET.sub(`city/ball/b`, (v) => ballRecv(`b`, v))];
    } else if (BN.unsub && far > 130) {
      BN.unsub.forEach((u) => u && u());
      BN.unsub = null;
    }
    // vurduğum top durunca son konumu bir kez yaz
    for (const k of [`f`, `b`]) {
      const b = ballOf(k);
      if (BN.moving[k] && Math.hypot(b.vx, b.vz) < 0.05 && Math.abs(b.vy) < 0.05 && !(k === `b` && (BB.fly || BB.held)) && NOW() - BN.sendT[k] > 400) {
        BN.moving[k] = !1;
        ballSend(k);
        BN.moving[k] = !1;
      }
    }
  };
  const ballsTick = (dt) => {
    const pvx = (self.x - PPX) / Math.max(dt, 1e-3),
      pvz = (self.z - PPZ) / Math.max(dt, 1e-3);
    PPX = self.x;
    PPZ = self.z;
    if (Math.hypot(pvx, pvz) < 20) {
      PVX = PVX * 0.6 + pvx * 0.4;
      PVZ = PVZ * 0.6 + pvz * 0.4;
    }
    ballNet();
    const near = Math.abs(self.x + 80) < 40 && Math.abs(self.z - 80) < 20;
    if (!near && !BB.held) return;
    FB.cd -= dt;
    if (FB.goalT > 0) {
      FB.goalT -= dt;
      if (FB.goalT <= 0) {
        Object.assign(FB, { x: FB.home[0], z: FB.home[1], y: 0.6, vx: 0, vy: 0, vz: 0 });
      }
    }
    const d = Math.hypot(self.x - FB.x, self.z - FB.z),
      ps = Math.hypot(PVX, PVZ);
    if (d < 0.62 && ps > 0.5 && FB.cd <= 0 && Math.abs(me.y - FB.y) < 1.2) {
      const k = ps > 4.5 ? 1.95 : 1.45,
        dx = PVX / ps,
        dz = PVZ / ps;
      FB.vx = dx * ps * k + PVX * 0.2;
      FB.vz = dz * ps * k + PVZ * 0.2;
      FB.vy = ps > 4.5 ? 3.2 : 1.2;
      FB.cd = 0.35;
      FB.x = self.x + dx * 0.65;
      FB.z = self.z + dz * 0.65;
      thud(0.15);
      ballSend(`f`);
    }
    ballPhys(FB, FBB, dt, fbGoal);
    BB.cd -= dt;
    if (BB.held) {
      const M3 = me.m3 && me.m3.root.visible ? me.m3 : null;
      let hx, hy, hz;
      if (M3) {
        M3.root.updateMatrixWorld(!0);
        const p = M3.hand.getWorldPosition(new V());
        hx = p.x;
        hy = p.y;
        hz = p.z;
      } else {
        hx = self.x;
        hy = me.y + 1.1;
        hz = self.z;
      }
      const t = NOW() / 1e3,
        mv = ps > 0.4;
      BB.x = hx + (mv ? Math.sin(self.camYaw) * -0.1 : 0);
      BB.z = hz;
      BB.y = mv ? PKY + BB.r + Math.abs(Math.sin(t * 7)) * (hy - PKY - 0.1) : hy;
      BB.m.position.set(BB.x, BB.y, BB.z);
      BB.m.rotation.x += dt * 4;
      if (Math.abs(self.x + 80) > 9.2 || Math.abs(self.z - 80) > 8.2) {
        BB.held = !1;
        toast(`🏀 Top sahada kaldı`);
        BB.x = CL(self.x, BBB.x0 + 0.3, BBB.x1 - 0.3);
        BB.z = CL(self.z, BBB.z0 + 0.3, BBB.z1 - 0.3);
        BB.vx = BB.vz = 0;
        ballSend(`b`, { h: `` });
      }
    } else if (BB.remoteHold) {
      // v219: topu başka oyuncu sürüyor — onun elinde göster
      const f = ctx.figOf(BB.remoteHold);
      if (!f || Math.abs(f.x + 80) > 10 || Math.abs(f.z - 80) > 9) BB.remoteHold = null;
      else {
        const t = NOW() / 1e3;
        BB.x = f.x;
        BB.z = f.z;
        BB.y = PKY + BB.r + Math.abs(Math.sin(t * 7)) * 0.9;
        BB.m.position.set(BB.x, BB.y, BB.z);
      }
    } else if (BB.fly) {
      const F = BB.fly;
      F.t += dt;
      const k = Math.min(1, F.t / F.T);
      BB.x = F.x0 + (F.x1 - F.x0) * k;
      BB.z = F.z0 + (F.z1 - F.z0) * k;
      BB.y = F.y0 + (F.y1 - F.y0) * k + F.apex * 4 * k * (1 - k);
      BB.m.position.set(BB.x, BB.y, BB.z);
      BB.m.rotation.z -= dt * 8;
      if (k >= 1) {
        BB.fly = null;
        if (F.make) {
          BB.vx = 0;
          BB.vz = 0;
          BB.vy = -2;
          toast(F.pts === 3 ? `🏀 ÜÇLÜK! +3` : `🏀 Basket! +2`);
          thud(0.2);
        } else {
          const a = F.ra ?? Math.random() * Math.PI * 2; // v219: dönüş yönü şutu atanla aynı
          BB.vx = Math.cos(a) * 2.5;
          BB.vz = Math.sin(a) * 2.5;
          BB.vy = 2.4;
          toast(`🏀 Çemberden döndü!`);
        }
      }
    } else ballPhys(BB, BBB, dt);
  };
  const bbShoot = () => {
    if (!BB.held) return;
    const hoops = [
        [-86.9, 80],
        [-73.1, 80],
      ],
      hp = hoops.sort((a, b) => Math.hypot(a[0] - self.x, a[1] - self.z) - Math.hypot(b[0] - self.x, b[1] - self.z))[0],
      d = Math.hypot(hp[0] - self.x, hp[1] - self.z),
      pr = CL(1.02 - d * 0.075, 0.15, 0.93),
      make = Math.random() < pr,
      off = make ? 0 : 0.35 + Math.random() * 0.3,
      oa = Math.random() * Math.PI * 2;
    BB.held = !1;
    BB.fly = {
      t: 0,
      T: 0.55 + d * 0.07,
      x0: BB.x,
      y0: BB.y,
      z0: BB.z,
      x1: hp[0] + Math.cos(oa) * off,
      z1: hp[1] + Math.sin(oa) * off,
      y1: PKY + 3.05 + (make ? 0.02 : 0.12),
      apex: 1.4 + d * 0.12,
      make,
      pts: d > 6.6 ? 3 : 2,
      ra: Math.random() * Math.PI * 2,
    };
    me.playEmote && me.playEmote(`zipla`);
    BB.cd = 0.6;
    const F = BB.fly;
    ballSend(`b`, { h: ``, fl: [F.T, F.x0, F.y0, F.z0, F.x1, F.z1, F.y1, F.apex, F.make ? 1 : 0, F.pts, F.ra].map((v) => Math.round(v * 1000) / 1000).join(`,`) });
  };
  /* ---------- skateboard ---------- */
  const SK = {
    rent: !1,
    on: !1,
    sp: 0,
    yaw: 0,
    y: 0,
    air: !1,
    vy: 0,
    spin: 0,
    flip: 0,
    ayaw: 0,
    qp: !1,
    pvy: 0,
    pt: 0,
    lastJ: !1,
    lastE: !1,
    score: 0,
    camT: 0,
  };
  const board = (() => {
    const g = new T.Group(),
      dm = new T.MeshStandardMaterial({ color: `#1b1d22`, roughness: 0.6 }),
      gm = new T.MeshStandardMaterial({ color: `#7a2ad0`, roughness: 0.5 }),
      wm = new T.MeshStandardMaterial({ color: `#f4f4f2`, roughness: 0.4 }),
      tm = new T.MeshStandardMaterial({ color: `#c0c4cc`, metalness: 0.8, roughness: 0.3 });
    const deck = new T.Mesh(new T.BoxGeometry(0.24, 0.03, 0.86), dm);
    deck.position.y = 0.1;
    g.add(deck);
    const art = new T.Mesh(new T.BoxGeometry(0.245, 0.032, 0.6), gm);
    art.position.y = 0.095;
    g.add(art);
    for (const z of [-0.3, 0.3]) {
      const tr = new T.Mesh(new T.BoxGeometry(0.2, 0.03, 0.05), tm);
      tr.position.set(0, 0.07, z);
      g.add(tr);
      for (const x of [-0.11, 0.11]) {
        const w = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.04, 12), wm);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.035, z);
        g.add(w);
      }
    }
    g.traverse((o) => {
      o.castShadow = !0;
    });
    g.visible = !1;
    scene.add(g);
    return g;
  })();
  const skLegs = () => {
    try {
      me.m3 &&
        me.m3.legs.forEach((l) => {
          l.hip.rotation.z = 0;
        });
    } catch {}
  };
  const skBail = (why) => {
    SK.on = !1;
    skLegs();
    SK.air = !1;
    board.visible = !1;
    RF.vx = Math.sin(SK.yaw) * SK.sp * 0.6;
    RF.vz = Math.cos(SK.yaw) * SK.sp * 0.6;
    SK.sp = 0;
    startFall(1.5, !0);
    toast(why || `🛹 Düştün! Kaykay elinden kaçtı`);
  };
  // v219: kaykay sahibi mi / kiralık süresi var mı (CityScreen kullanıcı belgesinden verir)
  const skHas = () => Boolean(ctx.skate?.()?.owned) || (ctx.skate?.()?.until || 0) > NET.now();
  const skRentTick = () => {
    if (!SK.on) return;
    const st = ctx.skate?.() || {};
    if (st.owned || SK.busy) return;
    // binili kiralıkta süre bitmek üzere → bir dakika daha (bisiklet gibi)
    if ((st.until || 0) - NET.now() < 8000) {
      SK.busy = !0;
      ctx
        .cityAction({ op: `skateRent` })
        .then((r) => r?.until && ctx.setSkateRent(r.until, r.now))
        .catch(() => {
          skDismount();
          toast(`🛹 Kiralık süre bitti`);
        })
        .finally(() => (SK.busy = !1));
    }
  };
  const skMount = () => {
    if (!skHas() || SK.on || HX.on || ctx.driving() || self.ride || self.seat || RF.fall || RF.down) return;
    SK.on = !0;
    SK.sp = 0;
    SK.air = !1;
    SK.y = gH(self.x, self.z);
    SK.yaw = Math.atan2(PVX || Math.sin(self.camYaw + Math.PI), PVZ || Math.cos(self.camYaw + Math.PI));
    self.target = null;
    self.path = null;
    board.visible = !0;
    toast(matchMedia(`(pointer: coarse)`).matches ? `🛹 ▲ it · ◀▶ dön · ZIPLA · havada FLIP` : `🛹 W/▲ it · A/D dön · Space/ZIPLA · havada E/FLIP`);
  };
  const skDismount = () => {
    if (!SK.on || SK.air) return;
    SK.on = !1;
    skLegs();
    board.visible = !1;
    me.y = gH(self.x, self.z);
  };
  const skStep = (dt) => {
    const k = keys,
      fwd = k.KeyW || k.ArrowUp || TC.f ? 1 : 0,
      brk = k.KeyS || k.ArrowDown || TC.b ? 1 : 0,
      turn = (k.KeyA || k.ArrowLeft || TC.l ? 1 : 0) - (k.KeyD || k.ArrowRight || TC.r ? 1 : 0),
      jump = !!(k.Space || TC.u),
      flipK = !!(k.KeyE || TC.d);
    SK.pushing = !1;
    if (!SK.air) {
      SK.yaw += turn * 2.4 * dt * (0.55 + Math.min(1, SK.sp / 7) * 0.45);
      if (fwd) {
        SK.sp += (SK.sp < 4 ? 7 : SK.sp < 9 ? 4 : 1.6) * dt;
        SK.pushing = SK.sp < 10.5;
        SK.pt += dt;
      }
      SK.sp -= (brk ? 9 : 0.55) * dt;
      const dx = Math.sin(SK.yaw),
        dz = Math.cos(SK.yaw),
        h0 = gH(self.x, self.z),
        hf = gH(self.x + dx * 0.35, self.z + dz * 0.35),
        sl = (hf - h0) / 0.35;
      SK.sp -= 9.8 * CL(sl, -2, 2) * dt * 0.9;
      SK.sp = Math.min(SK.sp, 13);
      if (SK.sp < 0) {
        if (sl > 0.15) {
          SK.yaw += Math.PI;
          SK.sp = -SK.sp * 0.9;
          toast(`🛹 Fakie`);
        } else SK.sp = 0;
      }
      const nx = self.x + dx * SK.sp * dt,
        nz = self.z + dz * SK.sp * dt,
        edge = pkH(self.x, self.z) != null && h0 > PKY + 0.3 && pkH(nx, nz) == null;
      if (!edge && canStand(nx, nz)) {
        self.x = nx;
        self.z = nz;
      } else if (edge) {
        SK.sp = 0;
      } else {
        if (SK.sp > 7.5) {
          skBail(`🛹 Duvara çarptın!`);
          return;
        }
        SK.sp *= 0.25;
        thud(0.2);
      }
      const h = gH(self.x, self.z),
        vg = (h - SK.y) / Math.max(dt, 1e-3);
      const lz = self.z - 80,
        lx = self.x + 80,
        up = lx >= 11 && lx <= 29 ? (lz <= -7 && lz >= -9.9 ? -1 : lz >= 7 && lz <= 9.9 ? 1 : 0) : 0;
      if (up && h > PKY + 1.42 && dz * up > 0.55 && SK.sp > 2.2) {
        SK.air = !0;
        SK.qp = !0;
        SK.vy = Math.min(SK.sp * 1.1, 12.5);
        SK.ayaw = SK.yaw;
        SK.spin = 0;
        SK.flip = 0;
        SK.y = h;
        self.z = 80 + up * 9.55;
      } else if (h < SK.y - 0.12 && SK.pvy > 1.2) {
        SK.air = !0;
        SK.qp = !1;
        SK.vy = SK.pvy * 0.9;
        SK.ayaw = SK.yaw;
        SK.spin = 0;
        SK.flip = 0;
      } else {
        SK.y = h;
        SK.pvy = SK.pvy * 0.5 + vg * 0.5;
      }
      if (jump && !SK.lastJ && !SK.air) {
        SK.air = !0;
        SK.qp = !1;
        SK.vy = 5.2;
        SK.ayaw = SK.yaw;
        SK.spin = 0;
        SK.flip = 0;
        thud(0.1);
      }
    } else {
      SK.vy -= 19 * dt;
      SK.y += SK.vy * dt;
      SK.spin += turn * 7.5 * dt;
      if (flipK && !SK.lastE && SK.flip === 0) SK.flip = 1e-3;
      if (SK.flip > 0) SK.flip = Math.min(Math.PI * 2, SK.flip + dt * 15);
      if (!SK.qp) {
        const dx = Math.sin(SK.ayaw),
          dz = Math.cos(SK.ayaw),
          nx = self.x + dx * SK.sp * dt,
          nz = self.z + dz * SK.sp * dt;
        if (canStand(nx, nz) || pkH(nx, nz) != null) {
          self.x = nx;
          self.z = nz;
        } else SK.sp *= 0.3;
      }
      const h = gH(self.x, self.z);
      if (SK.y <= h && SK.vy < 0) {
        const spin = SK.spin,
          r = Math.round(spin / Math.PI) * Math.PI,
          dev = Math.abs(spin - r),
          badFlip = SK.flip > 0 && SK.flip < Math.PI * 1.7;
        if (dev > 0.65 || badFlip || SK.vy < -13) {
          SK.y = h;
          skBail(SK.vy < -13 ? `🛹 Çok yüksekten indin!` : `🛹 Yamuk indin, düştün!`);
          return;
        }
        const deg = Math.round((Math.abs(r) * 180) / Math.PI),
          name =
            [SK.flip > 0 ? `Kickflip` : ``, deg ? `${deg}` : ``, SK.qp && !deg && !SK.flip ? `Air` : ``].filter(Boolean).join(` `) ||
            (SK.y - h < 0.01 && !SK.qp ? `Ollie` : `Ollie`),
          pts = 10 + deg / 2 + (SK.flip ? 40 : 0) + (SK.qp ? 20 : 0);
        SK.score += pts;
        if (deg || SK.flip || SK.qp) toast(`🛹 ${name}! +${Math.round(pts)} · Skor ${Math.round(SK.score)}`);
        SK.yaw = SK.ayaw + r + (SK.qp ? Math.PI : 0);
        if (SK.qp) SK.sp = Math.min(Math.abs(SK.vy) * 0.85, 12);
        SK.air = !1;
        SK.qp = !1;
        SK.y = h;
        SK.flip = 0;
        SK.spin = 0;
        SK.pvy = 0;
        thud(0.12);
      }
    }
    SK.lastJ = jump;
    SK.lastE = flipK;
    me.x = self.x;
    me.z = self.z;
    me.y = SK.y + 0.1;
    me.moving = !1;
    me.sitting = !1;
    const vyaw = SK.air ? SK.ayaw + SK.spin + (SK.qp ? 0 : 0) : SK.yaw;
    board.position.set(self.x, SK.y + 0.01, self.z);
    board.rotation.set(0, vyaw, 0);
    board.rotateZ(SK.flip);
    if (Math.abs(WR(self.camYaw - (SK.lcy ?? self.camYaw))) > 1e-4) SK.ot = NOW();
    if (!SK.air && SK.sp > 1 && NOW() - (SK.ot || 0) > 1800) {
      const want = SK.yaw + Math.PI,
        dd = WR(want - self.camYaw);
      self.camYaw += dd * Math.min(1, dt * 2.2);
    }
    SK.lcy = self.camYaw;
    ctx.setEye(1.55 + me.y);
    return !0;
  };
  const skPost = () => {
    if (!SK.on) return;
    const M3 = me.m3 && me.m3.root.visible ? me.m3 : null;
    if (!M3) return;
    const r = M3.root,
      vyaw = SK.air ? SK.ayaw + SK.spin : SK.yaw,
      t = NOW() / 1e3;
    if (SK.pushing && !SK.air) {
      r.rotation.set(0, vyaw, 0);
      const ph = SK.pt * 7;
      M3.legs.forEach((l, i) => {
        if (i === 1) {
          l.hip.rotation.x = Math.sin(ph) * 0.75 - 0.1;
          l.knee.rotation.x = Math.max(0, Math.cos(ph)) * 0.6;
        } else {
          l.hip.rotation.x = -0.15;
          l.knee.rotation.x = 0.25;
        }
      });
      M3.arms.forEach((a) => {
        a.sh.rotation.x = Math.sin(ph + (a.sx > 0 ? 0 : Math.PI)) * 0.35;
      });
    } else {
      r.rotation.set(0, vyaw - Math.PI / 2, 0);
      M3.legs.forEach((l, i) => {
        l.hip.rotation.x = -0.35;
        l.knee.rotation.x = 0.7;
        l.hip.rotation.z = (i ? 1 : -1) * 0.28;
      });
      M3.arms.forEach((a) => {
        a.sh.rotation.z = a.sx * 1.05 + Math.sin(t * 2 + a.sx) * 0.08;
        a.sh.rotation.x = 0;
        a.el.rotation.x = -0.2;
      });
      r.position.y -= 0.12;
      if (SK.air) r.position.y += 0.1;
    }
  };
  /* ---------- action button (balls/skate) ---------- */
  const aBtn = el(`button`, `nx-b nx-board nx-act nx-hide`, ``);
  aBtn.style.bottom = `200px`;
  aBtn.addEventListener(`pointerdown`, stop);
  CT.appendChild(aBtn);
  let aAct = null;
  aBtn.addEventListener(`click`, (ev) => {
    ev.stopPropagation();
    aAct && aAct();
  });
  const KIOSK = [-70.4, 88.6];
  const actTick = () => {
    let lbl = ``,
      fn = null;
    if (!HX.on && !RF.fall && !RF.down && !ctx.driving()) {
      const dk = Math.hypot(self.x - KIOSK[0], self.z - KIOSK[1]);
      if (SK.on) {
        lbl = SK.air ? `` : `🛹 Kaykaydan in`;
        fn = SK.air ? null : skDismount;
      } else if (skHas() && !ctx.venue() && !self.ride && !self.seat) {
        // v219: kendi kaykayı (ya da kiralık süresi dolmamış) → her yerde binilir
        lbl = `🛹 Kaykaya bin`;
        fn = skMount;
      } else if (dk < 3.6 && !ctx.guest) {
        // kaykay büfesi: kirala (dakikası 100) — satın almak için yanındaki düğme (CityScreen)
        lbl = `🛹 Kaykay kirala · ${SKATE.rentPerMin} altın/dk`;
        fn = async () => {
          if (SK.busy) return;
          SK.busy = !0;
          try {
            const r = await ctx.cityAction({ op: `skateRent` });
            if (r?.until) ctx.setSkateRent(r.until, r.now);
            toast(`🛹 Kaykay kiralandı! İyi sürüşler`);
            skMount();
          } catch (err) {
            toast(`⚠️ ${err?.message || `Kiralanamadı`}`);
          }
          SK.busy = !1;
        };
      } else if (BB.held) {
        lbl = `🏀 Şut at · G`;
        fn = bbShoot;
      } else if (!BB.fly && !BB.remoteHold && Math.hypot(self.x - BB.x, self.z - BB.z) < 1.4 && BB.cd <= 0) {
        lbl = `🏀 Topu al · G`;
        fn = () => {
          BB.held = !0;
          BB.vx = BB.vz = BB.vy = 0;
          ballSend(`b`, { h: ctx.uid });
        };
      }
    }
    aAct = fn;
    if (aBtn.textContent !== lbl) aBtn.textContent = lbl;
    show(aBtn, !!fn);
    aBtn.classList.toggle(`nx-skx`, !!SK.on);
    show(skL, !!SK.on);
    show(skR, !!SK.on);
  };
  const onKeyG = (ev) => {
    const t = ev.target;
    if (t && (t.tagName === `INPUT` || t.tagName === `TEXTAREA` || t.isContentEditable)) return;
    if (ev.repeat) return;
    if (ev.code === `KeyG` && aAct && /🏀/.test(aBtn.textContent)) aAct();
    if (SK.on && ev.code === `Space`) ev.preventDefault();
  };
  window.addEventListener(`keydown`, onKeyG);
  KEYH.push([`keydown`, onKeyG]);

  // helikopter düğümü (küçük, seyrek değişir): kilit, park yeri, yolcular
  HN.unsub = NET.sub(`city/heli`, (v) => {
    HN.node = v || null;
    if (HN.mine && v?.by && v.by !== ctx.uid) {
      // kilit elimden gitti (ör. bağlantı koptu, başkası aldı) → in
      HN.mine = !1;
      if (HX.on) HX.exit();
    }
    ui();
  });
  // v219: kendi konum kaydıma eklenecek alanlar (motor her tick'te çağırır)
  const presence = () => {
    if (HX.on) return { p: `h`, rk: 1, hl: hlStr() };
    if (PAX.on) return { p: `h`, rk: PAX.seat + 1, ro: HN.node?.by || `` };
    if (HN.mine && (H.rpm > 0.02 || !H.gnd || H.wreck)) return { hl: hlStr() }; // atladım, helikopter kendi iniyor
    return null;
  };
  // başka oyuncu helikopterde → figürü koltuğa
  const remoteFig = (fig, rec) => {
    if (rec?.p !== `h`) return !1;
    const s = seatWorld(Math.max(0, Math.min(3, (Number(rec.rk) || 1) - 1)));
    fig.x = s.x;
    fig.z = s.z;
    fig.y = H.y;
    fig.seatY = s.y - 0.1;
    fig.inCar = !0;
    fig.sitting = !0;
    fig.carYaw = H.yaw;
    fig.moving = !1;
    return !0;
  };
  const dispose = () => {
    try {
      if (HN.mine) heliRelease();
      if (PAX.on) paxExit();
      HN.unsub && HN.unsub();
      BN.unsub && BN.unsub.forEach((u) => u && u());
      KEYH.forEach(([n, f]) => window.removeEventListener(n, f));
      container.querySelectorAll(`.nx-b,.nx-hud,.nx-pad,.nx-toast`).forEach((n) => n.remove());
      document.getElementById(`nx-css`)?.remove();
      [HM.root, board, FB.m, BB.m].forEach((o) => o && scene.remove(o));
      FX.forEach((f) => scene.remove(f.o));
      FX.length = 0;
      if (AC) AC.close?.();
    } catch (err) {
      console.warn(`[ekler]`, err);
    }
  };

  return {
    presence,
    remoteFig,
    dispose,
    heliBusy: () => HX.on || PAX.on,
    skate: () => ({ on: SK.on }),
    g: NX_g,
    w: NX_w,
    ys: NX_ys,
    mv: NX_mv,
    cam: NX_cam,
    post: NX_post,
    after: NX_after,
    busy: NX_busy,
    noVenue: NX_noVenue,
    reset: NX_reset,
  };

}
