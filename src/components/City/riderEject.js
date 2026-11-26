// =============================================================================
// v216 — BİNEKTEN FIRLAMA (motor, bisiklet, at, deve) — prototip: preview/firlama.html
// -----------------------------------------------------------------------------
// Sert çarpmada sürücü bineğin üstünden fırlar, havada takla atar, yere düşüp kayar, durur.
// Yavaş çarpmada (eşiğin altı) hiçbir şey olmaz: eskisi gibi sadece sarsıntı + geri sekme (carImpact.js).
//
//   • Sertlik = carImpact.applyImpact'in verdiği KAPANMA HIZI (vn): duvara dik hız bileşeni.
//     Duvara sürtünerek geçmek / yan yan değmek fırlatmaz; dik ve hızlı çarpma fırlatır.
//   • Gövde: 5 parçacıklı katı cisim (kalça, baş, iki omuz, göğüs) — konum tabanlı dinamik (PBD).
//     Yer çekimi, yerle / engellerle temas (esneklik + Coulomb sürtünmesi). Takla, yuvarlanma,
//     duvara yapışıp aşağı kayma, alçak bariyerin üstünden aşma, araba tavanına düşme kendiliğinden çıkar.
//   • Kollar / bacaklar: havada çırpınır, yerde gevşer (limbPose → Avatar3D eklemleri).
// Saf fonksiyonlar (Three.js yok) — tests/city/rider-eject.test.mjs ile sınanır.
// Sunucuya / Firestore'a / RTDB'ye hiçbir şey eklenmez.
// =============================================================================

// --- binek türü + fırlama eşiği --------------------------------------------------
// v: vehicles.js modeli (moto, ride, catalogId). Araba / otobüs / tır → null (fırlama yok)
export function riderKind(v) {
  if (!v?.moto) return null;
  if (v.ride === 'bike') return 'bike';
  if (v.ride === 'horse') return v.catalogId === 27 || v.def?.name === 'Deve' ? 'camel' : 'horse';
  return 'moto';
}
// Kapanma hızı eşiği (m/sn). km/sa = × 3,6 → bisiklet 30, at 38, deve 33, motor 42 km/sa
// (v216: prototipteki ilk değerlerin 1,5 katı — orta hızdaki çarpmalar fırlatmasın)
export const EJECT_MIN = { bike: 8.4, horse: 10.5, camel: 9.2, moto: 11.7 };
// Türlere göre fırlama: pop = yukarı fırlama, over = baş öne (takla), seatUp = sürücünün oturma yüksekliği farkı
const LAUNCH = {
  bike: { pop: 1.1, popK: 0.11, keep: 0.8, over: 0.56 },
  moto: { pop: 1.3, popK: 0.12, keep: 0.8, over: 0.6 },
  horse: { pop: 1.6, popK: 0.1, keep: 0.76, over: 0.66 }, // at aniden durur, sürücü boynun üstünden
  camel: { pop: 1.8, popK: 0.1, keep: 0.74, over: 0.68 },
};
export function ejectCheck(v, vn, min = EJECT_MIN) {
  const k = riderKind(v);
  if (!k) return false;
  return vn >= (min[k] ?? 99);
}

// --- küçük vektör yardımcıları -------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// Gövde parçacıkları — kalçaya göre yerel konum (x: sol, y: yukarı, z: ön), yarıçap (m).
// Avatar3D ("dengeli") ölçüleri: kalça ≈ 0,63 m, baş ortası ≈ 1,29 m, omuz ≈ 1,0 m.
export const BODY = [
  { n: 'P', o: [0, 0, 0], r: 0.17 }, // kalça
  { n: 'H', o: [0, 0.66, 0.02], r: 0.15 }, // baş
  { n: 'L', o: [0.24, 0.38, 0], r: 0.11 }, // sol omuz
  { n: 'R', o: [-0.24, 0.38, 0], r: 0.11 }, // sağ omuz
  { n: 'C', o: [0, 0.3, 0.12], r: 0.12 }, // göğüs / karın (gövdeyi düzlem olmaktan çıkarır)
];

