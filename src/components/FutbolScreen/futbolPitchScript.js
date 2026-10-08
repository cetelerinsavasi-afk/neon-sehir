// =============================================================================
// v77 — Canlı saha senaryosu (SADECE görsel). Maç sonucu sunucuda bellidir;
// burada zaman çizelgesindeki olaylardan topun yolu üretilir:
//   atak (olaydan biraz önce top rakip yarı sahaya akar, "tehlike")
//   → şut (gol: ağlara · isabetli: kaleci çeler · isabetsiz: direk / aut / blok)
//   → toparlanma (golden sonra santra, diğerlerinde kale vuruşu)
// Olay yokken top, topla oynama oranına göre sahada dolaşır.
// Ev sahibi SAĞA, deplasman SOLA hücum eder. Koordinatlar: x 0–100, y 0–64.
// Deterministik: aynı maç aynı dakikada her izleyicide aynı görünür.
// =============================================================================
export const PITCH_W = 100;
export const PITCH_H = 64;
// v77 — süreler GERÇEK SANİYE cinsinden (canlıda 1 maç dakikası = 40 sn).
// Eskiden dakika cinsindendi: canlıda atak 30 sn, şut 4 sn sürüyordu (çok yavaş).
// Hızlı özet tekrarında (1 dk ≈ 0,17 sn) eski dakika süreleri kullanılır.
export const LIVE_SEC_PER_MIN = 40;
const DUR_LIVE_S = { build: 6.5, shot: 0.7, after: 3.2 };
const DUR_REPLAY_MIN = { build: 0.75, shot: 0.1, after: 0.45 };
function durations(spm) {
  if (spm >= 5) return { build: DUR_LIVE_S.build / spm, shot: DUR_LIVE_S.shot / spm, after: DUR_LIVE_S.after / spm };
  return DUR_REPLAY_MIN;
}

// basit deterministik "rastgele" (dakika + ek)
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// isabetsiz şutun türü (sunucu etiketi 'Şut auta / bloke oldu' tek; görselde çeşitlenir)
export function shotVariant(e) {
  if (e.type === 'goal') return 'goal';
  if (e.type === 'shot_on') return 'save';
  const r = hash(e.minute * 3.7 + (e.team === 'home' ? 1 : 2));
  return r < 0.3 ? 'post' : r < 0.7 ? 'wide' : 'block';
}
export const VARIANT_TEXT = {
  goal: 'GOOOL!',
  save: 'KURTARIŞ!',
  post: 'DİREK!',
  wide: 'AUT',
  block: 'BLOK!',
};
export const VARIANT_ICON = { goal: '⚽', save: '🧤', post: '🥅', wide: '↗️', block: '🛡️' };
// anlatımda isabetsiz şutun etiketi (sunucu etiketinin yerine)
export const MISS_LABEL = { post: 'Şut direkten döndü!', wide: 'Şut auta çıktı', block: 'Şut defansa çarptı' };

function possessionAt(checkpoints, minute) {
  if (!checkpoints?.length) return 50;
  if (minute <= 0) return checkpoints[0].home;
  if (minute >= 90) return checkpoints[checkpoints.length - 1].home;
  const idx = Math.min(Math.floor(minute / 10), checkpoints.length - 2);
  const a = checkpoints[idx];
  const b = checkpoints[idx + 1] || a;
  return a.home + (b.home - a.home) * ((minute - a.minute) / (b.minute - a.minute || 10));
}

// Olay yokken dolaşma (hızlı özet için: dakika tabanlı yumuşak yol)
function wander(t, poss) {
  const bias = (poss - 50) * 0.7; // ev sahibi fazla oynuyorsa top rakip yarıda
  const x = 50 + bias + Math.sin(t * 1.31 + 0.7) * 17 + Math.sin(t * 3.7) * 6;
  const y = 32 + Math.sin(t * 0.93 + 1.9) * 15 + Math.sin(t * 2.71) * 6;
  return { x: Math.max(8, Math.min(92, x)), y: Math.max(6, Math.min(58, y)) };
}

// v77 — CANLI pas oyunu: top oyuncudan oyuncuya ~1–2 sn'de bir pas olarak
// gider; topa sahip takım, topla oynama oranına göre seçilir. Saniye tabanlı
// ve deterministik (aynı anda her izleyicide aynı).
const PASS_S = 1.6;
function passTarget(n, poss) {
  const home = hash(n * 1.37 + 0.11) * 100 < poss;
  const tilt = Math.sin(n * 0.21) * 22 + (poss - 50) * 0.5; // sahanın hangi yarısında oynanıyor
  const idx = 1 + Math.floor(hash(n * 2.71 + 0.5) * 5); // kaleci hariç
  const [bx, by] = SHAPE[idx];
  const x = (home ? bx : 100 - bx) + tilt + (hash(n + 0.3) - 0.5) * 10;
  const y = by + (hash(n + 0.9) - 0.5) * 12;
  return { x: Math.max(6, Math.min(94, x)), y: Math.max(5, Math.min(59, y)), home };
}
function passPlay(sec, poss) {
  const n = Math.floor(sec / PASS_S);
  const f = sec / PASS_S - n;
  const a = passTarget(n - 1, poss);
  const b = passTarget(n, poss);
  if (f < 0.42) {
    // pas: hızlı çıkış, yumuşak varış
    const k = 1 - Math.pow(1 - f / 0.42, 2.2);
    const arc = Math.sin(k * Math.PI) * Math.min(4, Math.hypot(b.x - a.x, b.y - a.y) * 0.06);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) - arc };
  }
  // alan oyuncu topu sürer
  const d = (f - 0.42) / 0.58;
  const dir = b.home ? 1 : -1;
  return { x: b.x + dir * d * 5 + Math.sin(sec * 9) * 0.5, y: b.y + Math.sin(sec * 3.1 + n) * 1.4 };
}
function playBall(t, poss, spm) {
  return spm >= 5 ? passPlay(t * spm, poss) : wander(t, poss);
}

