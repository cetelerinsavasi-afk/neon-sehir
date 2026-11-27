// =============================================================================
// v219 — PAZAR YERİ (şehrin kuzeybatısı: tezgâhlar, tenteler, ampul zincirleri) + açık otopark
// (yol tabelaları, park etmiş araçlar). Prototipten (harita_duzeni5) aktarıldı.
// =============================================================================
import * as THREE from 'three';
import { Kit as QN, M as J, glowMat as RN } from '../kit.js';
import { ZI } from './pist.js';

const soe = THREE;

const PAZAR_TEZGAH = [
    [`MANAV`, [`#ff9f1c`, `#d62828`, `#ffd23f`, `#7fb800`], `Manav`],
    [`SEBZE`, [`#e63946`, `#4a1d5c`, `#2d8a3a`, `#c9a36b`], `Sebzeci`],
    [`BAHARAT`, [`#b5341b`, `#e9b20e`, `#7a4a24`, `#6a8a2a`], `Baharatçı`],
    [`KURUYEMİŞ`, [`#a0703c`, `#e8d3a8`, `#6b4423`, `#c58a4a`], `Kuruyemişçi`],
    [`PEYNİR & ZEYTİN`, [`#f4efe2`, `#2b2b22`, `#6b7a2a`, `#f1d98a`], `Peynirci`],
    [`ÇİÇEKÇİ`, [`#ff4d8d`, `#ffd23f`, `#b46bff`, `#ff7a1a`], `Çiçekçi`],
    [`BALIKÇI`, [`#c9d6e2`, `#9fb3c8`, `#e8eef4`, `#8aa2b5`], `Balıkçı`],
    [`TURŞU`, [`#9ccc3a`, `#d94f30`, `#e8c547`, `#6a9a3a`], `Turşucu`],
    [`BAL & REÇEL`, [`#e0a020`, `#b5341b`, `#7a1f4a`, `#f1b84a`], `Balcı`],
    [`SİMİT & POĞAÇA`, [`#b5793a`, `#d9a560`, `#8a5426`, `#f0d08a`], `Simitçi`],
    [`TEKSTİL`, [`#1f6fd0`, `#ff2d8a`, `#39b54a`, `#f4efe2`], `Tekstilci`],
    [`ÇAY OCAĞI`, [`#8a2a14`, `#f4efe2`, `#c8141e`, `#e0a020`], `Çaycı`],
  ],
  __PZA = [
    [`#c8141e`, `#ffffff`],
    [`#1f8a4c`, `#ffffff`],
    [`#1f6fd0`, `#ffffff`],
    [`#ff7a1a`, `#ffffff`],
    [`#ffd23f`, `#c8141e`],
    [`#7a2ad0`, `#ffffff`],
  ],
  __PZN = [
    `Hasan`,
    `Ayşe`,
    `Mehmet`,
    `Fatma`,
    `Ali`,
    `Zeynep`,
    `Mustafa`,
    `Elif`,
    `Hüseyin`,
    `Emine`,
    `İbrahim`,
    `Hatice`,
    `Osman`,
    `Meryem`,
    `Yusuf`,
    `Selma`,
  ],
  __PZC = [`#c8141e`, `#1f6fd0`, `#1f8a4c`, `#ff7a1a`, `#7a2ad0`, `#2b3550`, `#e0a020`, `#14161b`],
  __PZTX = new Map();
