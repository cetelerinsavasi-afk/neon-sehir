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

// Kullanıcı revizesi: kadro/transfer listesi gibi yerlerde oyuncular
// artık mevkiye göre başlıklı gruplar hâlinde gösteriliyor (ör.
// "Forvetler" başlığı altında forvetler, altında "Orta Saha" vb.).
export const FUTBOL_POSITION_LABELS_PLURAL = {
  FWD: 'Forvetler',
  MID: 'Orta Saha',
  DEF: 'Defans',
  GK: 'Kaleciler',
};

export function groupFutbolPlayersByPositionOrdered(players) {
  const sorted = sortFutbolPlayersByPosition(players);
  const groups = [];
  let current = null;
  for (const p of sorted) {
    if (!current || current.position !== p.position) {
      current = { position: p.position, label: FUTBOL_POSITION_LABELS_PLURAL[p.position] || p.position, players: [] };
      groups.push(current);
    }
    current.players.push(p);
  }
  return groups;
}
