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
