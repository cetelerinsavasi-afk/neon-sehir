// =============================================================================
// v151 — MESLEK GÖRSELLERİ (sadece şoförün cihazında; ağa gitmez)
//   • Hedef işareti: ışık sütunu + yerde halka + üstte etiket (mesafeyle)
//   • Bot insanlar: durakta bekleyen yolcular, el sallayan taksi müşterisi,
//     yerde yatan hasta — Fig (avatar kartı) havuzu
//   • Şüpheli araç (polis kovalamacası): yol ızgarasında kaçan bot araba
// =============================================================================
import * as THREE from 'three';

const XS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
const ZS = [-140, -100, -60, -20, 20, 60, 100];
const BIG = [
  [-36, 36, -16, 16],
  [44, 116, -16, 56],
  [-76, -4, 24, 56],
  [-116, -44, 64, 96],
];
const covered = (x, z) => BIG.some(([x0, x1, z0, z1]) => x > x0 + 1 && x < x1 - 1 && z > z0 + 1 && z < z1 - 1);
const nearestIdx = (arr, v) => arr.reduce((b, a, i) => (Math.abs(a - v) < Math.abs(arr[b] - v) ? i : b), 0);

// rastgele bot avatarı (görünüş çeşitliliği)
const SKINS = ['#f1c9a5', '#d9a47a', '#c68863', '#a8724c', '#6e4a32', '#f6d7bd'];
const HAIRS = ['short', 'slick', 'wavy', 'long', 'bun', 'curly', 'ponytail', 'kel', 'pixie', 'undercut'];
const HAIRC = ['#2b2118', '#111', '#6b4423', '#c9a26b', '#8a8f99', '#a8323e'];
const CLOTH = ['hoodie', 'hawaii', 'vest', 'tanktop', 'suit', 'leather', 'trenchcoat'];
const CLOTHC = ['#22262f', '#1745b5', '#c8141e', '#3a5f3a', '#e8e2d0', '#8b5cf6', '#e9651c', '#19a0d8'];
const pick = (a, r) => a[Math.floor(r() * a.length) % a.length];
export function botAvatar(seed) {
  let s = (Math.abs(Math.floor(seed * 9973)) % 2147483646) + 1;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const female = r() < 0.5;
  return {
    gender: female ? 'kadin' : 'erkek',
    build: pick(['zayif', 'standart', 'standart', 'iri'], r),
    skin: pick(SKINS, r),
    hairStyle: female ? pick(['long', 'bun', 'ponytail', 'pixie', 'curly', 'wavy'], r) : pick(HAIRS, r),
    hairColor: pick(HAIRC, r),
    clothing: pick(CLOTH, r),
    clothColor: pick(CLOTHC, r),
    pantsColor: pick(['#22262f', '#2f3a55', '#3a3f4a', '#6b4423', '#111'], r),
    neckAcc: 'none',
    facialHair: female ? 'none' : pick(['none', 'none', 'mustache', 'short', 'goatee'], r),
    mouthShape: pick(['neutral', 'smile', 'smile'], r),
  };
}

