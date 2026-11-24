// =============================================================================
// houseFloors.js — v196 3 KATLI EV (şehirdeki "ev" binasının içi). Prototipten kaynak koduna aktarıldı.
// -----------------------------------------------------------------------------
// Katlar (Giriş / Üst kat / Çatı katı), iki merdiven, kat boşlukları, beşik çatı + çatı pencereleri,
// kesit görünümü (kameraya bakan duvarlar alçalır), kat başına mobilya grupları, çarpışma, oturma yerleri,
// kat-farkında yürüme / dokunarak gitme (rota merdivenlerden geçer), kamera sınırları.
// Ölçüler functions/homeGeometry.js ile ortak (sunucu aynı kurallarla doğrular).
// Eşyalar dışarıdan verilir (ml.setItems) — kimin evi içerideyse onun belgesi (houses/home_{uid}).
// =============================================================================
import * as THREE from 'three';
import { Kit, M, GLASS, wallMat } from '../kit.js';
import { CATALOG_MAP, itemBoxes } from '../../HouseScreen/houseCatalog.js';
import { floorDef, wallDef, tileBaseTexture } from '../../HouseScreen/houseTextures.js';

// v198: bir nesnenin kendi (paylaşılmayan) geometri / malzeme / dokularını bırakır
function freeObj(o) {
  o.traverse((c) => {
    if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose();
    if (c.material) {
      [].concat(c.material).forEach((m) => {
        if (!m || m.userData?.shared) return;
        if (m.userData?.tex) m.userData.tex.dispose?.();
        m.dispose();
      });
    }
  });
}
import { FLOOR_Y as UP, SLAB, WALL_H, HALF_W as EF, HALF_D as TF, ROOF_HALF_W as QP, ROOF_RISE as KP, ROOF_SPAN as CF, RAMPS as RAMP_DEFS, HOLE_1 as XP, HOLE_2 as ZP, WALL_GAP, DIVIDER_SEGS, DIV_FACE, divLocal, divWorld } from '../../../../functions/homeGeometry.js';

const PI = Math.PI;
const GP = UP[2]; // saçak (çatı katı zemini) yüksekliği
const STEP = 0.75; // bir adımda çıkılabilen yükseklik
const HEAD = 2.0; // v198: merdivenin altından geçmek için gereken boşluk
const DIVIDER_KEYS = new Set(['wall2', 'wall4', 'walldoor']); // v198: duvar kaplamasını kullanan bölmeler
export const HOUSE_EXT_H = 12.76; // binanın dış yüksekliği (çatı sırtı)
const YP = RAMP_DEFS.map((r) => ({ ...r, base: UP[r.base], top: UP[r.top] }));
const LNE = Math.atan2(KP, CF);
const roofY = (x) => GP + KP * (1 - Math.abs(x) / CF) - 0.25;
const NORMALS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const alongX = (n) => n === 0 || n === 2; // ön / arka duvar
const DORMERS = [{ u0: 1.3, u1: 3.7, z0: -4.6, z1: -2.6 }, { u0: 1.3, u1: 3.7, z0: 2.6, z1: 4.6 }];
// merdiven rota düğümleri (dokunarak gitme)
const RF = [
  { lo: 0, hub: [-7, 4.6], bot: [-8.3, 4], top: [-8.3, -3.1], up: [-7, -3.1] },
  { lo: 1, hub: [5.6, -4.8], bot: [5.5, -6.3], top: [-1.7, -6.3], up: [-1.7, -4.9] },
];
const inBox = (b, x, z) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
const rampLerp = (r, t, run) => r.base + (r.top - r.base) * Math.min(1, Math.max(0, t + 0.14 / run));
const floorOfY = (y) => (y > UP[2] - 0.5 ? 2 : y > UP[1] - 0.5 ? 1 : +(y > 1.9));
export const houseLevel = (y) => (y > UP[2] - 1.6 ? 2 : +(y > UP[1] - 1.6));
const levelOfY = (y) => (Math.abs(y - UP[0]) < 0.35 ? 0 : Math.abs(y - UP[1]) < 0.35 ? 1 : Math.abs(y - UP[2]) < 0.35 ? 2 : -1);

