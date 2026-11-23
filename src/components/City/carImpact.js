// =============================================================================
// v193 — GERÇEKÇİ ÇARPMA + HAVADA SÜZÜLME (v187 "Dublör Parkuru" prototipinden uyarlandı)
// -----------------------------------------------------------------------------
// Prototip tam 3D katı cisim fiziği kullanıyor (120 adım/sn, tekerlek başına süspansiyon). Şehirdeki
// araba modeli (ağ, kamera, dorse, meslekler buna bağlı) korunarak prototipin YÖNTEMLERİ alındı:
//   • Çarpma: temas noktasında itki (impulse) — kapanma hızı × (1 + esneklik) / (1/m + (r×n)²/I).
//     Önden çarpınca araba hızına göre geri seker; köşeden / yandan çarpınca kendi etrafında döner
//     (açısal hız); duvar boyunca sürtünmeyle kayar. Kütle 1 alınır, atalet aracın ölçüsünden (L, W).
//   • Havada: "uçuş dengesi" — burun gidiş yönüne (yörüngeye) döner, açısal hız havada az söner;
//     gaz / fren burnu, direksiyon yatışı hafifçe döndürür (prototipteki hava kontrolü).
//   • İniş / çarpma: gövde (süspansiyon) yay-sönüm ile çöker ve toparlanır.
// Saf fonksiyonlar (Three.js yok) — tests/city/car-impact.test.mjs ile sınanır. Sunucuya / Firestore'a /
// RTDB'ye hiçbir şey eklenmez.
// =============================================================================

// araç türüne göre esneklik (e) ve sürtünme (μ) — ağır araç az seker, motor biraz daha
export function impactParams(v) {
  if (v?.ride === 'horse' || v?.walker) return { e: 0.08, mu: 0.5 };
  if (v?.moto) return { e: 0.32, mu: 0.45 };
  if ((v?.len || 4) > 6) return { e: 0.14, mu: 0.4 }; // otobüs, tır
  return { e: 0.27, mu: 0.38 };
}

// aracın atalet momenti (kütle 1): dikdörtgen plaka (L × W) — ağır / uzun araç zor döner
export function yawInertia(v) {
  const L = Math.max(1.6, v?.len || 4.2);
  const W = Math.max(0.6, (v?.halfW || 0.9) * 2);
  return (L * L + W * W) / 12;
}

// Temas: aracın çarpışma daireleri (yarıçap r) içinde engelli olanlar bulunur (blockedCircle). Her birinin
// kenarında engelin içinde kalan yönler (blockedPt, nokta testi) toplanır: normal = bu yönlerin tersi
// (engelden araca), temas noktası = dairenin o yöndeki kenarı. Bulunamazsa null.
export function findContact(circles, r, blockedCircle, blockedPt = blockedCircle, fallbackDir = null) {
  let px = 0;
  let pz = 0;
  let n = 0;
  let wx = 0;
  let wz = 0;
  for (const [cx, cz] of circles) {
    if (!blockedCircle(cx, cz)) continue;
    let dx = 0;
    let dz = 0;
    for (const rr of [1.15, 0.8, 0.45]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const ux = Math.cos(a);
        const uz = Math.sin(a);
        if (blockedPt(cx + ux * r * rr, cz + uz * r * rr)) {
          dx += ux;
          dz += uz;
        }
      }
      if (dx || dz) break;
    }
    const L = Math.hypot(dx, dz);
    if (L < 1e-3) continue;
    dx /= L;
    dz /= L;
    wx += dx;
    wz += dz;
    px += cx + dx * r;
    pz += cz + dz * r;
    n += 1;
  }
  if (!n) {
    if (!fallbackDir) return null;
    const c = circles.find(([cx, cz]) => blockedCircle(cx, cz));
    if (!c) return null;
    return { px: c[0] + fallbackDir[0] * r, pz: c[1] + fallbackDir[1] * r, nx: -fallbackDir[0], nz: -fallbackDir[1] };
  }
  const L = Math.hypot(wx, wz) || 1;
  return { px: px / n, pz: pz / n, nx: -wx / L, nz: -wz / L };
}

// İtki uygula. c: { x, z, vx, vz, spin } (spin: ekstra sapma açısal hızı, rad/sn, +y ekseni).
// Dönen: { vn: kapanma hızı (≥0), vt: sürtünen hız, j } — vn > 0 ise çarptı.
export function applyImpact(c, contact, { e = 0.27, mu = 0.38, I = 1.6 } = {}) {
  const rx = contact.px - c.x;
  const rz = contact.pz - c.z;
  const w = c.spin || 0;
  // temas noktasının hızı: v + ω × r   (ω = w ŷ → (w·rz, −w·rx))
  const vpx = c.vx + w * rz;
  const vpz = c.vz - w * rx;
  const vn = vpx * contact.nx + vpz * contact.nz;
  if (vn >= 0) return { vn: 0, vt: 0, j: 0 }; // ayrılıyor
  const rn = rz * contact.nx - rx * contact.nz; // (r × n)_y
  const j = (-(1 + e) * vn) / (1 + (rn * rn) / I);
  c.vx += j * contact.nx;
  c.vz += j * contact.nz;
  let spin = w + (j * rn) / I;
  // sürtünme (teğet): duvar boyunca kayarken hız ve dönüş azalır
  const tx = vpx - vn * contact.nx;
  const tz = vpz - vn * contact.nz;
  const vt = Math.hypot(tx, tz);
  if (vt > 1e-4) {
    const ux = tx / vt;
    const uz = tz / vt;
    const rt = rz * ux - rx * uz;
    const jt = Math.min(mu * j, vt / (1 + (rt * rt) / I));
    c.vx -= jt * ux;
    c.vz -= jt * uz;
    spin -= (jt * rt) / I;
  }
  c.spin = Math.max(-6, Math.min(6, spin));
  return { vn: -vn, vt, j };
}

// Yay-sönüm (yarı örtük Euler, kararlı): x'' = −k·x − d·x'. s: { x, v }
export function spring(s, k, d, dt) {
  const steps = Math.max(1, Math.ceil(dt / 0.02));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (-k * s.x - d * s.v) * h;
    s.x += s.v * h;
  }
  return s;
}

// Havada burun (gp = eğim, tan): yörünge açısına doğru döner + oyuncu girdisi; açısal hız az söner.
// a: { gp, gpV }, vy: dikey hız, vF: ileri hız, inP: −1..1 (gaz: burun aşağı, fren: burun yukarı)
export function airPitch(a, vy, vF, inP, dt, { assist = 0.6, torque = 3.2 } = {}) {
  const vh = Math.max(4, Math.abs(vF));
  const path = Math.max(-1.1, Math.min(1.1, (vy / vh) * Math.sign(vF || 1)));
  const acc = (path - a.gp) * 7 * assist - a.gpV * 1.1 - inP * torque * 0.55;
  a.gpV += acc * dt;
  a.gpV *= Math.exp(-0.08 * dt);
  a.gp = Math.max(-1.2, Math.min(1.2, a.gp + a.gpV * dt));
  return a;
}