// Fırlatma. frame: sürücünün dünyadaki eksenleri { x, y, z } (birim vektörler), pelvis: [x, y, z]
// vel: çarpma ÖNCESİ binek hızı [vx, vy, vz] · kind: riderKind · speed: çarpma öncesi hız (m/sn)
export function makeRagdoll({ pelvis, frame, vel, kind = 'moto', speed = null, seed = 1 }) {
  const L = LAUNCH[kind] || LAUNCH.moto;
  const sp = speed ?? Math.hypot(vel[0], vel[2]);
  const fwd = norm([vel[0], 0, vel[2]]);
  const rnd = mulberry(seed);
  const side = (rnd() - 0.5) * 0.25 * sp; // hafif yana savrulma (her kaza biraz farklı)
  const sideV = [frame.x[0] * side * 0.12, 0, frame.x[2] * side * 0.12];
  const ps = BODY.map((b) => {
    const p = [
      pelvis[0] + frame.x[0] * b.o[0] + frame.y[0] * b.o[1] + frame.z[0] * b.o[2],
      pelvis[1] + frame.x[1] * b.o[0] + frame.y[1] * b.o[1] + frame.z[1] * b.o[2],
      pelvis[2] + frame.x[2] * b.o[0] + frame.y[2] * b.o[1] + frame.z[2] * b.o[2],
    ];
    // yukarıdaki parçalar (baş, omuz) daha hızlı öne gider → öne takla
    const hk = b.o[1] / 0.66;
    const keep = L.keep + L.over * hk * 0.5;
    const up = L.pop + L.popK * sp + hk * 0.25;
    // yana yatış: sol / sağ omuz biraz farklı → takla eğik olur, gövde yan döner
    const tw = b.o[0] * (rnd() - 0.5) * 2.2;
    return { p, q: p.slice(), v: [vel[0] * keep + fwd[0] * tw + sideV[0], up + (vel[1] || 0), vel[2] * keep + fwd[2] * tw + sideV[2]], r: b.r, c: 0 };
  });
  const cons = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) cons.push([i, j, len(sub(ps[i].p, ps[j].p))]);
  return { ps, cons, t: 0, air: 1, airT: 0, rest: 0, still: 0, hitMax: 0, hits: [], ground: 0, slide: 0 };
}