function rampAt(r, x, z) {
  const along = r.ax === 'z' ? z : x;
  const cross = r.ax === 'z' ? x : z;
  const run = Math.abs(r.d1 - r.d0);
  const t = (along - r.d0) / (r.d1 - r.d0);
  return { t, run, inside: t >= 0 && t <= 1 && cross > r.c0 && cross < r.c1 };
}
const tmpGrounds = [];
function groundsAt(x, z, out) {
  out.length = 0;
  if (Math.abs(x) > EF || Math.abs(z) > TF) return out;
  out.push(UP[0]);
  if (!inBox(XP, x, z)) out.push(UP[1]);
  if (Math.abs(x) <= QP && !inBox(ZP, x, z)) out.push(UP[2]);
  for (const r of YP) {
    const a = rampAt(r, x, z);
    if (a.inside) out.push(rampLerp(r, a.t, a.run));
  }
  return out;
}
// (x, z)'de y'nin altında kalan en yüksek basılabilir zemin
function groundAt(x, z, y) {
  if (y == null) return null;
  groundsAt(x, z, tmpGrounds);
  let best = null;
  for (const g of tmpGrounds) if (g <= y + STEP && (best === null || g > best)) best = g;
  return best;
}
// mobilya çarpışma kutuları (kat başına)
const solidsByFloor = [[], [], []];
function boxHit(b, x, z, pad) {
  const dx = x - b.x;
  const dz = z - b.z;
  const u = dx * b.c - dz * b.s;
  const v = dx * b.s + dz * b.c;
  return Math.abs(u) < b.hw + pad && Math.abs(v) < b.hd + pad;
}
function rebuildSolids(items) {
  solidsByFloor.forEach((l) => (l.length = 0));
  items.forEach((it) => {
    const def = CATALOG_MAP[it.k];
    if (!def || !solidsByFloor[it.f]) return;
    const a = (it.r * PI) / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    itemBoxes(def).forEach(([bx, bz, hw, hd]) => solidsByFloor[it.f].push({ x: it.x + bx * c + bz * s, z: it.z - bx * s + bz * c, c, s, hw, hd }));
  });
}
// v197: döndürülmüş çarpışma kutularının merkeze göre sınırları [minX, maxX, minZ, maxZ] (yoksa null)
function itemExtent(def, r) {
  const boxes = def ? itemBoxes(def) : [];
  if (!boxes.length) return null;
  const a = ((r || 0) * PI) / 4;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = [1e9, -1e9, 1e9, -1e9];
  boxes.forEach(([bx, bz, hw, hd]) => {
    const px = bx * c + bz * s;
    const pz = -bx * s + bz * c;
    const wx = hw * Math.abs(c) + hd * Math.abs(s);
    const wz = hw * Math.abs(s) + hd * Math.abs(c);
    o[0] = Math.min(o[0], px - wx);
    o[1] = Math.max(o[1], px + wx);
    o[2] = Math.min(o[2], pz - wz);
    o[3] = Math.max(o[3], pz + wz);
  });
  return o;
}
function blockedPoint(x, z, y) {
  const upper = y > 1.9;
  if (Math.abs(x) > EF - 0.05 || Math.abs(z) > TF - 0.05) return upper;
  const g = groundAt(x, z, y);
  if (g === null || g < y - STEP) return true;
  for (const r of YP) {
    if (y < r.base - 0.3 || y > r.top - 0.3) continue;
    const a = rampAt(r, x, z);
    // v198: merdivenin ALTI baş hizasından yüksekse yürünür (eskiden merdivenin altı komple duvardı;
    // avatar altına düz giremiyor, yanlardan dolanıyordu)
    if (a.inside) {
      const h = rampLerp(r, a.t, a.run);
      if (h > y + STEP && h < y + HEAD) return true;
    }
  }
  if (y > UP[2] - 0.4 && Math.abs(x) > QP - 0.05) return true;
  const lv = levelOfY(y);
  if (lv >= 0) for (const b of solidsByFloor[lv]) if (boxHit(b, x, z, 0.04)) return true;
  return false;
}
function blocked(x, z, rad, y) {
  if (y == null) return false;
  const k = rad * 0.8;
  return blockedPoint(x, z, y) || blockedPoint(x + k, z, y) || blockedPoint(x - k, z, y) || blockedPoint(x, z + k, y) || blockedPoint(x, z - k, y);
}
// ekran ışını → hangi katın zeminine değdi (oda yerel)
function pick(origin, dir) {
  if (dir.y > -0.02) return null;
  let prevY = origin.y;
  for (let t = 0.1; t < 60; t += 0.06) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    if (y < -1) break;
    if (Math.abs(x) < EF && Math.abs(z) < TF) {
      groundsAt(x, z, tmpGrounds);
      for (const g of tmpGrounds) if (prevY >= g && y <= g) return { x, z, y: g };
    }
    prevY = y;
  }
  return null;
}
// v198 — TELEFONDA KAT DEĞİŞTİRME: merdivene dokununca merdivenin ortasında durulmaz; aşağıdaysan
// üst kata (merdivenin çıkışı), yukarıdaysan alt kata (merdivenin dibi) yürünür.
function stairGoal(g, y) {
  if (!g) return null;
  for (let i = 0; i < YP.length; i++) {
    const r = YP[i];
    const a = rampAt(r, g.x, g.z);
    if (!a.inside) continue;
    const h = rampLerp(r, a.t, a.run);
    if (Math.abs(g.y - h) > 0.3 || h - r.base < 0.3 || r.top - h < 0.3) continue; // dokunulan yer merdivenin basamağı
    const here = floorOfY(y);
    if (here <= RF[i].lo) return { x: RF[i].up[0], z: RF[i].up[1], y: r.top };
    return { x: RF[i].hub[0], z: RF[i].hub[1], y: r.base };
  }
  return null;
}
// v199 — KAT İÇİ YOL BULMA: eskiden rota merdiven düğümleri arasında düz çizgiydi, mobilyayı hesaba
// katmıyordu → merdiven başına / yoluna konan bir koltuk, masa avatarı takıyordu ("3. kata çıkamıyorum",
// "merdivene yakın yerlerde düzgün yürümüyor"). Artık her kat içi ayak 0,2 m ızgarada A* ile dolaşılır.
const PATH_R = 0.3;
const CELL = 0.2;
function floorFree(x, z, f) {
  const y = UP[f];
  if (blocked(x, z, PATH_R, y)) return false;
  const g = groundAt(x, z, y);
  return g != null && Math.abs(g - y) < 0.05;
}
function lineFree(a, b, f) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(d / 0.12));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (!floorFree(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, f)) return false;
  }
  return true;
}
function gridPath(a, b, f) {
  const hx = f === 2 ? QP : EF;
  const NX = Math.floor((hx * 2) / CELL);
  const NZ = Math.floor((TF * 2) / CELL);
  const ix = (x) => Math.max(0, Math.min(NX - 1, Math.floor((x + hx) / CELL)));
  const iz = (z) => Math.max(0, Math.min(NZ - 1, Math.floor((z + TF) / CELL)));
  const cx = (i) => -hx + (i + 0.5) * CELL;
  const cz = (j) => -TF + (j + 0.5) * CELL;
  const free = new Int8Array(NX * NZ).fill(-1); // -1 bilinmiyor
  const ok = (i, j) => {
    const k = j * NX + i;
    if (free[k] < 0) free[k] = floorFree(cx(i), cz(j), f) ? 1 : 0;
    return free[k] === 1;
  };
  // başlangıç / hedef dolu hücredeyse en yakın boş hücre
  const near = (x, z) => {
    const i0 = ix(x);
    const j0 = iz(z);
    for (let r = 0; r < 8; r++) {
      let best = null;
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= NX || j >= NZ || !ok(i, j)) continue;
          const d = Math.hypot(cx(i) - x, cz(j) - z);
          if (!best || d < best.d) best = { i, j, d };
        }
      }
      if (best) return best;
    }
    return null;
  };
  const s = near(a[0], a[1]);
  const t = near(b[0], b[1]);
  if (!s || !t) return null;
  const S = s.j * NX + s.i;
  const T = t.j * NX + t.i;
  const g = new Float32Array(NX * NZ).fill(Infinity);
  const from = new Int32Array(NX * NZ).fill(-1);
  const done = new Uint8Array(NX * NZ);
  const open = [S];
  g[S] = 0;
  const h = (k) => {
    const dx = Math.abs((k % NX) - t.i);
    const dz = Math.abs(((k / NX) | 0) - t.j);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  let found = false;
  let guard = 0;
  while (open.length && guard++ < 20000) {
    let bi = 0;
    for (let q = 1; q < open.length; q++) if (g[open[q]] + h(open[q]) < g[open[bi]] + h(open[bi])) bi = q;
    const k = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === T) {
      found = true;
      break;
    }
    const i = k % NX;
    const j = (k / NX) | 0;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ || !ok(ni, nj)) continue;
        if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue; // köşeden kesme
        const nk = nj * NX + ni;
        const ng = g[k] + (di && dj ? 1.414 : 1);
        if (ng < g[nk]) {
          g[nk] = ng;
          from[nk] = k;
          open.push(nk);
        }
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = T; k !== -1; k = from[k]) cells.push([cx(k % NX), cz((k / NX) | 0)]);
  cells.reverse();
  cells[cells.length - 1] = [b[0], b[1]];
  // görüş hattıyla sadeleştir
  const out = [];
  let cur = [a[0], a[1]];
  let q = 0;
  while (q < cells.length) {
    let far = q;
    for (let r = cells.length - 1; r > q; r--) {
      if (lineFree(cur, cells[r], f)) {
        far = r;
        break;
      }
    }
    out.push(cells[far]);
    cur = cells[far];
    q = far + 1;
  }
  return out;
}
// bir kat içinde a → b: engel yoksa düz, varsa mobilyanın etrafından
function leg(a, b, f) {
  if (lineFree(a, b, f)) return [b];
  return gridPath(a, b, f) || [b];
}
// kat değiştiren yürüme rotası (merdiven düğümleri üzerinden; kat içi ayaklar mobilyayı dolaşır)
function route(a, b) {
  let fa = floorOfY(a.y);
  const fb = floorOfY(b.y);
  const pts = [];
  let cur = [a.x, a.z];
  const walk = (to, f) => {
    pts.push(...leg(cur, to, f));
    cur = to;
  };
  const climb = (to) => {
    pts.push(to);
    cur = to;
  };
  for (const r of YP) {
    if (!rampAt(r, a.x, a.z).inside || a.y < r.base + 0.3 || a.y > r.top - 0.3) continue;
    const i = YP.indexOf(r);
    const goingUp = fb > RF[i].lo;
    climb(goingUp ? RF[i].top : RF[i].bot);
    fa = goingUp ? RF[i].lo + 1 : RF[i].lo;
    walk(goingUp ? RF[i].up : RF[i].hub, fa);
  }
  while (fa !== fb) {
    if (fb > fa) {
      const r = RF[fa];
      walk(r.hub, fa);
      walk(r.bot, fa);
      climb(r.top);
      fa += 1;
      walk(r.up, fa);
    } else {
      const r = RF[fa - 1];
      walk(r.up, fa);
      walk(r.top, fa);
      climb(r.bot);
      fa -= 1;
      walk(r.hub, fa);
    }
  }
  walk([b.x, b.z], fb);
  return pts;
}

