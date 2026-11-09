// =============================================================================
// v149 — STADYUM (NEON ARENA): haritaya gömülü, içine yürüyerek girilen stadyum.
// Prototipten (neon-sehir-stadyum) okunur kaynak koda aktarıldı.
//   • Elips dış cephe, 4 giriş tüneli (eksenlerde), 10 basamaklı tribün + gerçek
//     koltuklar (oturulabilir), localar, çatı halkası, projektörler, iki dev skor ekranı.
//   • Saha: çizgili çim, kaleler (fileli), yedek kulübeleri, reklam panoları.
//   • Reklam panolarında Süper Lig takımlarının sponsor fabrikaları yazar (setSponsors).
//   • Arabalar stadyuma giremez (car-only elips); yayalar tünellerden girip tribünde gezer.
//   • Tribün basamakları yürünebilir (height: zemin yüksekliği fonksiyonu).
//   • Maç saatinde saha kilitlenir (pitchLock dikdörtgeni — motor açar/kapatır).
// Ölçüler metre; kit yereli: +z güney (ana giriş), saha uzun ekseni x.
// =============================================================================
import { THREE, M, glowMat, basicGlow, canvasTex } from './kit.js';

const PI = Math.PI;
const BASE_Y = 0.13; // kaldırım yüksekliği
const OUT_RX = 33.4; // dış cephe
const OUT_RZ = 27;
const IN_RX = 25.5; // tribünün iç kenarı (saha tarafı)
const IN_RZ = 18.8;
const TOP_RX = 31.2; // alt tribünün dış kenarı
const TOP_RZ = 24.8;
const TIERS = 10;
const STEP = 0.5; // basamak yüksekliği
const LOGE_Y0 = 5.13; // loca bandı
const LOGE_Y1 = 8.3;
const ROOF_Y = 14.2;
const GAP = 3; // tünel yarı genişliği (eksenlerde)
const TUNNEL_H = 4.6;
const PITCH_L = 39;
const PITCH_W = 25;

const tierRx = (k) => IN_RX + (TOP_RX - IN_RX) * k;
const tierRz = (k) => IN_RZ + (TOP_RZ - IN_RZ) * k;
const tierY = (i) => BASE_Y + (i + 1) * STEP;
const inTunnel = (x, z, pad = 0) => Math.abs(x) < GAP + pad || Math.abs(z) < GAP + pad;
const dmat = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide, ...extra });