function mulberry(a) {
  let s = a >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Çevre: world.boxes = [{ x, z, w, d, h, y0?, ry?, self? }] (duvar, bariyer, araba, direk, bineğin kendisi)
// world.groundY(x, z, y) → zemin yüksekliği (yoksa 0) — parçacık başına alt adımda BİR kez sorulur
// world.blocked(x, z, r) → şehrin 2B engel ızgarası (bina, duvar) — parçacık başına alt adımda BİR kez
const G = 9.8;
const E_GROUND = 0.22; // yerde sekme
const E_WALL = 0.12; // duvara yapışır gibi
const MU = 0.7; // asfaltta kayma sürtünmesi (μ·g ≈ 6,9 m/sn² yavaşlama)
const ROLL_DAMP = 1.6; // yerde yuvarlanırken / sürünürken ek enerji kaybı (1/sn)
const H = 1 / 120;

// Bir adım ilerlet (sabit 1/120 sn alt adımlarla). Dönen: bu adımdaki en sert temas (m/sn) — ses / sarsıntı için
export function stepRagdoll(rd, dt, world) {
  let hit = 0;
  let acc = Math.min(dt, 0.1);
  while (acc > 1e-6) {
    const h = Math.min(H, acc);
    acc -= h;
    hit = Math.max(hit, subStep(rd, h, world));
  }
  rd.t += dt;
  return hit;
}

function subStep(rd, h, world) {
  const { ps, cons } = rd;
  const boxes = world.boxes || [];
  const gy = world.groundY || (() => 0);
  const blocked = world.blocked || null;
  for (const a of ps) {
    a.v[1] -= G * h;
    const drag = Math.exp(-0.05 * h); // hava direnci (az)
    a.v[0] *= drag;
    a.v[1] *= drag;
    a.v[2] *= drag;
    a.q[0] = a.p[0];
    a.q[1] = a.p[1];
    a.q[2] = a.p[2];
    a.p[0] += a.v[0] * h;
    a.p[1] += a.v[1] * h;
    a.p[2] += a.v[2] * h;
    a.c = 0;
    a.n = null;
    a.gy = gy(a.p[0], a.p[2], a.q[1]) + a.r;
  }
  // kısıtlar + temaslar (birkaç tur)
  for (let it = 0; it < 6; it++) {
    for (const [i, j, d0] of cons) {
      const A = ps[i];
      const B = ps[j];
      const dx = B.p[0] - A.p[0];
      const dy = B.p[1] - A.p[1];
      const dz = B.p[2] - A.p[2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const k = ((d - d0) / d) * 0.5;
      A.p[0] += dx * k;
      A.p[1] += dy * k;
      A.p[2] += dz * k;
      B.p[0] -= dx * k;
      B.p[1] -= dy * k;
      B.p[2] -= dz * k;
    }
    for (const a of ps) {
      const g = a.gy;
      if (a.p[1] < g) {
        a.p[1] = g;
        a.c = 1;
        a.n = [0, 1, 0];
      }
      for (const b of boxes) collideBox(a, b);
    }
  }
  // 2B engel ızgarası (şehir): engele giren parçacık yatayda geri alınır, duvar teması sayılır
  if (blocked) {
    for (const a of ps) {
      if (!blocked(a.p[0], a.p[2], a.r)) continue;
      if (blocked(a.q[0], a.q[2], a.r)) continue; // zaten içindeydi (başlangıç) — itme yok
      let dx = a.q[0] - a.p[0];
      let dz = a.q[2] - a.p[2];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      a.p[0] = a.q[0];
      a.p[2] = a.q[2];
      a.c = 2;
      a.n = [dx, 0, dz];
    }
  }
  // hız = konum farkı; temasta sekme + sürtünme
  let hit = 0;
  let ground = 0;
  for (const a of ps) {
    const nv = [(a.p[0] - a.q[0]) / h, (a.p[1] - a.q[1]) / h, (a.p[2] - a.q[2]) / h];
    if (a.c && a.n) {
      const n = a.n;
      const vin = dot(a.v, n); // temas öncesi normal hız (<0: çarpıyor)
      const vnNow = dot(nv, n);
      const t = [nv[0] - n[0] * vnNow, nv[1] - n[1] * vnNow, nv[2] - n[2] * vnNow];
      const e = a.c === 2 ? E_WALL : E_GROUND;
      const vnOut = vin < -1.2 ? -vin * e : Math.max(0, vnNow);
      const dvn = Math.max(0, vnOut - vin);
      const tl = len(t);
      // Coulomb: teğet hız, normal itki × μ kadar azalır (dinlenmede itki ≈ g·h → yavaşça durur)
      const fr = tl > 1e-6 ? Math.max(0, tl - MU * dvn) / tl : 0;
      a.v = [t[0] * fr + n[0] * vnOut, t[1] * fr + n[1] * vnOut, t[2] * fr + n[2] * vnOut];
      if (-vin > hit) hit = -vin;
      if (a.c === 1) ground++;
    } else a.v = nv;
  }
  rd.ground = ground;
  if (ground) {
    // yere değen gövde yuvarlanarak da enerji kaybeder (kıyafet, uzuvlar) — sonsuz takla atmasın
    const k = Math.exp(-ROLL_DAMP * h * Math.min(1, ground / 2));
    for (const a of ps) {
      a.v[0] *= k;
      a.v[2] *= k;
      if (a.v[1] > 0) a.v[1] *= k;
    }
  }
  rd.slide = ground ? Math.hypot(ps[0].v[0], ps[0].v[2]) : 0;
  // havada mı (yumuşatılmış), duruldu mu
  rd.air += ((ground ? 0 : 1) - rd.air) * Math.min(1, h * (ground ? 10 : 4));
  if (!ground) rd.airT += h;
  let vmax = 0;
  for (const a of ps) vmax = Math.max(vmax, len(a.v));
  rd.still = vmax < 0.3 && ground >= 2 ? rd.still + h : 0;
  if (rd.still > 0.5) rd.rest = 1;
  if (hit > rd.hitMax) rd.hitMax = hit;
  return hit;
}

// küre (parçacık) × kutu. Dışarı it, normali kaydet (üst yüzey → zemin gibi).
// b.ry: kutunun yönü (araç yaw'ı: ileri = (sin, cos)); d bu yönde, w yana.
// b.self: sürücünün kendi bineği — parçacık ondan bir kez ayrılana kadar çarpışmaz (başta üstünde oturuyor)
function collideBox(a, b) {
  const ry = b.ry || 0;
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  const toL = (x, z) => [(x - b.x) * cs - (z - b.z) * sn, (x - b.x) * sn + (z - b.z) * cs];
  const [lx, lz] = toL(a.p[0], a.p[2]);
  const [qx, qz] = toL(a.q[0], a.q[2]);
  const L = { p: [lx, a.p[1], lz], q: [qx, a.q[1], qz], r: a.r, c: 0, n: null };
  const hit = boxLocal(L, { x: 0, z: 0, w: b.w, d: b.d, h: b.h, y0: b.y0 });
  if (b.self) {
    a.free = a.free || {};
    if (!a.free[b.self]) {
      if (!hit) a.free[b.self] = true;
      return;
    }
  }
  if (!hit) return;
  // b.round: üstü yuvarlak (atın / devenin sırtı) — üstünde kalan parçacık yana kayar, sürücü sırtta asılı kalmaz
  if (b.round && L.n[1] > 0.7) L.p[0] += (L.p[0] >= 0 ? 1 : -1) * 0.9 * H;
  const [nx, ny, nz] = L.n;
  a.p[0] = b.x + L.p[0] * cs + L.p[2] * sn;
  a.p[1] = L.p[1];
  a.p[2] = b.z - L.p[0] * sn + L.p[2] * cs;
  a.n = [nx * cs + nz * sn, ny, -nx * sn + nz * cs];
  a.c = L.c;
}
function boxLocal(a, b) {
  const y0 = b.y0 || 0;
  const mnx = b.x - b.w / 2;
  const mxx = b.x + b.w / 2;
  const mnz = b.z - b.d / 2;
  const mxz = b.z + b.d / 2;
  const [px, py, pz] = a.p;
  const cx = Math.max(mnx, Math.min(mxx, px));
  const cy = Math.max(y0, Math.min(y0 + b.h, py));
  const cz = Math.max(mnz, Math.min(mxz, pz));
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > a.r * a.r) return false;
  let n;
  let pen;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    n = [dx / d, dy / d, dz / d];
    pen = a.r - d;
  } else {
    // merkez kutunun içinde: en yakın yüze çıkar (önceki konuma göre giriş yönü tercih edilir)
    const opts = [
      [px - mnx, [-1, 0, 0]],
      [mxx - px, [1, 0, 0]],
      [pz - mnz, [0, 0, -1]],
      [mxz - pz, [0, 0, 1]],
      [y0 + b.h - py, [0, 1, 0]],
    ];
    if (a.q[1] >= y0 + b.h - 0.02) opts[4][0] -= 10; // üstten geliyorsa tavana konar
    opts.sort((u, w) => u[0] - w[0]);
    n = opts[0][1];
    pen = opts[0][0] + a.r;
  }
  a.p[0] += n[0] * pen;
  a.p[1] += n[1] * pen;
  a.p[2] += n[2] * pen;
  a.c = n[1] > 0.7 ? 1 : 2; // üst yüzey = zemin, yan yüz = duvar
  a.n = n;
  return true;
}