export const HOME_FLOOR_DEFAULT = 'parke_ceviz';
export const HOME_WALL_DEFAULT = 'boya_krem';
// ---- yapı parçaları -----------------------------------------------------------------------
// deneme eşyası: malzemeler kopyalanıp yarı saydam (paylaşılan malzemeye dokunulmaz)
const ghostCache = new WeakMap();
function ghostify(o) {
  o.traverse((q) => {
    if (!q.isMesh || !q.material) return;
    const one = (m) => {
      let g = ghostCache.get(m);
      if (!g) {
        g = m.clone();
        g.transparent = true;
        g.opacity = Math.min(m.opacity ?? 1, 0.42);
        g.depthWrite = false;
        ghostCache.set(m, g);
      }
      return g;
    };
    q.material = Array.isArray(q.material) ? q.material.map(one) : one(q.material);
    q.castShadow = false;
  });
}
// v196: kat başına kaplama — her katın kendi malzemesi (noDedupe: birleştirmede ayrı kalır, kat katlar
// birbirine karışmaz). Kaplama değişince yeni mesh kurulmaz; malzemenin dokusu yerinde değişir.
function paintSurf(m, def, rough) {
  const t = tileBaseTexture(def).clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const r = m.userData.baseRep / (def.rep || m.userData.baseRep);
  t.repeat.set(r, r);
  const old = m.map;
  m.map = t;
  m.roughness = rough ?? def.rough ?? 0.8;
  m.userData.key = def.key;
  m.needsUpdate = true;
  if (old && old !== t) old.dispose();
}
function ownSurf(def, rough, baseRep) {
  const m = new THREE.MeshStandardMaterial({ roughness: rough });
  m.userData.noDedupe = true;
  m.userData.baseRep = baseRep;
  paintSurf(m, def, rough);
  return m;
}
// yatay döşeme parçası (UV dünya ölçeğinde, yan yana kesintisiz)
function floorPlane(g, mat, rep, x0, x1, z0, z1, y, up = true) {
  const w = x1 - x0;
  const d = z1 - z0;
  const geo = new THREE.PlaneGeometry(w, d);
  const uv = geo.attributes.uv;
  const cz = (z0 + z1) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * w) / rep, (up ? -cz + (uv.getY(i) - 0.5) * d : cz + (uv.getY(i) - 0.5) * d) / rep);
  const m = new THREE.Mesh(geo, mat);
  m.position.set((x0 + x1) / 2, y, cz);
  m.rotation.x = up ? -PI / 2 : PI / 2;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