// Elips "torna" yüzeyi: profil [rx, rz, y] noktaları, seg dilim; skip(x, z) → o parçayı atla
function ellLathe(profile, seg, { skip = null, uPerM = 0 } = {}) {
  const pos = [];
  const uv = [];
  const at = (rx, rz, y, a) => [rx * Math.sin(a), y, rz * Math.cos(a)];
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * PI * 2;
    const a1 = ((s + 1) / seg) * PI * 2;
    const am = (a0 + a1) / 2;
    for (let d = 0; d < profile.length - 1; d++) {
      const [rx0, rz0, y0] = profile[d];
      const [rx1, rz1, y1] = profile[d + 1];
      if (skip) {
        const mx = (rx0 + rx1) / 2;
        const mz = (rz0 + rz1) / 2;
        if (skip(mx * Math.sin(am), mz * Math.cos(am))) continue;
      }
      const p00 = at(rx0, rz0, y0, a0);
      const p01 = at(rx0, rz0, y0, a1);
      const p10 = at(rx1, rz1, y1, a0);
      const p11 = at(rx1, rz1, y1, a1);
      pos.push(...p00, ...p10, ...p01, ...p01, ...p10, ...p11);
      const du = uPerM ? Math.hypot(p01[0] - p00[0], p01[2] - p00[2]) * uPerM : 1 / seg;
      const u0 = uPerM ? s * du : s / seg;
      const u1 = u0 + du;
      uv.push(u0, d, u0, d + 1, u1, d, u1, d, u0, d + 1, u1, d + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Elips çevresinde eşit aralıklarla nokta (x, z, dışa bakan yön, açı)
function alongEllipse(rx, rz, spacing, cb) {
  const N = 2400;
  let left = spacing / 2;
  let px = 0;
  let pz = rz;
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * PI * 2;
    const x = rx * Math.sin(a);
    const z = rz * Math.cos(a);
    left -= Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
    if (left <= 0) {
      left += spacing;
      const nx = -x / (rx * rx);
      const nz = -z / (rz * rz);
      cb(x, z, Math.atan2(nx, nz), a);
    }
  }
}

// Tribün basamağının yüksekliği (kit yereli) — tribünde değilse null
export function stadiumHeight(x, z) {
  if ((x / IN_RX) ** 2 + (z / IN_RZ) ** 2 <= 1 || (x / TOP_RX) ** 2 + (z / TOP_RZ) ** 2 > 1 || inTunnel(x, z)) return null;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const m = (lo + hi) / 2;
    if ((x / tierRx(m)) ** 2 + (z / tierRz(m)) ** 2 > 1) lo = m;
    else hi = m;
  }
  return tierY(Math.min(TIERS - 1, Math.floor(((lo + hi) / 2) * TIERS)));
}

// Tek koltuk (oturak + sırtlık + ayak) — binlercesi tek ağda birleştirilir
function seatGeo() {
  const a = new THREE.BoxGeometry(0.46, 0.08, 0.38).toNonIndexed();
  a.translate(0, 0.42, 0.03);
  const b = new THREE.BoxGeometry(0.46, 0.34, 0.06).toNonIndexed();
  b.translate(0, 0.6, -0.17);
  const c = new THREE.BoxGeometry(0.08, 0.36, 0.08).toNonIndexed();
  c.translate(0, 0.18, -0.05);
  const pos = [];
  const nor = [];
  for (const g of [a, b, c]) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// Reklam bandı: sponsor adları (Süper Lig takımlarının sponsor fabrikaları)
const AD_DEFAULT = ['NEON ŞEHİR', 'ÇETELERİN SAVAŞI', 'SIXTAGRAM', 'BELEDİYE'];
const AD_COLORS = ['#ff3fa0', '#19e8ff', '#ffd23f', '#39ff88', '#ff9f45', '#b16bff', '#ffffff', '#ff6a3a'];
function drawAds(canvas, names) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const list = names && names.length ? names : AD_DEFAULT;
  g.fillStyle = '#07080d';
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const cell = W / list.length;
  list.forEach((name, i) => {
    const text = String(name).toLocaleUpperCase('tr-TR');
    let fs = 42;
    g.font = `900 ${fs}px Arial, sans-serif`;
    while (g.measureText(text).width > cell - 24 && fs > 16) {
      fs -= 2;
      g.font = `900 ${fs}px Arial, sans-serif`;
    }
    g.fillStyle = AD_COLORS[i % AD_COLORS.length];
    g.fillText(text, (i + 0.5) * cell, H / 2 + 2);
    // ayırıcı
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(Math.round((i + 1) * cell) - 1, 10, 2, H - 20);
  });
}

export function buildStadyum(kit, lot) {
  const { w, d } = lot;
  kit.floor('kaldirim', w, d, 0, 0);

  // --- dış cephe (tünel kemerleri boş) + ışık şeritleri + kolonlar -------------
  const facade = dmat('#3a4150', 0.5, 0.3);
  kit.mesh(ellLathe([[OUT_RX, OUT_RZ, 0], [OUT_RX, OUT_RZ, TUNNEL_H]], 220, { skip: (x, z) => inTunnel(x, z, 0.1) }), facade);
  kit.mesh(ellLathe([[OUT_RX, OUT_RZ, TUNNEL_H], [OUT_RX, OUT_RZ, 14]], 160), facade);
  for (const y of [4.75, 8.5, 12.5]) kit.mesh(ellLathe([[33.46, 27.06, y], [33.46, 27.06, y + 0.25]], 160), glowMat(y === 8.5 ? '#ff3fa0' : '#dfe8ff', 2.2), 0, 0, 0, 0, { cast: false });
  const colM = M('#565f70', 0.4, 0.5);
  alongEllipse(33.6, 27.2, 6.2, (x, z, yaw) => {
    if (!inTunnel(x, z, 1.2)) kit.box(0.5, 14, 0.6, colM, x, 0, z, { ry: yaw });
  });

  // --- saha çevresi (tartan) + tünel zeminleri -----------------------------------
  const track = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ color: '#7a2f36', roughness: 0.9 }));
  track.rotation.x = -PI / 2;
  track.scale.set(25.9, 19.2, 1);
  track.position.y = 0.15;
  track.receiveShadow = true;
  kit.add(track);
  const tunM = M('#2a2e38', 0.85);
  kit.box(2 * GAP, 0.02, 9.2, tunM, 0, 0.14, 45.8 / 2, { cast: false });
  kit.box(2 * GAP, 0.02, 9.2, tunM, 0, 0.14, -45.8 / 2, { cast: false });
  kit.box(8.9, 0.02, 2 * GAP, tunM, 58.9 / 2, 0.14, 0, { cast: false });
  kit.box(8.9, 0.02, 2 * GAP, tunM, -58.9 / 2, 0.14, 0, { cast: false });

  // --- saha (çim + çizgiler) -------------------------------------------------------
  const pitchTex = canvasTex('saha149', 1024, 640, (g, W, H) => {
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? '#2f8f3a' : '#37a345';
      g.fillRect((i * W) / 14, 0, W / 14 + 1, H);
    }
    g.strokeStyle = '#f2fbf2';
    g.lineWidth = 6;
    g.strokeRect(26, 26, W - 52, H - 52);
    g.beginPath();
    g.moveTo(W / 2, 26);
    g.lineTo(W / 2, H - 26);
    g.stroke();
    g.beginPath();
    g.arc(W / 2, H / 2, 84, 0, PI * 2);
    g.stroke();
    g.fillStyle = '#f2fbf2';
    g.beginPath();
    g.arc(W / 2, H / 2, 7, 0, PI * 2);
    g.fill();
    for (const side of [0, 1]) {
      const gx = side ? W - 26 : 26;
      const dir = side ? -1 : 1;
      g.strokeRect(Math.min(gx, gx + dir * 150), H / 2 - 190, 150, 380);
      g.strokeRect(Math.min(gx, gx + dir * 55), H / 2 - 90, 55, 180);
      g.beginPath();
      g.arc(gx + dir * 105, H / 2, 7, 0, PI * 2);
      g.fill();
      g.beginPath();
      g.arc(gx + dir * 105, H / 2, 84, side ? PI * 0.62 : -PI * 0.38, side ? PI * 1.38 : PI * 0.38);
      g.stroke();
    }
    for (const [cx, cy] of [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]]) {
      g.beginPath();
      g.arc(cx, cy, 16, 0, PI * 2);
      g.stroke();
    }
  }, { repeat: false });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_L, PITCH_W), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.92, emissive: '#ffffff', emissiveMap: pitchTex, emissiveIntensity: 0.18 }));
  pitch.rotation.x = -PI / 2;
  pitch.position.y = 0.16;
  pitch.receiveShadow = true;
  kit.add(pitch);

  // --- kaleler (direk + üst direk + yarı saydam file) + köşe bayrakları -------------
  const postM = M('#f4f6fa', 0.3, 0.2);
  const netM = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
  const goalX = PITCH_L / 2 - (26 / 1024) * PITCH_L;
  for (const s of [-1, 1]) {
    const gx = s * goalX;
    const gh = 2.1;
    const gw = 3.4;
    for (const z of [-gw, gw]) {
      kit.cyl(0.07, 0.07, gh, postM, gx, 0.16, z, 8);
      kit.solid(gx + s * 0.6, z, 0.75, 0.26);
    }
    kit.box(0.14, 0.14, gw * 2 + 0.14, postM, gx, gh + 0.09, 0);
    kit.mesh(new THREE.PlaneGeometry(gw * 2, gh), netM, gx + s * 1.2, 1.21, 0, PI / 2, { cast: false });
    kit.mesh(new THREE.PlaneGeometry(1.2, gw * 2), netM, gx + s * 0.6, 2.26, 0, 0, { cast: false, rx: -PI / 2 });
    for (const z of [-gw, gw]) kit.mesh(new THREE.PlaneGeometry(1.2, gh), netM, gx + s * 0.6, 1.21, z, 0, { cast: false });
    kit.solid(gx + s * 1.2, 0, 0.26, gw);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = sx * goalX;
    const z = sz * (PITCH_W / 2 - (26 / 640) * PITCH_W);
    kit.cyl(0.03, 0.03, 1.5, postM, x, 0.16, z, 6);
    kit.box(0.02, 0.32, 0.45, basicGlow('#ff3fa0'), x, 1.3, z + 0.23 * -sz, { cast: false });
  }

  // --- reklam panoları: sponsor fabrikaları ---------------------------------------
  const adCanvas = document.createElement('canvas');
  adCanvas.width = 2048;
  adCanvas.height = 64;
  drawAds(adCanvas, null);
  const adTex = new THREE.CanvasTexture(adCanvas);
  adTex.colorSpace = THREE.SRGBColorSpace;
  adTex.wrapS = THREE.RepeatWrapping;
  const adMat = new THREE.MeshStandardMaterial({ color: '#000000', map: adTex, emissive: '#ffffff', emissiveMap: adTex, emissiveIntensity: 1.4, roughness: 0.5 });
  const adFrame = M('#15171f', 0.6, 0.3);
  const board = (len, x, z, ry) => {
    kit.box(len, 0.95, 0.18, adFrame, x, BASE_Y, z, { ry });
    const geo = new THREE.PlaneGeometry(len, 0.8);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 18) + x * 0.07);
    // canlı (birleştirilmez): sponsorlar değişince doku yeniden çizilir
    kit.mesh(geo, adMat, x + Math.sin(ry) * 0.1, 0.63, z + Math.cos(ry) * 0.1, ry, { cast: false, dyn: true });
    const along = Math.abs(Math.cos(ry)) > 0.5;
    kit.solid(x, z, along ? len / 2 : 0.2, along ? 0.2 : len / 2);
  };
  for (const s of [-1, 1]) {
    for (const x of [-13, -5, 5, 13]) board(5.5, x, s * 14.1, s > 0 ? PI : 0);
    board(7, s * 21.1, -6.6, s > 0 ? -PI / 2 : PI / 2);
    board(7, s * 21.1, 6.6, s > 0 ? -PI / 2 : PI / 2);
  }

  // --- yedek kulübeleri -------------------------------------------------------------
  const dugM = new THREE.MeshStandardMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
  for (const s of [-1, 1]) {
    const x = s * 7.5;
    const z = 15.6;
    kit.item('parkbench', x - 0.9, z, 4, 0);
    kit.item('parkbench', x + 0.9, z, 4, 0);
    kit.mesh(new THREE.CylinderGeometry(1.25, 1.25, 4.2, 18, 1, true, PI / 2, PI), dugM, x, 1, z - 0.1, 0, { cast: false, rz: PI / 2 });
  }

  // --- tribün basamakları + basamak kenar çizgileri + saha korkuluğu -----------------
  const steps = [[IN_RX, IN_RZ, BASE_Y]];
  for (let i = 0; i < TIERS; i++) {
    steps.push([tierRx(i / TIERS), tierRz(i / TIERS), tierY(i)]);
    steps.push([tierRx((i + 1) / TIERS), tierRz((i + 1) / TIERS), tierY(i)]);
  }
  kit.mesh(ellLathe(steps, 300, { skip: (x, z) => inTunnel(x, z, 0.2) }), dmat('#525866', 0.85));
  const edgeM = M('#e8b923', 0.6);
  for (let i = 0; i < TIERS; i++) {
    const k = i / TIERS;
    const y = tierY(i);
    kit.mesh(ellLathe([[tierRx(k) + 0.02, tierRz(k) + 0.02, y + 0.012], [tierRx(k) + 0.1, tierRz(k) + 0.1, y + 0.012]], 300, { skip: (x, z) => inTunnel(x, z, 0.2) }), edgeM, 0, 0, 0, 0, { cast: false });
  }
  kit.mesh(ellLathe([[IN_RX - 0.02, IN_RZ - 0.02, 0.31], [IN_RX - 0.02, IN_RZ - 0.02, 0.55]], 300, { skip: (x, z) => inTunnel(x, z, 0.2) }), glowMat('#19e8ff', 1.8), 0, 0, 0, 0, { cast: false });

  // --- koltuklar: tek ağ (renkli bloklar) + her biri oturulabilir nokta ----------------
  const sg = seatGeo();
  const sp = sg.attributes.position.array;
  const sn = sg.attributes.normal.array;
  const pos = [];
  const nor = [];
  const col = [];
  const COL = { north: '#ff3fa0', south: '#19e8ff', ends: '#ffd23f', vip: '#f4f6fa' };
  const c3 = new THREE.Color();
  for (let i = 0; i < TIERS; i++) {
    const k = (i + 0.58) / TIERS;
    const rx = tierRx(k);
    const rz = tierRz(k);
    const y = tierY(i);
    let n = 0;
    alongEllipse(rx, rz, 0.62, (x, z, yaw) => {
      n += 1;
      if (n % 15 === 0 || n % 15 === 1 || inTunnel(x, z, 0.75)) return; // merdiven boşlukları
      const a = Math.atan2(x / rx, z / rz);
      const ends = Math.abs(Math.sin(a)) > 0.82;
      const vip = !ends && Math.cos(a) > 0 && i >= 3 && i <= 5 && Math.abs(x) < 9;
      c3.set(vip ? COL.vip : ends ? COL.ends : z < 0 ? COL.north : COL.south);
      const cs = Math.cos(yaw);
      const sn2 = Math.sin(yaw);
      for (let q = 0; q < sp.length; q += 3) {
        const lx = sp[q];
        const lz = sp[q + 2];
        pos.push(x + cs * lx + sn2 * lz, y + sp[q + 1], z - sn2 * lx + cs * lz);
        const nx = sn[q];
        const nz = sn[q + 2];
        nor.push(cs * nx + sn2 * nz, sn[q + 1], -sn2 * nx + cs * nz);
        col.push(c3.r, c3.g, c3.b);
      }
      kit.seats.push({ o: kit.group, x, y: y + 0.47, z, yaw, tier: true });
    });
  }
  const seatsGeo = new THREE.BufferGeometry();
  seatsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  seatsGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  seatsGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const seatsMesh = kit.mesh(seatsGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }), 0, 0, 0, 0, { cast: false });
  seatsMesh.userData.seatsMesh = true;

  // --- localar + üst tribün + çatı ---------------------------------------------------
  kit.mesh(ellLathe([[TOP_RX, TOP_RZ, LOGE_Y0], [TOP_RX, TOP_RZ, LOGE_Y1]], 220), dmat('#2a2f3c', 0.7));
  const logeTex = canvasTex('stadloca', 512, 64, (g, W, H) => {
    g.fillStyle = '#0d1018';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 5 === 2 ? '#7fd9ff' : '#ffd99a';
      g.fillRect(i * 32 + 3, 8, 26, H - 16);
    }
  });
  const logeM = new THREE.MeshStandardMaterial({ color: '#000000', map: logeTex, emissive: '#ffffff', emissiveMap: logeTex, emissiveIntensity: 0.9, side: THREE.DoubleSide });
  kit.mesh(ellLathe([[TOP_RX - 0.03, TOP_RZ - 0.03, 6.13], [TOP_RX - 0.03, TOP_RZ - 0.03, 7.53]], 220, { uPerM: 1 / 8 }), logeM, 0, 0, 0, 0, { cast: false });
  kit.mesh(ellLathe([[TOP_RX - 0.04, TOP_RZ - 0.04, LOGE_Y1 - 0.45], [TOP_RX - 0.04, TOP_RZ - 0.04, LOGE_Y1 - 0.2]], 220), glowMat('#ff3fa0', 2), 0, 0, 0, 0, { cast: false });
  const upTex = canvasTex('stadkoltuk149', 512, 128, (g, W, H) => {
    for (let i = 0; i < 24; i++) {
      g.fillStyle = i % 2 ? '#1f2433' : '#272d3e';
      g.fillRect(0, (i * H) / 24, W, H / 24);
    }
    for (let i = 0; i < 3200; i++) {
      g.fillStyle = ['#ff3fa0', '#ffd23f', '#19e8ff', '#ffffff', '#ff6a3a'][i % 5];
      g.globalAlpha = 0.6;
      g.fillRect(Math.random() * W, Math.random() * H, 2.2, 2);
    }
  });
  kit.mesh(ellLathe([[TOP_RX, TOP_RZ, LOGE_Y1], [OUT_RX - 0.15, OUT_RZ - 0.15, 13.4]], 220, { uPerM: 1 / 20 }), new THREE.MeshStandardMaterial({ map: upTex, roughness: 0.8, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: upTex, emissiveIntensity: 0.22 }), 0, 0, 0, 0, { cast: false });
  kit.mesh(ellLathe([[OUT_RX - 9.5, OUT_RZ - 8, ROOF_Y], [34.2, 27.8, ROOF_Y]], 160), new THREE.MeshStandardMaterial({ color: '#c9d2e0', roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.82, side: THREE.DoubleSide }), 0, 0, 0, 0, { cast: false });
  kit.mesh(ellLathe([[OUT_RX - 9.5, OUT_RZ - 8, ROOF_Y - 0.15], [OUT_RX - 9.5, OUT_RZ - 8, 14.32]], 160), glowMat('#e9f4ff', 2.6), 0, 0, 0, 0, { cast: false });

  // --- tünel duvarları (merdiven basamaklarının yan duvarı) + tünel tavanı ------------
  const wallM = M('#3a3f4c', 0.75);
  const capM = M('#8f96a6', 0.4, 0.5);
  const tunnel = (axis, sgn) => {
    const radAt = (k) => {
      const rx = tierRx(k);
      const rz = tierRz(k);
      return axis === 'z' ? rz * Math.sqrt(Math.max(0, 1 - (GAP / rx) ** 2)) : rx * Math.sqrt(Math.max(0, 1 - (GAP / rz) ** 2));
    };
    const outer = axis === 'z' ? OUT_RZ * Math.sqrt(1 - (GAP / OUT_RX) ** 2) : OUT_RX * Math.sqrt(1 - (GAP / OUT_RZ) ** 2);
    const segs = [];
    for (let i = 0; i < TIERS; i++) segs.push([radAt(i / TIERS), radAt((i + 1) / TIERS), Math.min(5.23, tierY(i) + 1)]);
    segs.push([radAt(1), outer + 0.2, 5.15]);
    for (const side of [-1, 1]) {
      segs.forEach(([r0, r1, top]) => {
        const len = r1 - r0 + 0.02;
        const mid = (sgn * (r0 + r1)) / 2;
        const off = side * 3.18;
        if (axis === 'z') {
          kit.box(0.36, top - BASE_Y, len, wallM, off, BASE_Y, mid);
          kit.box(0.42, 0.06, len, capM, off, top, mid, { cast: false });
          kit.solid(off, mid, 0.3, len / 2);
        } else {
          kit.box(len, top - BASE_Y, 0.36, wallM, mid, BASE_Y, off);
          kit.box(len, 0.06, 0.42, capM, mid, top, off, { cast: false });
          kit.solid(mid, off, len / 2, 0.3);
        }
      });
    }
    const r0 = radAt(1) - 0.2;
    const r1 = outer + 0.3;
    const mid = (sgn * (r0 + r1)) / 2;
    if (axis === 'z') kit.box(6.8, 0.6, r1 - r0, wallM, 0, TUNNEL_H, mid);
    else kit.box(r1 - r0, 0.6, 6.8, wallM, mid, TUNNEL_H, 0);
    const lx = axis === 'z' ? 0 : sgn * (outer - 1.2);
    const lz = axis === 'z' ? sgn * (outer - 1.2) : 0;
    kit.light(lx, TUNNEL_H - 0.4, lz, '#ffe3ae', 4, 9);
  };
  tunnel('z', 1);
  tunnel('z', -1);
  tunnel('x', 1);
  tunnel('x', -1);

  // --- çarpışma ---------------------------------------------------------------------------
  // en üst basamağın arkası (loca duvarı) ve dış cephe: yürünemez halka
  alongEllipse(31.45, 25.05, 0.9, (x, z, yaw) => {
    if (!inTunnel(x, z, 0.2)) kit.solid(x, z, 0.55, 0.3, yaw);
  });
  alongEllipse(33.5, 27.1, 0.9, (x, z, yaw) => {
    if (!inTunnel(x, z, 0.15)) kit.solid(x, z, 0.55, 0.32, yaw);
  });
  kit.ellipse(0, 0, 34, 27.6, { car: true }); // arabalar stadyuma girmez
  kit.height(0, 0, 34.4, stadiumHeight); // tribün basamakları
  kit.area(0, 0, OUT_RX - 0.3, OUT_RZ - 0.3, 'stadyum');
  // ana giriş: v151 — güney tünelinin içi (stadyum alanında doğulur → üstte Futbol düğmesi hemen görünür)
  kit.zone({ x: 0, z: 22, r: 0, kind: 'spawn', key: 'stadyum', lx: 0, lz: 0 });

  // --- kamera engelleri (kamera duvar / tribün içine girmesin) -------------------------
  const inv = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const camBlock = (geo) => {
    const o = new THREE.Mesh(geo, inv);
    o.userData.blocker = true;
    kit.group.add(o);
    kit.blockers.push(o);
  };
  camBlock(ellLathe([[33.5, 27.1, 0], [33.5, 27.1, 14]], 96, { skip: (x, z) => inTunnel(x, z, -0.5) }));
  camBlock(ellLathe([[33.5, 27.1, 4.9], [33.5, 27.1, 14]], 96));
  const stepsCam = [[IN_RX - 0.3, IN_RZ - 0.3, 0.93]];
  for (let i = 0; i < TIERS; i++) stepsCam.push([tierRx((i + 0.5) / TIERS), tierRz((i + 0.5) / TIERS), tierY(i) + 0.85]);
  stepsCam.push([TOP_RX, TOP_RZ, 5.98]);
  camBlock(ellLathe(stepsCam, 120, { skip: (x, z) => inTunnel(x, z, 0.3) }));
  camBlock(ellLathe([[TOP_RX, TOP_RZ, 5.98], [TOP_RX, TOP_RZ, LOGE_Y1], [OUT_RX - 0.15, OUT_RZ - 0.15, 13.4]], 120));
  camBlock(ellLathe([[OUT_RX - 9.5, OUT_RZ - 8, ROOF_Y - 0.3], [34.3, 27.9, ROOF_Y - 0.3]], 96));
  for (const [ax, az, hx, hz] of [[0, 1, GAP, 0], [0, -1, GAP, 0], [1, 0, 0, GAP], [-1, 0, 0, GAP]]) {
    const a = ax ? TOP_RX - 0.5 : TOP_RZ - 0.5;
    const len = (ax ? OUT_RX : OUT_RZ) - a;
    const o = new THREE.Mesh(new THREE.BoxGeometry(hx ? hx * 2 + 0.8 : len, 0.8, hz ? hz * 2 + 0.8 : len), inv);
    o.position.set(ax * (a + len / 2), 4.9, az * (a + len / 2));
    o.userData.blocker = true;
    kit.group.add(o);
    kit.blockers.push(o);
  }

  // --- projektörler + ışıklar ------------------------------------------------------------
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = sx * 23;
    const z = sz * 18.6;
    kit.cyl(0.25, 0.35, 22, M('#4a505c', 0.4, 0.7), x, 0, z, 10);
    kit.box(3, 1.6, 0.4, basicGlow('#f4f8ff'), x, 22, z, { cast: false, ry: Math.atan2(-x, -z) });
    kit.light(x * 0.8, 18, z * 0.8, '#eef4ff', 10, 34);
  }
  kit.light(0, 12, 0, '#eef4ff', 12, 40);

  // --- dev skor ekranları (iki kale arkası) -------------------------------------------------
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 1024;
  sbCanvas.height = 420;
  const sbTex = new THREE.CanvasTexture(sbCanvas);
  sbTex.colorSpace = THREE.SRGBColorSpace;
  const sbMat = new THREE.MeshBasicMaterial({ map: sbTex, toneMapped: false });
  const scoreboard = (st) => {
    const g = sbCanvas.getContext('2d');
    const W = sbCanvas.width;
    const H = sbCanvas.height;
    g.fillStyle = '#05060a';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ff3fa0';
    g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fit = (text, size, maxW, weight = 900) => {
      let fs = size;
      g.font = `${weight} ${fs}px Arial, sans-serif`;
      while (g.measureText(text).width > maxW && fs > 20) {
        fs -= 4;
        g.font = `${weight} ${fs}px Arial, sans-serif`;
      }
    };
    if (!st) {
      g.fillStyle = '#ffffff';
      fit('NEON ARENA', 120, W - 80);
      g.fillText('NEON ARENA', W / 2, H / 2);
      sbTex.needsUpdate = true;
      return;
    }
    if (st.banner) {
      g.fillStyle = '#ffd23f';
      fit(st.banner, 190, W - 80);
      g.fillText(st.banner, W / 2, H / 2 - 30);
      g.fillStyle = '#ffffff';
      const line = `${st.home}  ${st.hs} - ${st.as}  ${st.away}`;
      fit(line, 64, W - 80);
      g.fillText(line, W / 2, H - 70);
      sbTex.needsUpdate = true;
      return;
    }
    g.fillStyle = '#ffffff';
    fit(st.home, 70, 330);
    g.fillText(st.home, 200, 120);
    fit(st.away, 70, 330);
    g.fillText(st.away, W - 200, 120);
    g.fillStyle = '#ffd23f';
    g.font = '900 170px ui-monospace, Menlo, monospace';
    g.fillText(st.phase === 'scheduled' ? '-' : `${st.hs}-${st.as}`, W / 2, 130);
    g.fillStyle = st.phase === 'live' ? '#39ff88' : '#19e8ff';
    let sub = 'NEON ARENA';
    if (st.phase === 'live' && st.min) sub = `${st.min}'`;
    else if (st.phase === 'finished' || st.phase === 'live') sub = 'MAÇ SONU';
    else if (st.phase === 'scheduled') sub = 'MAÇ 18:00';
    fit(sub, 120, W - 120);
    g.fillText(sub, W / 2, 320);
    sbTex.needsUpdate = true;
  };
  scoreboard(null);
  for (const s of [-1, 1]) {
    const x = s * 31.8;
    kit.box(0.5, 4.6, 11, M('#101218', 0.5, 0.4), x, 8.6, 0, { cast: false });
    kit.mesh(new THREE.PlaneGeometry(10.4, 4.27), sbMat, x - s * 0.27, 10.9, 0, (-s * PI) / 2, { cast: false, dyn: true });
    kit.light(x - s * 2, 10.8, 0, '#ff3fa0', 3, 9);
  }

  // --- tabelalar ------------------------------------------------------------------------------
  kit.sign('macgunu', 'MAÇ GÜNÜ', 1.3, 0, 9.6, 27.75, 0, { color: '#ffffff', bg: 'rgba(10,12,18,0.92)', border: '#ff3fa0', font: '900 110px Arial, sans-serif', glow: '#ff3fa0', li: 6, ld: 12 });
  kit.sign('stadgir', 'NEON ARENA', 1, 0, 5.85, 27.22, 0, { color: '#ffffff', bg: 'rgba(10,12,18,0.85)', border: '#19e8ff', font: '900 100px Arial, sans-serif', glow: '#19e8ff', li: 5, ld: 10 });
  kit.pool(0, 30.1, '#ff3fa0', 12, 0.16, 0.45);
  for (const s of [-1, 1]) kit.sign(`stadgir${s}`, 'NEON ARENA', 1, s * 33.52, 5.85, 0, (s * PI) / 2, { color: '#ffffff', bg: 'rgba(10,12,18,0.85)', border: '#19e8ff', font: '900 100px Arial, sans-serif', glow: '#19e8ff', li: 4, ld: 9 });
  kit.sign('stadgirn', 'NEON ARENA', 1, 0, 5.85, -27.22, PI, { color: '#ffffff', bg: 'rgba(10,12,18,0.85)', border: '#19e8ff', font: '900 100px Arial, sans-serif', light: false });

  let lastAds = '';
  return {
    mapLabel: { text: 'STADYUM', y: 18, z: 0 },
    match: {
      pitch: { L: goalX * 2, W: PITCH_W * (1 - 52 / 640) },
      scoreboard,
      // maç saatinde sahaya girilmez (kit yereli, merkez 0,0)
      pitchLock: { hw: 20.85, hd: 13.85 },
      setSponsors(names) {
        const key = JSON.stringify(names || []);
        if (key === lastAds) return;
        lastAds = key;
        drawAds(adCanvas, names);
        adTex.needsUpdate = true;
      },
    },
  };
}