// --- gövde ekseni (görüntü için) --------------------------------------------------------
// Dönen: { o: kalça konumu, x, y, z: eksenler } — Three.js'te Matrix4.makeBasis(x, y, z)
export function ragdollFrame(rd) {
  const [P, Hh, L, R] = rd.ps;
  const y = norm(sub(Hh.p, P.p));
  let x = sub(L.p, R.p);
  x = norm(sub(x, y.map((c) => c * dot(x, y))));
  const z = cross(x, y);
  return { o: P.p.slice(), x, y, z };
}

// Kalkış için yüz yönü (yere paralel): başın gösterdiği yön
export function ragdollHeading(rd) {
  const f = ragdollFrame(rd);
  const hx = f.y[0];
  const hz = f.y[2];
  if (Math.hypot(hx, hz) < 0.2) return Math.atan2(f.z[0], f.z[2]);
  return Math.atan2(hx, hz);
}

// --- kollar / bacaklar (Avatar3D eklemleri) --------------------------------------------
// Dönen: arms[i] = { x, z, ex }, legs[i] = { x, k } (i: 0 sağ, 1 sol — Avatar3D sırası; sx = ∓1)
// air: 0..1 (havada), t: sn, spin: gövde dönüş hızı (rad/sn), shock: son darbe (0..1)
export function limbPose(air, t, spin = 0, shock = 0) {
  const fl = Math.min(1, air * (0.6 + Math.min(1, spin / 6) * 0.6));
  const arms = [0, 1].map((i) => {
    const sx = i ? 1 : -1;
    const w = Math.sin(t * 13 + i * 2.1);
    const limp = { x: -0.35 + shock * 0.3 * Math.sin(t * 30 + i), z: sx * 1.25, ex: -0.25 };
    const flail = { x: -2.0 + w * 1.1, z: sx * (1.35 + Math.sin(t * 9 + i) * 0.5), ex: -0.6 - Math.max(0, w) * 0.8 };
    return { x: mix(limp.x, flail.x, fl), z: mix(limp.z, flail.z, fl), ex: mix(limp.ex, flail.ex, fl) };
  });
  const legs = [0, 1].map((i) => {
    const w = Math.sin(t * 10 + i * Math.PI);
    const limp = { x: -0.12 - i * 0.12, k: 0.18 + i * 0.25 };
    const flail = { x: -0.5 + w * 0.7, k: 0.6 + Math.max(0, -w) * 0.7 };
    return { x: mix(limp.x, flail.x, fl), k: mix(limp.k, flail.k, fl) };
  });
  return { arms, legs, flail: fl };
}
const mix = (a, b, k) => a + (b - a) * k;