// dik duvar yüzü. n = [nx, nz] normal (iç tarafa)
function wallPlane(g, mat, rep, a0, a1, y0, y1, at, n) {
  const w = a1 - a0;
  const h = y1 - y0;
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (a0 + uv.getX(i) * w) / rep, (y0 + uv.getY(i) * h) / rep);
  const m = new THREE.Mesh(geo, mat);
  const c = (a0 + a1) / 2;
  if (n[0] === 0) m.position.set(c, (y0 + y1) / 2, at);
  else m.position.set(at, (y0 + y1) / 2, c);
  m.rotation.y = n[1] === 1 ? 0 : n[1] === -1 ? PI : n[0] === 1 ? PI / 2 : -PI / 2;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function box(g, w, h, d, mat, x, y, z, ry = 0, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  m.castShadow = cast;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
// tırabzan: dikmeler + eğimli küpeşte
function railing(g, x0, z0, y0, x1, z1, y1, mat) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.55));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    box(g, 0.05, 0.95, 0.05, mat, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, 0, false);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, Math.hypot(len, y1 - y0)), mat);
  top.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.98, (z0 + z1) / 2);
  top.rotation.order = 'YXZ';
  top.rotation.y = Math.atan2(x1 - x0, z1 - z0);
  top.rotation.x = -Math.atan2(y1 - y0, len);
  g.add(top);
}
function stairs(g, r, bodyM, treadM) {
  const run = Math.abs(r.d1 - r.d0);
  const dir = Math.sign(r.d1 - r.d0);
  const step = run / 20;
  const wd = r.c1 - r.c0;
  const cc = (r.c0 + r.c1) / 2;
  for (let i = 0; i < 20; i++) {
    const y = r.base + ((r.top - r.base) * (i + 1)) / 20;
    const a = r.d0 + dir * (i + 0.5) * step;
    const h = y - r.base;
    if (r.ax === 'z') {
      box(g, wd, h, step + 0.01, bodyM, cc, r.base, a);
      box(g, wd + 0.04, 0.04, step + 0.04, treadM, cc, y - 0.02, a, 0, false);
    } else {
      box(g, step + 0.01, h, wd, bodyM, a, r.base, cc);
      box(g, step + 0.04, 0.04, wd + 0.04, treadM, a, y - 0.02, cc, 0, false);
    }
  }
}
// duvar şeridini delikler (kapı / pencere) etrafında parçalara böler: [a0, a1, y0, y1][]
function splitHoles(a0, a1, y0, y1, holes) {
  const out = [];
  let cur = a0;
  holes
    .slice()
    .sort((p, q) => p.a0 - q.a0)
    .forEach((h) => {
      if (h.a0 > cur) out.push([cur, h.a0, y0, y1]);
      if (h.y0 > y0) out.push([h.a0, h.a1, y0, h.y0]);
      if (h.y1 < y1) out.push([h.a0, h.a1, h.y1, y1]);
      cur = Math.max(cur, h.a1);
    });
  if (cur < a1) out.push([cur, a1, y0, y1]);
  return out;
}
function wallSeg(g, side, a0, a1, y0, y1, at, t, mat, cast = true) {
  const w = a1 - a0;
  const c = (a0 + a1) / 2;
  return alongX(side) ? box(g, w, y1 - y0, t, mat, c, y0, at, 0, cast) : box(g, t, y1 - y0, w, mat, at, y0, c, 0, cast);
}
function frame(g, side, h, at, mat, { bars = 0, hbars = 0, d = 0.08, t = 0.07 } = {}) {
  const { a0, a1, y0, y1 } = h;
  wallSeg(g, side, a0 - t, a1 + t, y1, y1 + t, at, d, mat, false);
  wallSeg(g, side, a0 - t, a1 + t, y0 - t, y0, at, d, mat, false);
  wallSeg(g, side, a0 - t, a0, y0, y1, at, d, mat, false);
  wallSeg(g, side, a1, a1 + t, y0, y1, at, d, mat, false);
  for (let i = 1; i <= bars; i++) {
    const a = a0 + ((a1 - a0) * i) / (bars + 1);
    wallSeg(g, side, a - t / 2, a + t / 2, y0, y1, at, d * 0.8, mat, false);
  }
  for (let i = 1; i <= hbars; i++) {
    const y = y0 + ((y1 - y0) * i) / (hbars + 1);
    wallSeg(g, side, a0, a1, y - t / 2, y + t / 2, at, d * 0.8, mat, false);
  }
}
// v196: pencere modeli / rengi (evin penceresine dokununca). Ev belgesi: win: { [id]: { m, c } }
export const WIN_MODELS = ['Klasik', 'Tek cam', 'Kafes', 'Panjurlu'];
export const WIN_COLORS = [
  ['Beyaz', '#f7f3ec'],
  ['Krem', '#e6d8bd'],
  ['Ahşap', '#7a5234'],
  ['Ceviz', '#3f2a1c'],
  ['Siyah', '#1d1d1f'],
  ['Antrasit', '#4a4f57'],
  ['Yeşil', '#2f5d3a'],
  ['Lacivert', '#23395d'],
];
function drawWindow(w, st) {
  const m = Math.max(0, Math.min(WIN_MODELS.length - 1, st?.m | 0));
  const mat = M(WIN_COLORS[Math.max(0, Math.min(WIN_COLORS.length - 1, st?.c | 0))][1], 0.55);
  const { side, h, big } = w;
  const nn = alongX(side) ? NORMALS[side][1] : NORMALS[side][0];
  const barsN = big ? Math.max(1, Math.round((h.a1 - h.a0) / 1.7) - 1) : 1;
  const bars = m === 1 ? 0 : barsN;
  const hbars = m === 2 ? (big ? 2 : 1) : 0;
  const og = w.og;
  const ig = w.ig;
  frame(og, side, h, w.outer + nn * 0.03, mat, { bars, hbars });
  frame(ig, side, h, w.inner - nn * 0.03, mat, { bars, hbars });
  if (!big) {
    wallSeg(og, side, h.a0 - 0.18, h.a1 + 0.18, h.y0 - 0.14, h.y0 - 0.04, w.outer + nn * 0.12, 0.26, mat, false);
    wallSeg(ig, side, h.a0 - 0.12, h.a1 + 0.12, h.y0 - 0.1, h.y0 - 0.04, w.inner - nn * 0.1, 0.2, mat, false);
  }
  if (m === 3 && !big) {
    // panjurlar: pencerenin iki yanında, dışta (çıtalı)
    const sw = (h.a1 - h.a0) / 2;
    const at = w.outer + nn * 0.05;
    const slat = M(WIN_COLORS[Math.max(0, Math.min(WIN_COLORS.length - 1, st?.c | 0))][1], 0.7);
    for (const [s0, s1] of [[h.a0 - 0.09 - sw, h.a0 - 0.09], [h.a1 + 0.09, h.a1 + 0.09 + sw]]) {
      wallSeg(og, side, s0, s1, h.y0 - 0.02, h.y1 + 0.02, at, 0.05, mat, false);
      for (let y = h.y0 + 0.14; y < h.y1 - 0.05; y += 0.16) wallSeg(og, side, s0 + 0.05, s1 - 0.05, y - 0.02, y + 0.02, at + nn * 0.03, 0.03, slat, false);
    }
  }
}
function pane(g, side, h, at) {
  const n = NORMALS[side];
  const m = wallPlane(g, GLASS(), 1, h.a0, h.a1, h.y0, h.y1, at, n);
  m.renderOrder = 5;
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.window = { side, a0: h.a0, a1: h.a1, y0: h.y0, y1: h.y1 }; // v196: pencereye dokununca renk / model
  return m;
}
// bir kat duvarı (dış + iç yüz + pencereler)
function storeyWall(outG, inG, side, { T, yb, yt, yIn0, yIn1, holes, extM, wallM, wr, storey, wins }) {
  const n = NORMALS[side];
  const half = alongX(side) ? EF : TF;
  const mid = alongX(side) ? n[1] * (TF + T / 2) : n[0] * (EF + T / 2);
  const outer = alongX(side) ? n[1] * (TF + T) : n[0] * (EF + T);
  const inner = alongX(side) ? n[1] * (TF - 0.01) : n[0] * (EF - 0.01);
  const span = alongX(side) ? half + T : half;
  splitHoles(-span, span, yb, yt, holes).forEach(([a0, a1, y0, y1]) => wallSeg(outG, side, a0, a1, y0, y1, mid, T, extM));
  splitHoles(-half, half, yIn0, yIn1, holes.map((h) => ({ ...h, y0: Math.max(h.y0, yIn0), y1: Math.min(h.y1, yIn1) }))).forEach(([a0, a1, y0, y1]) => wallPlane(inG, wallM, wr, a0, a1, y0, y1, inner, [-n[0], -n[1]]));
  // pencere çerçeveleri ayrı grupta (kendi içinde birleşir; model / renk değişince sadece o duvarınki yeniden kurulur)
  const og = new THREE.Group();
  const ig = new THREE.Group();
  og.userData.noMerge = true;
  ig.userData.noMerge = true;
  outG.add(og);
  if (inG !== outG) inG.add(ig);
  else og.add(ig);
  const list = [];
  holes.filter((h) => !h.door).forEach((h, i) => {
    pane(outG, side, h, mid);
    list.push({ id: `${storey}_${side}_${i}`, storey, side, h, big: Boolean(h.big), outer, inner, mid, og, ig });
  });
  wins.push({ og, ig, list });
}
function roof(g, { roofM, ceilM, trimM, T }) {
  const slopeLen = Math.hypot(CF, KP) + 0.05;
  const thick = 0.3;
  const depth = TF + T + 0.5;
  const mats = [roofM, roofM, roofM, ceilM, roofM, roofM];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, roofY(0), 0);
    pivot.rotation.set(0, side > 0 ? 0 : PI, -LNE);
    g.add(pivot);
    const holes = DORMERS.map((d) => ({ a0: d.z0, a1: d.z1, y0: d.u0, y1: d.u1 }));
    splitHoles(-depth, depth, 0, slopeLen, holes).forEach(([a0, a1, y0, y1]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(y1 - y0, thick, a1 - a0), mats);
      m.position.set((y0 + y1) / 2, thick / 2, (a0 + a1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.noMerge = true;
      pivot.add(m);
    });
    DORMERS.forEach((d) => {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(d.u1 - d.u0, d.z1 - d.z0), GLASS());
      gl.rotation.x = -PI / 2;
      gl.position.set((d.u0 + d.u1) / 2, thick * 0.6, (d.z0 + d.z1) / 2);
      gl.renderOrder = 5;
      pivot.add(gl);
      const bar = (w, l, x, z) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, l), trimM);
        b.position.set(x, 0.34, z);
        pivot.add(b);
      };
      bar(d.u1 - d.u0 + 0.16, 0.08, (d.u0 + d.u1) / 2, d.z0 - 0.04);
      bar(d.u1 - d.u0 + 0.16, 0.08, (d.u0 + d.u1) / 2, d.z1 + 0.04);
      bar(0.08, d.z1 - d.z0, d.u0 - 0.04, (d.z0 + d.z1) / 2);
      bar(0.08, d.z1 - d.z0, d.u1 + 0.04, (d.z0 + d.z1) / 2);
      bar(0.05, d.z1 - d.z0, (d.u0 + d.u1) / 2, (d.z0 + d.z1) / 2);
    });
  }
  box(g, 0.34, 0.24, (TF + T + 0.5) * 2, M('#2a1e1b', 0.8), 0, roofY(0) + 0.3 / Math.cos(LNE) - 0.05, 0, 0, false);
}

