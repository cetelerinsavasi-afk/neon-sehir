// v96 — Şampiyona: her araçta günün en hızlı ilk 3'üne ödül (aracın galeri fiyatı baz).
// Örn. 1.000.000 altınlık araç → 1. 250.000 · 2. 100.000 · 3. 50.000
// İstemci (ChampionshipScreen) ve sunucu (raceTa + gece ödemesi) aynı dosyayı kullanır.
export const CHAMPIONSHIP_PRIZE_RATIOS = [0.25, 0.1, 0.05];
export const CHAMPIONSHIP_TOP_KEEP = 10;

export const championshipPrize = (price, place) => Math.round((Number(price) || 0) * (CHAMPIONSHIP_PRIZE_RATIOS[place - 1] || 0));

// Günün sıralaması: oyuncu başına en iyi süre, süreye göre artan (eşitlikte önce bitiren önde).
export function mergeChampionshipTop(top, entry) {
  const list = Array.isArray(top) ? top.filter((e) => e && e.uid && Number(e.timeMs) > 0) : [];
  const i = list.findIndex((e) => e.uid === entry.uid);
  if (i >= 0) {
    if (Number(entry.timeMs) >= Number(list[i].timeMs)) return list;
    list.splice(i, 1);
  }
  list.push(entry);
  list.sort((a, b) => Number(a.timeMs) - Number(b.timeMs) || Number(a.at || 0) - Number(b.at || 0));
  return list.slice(0, CHAMPIONSHIP_TOP_KEEP);
}

// Bir günün ilk 3'ü (yer + ödül). Eski kayıtlar (top yok) → tek kazanan / berabere liderler 1.
export function championshipPodium(doc, price) {
  if (!doc) return [];
  if (Array.isArray(doc.top) && doc.top.length) {
    return doc.top.slice(0, 3).map((e, i) => ({ ...e, place: i + 1, reward: championshipPrize(price, i + 1) }));
  }
  const leaders = Array.isArray(doc.leaders) && doc.leaders.length ? doc.leaders : doc.leaderUid ? [{ uid: doc.leaderUid, name: doc.leaderName, vehicleModel: doc.leaderVehicleModel, timeMs: doc.leaderTimeMs }] : [];
  return leaders.map((e) => ({ ...e, timeMs: e.timeMs ?? doc.leaderTimeMs, turns: doc.leaderTurns, place: 1, reward: championshipPrize(price, 1) }));
}

// =============================================================================
// v128 — ŞAMPİYONA (yeni sistem): ödül artık SÜREYE göre, yarış biter bitmez.
//   - Her ARAÇ günde 1 kez katılır (aynı modelden 3 araba = 3 giriş).
//   - Günün listesi (championshipBoard/{gün}) ve tüm zamanlar listesi
//     (championshipBoard/allTime) oyuncu başına en iyi süreyi tutar.
// İstemci (ChampionshipScreen / yarış sonucu) ve sunucu aynı tabloyu kullanır.
// =============================================================================
export const CHAMP_V2_START_DAY = '2026-10-25';
// Eski sisteme ait günleri yeni sisteme taşıma (geçiş) — bu tarihten sonra çalışmaz.
export const CHAMP_V2_MIGRATE_UNTIL = '2026-11-02';
export const CHAMP_BOARD_SHOW = 10;

// [üst sınır (ms, HARİÇ), ödül] — 25 sn altı 500.000 … 60 sn'ye kadar (dahil) 1.000
export const CHAMP_PRIZE_TIERS = [
  [25000, 500000],
  [26000, 250000],
  [27000, 200000],
  [28000, 160000],
  [29000, 120000],
  [30000, 80000],
  [33000, 60000],
  [36000, 40000],
  [40000, 20000],
  [45000, 10000],
  [50000, 5000],
  [55000, 2500],
  [60001, 1000],
];

export function championshipTimePrize(ms) {
  const t = Number(ms);
  if (!Number.isFinite(t) || t <= 0) return 0;
  for (const [limit, prize] of CHAMP_PRIZE_TIERS) if (t < limit) return prize;
  return 0;
}

// Ödülün kademesi (0 = en yüksek) — süre ödül almıyorsa -1
export function championshipTierIndex(ms) {
  const t = Number(ms);
  if (!Number.isFinite(t) || t <= 0) return -1;
  return CHAMP_PRIZE_TIERS.findIndex(([limit]) => t < limit);
}

// Günün listesi: { [uid]: entry } → süreye göre sıralı dizi (eşitlikte önce bitiren)
export function rankChampionshipBoard(entries) {
  return Object.entries(entries && typeof entries === 'object' ? entries : {})
    .map(([uid, e]) => ({ ...e, uid }))
    .filter((e) => Number(e.timeMs) > 0)
    .sort((a, b) => Number(a.timeMs) - Number(b.timeMs) || Number(a.at || 0) - Number(b.at || 0));
}

// Bu koşu oyuncunun günlük kaydından daha iyi mi?
export function isBetterRun(prev, timeMs) {
  return !prev || !(Number(prev.timeMs) > 0) || Number(timeMs) < Number(prev.timeMs);
}