// Gövdenin dönüş hızı (rad/sn): baş ile kalçanın göreli hızından
export function ragdollSpin(rd) {
  const [P, Hh] = rd.ps;
  const r = sub(Hh.p, P.p);
  const dv = sub(Hh.v, P.v);
  const l = len(r) || 1;
  return len(cross(r, dv)) / (l * l);
}

// --- devrilen iki teker (motor / bisiklet) -------------------------------------------------
// Sürücüsüz kalan motor yana yatar ve kayarak durur. c: { vx, vz, spin, roll, rollV, fall }
export function stepFallenBike(c, dt) {
  const target = (c.fall || 1) * 1.38;
  c.rollV = (c.rollV || 0) + ((target - (c.roll || 0)) * 30 - (c.rollV || 0) * 4) * dt;
  c.roll = (c.roll || 0) + c.rollV * dt;
  if (Math.abs(c.roll) > 1.38) {
    c.roll = Math.sign(c.roll) * 1.38;
    c.rollV *= -0.25; // yere vurup hafif seker
  }
  const sp = Math.hypot(c.vx, c.vz);
  const lying = Math.abs(c.roll) > 1.1;
  const dec = (lying ? 6.5 : 2.5) * dt;
  const k = sp > dec ? (sp - dec) / sp : 0;
  c.vx *= k;
  c.vz *= k;
  c.spin = (c.spin || 0) * Math.exp(-dt * (lying ? 2 : 0.8));
  return c;
}