// ---- ANA KURULUM -------------------------------------------------------------------------
// P: newParts('ev') (venues.js) — root, low[4], lowInner[4], stubs[4], int (Kit), base
export function buildHouseFloors(P, { RX, RZ, T, doorX, doorW = 1.1, doorH = 2.25 }) {
  const W2 = EF * 2;
  const D2 = TF * 2;
  const root = new THREE.Group();
  root.name = 'ev_katlar';
  root.position.set(RX, 0, RZ);
  P.root.add(root);
  const grp = (name) => {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    return g;
  };
  const k0 = grp('ev_k0');
  const ceil0 = grp('ev_tavan0');
  const k1 = grp('ev_k1');
  const ceil1 = grp('ev_tavan1');
  const k2 = grp('ev_k2');
  const roofG = grp('ev_cati');
  const w1 = [0, 1, 2, 3].map((i) => grp(`ev_k1_${i}`));
  const w1dip = [0, 1, 2, 3].map((i) => grp(`ev_k1_dip${i}`));
  const w2 = [0, 1, 2, 3].map((i) => grp(`ev_k2_${i}`));
  const w2dip = [0, 1, 2, 3].map((i) => grp(`ev_k2_dip${i}`));
  [...w1dip, ...w2dip].forEach((g) => (g.visible = false));
  // kaplamalar (kat başına değiştirilebilir — setSurfaces)
  const parke = floorDef(HOME_FLOOR_DEFAULT);
  const boya = wallDef(HOME_WALL_DEFAULT);
  const fRep0 = parke.rep || 2;
  const wRep0 = boya.rep || 3;
  const floorM = [0, 1, 2].map(() => ownSurf(parke, 0.5, fRep0));
  const wallMs = [0, 1, 2].map(() => ownSurf(boya, 0.9, wRep0));
  const wallM = wallMs[0];
  // v198: duvar bölücü / kapılı bölme malzemesi — kat başına, o katın duvar kaplamasıyla aynı desen
  // (bölücünün UV'si 4 m genişlik × duvar yüksekliği; eski ev motorundaki dividerMat ile aynı ölçek)
  const divMs = [0, 1, 2].map(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    m.userData.shared = true; // eşyalar silinirken bırakılmasın
    m.userData.noDedupe = true;
    return m;
  });
  const paintDiv = (m, def) => {
    const t = tileBaseTexture(def).clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const rep = def.rep || 3;
    t.repeat.set(4 / rep, WALL_H / rep);
    const old = m.map;
    m.map = t;
    m.roughness = def.rough ?? 0.9;
    m.userData.key = def.key;
    m.needsUpdate = true;
    if (old && old !== t) old.dispose();
  };
  divMs.forEach((m) => paintDiv(m, boya));
  const extM = wallMat('boya_krem');
  const ceilM = M('#f4f1ea', 0.9);
  const slabEdgeM = M('#e8e1d4', 0.8);
  const trimM = M('#f7f3ec', 0.55);
  const roofM = M('#3b2a26', 0.8);
  const stairM = M('#6b4630', 0.55);
  const treadM = M('#e6dccb', 0.85);
  const railM = M('#2b2420', 0.5, 0.3);
  const fRep = fRep0;
  const wRep = wRep0;
  const [, F1, F2] = UP;
  // giriş katı zemini (kabuğun zemininin hemen üstünde; kaplaması değiştirilebilir)
  floorPlane(k0, floorM[0], fRep, -EF, EF, -TF, TF, UP[0] + 0.004, true);
  // 1. kat döşemesi (merdiven boşluğu hariç) + 0. kat tavanı
  [[XP.x1, EF, -TF, TF], [-EF, XP.x1, -TF, XP.z0], [-EF, XP.x1, XP.z1, TF]].forEach(([x0, x1, z0, z1]) => {
    floorPlane(ceil0, ceilM, 1, x0, x1, z0, z1, F1 - SLAB, false);
    floorPlane(k1, floorM[1], fRep, x0, x1, z0, z1, F1, true);
  });
  wallPlane(ceil0, slabEdgeM, 1, XP.z0, XP.z1, F1 - SLAB, F1, XP.x1, [-1, 0]);
  wallPlane(ceil0, slabEdgeM, 1, XP.x0, XP.x1, F1 - SLAB, F1, XP.z1, [0, -1]);
  wallPlane(ceil0, slabEdgeM, 1, XP.x0, XP.x1, F1 - SLAB, F1, XP.z0, [0, 1]);
  // çatı katı döşemesi (dar) + 1. kat tavanı
  [[-EF, ZP.x0, -TF, TF], [ZP.x1, EF, -TF, TF], [ZP.x0, ZP.x1, ZP.z1, TF]].forEach(([x0, x1, z0, z1]) => floorPlane(ceil1, ceilM, 1, x0, x1, z0, z1, F2 - SLAB, false));
  [[-QP, ZP.x0, -TF, TF], [ZP.x1, QP, -TF, TF], [ZP.x0, ZP.x1, ZP.z1, TF]].forEach(([x0, x1, z0, z1]) => floorPlane(k2, floorM[2], fRep, x0, x1, z0, z1, F2, true));
  wallPlane(ceil1, slabEdgeM, 1, ZP.x0, ZP.x1, F2 - SLAB, F2, ZP.z1, [0, -1]);
  wallPlane(ceil1, slabEdgeM, 1, ZP.z0, ZP.z1, F2 - SLAB, F2, ZP.x0, [1, 0]);
  wallPlane(ceil1, slabEdgeM, 1, ZP.z0, ZP.z1, F2 - SLAB, F2, ZP.x1, [-1, 0]);
  // merdivenler + tırabzanlar
  const [R0, R1] = YP;
  stairs(k0, R0, stairM, treadM);
  stairs(k1, R1, stairM, treadM);
  railing(k0, R0.c1 + 0.03, R0.d0 - 0.15, R0.base + 0.2, R0.c1 + 0.03, R0.d1 + 0.2, R0.top, railM);
  railing(k1, XP.x1 + 0.04, XP.z0 + 0.9, F1, XP.x1 + 0.04, XP.z1 + 0.04, F1, railM);
  railing(k1, XP.x0 + 0.05, XP.z1 + 0.04, F1, XP.x1 + 0.04, XP.z1 + 0.04, F1, railM);
  railing(k1, R1.d0 - 0.15, R1.c1 + 0.03, R1.base + 0.2, R1.d1 + 0.2, R1.c1 + 0.03, R1.top, railM);
  railing(k2, ZP.x0 + 0.9, ZP.z1 + 0.04, F2, ZP.x1 + 0.04, ZP.z1 + 0.04, F2, railM);
  railing(k2, ZP.x1 + 0.04, ZP.z0 + 0.05, F2, ZP.x1 + 0.04, ZP.z1 + 0.04, F2, railM);
  // pencereler / kapı
  const win = (a, y, w = 1.5, h = 1.5) => ({ a0: a - w / 2, a1: a + w / 2, y0: y - h / 2, y1: y + h / 2 });
  const frontXs = [-6.9, -2.3, 2.3, 6.9].filter((x) => Math.abs(x - doorX) > 1.6);
  const sideZs = [-3.5, 3.5];
  const backXs = [-4.6, 0, 4.6];
  const doorHole = { a0: doorX - doorW / 2, a1: doorX + doorW / 2, y0: 0, y1: doorH, door: true };
  const wy0 = 1.9;
  const wy1 = F1 + 1.6;
  const shells = P.low.map((k) => {
    const g = new THREE.Group();
    g.position.z = RZ;
    k.group.add(g);
    return g;
  });
  const inner = P.lowInner;
  const wins = []; // [{ og, ig, list }] — duvar başına pencere çerçeveleri
  const common = { T, extM, wallM, wr: wRep, trimM, wins };
  const s0 = { ...common, storey: 0, yb: 0, yt: 3.6, yIn0: UP[0], yIn1: F1 - SLAB };
  storeyWall(shells[0], inner[0], 0, { ...s0, holes: [doorHole, ...frontXs.map((x) => win(x, wy0))] });
  storeyWall(shells[1], inner[1], 1, { ...s0, holes: sideZs.map((z) => win(z, wy0)) });
  storeyWall(shells[2], inner[2], 2, { ...s0, holes: backXs.map((x) => win(x, wy0)) });
  storeyWall(shells[3], inner[3], 3, { ...s0, holes: sideZs.map((z) => win(z, wy0)) });
  box(shells[0], 2.6, 0.2, 1.4, roofM, doorX, 2.7, TF + T + 0.7); // kapı saçağı
  const s1 = { ...common, storey: 1, wallM: wallMs[1], yb: 3.6, yt: GP, yIn0: F1, yIn1: F2 - SLAB };
  const big = (a0, a1) => ({ a0, a1, y0: F1, y1: F2 - SLAB, big: true });
  storeyWall(w1[0], w1[0], 0, { ...s1, holes: [big(-8.5, EF - 0.5)] }); // ön: boydan cam (balkon görünümü)
  storeyWall(w1[1], w1[1], 1, { ...s1, holes: [big(-6.5, TF - 0.5)] });
  storeyWall(w1[2], w1[2], 2, { ...s1, holes: backXs.map((x) => win(x, wy1)) });
  storeyWall(w1[3], w1[3], 3, { ...s1, holes: sideZs.map((z) => win(z, wy1)) });
  for (const y of [3.5, GP - 0.22]) {
    box(w1[0], W2 + 2 * T + 0.24, 0.22, 0.12, trimM, 0, y, TF + T + 0.06, 0, false);
    box(w1[2], W2 + 2 * T + 0.24, 0.22, 0.12, trimM, 0, y, -TF - T - 0.06, 0, false);
    box(w1[1], 0.12, 0.22, D2 + 2 * T + 0.24, trimM, EF + T + 0.06, y, 0, 0, false);
    box(w1[3], 0.12, 0.22, D2 + 2 * T + 0.24, trimM, -EF - T - 0.06, y, 0, 0, false);
  }
  railing(w1[0], -8.5, TF + T + 0.12, F1 - 0.05, EF - 0.5, TF + T + 0.12, F1 - 0.05, railM);
  railing(w1[1], EF + T + 0.12, -6.5, F1 - 0.05, EF + T + 0.12, TF - 0.5, F1 - 0.05, railM);
  // kesitte duvar dipleri (kameraya bakan duvar alçalınca)
  const dipM = M('#23242a', 0.8);
  const dip = (g, side, y, a0, a1, mat = wallMs[1]) => {
    const n = [[0, -1], [-1, 0], [0, 1], [1, 0]][side];
    const at = [TF - 0.01, EF - 0.01, -TF + 0.01, -EF + 0.01][side];
    wallPlane(g, mat, wRep, a0, a1, y, y + 0.45, at, n);
    const w = a1 - a0;
    const c = (a0 + a1) / 2;
    if (n[0] === 0) box(g, w + 0.3, 0.06, 0.3, dipM, c, y + 0.45, at + n[1] * 0.15, 0, false);
    else box(g, 0.3, 0.06, w + 0.3, dipM, at + n[0] * 0.15, y + 0.45, c, 0, false);
  };
  dip(w1dip[0], 0, F1, -EF, EF);
  dip(w1dip[1], 1, F1, -TF, TF);
  dip(w1dip[2], 2, F1, -EF, EF);
  dip(w1dip[3], 3, F1, -TF, TF);
  // çatı katı: üçgen alınlıklar (yuvarlak pencereli) + iç yan duvarlar
  const gable = (x) => GP + KP * (1 - Math.abs(x) / CF);
  const de = EF + T;
  const pe = roofY(QP);
  const oy = F2 + 2.1;
  const or = 0.75;
  const shapeWithHole = (pts) => {
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    const h = new THREE.Path();
    h.absarc(0, oy, or, 0, PI * 2, true);
    s.holes.push(h);
    return new THREE.ShapeGeometry(s, 24);
  };
  const outerPts = [[-de, GP], [de, GP], [de, gable(de)], [0, gable(0)], [-de, gable(de)]];
  const innerPts = [[-QP, F2], [QP, F2], [QP, pe], [0, roofY(0)], [-QP, pe]];
  for (const [i, sgn] of [[0, 1], [2, -1]]) {
    const g = w2[i];
    const o = new THREE.Mesh(shapeWithHole(outerPts), extM);
    o.position.z = sgn * (TF + T);
    if (sgn < 0) o.rotation.y = PI;
    g.add(o);
    // v197: üçgen alınlığın UV'si metre cinsindendi (diğer duvarlar metre / wRep) → kaplama burada wRep kat
    // küçük görünüyordu (çatı katında 2 duvar küçük tuğla, 2 duvar büyük). Diğer duvarlarla aynı ölçek:
    const innGeo = shapeWithHole(innerPts);
    const iuv = innGeo.attributes.uv;
    for (let k = 0; k < iuv.count; k++) iuv.setXY(k, iuv.getX(k) / wRep, iuv.getY(k) / wRep);
    const inn = new THREE.Mesh(innGeo, wallMs[2]);
    inn.position.z = sgn * (TF - 0.01);
    if (sgn > 0) inn.rotation.y = PI;
    g.add(inn);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(or, or, T + 0.02, 24, 1, true), M('#e8e1d4', 0.8));
    ring.material.side = THREE.BackSide;
    ring.rotation.x = PI / 2;
    ring.position.set(0, oy, sgn * (TF + T / 2));
    g.add(ring);
    const gl = new THREE.Mesh(new THREE.CircleGeometry(or, 24), GLASS());
    gl.position.set(0, oy, sgn * (TF + T / 2));
    gl.renderOrder = 5;
    g.add(gl);
    for (const z of [TF + T + 0.04, TF - 0.04]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.06, 8, 28), trimM);
      t.position.set(0, oy, sgn * z);
      g.add(t);
    }
    const mul = new THREE.Mesh(new THREE.BoxGeometry(0.05, or * 2, 0.05), trimM);
    mul.position.set(0, oy, sgn * (TF + T / 2));
    g.add(mul);
    box(g, W2 + 2 * T + 0.24, 0.22, 0.12, trimM, 0, GP - 0.22, sgn * (TF + T + 0.06), 0, false);
  }
  dip(w2dip[0], 0, F2, -QP, QP, wallMs[2]); // v197: çatı katının kesit dibi kendi katının kaplamasıyla
  dip(w2dip[2], 2, F2, -QP, QP, wallMs[2]);
  wallPlane(k2, wallMs[2], wRep, -TF, TF, F2, pe, QP, [-1, 0]);
  wallPlane(k2, wallMs[2], wRep, -TF, TF, F2, pe, -QP, [1, 0]);
  roof(roofG, { roofM, ceilM, trimM, T });
  // baca
  const cy = roofY(4.5) + 0.06;
  box(roofG, 0.9, gable(4) + 2 - cy, 0.9, M('#5a4a44', 0.8), 4, cy, -2);
  box(roofG, 1.1, 0.18, 1.1, M('#3f3430', 0.8), 4, gable(4) + 2, -2, 0, false);
  // ışıklar
  P.int.light(0, F1 + 3, -2, '#fff1d6', 5.5, 13);
  P.int.light(-5, F1 + 3, 3, '#fff1d6', 4, 10);
  P.int.light(5, F1 + 3, 3, '#fff1d6', 4, 10);
  P.int.light(0, F2 + 3.4, -1, '#fff1d6', 5, 12);
  P.int.light(0, F2 + 3, 4.5, '#fff1d6', 3.5, 9);

  // mobilya: kat başına ayrı canlı grup
  let items = [];
  let realLook = false; // v197 göz: tasarımda deneme eşyalar gerçek haliyle
  const furn = [0, 1, 2].map((f) => {
    const k = new Kit(`ev_mobilya_${f}`);
    root.add(k.group);
    return k;
  });
  const objByIdx = []; // tasarımda sürükleme: eşya kimliği → 3B nesne
  const furnish = (k, f) => {
    objByIdx.forEach((o, i) => o?.userData.evF === f && (objByIdx[i] = null));
    // v198: kaldırılan eşyaların GPU belleği bırakılır. Eskiden her tasarım değişikliğinde (ekle / döndür /
    // renk / sil) ve her ev ziyaretinde 3 katın bütün eşyaları yeniden kuruluyor, eskiler hiç silinmiyordu →
    // bellek doluyor, telefonda WebView çöküp oyundan atıyordu.
    [...k.group.children].forEach((c) => {
      if (c === k.dynamic) return;
      k.group.remove(c);
      freeObj(c);
    });
    [...k.dynamic.children].forEach((c) => {
      k.dynamic.remove(c);
      freeObj(c);
    });
    k.ticks.length = 0;
    k.seats.length = 0;
    items.forEach((it, idx) => {
      if (it.f !== f) return;
      const o = k.item(it.k, it.x, it.z, it.r, it.c || 0, { y: UP[f], solid: false, dyn: true, ...(DIVIDER_KEYS.has(it.k) ? { wallMat: divMs[f], H: WALL_H } : {}) });
      if (o) {
        o.traverse((q) => (q.userData.evIdx = idx));
        o.userData.evF = f;
        objByIdx[idx] = o;
        // v196: satın alınmamış (deneme / sepetteki) eşya yarı saydam — eski evdeki gibi neyin yeni olduğu belli
        if (it.p !== 1 && !realLook) ghostify(o);
      }
    });
  };
  // pencere çerçeveleri: model / renk (win: { [id]: { m, c } }); birleştirme fonksiyonu mergeVenue'dan gelir
  let winStyle = {};
  let mergeFn = null;
  const clearG = (g) => [...g.children].forEach((c) => {
    if (c.userData.noMerge) return; // iç grup (aynı duvar grubu ise çerçeve grubunun içinde)
    g.remove(c);
    if (c.userData.merged) c.geometry?.dispose();
  });
  const drawWall = (wb) => {
    clearG(wb.og);
    clearG(wb.ig);
    wb.list.forEach((w) => drawWindow(w, winStyle[w.id]));
    if (mergeFn) {
      mergeFn(wb.og);
      mergeFn(wb.ig);
    }
    wb.og.traverse((o) => (o.userData.dyn = true));
    wb.ig.traverse((o) => (o.userData.dyn = true));
  };
  wins.forEach(drawWall);
  const winById = new Map();
  wins.forEach((wb) => wb.list.forEach((w) => winById.set(w.id, { w, wb })));
  const shown = (o) => {
    for (let q = o; q; q = q.parent) if (!q.visible) return false;
    return true;
  };
  const wInv = new THREE.Matrix4();
  const wRay = new THREE.Ray();
  const wPt = new THREE.Vector3();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthTest: false }));
  ring.rotation.x = -PI / 2;
  ring.renderOrder = 20;
  ring.visible = false;
  root.add(ring);
  root.traverse((o) => (o.userData.dyn = true));
  shells.forEach((g) => g.traverse((o) => (o.userData.dyn = true)));
  // kesit / tasarım görünümü: bir katın üstündekiler gizlenir
  const above = [
    [ceil0, k1, ceil1, k2, roofG, ...w1, ...w2, furn[1].group, furn[2].group],
    [ceil1, k2, roofG, ...w2, furn[2].group],
    [roofG],
  ];
  const all = [k0, ceil0, k1, ceil1, k2, roofG, ...w1, ...w1dip, ...w2, ...w2dip];
  const cutWalls = (v, f, facing) => {
    for (let i = 0; i < 4; i++) {
      const low = f === 0 && facing[i];
      v.low[i].group.visible = !low;
      if (v.lowInner[i]) v.lowInner[i].visible = !low;
      if (v.stubs?.[i]) v.stubs[i].visible = low;
      w1[i].visible = !(f === 1 && facing[i]);
      w1dip[i].visible = f === 1 && facing[i];
      const r2 = f === 2 && facing[i] && (i === 0 || i === 2);
      w2[i].visible = !r2;
      w2dip[i].visible = r2;
    }
  };
  const ml = {
    groups: all,
    // pencereler (v196): kimlik listesi, stil, dokunuş
    windowIds: () => [...winById.keys()],
    // kat düğmesi (telefon): o katın merdiven başı { x, z, y }
    stairGoal,
    objAt: (idx) => objByIdx[idx] || null, // v198: eşyanın 3B nesnesi (aç / kapat)
    floorTarget(f) {
      if (f <= 0) return { x: RF[0].hub[0], z: RF[0].hub[1], y: UP[0] };
      if (f === 1) return { x: RF[0].up[0], z: RF[0].up[1], y: UP[1] };
      return { x: RF[1].up[0], z: RF[1].up[1], y: UP[2] };
    },
    setWindows(win) {
      const next = win && typeof win === 'object' ? win : {};
      const dirty = new Set();
      for (const id of new Set([...Object.keys(winStyle), ...Object.keys(next)])) {
        const a = winStyle[id];
        const b = next[id];
        if ((a?.m | 0) !== (b?.m | 0) || (a?.c | 0) !== (b?.c | 0)) {
          const e = winById.get(id);
          if (e) dirty.add(e.wb);
        }
      }
      winStyle = { ...next };
      dirty.forEach(drawWall);
    },
    useMerge(fn) {
      mergeFn = fn;
      wins.forEach((wb) => {
        fn(wb.og);
        fn(wb.ig);
      });
    },
    // dünya ışını → bu katın görünen penceresi { id, dist } (yoksa null)
    pickWindow(worldRay, f) {
      let best = null;
      for (const wb of wins) {
        if (!wb.list.length || wb.list[0].storey !== f || !shown(wb.og)) continue;
        wb.og.updateMatrixWorld(true);
        wInv.copy(wb.og.matrixWorld).invert();
        wRay.copy(worldRay).applyMatrix4(wInv);
        for (const w of wb.list) {
          const ax = alongX(w.side);
          const dn = ax ? wRay.direction.z : wRay.direction.x;
          if (Math.abs(dn) < 1e-4) continue;
          const t = (w.mid - (ax ? wRay.origin.z : wRay.origin.x)) / dn;
          if (t <= 0) continue;
          wRay.at(t, wPt);
          const a = ax ? wPt.x : wPt.z;
          const m = 0.12;
          if (a < w.h.a0 - m || a > w.h.a1 + m || wPt.y < w.h.y0 - m || wPt.y > w.h.y1 + m) continue;
          wPt.applyMatrix4(wb.og.matrixWorld);
          const dist = wPt.distanceTo(worldRay.origin);
          if (!best || dist < best.dist) best = { id: w.id, dist };
        }
      }
      return best;
    },
    floors: UP,
    level: houseLevel,
    groundAt,
    pick,
    route,
    door: { x: doorX, z: TF - 1.2 },
    blocked,
    furnKit: (f) => furn[f],
    isCeil: (idx) => Boolean(CATALOG_MAP[items[idx]?.k]?.ceil),
    isSeatKey: (k) => Boolean(CATALOG_MAP[k]?.seats?.length),
    setRealLook(on) {
      if (realLook === on) return;
      realLook = on;
      [0, 1, 2].forEach((f) => furnish(furn[f], f));
    },
    get items() {
      return items;
    },
    // dışarıdan (ev belgesi) eşyalar: [{ i, k, x, z, r, c, f, p? }]
    setItems(list) {
      items = (Array.isArray(list) ? list : []).filter((it) => it && CATALOG_MAP[it.k] && [0, 1, 2].includes(it.f)).map((it) => ({ ...it }));
      rebuildSolids(items);
      [0, 1, 2].forEach((f) => furnish(furn[f], f));
    },
    // kat başına zemin + duvar kaplaması: { 0:{wall,floor}, 1:{…}, 2:{…} } (seçilmeyen = varsayılan)
    setSurfaces(surf) {
      [0, 1, 2].forEach((f) => {
        const fk = surf?.[f]?.floor || HOME_FLOOR_DEFAULT;
        const wk = surf?.[f]?.wall || HOME_WALL_DEFAULT;
        if (floorM[f].userData.key !== fk) paintSurf(floorM[f], floorDef(fk), 0.5);
        if (wallMs[f].userData.key !== wk) paintSurf(wallMs[f], wallDef(wk), 0.9);
        if (divMs[f].userData.key !== wk) paintDiv(divMs[f], wallDef(wk)); // v198: bölücüler de aynı desen
      });
    },
    camClamp(cam, toRoomFn, fromRoomFn, y) {
      const lv = houseLevel(y);
      const p = toRoomFn(cam.x, cam.z);
      const m = 3.5;
      let x = Math.max(-EF - m, Math.min(12.5, p.x));
      const z = Math.max(-TF - m, Math.min(10.5, p.z));
      const lo = UP[lv] + 0.3;
      let hi = lv === 2 ? 99 : UP[lv] + WALL_H - 0.2;
      if (lv < 2 && y > UP[lv] + 0.4) hi = UP[lv + 1] + WALL_H - 0.2;
      if (lv === 2) {
        x = Math.max(-5.3, Math.min(QP - 0.5, x));
        hi = roofY(x) - 0.25;
      }
      const w = fromRoomFn(x, z);
      cam.x = w.x;
      cam.z = w.z;
      cam.y = Math.max(lo, Math.min(hi, cam.y));
    },
    cut(v, f, facing) {
      cutWalls(v, f, facing);
    },
    designView(v, f, facing) {
      all.forEach((g) => (g.visible = !g.name.includes('_dip')));
      furn.forEach((k) => (k.group.visible = true));
      cutWalls(v, f, facing);
      above[f].forEach((g) => (g.visible = false));
    },
    reset(v) {
      all.forEach((g) => (g.visible = !g.name.includes('_dip')));
      furn.forEach((k) => (k.group.visible = true));
      ring.visible = false;
      if (v) cutWalls(v, -1, [false, false, false, false]);
    },
    refresh(f) {
      rebuildSolids(items);
      if (f == null) [0, 1, 2].forEach((q) => furnish(furn[q], q));
      else furnish(furn[f], f);
    },
    // sürüklerken eşyayı yerinde taşı (yeniden kurmadan); bırakınca React kaydeder
    dragTo(idx, it2) {
      const o = objByIdx[idx];
      if (!o) return;
      o.position.x = it2.x;
      o.position.z = it2.z;
      o.rotation.y = (it2.r * PI) / 4;
      ring.position.set(it2.x, UP[it2.f] + 0.03, it2.z);
    },
    select(idx) {
      const it = idx == null ? null : items[idx];
      if (!it) {
        ring.visible = false;
        return;
      }
      const boxes = itemBoxes(CATALOG_MAP[it.k] || {});
      const r = boxes.length ? Math.max(...boxes.map(([a, b, hw, hd]) => Math.hypot(Math.abs(a) + hw, Math.abs(b) + hd))) : 0.7;
      ring.scale.setScalar(Math.max(0.45, r + 0.15));
      ring.position.set(it.x, UP[it.f] + 0.03, it.z);
      ring.visible = true;
    },
    // tasarımda yerleştirme: duvar eşyası en yakın duvara oturur; zemin eşyası katın zeminine
    place(it, x, z) {
      const def = CATALOG_MAP[it.k];
      const f = it.f;
      const lim = f === 2 ? QP - 0.4 : EF - 0.35;
      if (def?.wall) {
        // v199: sonradan konan bölme duvarlarının iki yüzüne de takılır (eski ev motoru v77 gibi) —
        // oda duvarından daha yakın bir bölme yüzü varsa oraya oturur
        const half = def.wallW || 0.45;
        let bestDiv = null;
        items.forEach((d) => {
          const segs = DIVIDER_SEGS[d.k];
          if (!segs || d.f !== f || d.i === it.i) return;
          const { lx, lz } = divLocal(d, x, z);
          segs.forEach(([a0, a1]) => {
            if (a1 - a0 < half * 2 - 0.01) return; // eşya bu parçaya sığmıyor
            const cx = Math.max(a0 + half, Math.min(a1 - half, lx));
            const side = lz >= 0 ? 1 : -1;
            const dd = Math.hypot(lx - cx, lz - side * DIV_FACE);
            if (dd < 1.2 && (!bestDiv || dd < bestDiv.d)) bestDiv = { d: dd, div: d, cx, side };
          });
        });
        const outerD = Math.min(Math.abs(z + TF), Math.abs(TF - z), Math.abs((f === 2 ? QP : EF) - x), Math.abs(x + (f === 2 ? QP : EF)));
        if (bestDiv && bestDiv.d < outerD) {
          const w = divWorld(bestDiv.div, bestDiv.cx, bestDiv.side * (DIV_FACE + 0.005));
          it.x = Math.round(w.x * 100) / 100;
          it.z = Math.round(w.z * 100) / 100;
          it.r = ((((bestDiv.div.r || 0) + (bestDiv.side > 0 ? 0 : 4)) % 8) + 8) % 8;
          return true;
        }
        const cands =f === 2 ? [[x, -TF, 0], [x, TF, 4], [QP, z, 6], [-QP, z, 2]] : [[x, -TF, 0], [x, TF, 4], [EF, z, 6], [-EF, z, 2]];
        let best = null;
        let bd = 1e9;
        cands.forEach(([cx, cz, r]) => {
          const d = Math.hypot(cx - x, cz - z);
          if (d < bd) {
            bd = d;
            best = [cx, cz, r];
          }
        });
        it.x = Math.max(-lim + 0.3, Math.min(lim - 0.3, best[0]));
        it.z = Math.max(-6.6, Math.min(TF - 0.4, best[1]));
        if (Math.abs(best[1]) === TF) it.z = best[1];
        if (Math.abs(best[0]) === EF || Math.abs(best[0]) === QP) it.x = best[0];
        it.r = best[2];
        return true;
      }
      // v197: kutusu olan eşya duvara SIFIR oturur (döndürülmüş kutunun kenarı duvara değer; 0,2 m yakında mıknatıs)
      const ex = itemExtent(def, it.r);
      let cx;
      let cz;
      if (ex) {
        const M0 = WALL_GAP;
        const xl = f === 2 ? -lim : -EF + Math.max(M0, -ex[0]);
        const xh = f === 2 ? lim : EF - Math.max(M0, ex[1]);
        const zl = -TF + Math.max(M0, -ex[2]);
        const zh = TF - Math.max(M0, ex[3]);
        cx = xl > xh ? 0 : Math.max(xl, Math.min(xh, x));
        cz = zl > zh ? 0 : Math.max(zl, Math.min(zh, z));
        if (f !== 2 && xl <= xh) {
          if (cx - xl < 0.2) cx = xl;
          else if (xh - cx < 0.2) cx = xh;
        }
        if (zl <= zh) {
          if (cz - zl < 0.2) cz = zl;
          else if (zh - cz < 0.2) cz = zh;
        }
      } else {
        cx = Math.max(-lim, Math.min(lim, x));
        cz = Math.max(-6.65, Math.min(TF - 0.35, z));
      }
      groundsAt(cx, cz, tmpGrounds);
      if (!tmpGrounds.some((g) => Math.abs(g - UP[f]) < 0.01)) return false;
      for (const r of YP) if (rampAt(r, cx, cz).inside && (Math.abs(r.base - UP[f]) < 0.01 || Math.abs(r.top - UP[f]) < 0.01)) return false;
      it.x = cx;
      it.z = cz;
      return true;
    },
    seatList() {
      const out = [];
      items.forEach((it) => {
        const def = CATALOG_MAP[it.k];
        if (!def?.seats || it.p !== 1) return;
        const a = (it.r * PI) / 4;
        const c = Math.cos(a);
        const s = Math.sin(a);
        def.seats.forEach(([sx, sy, sz, sw]) => out.push({ x: it.x + sx * c + sz * s, z: it.z - sx * s + sz * c, y: UP[it.f] + sy, yaw: a + (sw || 0), i: it.i, k: it.k, f: it.f })); // v198: koltuğun kendi yönü (yemek takımı) // v198: hangi eşya (piyano / davul)
      });
      return out;
    },
  };
  P.ml = ml;
  return ml;
}