function awnTex(c1, c2) {
  var key = c1 + c2;
  if (__PZTX.has(key)) return __PZTX.get(key);
  var cv = document.createElement(`canvas`);
  cv.width = 128;
  cv.height = 32;
  var g = cv.getContext(`2d`);
  for (var i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? c2 : c1;
    g.fillRect(i * 16, 0, 16, 32);
  }
  var tx = new soe.CanvasTexture(cv);
  tx.colorSpace = soe.SRGBColorSpace;
  var m = new soe.MeshStandardMaterial({ map: tx, roughness: 0.85, side: 2 });
  m.userData.shared = !0;
  __PZTX.set(key, m);
  return m;
}
function stall(k, x, z, f, ti, si) {
  var T = PAZAR_TEZGAH[ti % PAZAR_TEZGAH.length],
    A = __PZA[(ti + si) % __PZA.length],
    L = 2.5,
    y0 = 0.12,
    wd = J(`#8a5a32`, 0.8),
    lg = J(`#6b4423`, 0.85),
    pl = J(`#3a3d42`, 0.5, 0.6);
  var lx = function (d) {
    return x + f * d;
  };
  k.box(1.0, 0.85, L, wd, lx(0), y0, z);
  k.box(1.08, 0.05, L + 0.08, lg, lx(0), y0 + 0.85, z);
  for (var s of [-1, 1]) for (var dd of [-0.6, 0.6]) k.box(0.06, 2.45, 0.06, pl, lx(dd), y0, z + s * (L / 2 + 0.02));
  var aw = k.mesh(new soe.PlaneGeometry(L + 0.4, 1.7), awnTex(A[0], A[1]), lx(-0.05), y0 + 2.5, z, f > 0 ? Math.PI / 2 : -Math.PI / 2, { cast: !0 });
  aw.rotation.order = `YXZ`;
  aw.rotation.x = -Math.PI / 2 + 0.32;
  var vf = k.mesh(new soe.PlaneGeometry(L + 0.4, 0.22), awnTex(A[1], A[0]), lx(0.78), y0 + 2.12, z, f > 0 ? Math.PI / 2 : -Math.PI / 2, { cast: !1 });
  var C = T[1],
    cr = J(`#b98a52`, 0.85),
    sg = new soe.SphereGeometry(0.075, 8, 6);
  for (var c = 0; c < 3; c++) {
    var cz = z - 0.8 + c * 0.8;
    k.box(0.62, 0.16, 0.7, cr, lx(0.1), y0 + 0.9, cz);
    var col = J(C[(c + si) % C.length], 0.55);
    if (ti % 12 == 4 || ti % 12 == 9) {
      for (var q = 0; q < 5; q++) k.box(0.16, 0.07, 0.16, col, lx(-0.12 + (q % 3) * 0.17), y0 + 1.06 + (q > 2 ? 0.07 : 0), cz - 0.22 + q * 0.11);
    } else if (ti % 12 == 7 || ti % 12 == 8) {
      for (var q = 0; q < 4; q++) k.cyl(0.07, 0.07, 0.2, col, lx(-0.12 + (q % 2) * 0.2), y0 + 1.06, cz - 0.15 + (q > 1 ? 0.25 : 0), 10);
    } else if (ti % 12 == 10) {
      for (var q = 0; q < 3; q++) k.box(0.5, 0.06, 0.55, J(C[(c + q) % C.length], 0.8), lx(0.1), y0 + 1.06 + q * 0.06, cz);
    } else for (var q = 0; q < 9; q++) k.mesh(sg, col, lx(-0.12 + (q % 3) * 0.17), y0 + 1.11 + (q > 5 ? 0.1 : 0), cz - 0.2 + (Math.floor(q / 3) % 3) * 0.2);
  }
  k.sign(`pz_${T[0]}`, T[0], 0.3, lx(0.02), y0 + 2.05, z, f > 0 ? Math.PI / 2 : -Math.PI / 2, {
    color: `#ffffff`,
    bg: A[0] === `#ffd23f` ? `#c8141e` : A[0],
    font: `900 100px Arial, sans-serif`,
    light: !1,
  });
  k.solid(lx(0), z, 0.55, L / 2 + 0.1);
  k.npcs.push({
    outer: !0,
    yaw: f > 0 ? Math.PI / 2 : -Math.PI / 2,
    x: lx(-0.95),
    z: z + (si % 2 ? 0.4 : -0.4),
    name: `${T[2]} ${__PZN[(ti * 3 + si) % __PZN.length]}`,
    av: {
      clothing: si % 2 ? `jacket` : `hoodie`,
      clothColor: __PZC[(ti + si) % __PZC.length],
      pantsColor: `#2b3550`,
      ...(si % 3 == 0 ? { hat: `cap`, hatColor: `#14161b` } : {}),
    },
    lines: [`Buyur abla, buyur abi! Taze taze!`, `Gel gel, bugün her şey yarı fiyat!`, `Pazarın en tazesi bizde!`, `Tadına bak, beğenmezsen alma!`].slice(
      si % 2,
      (si % 2) + 3,
    ),
  });
}
export function bulbs(k, a, b, h) {
  var d = Math.hypot(b[0] - a[0], b[1] - a[1]),
    n = Math.max(4, Math.round(d / 1.1)),
    w = J(`#1a1c20`, 0.6),
    bm = RN(`#ffe9a8`, 2.4),
    g = new soe.SphereGeometry(0.07, 6, 4);
  for (var i = 0; i <= n; i++) {
    var t = i / n,
      sag = Math.sin(t * Math.PI) * 0.55,
      x = a[0] + (b[0] - a[0]) * t,
      z = a[1] + (b[1] - a[1]) * t;
    k.mesh(g, bm, x, h - sag - 0.1, z, 0, { cast: !1 });
    if (i < n) {
      var t2 = (i + 1) / n,
        x2 = a[0] + (b[0] - a[0]) * t2,
        z2 = a[1] + (b[1] - a[1]) * t2,
        s2 = Math.sin(t2 * Math.PI) * 0.55,
        L = Math.hypot(x2 - x, z2 - z, s2 - sag);
      var m = k.box(0.02, 0.02, L, w, (x + x2) / 2, h - (sag + s2) / 2, (z + z2) / 2, { center: !0, cast: !1 });
      m.rotation.order = `YXZ`;
      m.rotation.y = Math.atan2(x2 - x, z2 - z);
      m.rotation.x = Math.atan2(s2 - sag, Math.hypot(x2 - x, z2 - z));
    }
  }
}
export function buildPazar(E) {
  var k = new QN(`pazar`);
  E.push(k);
  var SG = [
    {
      z0: -176,
      z1: -144,
      xl: -84.6,
      xr: -76.1,
      av: [
        [-83.6, -147.6],
        [-78.8, -160],
      ],
    },
    { z0: -136, z1: -104, xl: -85.5, xr: -74.5, av: [] },
    { z0: -96, z1: -64, xl: -85.5, xr: -74.5, av: [] },
    {
      z0: -56,
      z1: -24,
      xl: -83.8,
      xr: -75.2,
      av: [
        [-83.6, -27.6],
        [-81.2, -40],
        [-76.2, -27.8],
      ],
    },
    {
      z0: -16,
      z1: 16,
      xl: -83.9,
      xr: -75.7,
      av: [
        [-83.6, 12.4],
        [-81.2, 0],
        [-76.2, 12.2],
        [-78.8, 0],
      ],
    },
    {
      z0: 24,
      z1: 56,
      xl: -83.8,
      xr: -74.5,
      av: [
        [-83.6, 52.4],
        [-81.2, 40],
        [-75.6, 28.4],
        [-75.6, 51.6],
      ],
    },
  ];
  var ti = 0,
    si = 0;
  SG.forEach(function (s, bi) {
    var cx = (s.xl + s.xr) / 2,
      wide = s.xr - s.xl > 10;
    var hit = function (x, z, r) {
      return s.av.some(function (p) {
        return Math.abs(p[0] - x) < r + 0.35 && Math.abs(p[1] - z) < 1.45 + 0.4;
      });
    };
    [
      [-1, s.xl + 1.6],
      [1, s.xr - 1.6],
    ].forEach(function (sd, side) {
      var f = -sd[0],
        x = sd[1],
        slot = 0;
      for (var z = s.z0 + 3.2 + side * 1.6; z <= s.z1 - 3; z += 3.15) {
        if (hit(x, z, 0.8)) {
          slot++;
          continue;
        }
        if (slot % 4 == 3) {
          k.item(`parkbench`, x + f * 0.25, z, f > 0 ? 2 : 6, 0, { y: 0.12 });
          if ((slot + side) % 2) k.item(`copkutusu`, x + f * -0.2, z + 1.15, 0, 0, { y: 0.12 });
        } else {
          stall(k, x, z, f, ti++, si++);
        }
        slot++;
      }
    });
    var bn = [
      [s.xl, s.z0 + 2],
      [s.xr, s.z0 + 2],
    ];
    for (var z = s.z0 + 2, i = 0; z < s.z1 - 1; z += 5.5, i++) bn.push([i % 2 ? s.xl : s.xr, z]);
    var pts = [];
    for (var z2 = s.z0 + 1.5, i2 = 0; z2 <= s.z1 - 1.4; z2 += 5.2, i2++) pts.push([i2 % 2 ? s.xl + 0.05 : s.xr - 0.05, z2]);
    for (var p = 0; p < pts.length - 1; p++) bulbs(k, pts[p], pts[p + 1], 5.6);
    for (var z3 = s.z0 + 5; z3 < s.z1 - 4; z3 += 10) k.light(cx, 3.6, z3, `#ffd9a0`, 5, 11);
    if (wide) {
      for (var z4 = s.z0 + 7; z4 < s.z1 - 5; z4 += 9) {
        if (hit(cx, z4, 2.4)) continue;
        k.item(`parkbench`, cx - 1.15, z4, 2, 0, { y: 0.12 });
        k.item(`parkbench`, cx + 1.15, z4, 6, 0, { y: 0.12 });
        k.item(`planter`, cx, z4 - 1.9, 2, 0, { y: 0.12 });
        k.item(`planter`, cx, z4 + 1.9, 2, 0, { y: 0.12 });
      }
    } else {
      for (var z5 = s.z0 + 8; z5 < s.z1 - 6; z5 += 12) {
        if (hit(cx, z5, 1.0)) continue;
        k.item(`planter`, cx, z5, 2, 0, { y: 0.12 });
      }
    }
    var AV = [
      { clothing: `hoodie`, clothColor: `#ff2d8a`, pantsColor: `#1a1a1c` },
      { clothing: `jacket`, clothColor: `#2b3550`, pantsColor: `#3a3d42` },
      { clothing: `hoodie`, clothColor: `#39b54a`, pantsColor: `#1a1a1c` },
      { clothing: `jacket`, clothColor: `#e0a020`, pantsColor: `#2b3550`, hat: `cap`, hatColor: `#c8141e` },
    ];
    for (var w = 0; w < (wide ? 3 : 2); w++) {
      var ox = cx + (w - 1) * 0.9,
        za = s.z0 + 3 + w * 2,
        zb2 = s.z1 - 3 - w * 1.5;
      k.npcs.push({
        outer: !0,
        x: ox,
        z: za,
        name: [`Pazarcı Teyze`, `Müşteri Can`, `Müşteri Derya`, `Emekli Rıza`][(bi + w) % 4],
        av: AV[(bi + w) % 4],
        lines: [`Domatesler bugün çok güzel!`, `Şu pazarı çok seviyorum.`, `Bir kilo portakal aldım, bayağı ucuz.`, `Akşam pazarı başka güzel oluyor.`],
        route: [
          { x: ox, z: za },
          { x: ox + (w % 2 ? 0.6 : -0.6), z: (za + zb2) / 2 },
          { x: ox, z: zb2 },
        ],
      });
    }
  });
}
const SIGN_TEX = new Map();
function signTex(kind) {
  if (SIGN_TEX.has(kind)) return SIGN_TEX.get(kind);
  var cv = document.createElement(`canvas`),
    g = cv.getContext(`2d`);
  var rr = function (x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  if (kind === `cikmaz` || kind === `park`) {
    cv.width = 256;
    cv.height = 256;
    g.fillStyle = `#ffffff`;
    rr(4, 4, 248, 248, 26);
    g.fill();
    g.fillStyle = `#1d55b4`;
    rr(16, 16, 224, 224, 18);
    g.fill();
    if (kind === `cikmaz`) {
      g.fillStyle = `#ffffff`;
      g.fillRect(104, 92, 48, 140);
      g.fillStyle = `#e01b24`;
      g.fillRect(52, 52, 152, 46);
    } else {
      g.fillStyle = `#ffffff`;
      g.font = `900 190px Arial, sans-serif`;
      g.textAlign = `center`;
      g.textBaseline = `middle`;
      g.fillText(`P`, 128, 140);
    }
  } else {
    cv.width = 512;
    cv.height = 128;
    g.fillStyle = `#ffffff`;
    rr(4, 4, 504, 120, 16);
    g.fill();
    g.strokeStyle = `#14161b`;
    g.lineWidth = 6;
    rr(10, 10, 492, 108, 12);
    g.stroke();
    g.fillStyle = `#14161b`;
    g.textAlign = `center`;
    g.textBaseline = `middle`;
    var tx = kind === `cikmaz_p` ? [`ÇIKMAZ SOKAK`] : [`SİTE SAKİNLERİNE AİT`, `ÖZEL OTOPARK`];
    if (tx.length == 1) {
      g.font = `900 64px Arial, sans-serif`;
      g.fillText(tx[0], 256, 66);
    } else {
      g.font = `900 40px Arial, sans-serif`;
      g.fillText(tx[0], 256, 44);
      g.font = `900 44px Arial, sans-serif`;
      g.fillText(tx[1], 256, 90);
    }
  }
  var t = new soe.CanvasTexture(cv);
  t.colorSpace = soe.SRGBColorSpace;
  t.anisotropy = 4;
  var m = new soe.MeshBasicMaterial({ map: t, toneMapped: !1 });
  m.userData.shared = !0;
  SIGN_TEX.set(kind, m);
  return m;
}
function roadSign(k, x, z, ry, kind, plate) {
  var po = J(`#9aa0a8`, 0.4, 0.7);
  k.cyl(0.05, 0.05, 2.9, po, x, 0.12, z, 8);
  var bk = J(`#8a8f96`, 0.5, 0.6),
    sx = Math.sin(ry),
    sz = Math.cos(ry);
  var m = k.mesh(new soe.PlaneGeometry(0.7, 0.7), signTex(kind), x + sx * 0.04, 2.65, z + sz * 0.04, ry, { cast: !1, receive: !1 });
  k.box(0.72, 0.72, 0.02, bk, x, 2.3, z, { ry: ry });
  var p = k.mesh(new soe.PlaneGeometry(0.84, 0.21), signTex(plate), x + sx * 0.04, 2.08, z + sz * 0.04, ry, { cast: !1, receive: !1 });
  k.box(0.86, 0.23, 0.02, bk, x, 1.965, z, { ry: ry });
  k.solid(x, z, 0.12, 0.12);
}
export function buildOtopark(E) {
  var k = new QN(`site_otopark`);
  E.push(k);
  var X0 = 128.9,
    X1 = 159.7,
    Z0 = -104,
    Z1 = -96;
  k.floor(`asfalt`, X1 - X0, Z1 - Z0, (X0 + X1) / 2, (Z0 + Z1) / 2, 0.035, { offset: !0 });
  var wl = J(`#f4f4f4`, 0.6),
    yl = J(`#ffd23f`, 0.6);
  for (var i = 0; i <= 11; i++) k.box(0.12, 0.02, 4.6, wl, 130 + i * 2.7, 0.04, -101.7, { cast: !1 });
  k.box(X1 - 130, 0.02, 0.12, wl, (130 + X1) / 2, 0.04, -99.35, { cast: !1 });
  var ids = [1, 5, 4, 6],
    sl = [1, 4, 6, 9];
  sl.forEach(function (s, j) {
    ZI(k, ids[j], 131.35 + s * 2.7, -101.7, j % 3 == 1 ? 0 : Math.PI);
  });
  for (var bz = -103.5; bz <= -96.4; bz += 1.18) {
    k.cyl(0.11, 0.13, 0.85, J(`#2a2d33`, 0.5, 0.5), 159.35, 0, bz, 10, { cast: !1 });
    k.box(0.24, 0.08, 0.24, yl, 159.35, 0.7, bz);
  }
  k.solid(159.35, -100, 0.2, 3.8);
  k.solids.at(-1).car = !0;
  k.box(X1 - X0, 0.02, 0.12, yl, (X0 + X1) / 2, 0.04, -96.15, { cast: !1 });
  var bp = J(`#1d4fa0`, 0.5, 0.4);
  k.box(0.35, 1.05, 0.35, bp, 129.6, 0, -95.75);
  k.solid(129.6, -95.75, 0.2, 0.2);
  var arm = k.box(4.2, 0.12, 0.12, J(`#e01b24`, 0.6), 129.6, 1.0, -95.75, { center: !0 });
  arm.geometry.translate(2.05, 0, 0);
  arm.position.set(129.6, 1.0, -95.75);
  arm.rotation.set(0, Math.PI / 2, 1.25);
  roadSign(k, 128.6, -95.2, -Math.PI / 2, `cikmaz`, `cikmaz_p`);
  roadSign(k, 128.6, -104.8, -Math.PI / 2, `park`, `park_p`);
  k.label(`🅿️ Site Otoparkı`, 144, 4, -100, `map`);
}
export function buildOtoparkLot(k, v) {
  const Y = 0.13,
    wl = J(`#f4f4f2`, 0.6),
    yl = J(`#ffd23f`, 0.6);
  k.floor(`asfalt`, 30, 26, 0, 0, Y, { offset: !0 });
  for (const zr of [-1, 1]) {
    for (let i = 0; i <= 10; i++) k.box(0.12, 0.02, 5, wl, -13.5 + i * 2.7, Y + 0.01, zr * 8.2, { cast: !1 });
    k.box(27, 0.02, 0.12, wl, 0, Y + 0.01, zr * 5.7, { cast: !1 });
  }
  for (let x = -12; x <= 12; x += 4) k.box(1.6, 0.02, 0.3, yl, x, Y + 0.01, 0, { cast: !1 });
  const fill = [
      [1, 0],
      [3, 0],
      [4, 1],
      [6, 0],
      [8, 1],
      [9, 0],
      [0, 1],
      [2, 1],
      [5, 1],
      [7, 0],
    ],
    ids = [1, 3, 2, 5, 4, 7, 6, 10, 2, 5];
  fill.forEach(([s, r], j) => {
    if (j % 5 === 4) return;
    ZI(k, ids[j % ids.length], -12.15 + s * 2.7, (r ? 1 : -1) * 8.2, r ? 0 : Math.PI);
  });
  for (const x of [-14.6, 14.6])
    for (let z = -12; z <= 12; z += 1.5) {
      k.box(0.9, 0.6, 0.9, J(`#3a6a2e`, 0.8), x, Y, z);
    }
  k.solid(-14.6, 0, 0.45, 12.5);
  k.solid(14.6, 0, 0.45, 12.5);
  for (let x = -14; x <= 14; x += 1.5) k.box(0.9, 0.6, 0.9, J(`#3a6a2e`, 0.8), x, Y, -12.6);
  k.solid(0, -12.6, 14.5, 0.45);
  const bp = J(`#1d4fa0`, 0.5, 0.4);
  k.box(1.2, 2.4, 1.2, J(`#e9edf2`, 0.5), 10.6, Y, 11.4);
  k.box(1.4, 0.12, 1.4, bp, 10.6, Y + 2.4, 11.4);
  k.solid(10.6, 11.4, 0.6, 0.6);
  k.box(0.3, 1.1, 0.3, bp, 8.6, Y, 11.4);
  const arm = k.box(3.6, 0.1, 0.1, J(`#e01b24`, 0.6), 8.6, Y + 1, 11.4, { center: !0 });
  arm.geometry.translate(-1.8, 0, 0);
  arm.position.set(8.6, Y + 1, 11.4);
  arm.rotation.set(0, 0, -1.2);
  k.box(0.6, 1.4, 0.4, J(`#2a2d33`, 0.5, 0.4), 12.6, Y, 11.2);
  k.box(0.5, 0.3, 0.04, RN(`#19e8ff`, 2), 12.6, Y + 1.05, 11.42, { cast: !1 });
  roadSign(k, -12.8, 12.4, 0, `park`, `park_p`);
  k.sign(`op_ad`, `🅿️ AÇIK OTOPARK`, 0.5, 10.6, Y + 2.95, 12.02, 0, { color: `#ffffff`, bg: `#1d4fa0`, font: `900 100px Arial, sans-serif`, light: !1 });
  for (const [x, z] of [
    [-13.5, -11.5],
    [13.5, -11.5],
    [-13.5, 0],
    [13.5, 0],
  ])
    k.item(`streetlamp`, x, z, x < 0 ? 2 : 6, 0, { y: Y });
  k.label(`🅿️ Açık Otopark`, 0, 4, 0, `map`);
  return {};
}
