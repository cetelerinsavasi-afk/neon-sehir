// Menajerlik seviyesi (v38) — sunucudaki functions/index.js ile birebir aynı
// hesap. Galibiyet +1, mağlubiyet −1 puan; seviye aralıkları ikiye katlanır:
// −9..9 → 0 · 10..29 → 1 · 30..69 → 2 · … (eksi taraf simetrik).
const BASE = 10;
const low = (n) => BASE * (Math.pow(2, n) - 1);

export function levelFromPoints(points) {
  const p = Math.trunc(Number(points) || 0);
  const a = Math.abs(p);
  let n = 0;
  while (a >= low(n + 1)) n += 1;
  return p < 0 ? -n : n;
}

export function levelRange(level) {
  const L = Math.trunc(Number(level) || 0);
  if (L === 0) return [-(BASE - 1), BASE - 1];
  const n = Math.abs(L);
  const lo = low(n);
  const hi = low(n + 1) - 1;
  return L > 0 ? [lo, hi] : [-hi, -lo];
}

function anchor(level) {
  const L = Math.trunc(Number(level) || 0);
  if (L === 0) return 0;
  const [lo, hi] = levelRange(L);
  return L > 0 ? lo : hi;
}

// Oyuncunun güncel puanı (eski kayıtlarda seviye+streak'ten, seviye korunarak)
export function managerPoints(player) {
  if (player && Number.isFinite(player.futbolManagerPoints)) return Math.trunc(player.futbolManagerPoints);
  const level = player?.futbolManagerLevel || 0;
  const [lo, hi] = levelRange(level);
  return Math.max(lo, Math.min(hi, anchor(level) + Math.trunc(Number(player?.futbolManagerLevelStreak) || 0)));
}

// Çubuk için: seviye, puan, bir üst seviyeye kalan galibiyet, bir alt seviyeye kalan mağlubiyet
export function managerLevelInfo(player) {
  const points = managerPoints(player);
  const level = levelFromPoints(points);
  const [lo, hi] = levelRange(level);
  return { level, points, lo, hi, toUp: hi + 1 - points, toDown: points - (lo - 1) };
}