export function createJobWorld({ scene, layer, Fig, groundY, buildVehicle, placeLabel }) {
  // --- hedef işareti --------------------------------------------------------------
  const beamMat = new THREE.MeshBasicMaterial({ color: '#19e8ff', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#19e8ff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 26, 20, 1, true), beamMat);
  beam.position.y = 13;
  beam.renderOrder = 4;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.25, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.renderOrder = 4;
  beacon.add(beam, ring);
  beacon.visible = false;
  scene.add(beacon);
  const tag = document.createElement('div');
  tag.className = 'cs-jobtag';
  tag.style.display = 'none';
  layer.appendChild(tag);
  let target = null;

  function setTarget(t) {
    target = t ? { ...t } : null;
    beacon.visible = Boolean(target);
    if (!target) {
      tag.style.display = 'none';
      return;
    }
    beamMat.color.set(target.color || '#19e8ff');
    ringMat.color.set(target.color || '#19e8ff');
    const r = target.r || 6;
    ring.scale.setScalar(r);
    beacon.position.set(target.x, groundY(target.x, target.z), target.z);
  }

  // --- v152: YOL ÇİZGİSİ (prototipteki gibi): hedefe giden yol, yolun üstünde akan oklar ---
  const arrowTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.moveTo(14, 8);
    x.lineTo(42, 32);
    x.lineTo(14, 56);
    x.lineTo(26, 56);
    x.lineTo(54, 32);
    x.lineTo(26, 8);
    x.closePath();
    x.fill();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const routeMat = new THREE.MeshBasicMaterial({ map: arrowTex, color: '#19e8ff', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
  // v153: oklu şeridin altında geniş, parlak bir bant (uzaktan / yukarıdan da görünsün)
  const glowMat = new THREE.MeshBasicMaterial({ color: '#19e8ff', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
  let glow = null;
  let routePts = null;
  function ribbon(pts, W, y0, uvScale) {
    const pos = [];
    const uv = [];
    const idx = [];
    let u = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 0.05) continue;
      const nx = (-(b.z - a.z) / L) * (W / 2);
      const nz = ((b.x - a.x) / L) * (W / 2);
      const ya = groundY(a.x, a.z) + y0;
      const yb = groundY(b.x, b.z) + y0;
      const k = pos.length / 3;
      // köşelerde boşluk kalmasın: parça yarım genişlik kadar uzatılır
      const ex = ((b.x - a.x) / L) * (W / 2);
      const ez = ((b.z - a.z) / L) * (W / 2);
      const ax = a.x - (i ? ex : 0);
      const az = a.z - (i ? ez : 0);
      const bx = b.x + (i < pts.length - 2 ? ex : 0);
      const bz = b.z + (i < pts.length - 2 ? ez : 0);
      pos.push(ax + nx, ya, az + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz);
      uv.push(u / uvScale, 1, u / uvScale, 0, (u + L) / uvScale, 1, (u + L) / uvScale, 0);
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      u += L;
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  let route = null;
  function setRoute(pts, color) {
    for (const m of [route, glow]) {
      if (!m) continue;
      scene.remove(m);
      m.geometry.dispose();
    }
    route = null;
    glow = null;
    routePts = null;
    if (!pts || pts.length < 2) return;
    if (color) {
      routeMat.color.set(color);
      glowMat.color.set(color);
    }
    const g1 = ribbon(pts, 2.2, 0.09, 2.2);
    if (!g1) return;
    routePts = pts.map((p) => ({ x: p.x, z: p.z }));
    route = new THREE.Mesh(g1, routeMat);
    route.renderOrder = 4;
    route.frustumCulled = false;
    scene.add(route);
    const g2 = ribbon(pts, 4.2, 0.07, 4);
    if (g2) {
      glow = new THREE.Mesh(g2, glowMat);
      glow.renderOrder = 3;
      glow.frustumCulled = false;
      scene.add(glow);
    }
  }

  // --- bot insanlar -------------------------------------------------------------------
  const people = new Map(); // id → { fig, lie }
  function setPeople(list) {
    const want = new Map((list || []).map((p) => [p.id, p]));
    people.forEach((e, id) => {
      if (want.has(id)) return;
      e.fig.dispose(scene);
      people.delete(id);
    });
    want.forEach((p, id) => {
      let e = people.get(id);
      if (!e) {
        const fig = new Fig(scene, layer, { id: `bot_${id}`, name: p.name || '', avatar: botAvatar(p.seed ?? id.length * 7.3), npc: true });
        fig.label.style.display = 'none'; // botların ad etiketi yok
        e = { fig };
        people.set(id, e);
      }
      e.fig.x = p.x;
      e.fig.z = p.z;
      e.fig.y = groundY(p.x, p.z);
      e.lie = Boolean(p.lie);
      e.wave = Boolean(p.wave);
    });
  }

  // --- şüpheli araç -----------------------------------------------------------------------
  let sus = null; // { v, x, z, yaw, speed, tx, tz, last }
  function setSuspect(sp) {
    if (sus) {
      scene.remove(sus.v.root);
      sus.v.root.traverse((o) => o.isMesh && o.geometry.dispose());
      sus = null;
    }
    if (!sp) return;
    const v = buildVehicle(sp.car || 5, sp.mods || null);
    scene.add(v.root);
    sus = { v, x: sp.x, z: sp.z, yaw: sp.yaw || 0, speed: 0, tx: null, tz: null, last: null };
    nextNode();
  }
  // bir sonraki kavşak: ızgarada rastgele (geri dönmeden), kaplı yollardan kaçınır
  function nextNode() {
    const i = nearestIdx(XS, sus.x);
    const j = nearestIdx(ZS, sus.z);
    const onX = Math.abs(XS[i] - sus.x) < 3; // dikey yoldayım (x sabit)
    const onZ = Math.abs(ZS[j] - sus.z) < 3;
    const opts = [];
    const tryAdd = (ni, nj) => {
      if (ni < 0 || nj < 0 || ni >= XS.length || nj >= ZS.length) return;
      const nx = XS[ni];
      const nz = ZS[nj];
      if (covered((nx + (onX ? XS[i] : sus.x)) / 2, (nz + (onZ ? ZS[j] : sus.z)) / 2)) return;
      if (sus.last && Math.abs(sus.last[0] - nx) < 1 && Math.abs(sus.last[1] - nz) < 1) return;
      opts.push([nx, nz]);
    };
    if (onX && onZ) [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].forEach(([a, b]) => tryAdd(a, b));
    else if (onX) [[i, j], [i, j + (sus.z > ZS[j] ? 1 : -1)]].forEach(([a, b]) => tryAdd(a, b));
    else [[i, j], [i + (sus.x > XS[i] ? 1 : -1), j]].forEach(([a, b]) => tryAdd(a, b));
    const n = opts.length ? opts[Math.floor(Math.random() * opts.length)] : [XS[i], ZS[j]];
    sus.last = [sus.tx ?? sus.x, sus.tz ?? sus.z];
    sus.tx = n[0];
    sus.tz = n[1];
  }
  function stepSuspect(dt, px, pz) {
    if (!sus) return;
    const d = Math.hypot(sus.x - px, sus.z - pz);
    const want = sus.stop ? 0 : d < 60 ? 15 : d < 140 ? 11 : 7;
    sus.speed += (want - sus.speed) * Math.min(1, dt * 1.4);
    const dx = sus.tx - sus.x;
    const dz = sus.tz - sus.z;
    const g = Math.hypot(dx, dz);
    if (g < 2.2) nextNode();
    else {
      let a = Math.atan2(dx, dz) - sus.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      sus.yaw += a * Math.min(1, dt * 4);
      const step = Math.min(g, sus.speed * dt * (Math.abs(a) > 0.8 ? 0.5 : 1));
      sus.x += Math.sin(sus.yaw) * step;
      sus.z += Math.cos(sus.yaw) * step;
    }
    sus.v.root.position.set(sus.x, groundY(sus.x, sus.z), sus.z);
    sus.v.root.rotation.y = sus.yaw;
    sus.v.wheels.forEach((w) => (w.spin.rotation.z -= (sus.speed * dt) / w.r));
  }

  function update(dt, camera, now, px, pz, w, h) {
    stepSuspect(dt, px, pz);
    arrowTex.offset.x = -(now / 1000) * 1.2; // oklar hedefe doğru akar
    if (sus && target?.follow) {
      target.x = sus.x;
      target.z = sus.z;
    }
    if (target) {
      beacon.position.set(target.x, groundY(target.x, target.z), target.z);
      const t = now / 1000;
      beamMat.opacity = 0.24 + Math.sin(t * 3) * 0.08;
      const d = Math.hypot(target.x - px, target.z - pz);
      tag.textContent = `${target.icon || '📍'} ${target.name || ''} · ${Math.round(d)} m`;
      placeLabel(tag, target.x, 6.5, target.z, w, h, 2000);
    }
    people.forEach((e) => {
      e.fig.moving = false;
      e.fig.update(dt, camera, now);
      // yerde yatan hasta: kart yatırılır
      e.fig.pivot.rotation.x = e.lie ? -Math.PI / 2 + 0.05 : e.fig.pivot.rotation.x;
      if (e.lie) e.fig.pivot.position.y = 0.25;
      if (e.wave) e.fig.pivot.rotation.z = Math.sin(now / 160) * 0.08;
    });
  }

  return {
    setTarget,
    setRoute,
    route: () => (routePts ? { pts: routePts, color: `#${routeMat.color.getHexString()}` } : null),
    setPeople,
    setSuspect,
    suspect: () => (sus ? { x: sus.x, z: sus.z, speed: sus.speed } : null),
    stopSuspect: () => sus && (sus.stop = true),
    update,
    dispose() {
      setPeople([]);
      setSuspect(null);
      setRoute(null);
      scene.remove(beacon);
      tag.remove();
    },
  };
}