function shotPoint(e) {
  const home = e.team === 'home';
  const y = 32 + (hash(e.minute) - 0.5) * 22;
  return { x: home ? 80 + hash(e.minute + 1) * 6 : 20 - hash(e.minute + 1) * 6, y };
}
function shotTarget(e, v) {
  const home = e.team === 'home';
  const gx = home ? 100 : 0;
  const side = hash(e.minute + 5) < 0.5 ? -1 : 1;
  switch (v) {
    case 'goal':
      return { x: home ? 101.5 : -1.5, y: 32 + side * (2 + hash(e.minute + 6) * 3) };
    case 'save':
      return { x: home ? 96 : 4, y: 32 + side * hash(e.minute + 7) * 4 };
    case 'post':
      return { x: home ? 99.5 : 0.5, y: 32 + side * 4.4 };
    case 'wide':
      return { x: gx + (home ? 2 : -2), y: 32 + side * (9 + hash(e.minute + 8) * 6) };
    default: // block
      return { x: home ? 88 : 12, y: 32 + side * 6 };
  }
}
function afterPoint(e, v) {
  const home = e.team === 'home';
  if (v === 'goal') return { x: 50, y: 32 };
  if (v === 'post') return { x: home ? 84 : 16, y: 32 + (hash(e.minute + 9) - 0.5) * 30 };
  if (v === 'save') return { x: home ? 70 : 30, y: 32 + (hash(e.minute + 10) - 0.5) * 26 };
  return { x: home ? 72 : 28, y: 32 + (hash(e.minute + 11) - 0.5) * 30 }; // kale vuruşu / taç
}

// t (simüle dakika, kesirli) anındaki sahne
// spm: 1 maç dakikası kaç gerçek saniye (canlı 40; özet tekrarı ≈ 0,17)
export function pitchStateAt(timeline, checkpoints, t, spm = LIVE_SEC_PER_MIN) {
  const events = timeline || [];
  const poss = possessionAt(checkpoints, t);
  const { build: BUILD, shot: SHOT, after: AFTER } = durations(spm);
  let active = null;
  for (const e of events) {
    if (t >= e.minute - BUILD && t < e.minute + SHOT + AFTER) {
      active = e;
      break;
    }
  }
  if (!active) {
    const p = playBall(t, poss, spm);
    return { ball: p, phase: 'play', attackSide: null, event: null, poss };
  }
  const e = active;
  const v = shotVariant(e);
  const sp = shotPoint(e);
  const tgt = shotTarget(e, v);
  const after = afterPoint(e, v);
  const attackSide = e.team;
  if (t < e.minute) {
    // atak: dolaşmadan şut noktasına
    const k = ease((t - (e.minute - BUILD)) / BUILD);
    const from = playBall(e.minute - BUILD, poss, spm);
    // canlıda atak: kısa paslarla ilerleyen top (dalga), özet tekrarında hafif titreşim
    const wob = spm >= 5 ? Math.sin(t * spm * 4.2) * 3.2 * (1 - k) : Math.sin(t * 25) * 1.2 * (1 - k);
    return { ball: { x: lerp(from.x, sp.x, k), y: lerp(from.y, sp.y, k) + wob }, phase: 'attack', attackSide, danger: k, event: e, variant: v, poss };
  }
  if (t < e.minute + SHOT) {
    const k = (t - e.minute) / SHOT;
    const lift = Math.sin(k * Math.PI) * (v === 'wide' ? 3 : 1.5);
    return { ball: { x: lerp(sp.x, tgt.x, k), y: lerp(sp.y, tgt.y, k) - lift }, phase: 'shot', attackSide, event: e, variant: v, poss };
  }
  const k = ease(Math.min(1, (t - e.minute - SHOT) / AFTER));
  // gol: top ağlarda biraz bekler, sonra santraya (banner/flash süreleri: since/AFTER)
  const hold = v === 'goal' ? Math.min(1, k * 1.6) : k;
  return {
    ball: { x: lerp(tgt.x, after.x, v === 'goal' ? Math.max(0, hold * 1.4 - 0.4) : hold), y: lerp(tgt.y, after.y, v === 'goal' ? Math.max(0, hold * 1.4 - 0.4) : hold) },
    phase: 'after',
    attackSide,
    event: e,
    variant: v,
    since: t - e.minute,
    sinceK: (t - e.minute) / (SHOT + AFTER), // 0..1 (şut + toparlanma)
    poss,
  };
}

// Takım dizilişi (6 kişi: K, 2 D, 2 O, 1 F) — top x'ine göre kayar
const SHAPE = [
  [6, 32],
  [22, 19],
  [22, 45],
  [40, 21],
  [40, 43],
  [56, 32],
];
export function teamDots(side, ball) {
  const shift = (ball.x - 50) * 0.38;
  return SHAPE.map(([x, y], i) => {
    const gk = i === 0;
    const bx = side === 'home' ? x + (gk ? 0 : shift) : 100 - x + (gk ? 0 : shift);
    const pull = gk ? 0.15 : 0.22;
    const by = y + (ball.y - y) * pull;
    return { x: Math.max(2, Math.min(98, bx)), y: Math.max(3, Math.min(61, by)) };
  });
}
