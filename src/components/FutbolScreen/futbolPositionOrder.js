// Oyuncu listelerinde ortak sıralama: en üstte forvetler, en altta
// kaleciler (FWD, MID, DEF, GK). Aynı mevkideki oyuncular arasında
// güçlü olan üstte gösterilir.
export const FUTBOL_POSITION_ORDER = { FWD: 0, MID: 1, DEF: 2, GK: 3 };

export function sortFutbolPlayersByPosition(players) {
  return [...players].sort((a, b) => {
    const posDiff = (FUTBOL_POSITION_ORDER[a.position] ?? 99) - (FUTBOL_POSITION_ORDER[b.position] ?? 99);
    if (posDiff !== 0) return posDiff;
    return (b.power || 0) - (a.power || 0);
  });
}
