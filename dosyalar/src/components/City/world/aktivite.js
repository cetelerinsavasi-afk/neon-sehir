// =============================================================================
// v219 — AKTİVİTE PARKI (şehrin güneybatısı, lot 0,4–1,4): halı saha, basket sahası, kaykay rampaları,
// kaykay kiralama büfesi. Toplar ve kaykay fiziği: cityExtras.js. Prototipten (harita_duzeni5) aktarıldı.
// Rampa yükseklikleri cityExtras.js › pkH ile aynı (lot merkezi x = −80, z = 80).
// =============================================================================
import * as THREE from 'three';
import { M as J, glowMat as RN } from '../kit.js';

const soe = THREE;

function curveRamp(k, mat, x0, x1, zl, dir, R, dmax, deck) {
  const N = 14,
    pos = [],
    idx = [];
  for (let i = 0; i <= N; i++) {
    const d = (dmax * i) / N,
      h = R - Math.sqrt(R * R - d * d),
      z = zl + dir * d;
    pos.push(x0, h + 0.13, z, x1, h + 0.13, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    dir > 0 ? idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) : idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new soe.BufferGeometry();
  g.setAttribute(`position`, new soe.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new soe.Mesh(g, mat);
  m.castShadow = !0;
  m.receiveShadow = !0;
  k.add(m);
  const H = R - Math.sqrt(R * R - dmax * dmax),
    zt = zl + dir * dmax;
  k.box(x1 - x0, H, deck, J(`#8f9399`, 0.8), (x0 + x1) / 2, 0.13, zt + (dir * deck) / 2);
  const cp = k.cyl(0.05, 0.05, x1 - x0, J(`#d9dde3`, 0.2, 0.9), (x0 + x1) / 2, 0.13 + H, zt, 10);
  cp.rotation.z = Math.PI / 2;
  cp.position.y = 0.13 + H;
  k.box(x1 - x0, H, 0.1, J(`#6c7077`, 0.8), (x0 + x1) / 2, 0.13, zt + dir * deck);
  for (let x = x0 + 0.3; x < x1; x += 2.4) k.box(0.06, 1, 0.06, J(`#2a2e36`, 0.4, 0.7), x, 0.13 + H, zt + dir * deck);
  k.box(x1 - x0, 0.05, 0.05, J(`#2a2e36`, 0.4, 0.7), (x0 + x1) / 2, 1.1 + H, zt + dir * deck);
}
export function ballTex(kind) {
  const c = document.createElement(`canvas`);
  c.width = 256;
  c.height = 128;
  const g = c.getContext(`2d`);
  if (kind === `b`) {
    g.fillStyle = `#e0661c`;
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = `#1a0d05`;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 64);
    g.lineTo(256, 64);
    g.moveTo(64, 0);
    g.lineTo(64, 128);
    g.moveTo(192, 0);
    g.lineTo(192, 128);
    g.stroke();
    g.beginPath();
    g.ellipse(128, 64, 40, 64, 0, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.fillStyle = `#f4f4f2`;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = `#121212`;
    for (let i = 0; i < 10; i++) {
      const x = (i % 5) * 52 + (i > 4 ? 26 : 0) + 12,
        y = i > 4 ? 88 : 30;
      g.beginPath();
      for (let q = 0; q < 5; q++) {
        const a = (q / 5) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13);
      }
      g.fill();
    }
  }
  const t = new soe.CanvasTexture(c);
  t.colorSpace = soe.SRGBColorSpace;
  return t;
}
// v223: basket çemberinin saha ortasına uzaklığı (cityExtras şut hedefi de bunu kullanır)
export const HOOP_X = 6.7;

export function buildAktivite(k, v) {
  const Y = 0.13,
    gr = J(`#3f8a3a`, 0.9),
    bp = J(`#b5452e`, 0.9),
    wl = J(`#f4f4f2`, 0.6),
    fp = J(`#2a2e36`, 0.4, 0.7),
    net = new soe.MeshBasicMaterial({ color: `#1a1d22`, transparent: !0, opacity: 0.28, side: 2, depthWrite: !1 });
  k.floor(`cim`, 66, 26, 0, 0, Y, { offset: !0 });
  for (const [x, z, w, d] of [
    [0, -11.6, 65.2, 2],
    [0, 11.6, 65.2, 2],
    [-31.6, 0, 2, 25.2],
    [31.6, 0, 2, 25.2],
  ]) {
    k.box(w, 0.02, d, bp, x, Y, z, { cast: !1 });
    const L = Math.max(w, d);
    for (let q = -L / 2 + 1; q < L / 2 - 1; q += 2.2)
      k.box(w > d ? 1 : 0.1, 0.025, w > d ? 0.1 : 1, wl, w > d ? x + q : x, Y + 0.005, w > d ? z : z + q, { cast: !1 });
  }
  // v220: "BİSİKLET YOLU" tabelası kaldırıldı (yolun üstünde duruyordu)
  const FX0 = -29.5,
    FX1 = -11.5,
    FZ = 6.5;
  k.box(FX1 - FX0 + 1.4, 0.03, 2 * FZ + 1.4, J(`#2f8a3a`, 0.85), (FX0 + FX1) / 2, Y, 0, { cast: !1 });
  for (let i = 0; i < 8; i++)
    k.box((FX1 - FX0) / 8, 0.035, 2 * FZ, J(i % 2 ? `#2a7d34` : `#35944a`, 0.85), FX0 + ((i + 0.5) * (FX1 - FX0)) / 8, Y, 0, { cast: !1 });
  const ln = (x, z, w, d) => k.box(w, 0.04, d, wl, x, Y + 0.002, z, { cast: !1 }),
    mx = (FX0 + FX1) / 2;
  ln(mx, -FZ, FX1 - FX0, 0.1);
  ln(mx, FZ, FX1 - FX0, 0.1);
  ln(FX0, 0, 0.1, 2 * FZ);
  ln(FX1, 0, 0.1, 2 * FZ);
  ln(mx, 0, 0.1, 2 * FZ);
  const cc = k.mesh(new soe.RingGeometry(1.9, 2, 40), wl, mx, Y + 0.045, 0, 0, { rx: -Math.PI / 2, cast: !1 });
  for (const sx of [-1, 1]) {
    const gx = sx < 0 ? FX0 : FX1;
    ln(gx - sx * 1.6, 0, 0.1, 5);
    ln(gx - sx * 0.8, -2.5, 1.6, 0.1);
    ln(gx - sx * 0.8, 2.5, 1.6, 0.1);
    for (const z of [-1.6, 1.6]) k.cyl(0.06, 0.06, 2, wl, gx, Y, z, 10);
    const cb = k.cyl(0.06, 0.06, 3.2, wl, gx, Y + 2, 0, 10);
    cb.rotation.x = Math.PI / 2;
    cb.position.y = Y + 2;
    const nb = k.mesh(new soe.PlaneGeometry(3.2, 2), net, gx + sx * 0.8, Y + 1, 0, Math.PI / 2, { cast: !1, receive: !1 });
    nb.renderOrder = 5;
    for (const z of [-1.6, 1.6]) {
      const ns = k.mesh(new soe.PlaneGeometry(0.8, 2), net, gx + sx * 0.4, Y + 1, z, 0, { cast: !1, receive: !1 });
      ns.renderOrder = 5;
    }
    const nt = k.mesh(new soe.PlaneGeometry(0.8, 3.2), net, gx + sx * 0.4, Y + 2, 0, 0, { rx: -Math.PI / 2, ry: Math.PI / 2, cast: !1, receive: !1 });
    nt.renderOrder = 5;
  }
  const fen = (x0, z0, x1, z1, h, gap) => {
    const L = Math.hypot(x1 - x0, z1 - z0),
      n = Math.ceil(L / 2.5),
      dx = (x1 - x0) / L,
      dz = (z1 - z0) / L;
    const segs = gap
      ? [
          [0, gap[0]],
          [gap[1], L],
        ]
      : [[0, L]];
    segs.forEach(([a, b]) => {
      if (b - a < 0.1) return;
      const cxs = x0 + (dx * (a + b)) / 2,
        czs = z0 + (dz * (a + b)) / 2,
        ry = Math.atan2(dx, dz) + Math.PI / 2;
      const pl = k.mesh(new soe.PlaneGeometry(b - a, h), net, cxs, Y + h / 2, czs, ry, { cast: !1, receive: !1 });
      pl.renderOrder = 5;
      k.box(Math.abs(dx) * (b - a) + 0.06, 0.06, Math.abs(dz) * (b - a) + 0.06, fp, cxs, Y + h, czs);
      // v220: çit engeli en az 0,6 m kalın — yürüme ızgarası 0,5 m; 16 cm'lik engel hücre merkezlerine
      // denk gelmeyip içinden geçiliyordu. Sahalara artık sadece kapı boşluğundan girilir.
      k.solid(cxs, czs, (Math.abs(dx) * (b - a)) / 2 + (Math.abs(dx) > 0.5 ? 0.08 : 0.32), (Math.abs(dz) * (b - a)) / 2 + (Math.abs(dz) > 0.5 ? 0.08 : 0.32));
      for (let q = a; q <= b + 0.01; q += Math.max(0.5, (b - a) / Math.ceil((b - a) / 2.5))) k.box(0.08, h, 0.08, fp, x0 + dx * q, Y, z0 + dz * q);
    });
  };
  fen(-30, -7.2, -11, -7.2, 3.5, [8.5, 10.5]); // v223: halı sahaya iki taraftan giriş
  fen(-30, 7.2, -11, 7.2, 3.5, [8.5, 10.5]);
  fen(-30, -7.2, -30, 7.2, 3.5);
  fen(-11, -7.2, -11, 7.2, 3.5);
  k.sign(`pk_halisaha`, `⚽ HALISAHA`, 0.45, -20.5, Y + 3.9, 7.25, 0, { color: `#ffffff`, bg: `#1f8a4c`, font: `900 100px Arial, sans-serif`, light: !1 });
  k.sign(`pk_halisaha2`, `⚽ HALISAHA`, 0.45, -20.5, Y + 3.9, 7.2, Math.PI, {
    color: `#ffffff`,
    bg: `#1f8a4c`,
    font: `900 100px Arial, sans-serif`,
    light: !1,
  });
  const BX = 8,
    BZ = 7;
  k.box(2 * BX, 0.03, 2 * BZ, J(`#1d5fa8`, 0.8), 0, Y, 0, { cast: !1 });
  k.box(2 * BX - 2, 0.035, 2 * BZ - 2, J(`#d9772b`, 0.8), 0, Y, 0, { cast: !1 });
  const bl = (x, z, w, d) => k.box(w, 0.04, d, wl, x, Y + 0.004, z, { cast: !1 });
  bl(0, 0, 0.1, 2 * BZ - 2);
  bl(0, -BZ + 1, 2 * BX - 2, 0.1);
  bl(0, BZ - 1, 2 * BX - 2, 0.1);
  bl(-BX + 1, 0, 0.1, 2 * BZ - 2);
  bl(BX - 1, 0, 0.1, 2 * BZ - 2);
  k.mesh(new soe.RingGeometry(1.7, 1.8, 40), wl, 0, Y + 0.045, 0, 0, { rx: -Math.PI / 2, cast: !1 });
  for (const sx of [-1, 1]) {
    const ex = sx * (BX - 1);
    k.box(4.6, 0.042, 3.6, J(`#b3401e`, 0.8), ex - sx * 2.3, Y + 0.003, 0, { cast: !1 });
    const arc = k.mesh(new soe.RingGeometry(5.6, 5.7, 40, 1, sx > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), wl, sx * 6.6, Y + 0.046, 0, 0, {
      rx: -Math.PI / 2,
      cast: !1,
    });
    const px = sx * 7.6;
    k.cyl(0.09, 0.09, 3.4, fp, px, Y, 0, 10);
    k.box(0.8, 0.1, 0.1, fp, px - sx * 0.4, Y + 3.3, 0);
    k.box(0.06, 1.05, 1.8, J(`#f4f4f2`, 0.3), sx * 7.15, Y + 2.9, 0);
    k.box(0.07, 0.45, 0.6, J(`#c8141e`, 0.4), sx * 7.13, Y + 3.05, 0);
    // v223: çember panyonun içine giriyordu (arka kenarı panyonun arkasına taşıyor, pano çemberin önünde görünüyordu) →
    // çember panyodan 10 cm önde, arada taşıyıcı
    const rim = k.mesh(new soe.TorusGeometry(0.32, 0.025, 8, 24), J(`#ff5a1a`, 0.4, 0.5), sx * HOOP_X, Y + 3.05, 0, 0, { rx: Math.PI / 2 });
    k.box(0.16, 0.04, 0.12, J(`#ff5a1a`, 0.4, 0.5), sx * (HOOP_X + 0.37), Y + 3.03, 0);
    const nt = k.mesh(
      new soe.CylinderGeometry(0.32, 0.22, 0.5, 16, 1, !0),
      new soe.MeshBasicMaterial({ color: `#ffffff`, transparent: !0, opacity: 0.55, side: 2, wireframe: !0 }),
      sx * HOOP_X,
      Y + 2.8,
      0,
      0,
      { cast: !1 },
    );
  }
  fen(-8.8, -7.8, 8.8, -7.8, 3, [7.8, 9.8]);
  fen(-8.8, 7.8, 8.8, 7.8, 3, [7.8, 9.8]); // v223: basket sahasına iki taraftan giriş
  fen(-8.8, -7.8, -8.8, 7.8, 3);
  fen(8.8, -7.8, 8.8, 7.8, 3);
  k.sign(`pk_basket`, `🏀 BASKETBOL`, 0.45, 0, Y + 3.4, -7.85, Math.PI, { color: `#ffffff`, bg: `#d9772b`, font: `900 100px Arial, sans-serif`, light: !1 });
  k.sign(`pk_basket2`, `🏀 BASKETBOL`, 0.45, 0, Y + 3.4, -7.8, 0, { color: `#ffffff`, bg: `#d9772b`, font: `900 100px Arial, sans-serif`, light: !1 });
  const SX0 = 10.6,
    SX1 = 30,
    cn = J(`#a9adb3`, 0.85);
  k.box(SX1 - SX0, 0.03, 20.4, cn, (SX0 + SX1) / 2, Y, 0, { cast: !1 });
  const qm = new soe.MeshStandardMaterial({ color: `#b9bdc3`, roughness: 0.7, side: 2 });
  curveRamp(k, qm, 11, 29, -7, -1, 3.2, 2.8, 0.6);
  curveRamp(k, qm, 11, 29, 7, 1, 3.2, 2.8, 0.6);
  const fb = new soe.Shape();
  fb.moveTo(-4, 0);
  fb.lineTo(-2, 0.6);
  fb.lineTo(2, 0.6);
  fb.lineTo(4, 0);
  fb.closePath();
  const fbg = new soe.ExtrudeGeometry(fb, { depth: 5, bevelEnabled: !1 });
  const fbm = k.mesh(fbg, cn, 20, Y, -2.5, 0);
  k.box(4, 0.04, 0.04, J(`#d9dde3`, 0.2, 0.9), 20, Y + 0.6, -2.5);
  k.box(4, 0.04, 0.04, J(`#d9dde3`, 0.2, 0.9), 20, Y + 0.6, 2.5);
  const kc = new soe.Shape();
  kc.moveTo(0, 0);
  kc.lineTo(2, 0.75);
  kc.lineTo(2, 0);
  kc.closePath();
  k.mesh(new soe.ExtrudeGeometry(kc, { depth: 3, bevelEnabled: !1 }), J(`#9aa0a8`, 0.6, 0.3), 25.5, Y, -5, 0);
  for (let x = 14; x <= 22; x += 2) k.box(0.06, 0.4, 0.06, J(`#2a2e36`, 0.4, 0.7), x, Y, 4.6);
  const rl = k.cyl(0.04, 0.04, 8, J(`#d9dde3`, 0.2, 0.9), 18, Y + 0.42, 4.6, 10);
  rl.rotation.z = Math.PI / 2;
  rl.position.y = Y + 0.42;
  k.sign(`pk_skate`, `🛹 KAYKAY PARKI`, 0.5, 20, Y + 3.2, -10.55, 0, { color: `#ffffff`, bg: `#7a2ad0`, font: `900 100px Arial, sans-serif`, light: !1 });
  const KX = 9.6,
    KZ = 8.6;
  {
    const pu = J(`#7a2ad0`, 0.55),
      dk = J(`#2a2d33`, 0.6),
      wl = J(`#efeaf6`, 0.7),
      BC = [`#ff2d8a`, `#19e8ff`, `#ffd23f`, `#39ff88`, `#ff7a1a`];
    k.box(3.3, 0.08, 2.5, J(`#3a3d44`, 0.7), KX, Y, KZ + 0.05, { cast: !1 });
    k.box(3.3, 2.6, 0.12, wl, KX, Y, KZ + 1.2);
    for (const sx of [-1, 1]) k.box(0.12, 2.6, 2.5, wl, KX + sx * 1.6, Y, KZ + 0.05);
    k.box(3.7, 0.14, 3, pu, KX, Y + 2.6, KZ);
    k.box(3.72, 0.32, 0.06, pu, KX, Y + 2.42, KZ - 1.5);
    k.box(3.1, 0.95, 0.45, dk, KX, Y, KZ - 0.95);
    k.box(3.2, 0.05, 0.56, pu, KX, Y + 0.95, KZ - 0.95);
    k.box(3.1, 0.04, 0.06, RN(`#b46bff`, 2.2), KX, Y + 0.86, KZ - 1.19, { cast: !1 });
    for (let q = 0; q < 5; q++) {
      const x = KX - 1.2 + q * 0.6,
        c = BC[q];
      k.box(0.24, 0.84, 0.05, J(c, 0.45), x, Y + 0.95, KZ + 1.11);
      k.box(0.18, 0.6, 0.012, J(`#14161b`, 0.6), x, Y + 1.07, KZ + 1.083, { cast: !1 });
      for (const yy of [1.08, 1.66]) k.box(0.2, 0.05, 0.06, J(`#f4f4f2`, 0.4), x, Y + yy, KZ + 1.06, { cast: !1 });
    }
    k.box(3, 0.04, 0.18, dk, KX, Y + 0.9, KZ + 1.1);
    for (let q = 0; q < 2; q++) {
      const b = k.box(0.82, 0.035, 0.22, J(BC[q + 2], 0.45), KX - 0.55 + q * 1.1, Y + 1.0, KZ - 0.95);
      for (const dx of [-0.28, 0.28])
        for (const dz of [-0.08, 0.08]) k.box(0.05, 0.04, 0.04, J(`#f4f4f2`, 0.4), KX - 0.55 + q * 1.1 + dx, Y + 0.975, KZ - 0.95 + dz, { cast: !1 });
    }
    k.light(KX, Y + 2.2, KZ + 0.3, `#e3c8ff`, 3.5, 6);
    k.box(2.8, 0.04, 0.1, RN(`#f4f0ff`, 2), KX, Y + 2.55, KZ + 0.3, { cast: !1 });
    k.solid(KX, KZ + 1.2, 1.65, 0.1);
    for (const sx of [-1, 1]) k.solid(KX + sx * 1.6, KZ + 0.05, 0.1, 1.25);
    k.solid(KX, KZ - 0.95, 1.55, 0.25);
    k.sign(`pk_kaykayci`, `🛹 KAYKAY · KİRALIK`, 0.3, KX, Y + 2.42, KZ - 1.54, Math.PI, {
      color: `#ffffff`,
      bg: `#7a2ad0`,
      font: `900 100px Arial, sans-serif`,
      light: !1,
    });
  }
  k.npcs.push({
    outer: !1,
    yaw: Math.PI,
    x: KX,
    z: KZ + 0.4,
    name: `Kaykaycı Arda`,
    av: { clothing: `hoodie`, clothColor: `#7a2ad0`, hat: `cap`, hatColor: `#14161b`, pantsColor: `#1a1a1c` },
    lines: [`Kaykay kiralık, binip parkurda uç!`, `Rampaya hızlı gir, havada döndür!`, `ZIPLA ile zıpla, havada FLIP at!`],
  });
  for (const [x, z] of [
    [-10.2, -9.6],
    [-10.2, 9.6],
    [9.4, -9.6],
    [30, -9.6],
    [30, 9.6],
    [-30.4, -9.6],
  ])
    k.item(`tree`, x, z, 0, 0, { y: Y });
  for (const x of [-25, -15, -3, 3, 15, 25]) {
    k.item(`parkbench`, x, -9.6, 0, 0, { y: Y });
    k.item(`streetlamp`, x + 2, -9.9, 2, 0, { y: Y });
    k.item(`streetlamp`, x + 2, 9.9, 6, 0, { y: Y });
  }
  k.item(`copkutusu`, -10, 0, 0, 0, { y: Y });
  k.item(`copkutusu`, 10, -6, 0, 0, { y: Y });
  k.label(`🏀 AKTİVİTE PARKI`, 0, 9, 0, `map`);
  return {};
}
