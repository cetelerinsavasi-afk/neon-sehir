// =============================================================================
// v108 — Soygun ve devlet kuralları (saf fonksiyonlar — test edilebilir).
// functions/index.js (attemptHeist / executeHeistPlan / sellContrabandAtPark)
// bu hesapları kullanır; para hareketleri devlet kasası defterine yazılır
// (functions/stateTreasury.js).
// =============================================================================
import { POLICE } from './gang/config.js';

// Polis(ler) ekip soygununu durdurdu: v109 — kurtarılan paranın %25'i polislere
// eşit bölünür, kalanı (yuvarlama artığı dahil) devlete; her polis
// (kurtarılan × 4) / polis sayısı prestij kazanır (Polis Teşkilatı prestiji).
//   ör. 2 polis 500.000 kurtardı → kişi başı 62.500 altın + 1.000.000 prestij,
//   devlete 375.000.
export function policeBustSplit(recovered, policeCount) {
  const total = Math.max(0, Math.floor(Number(recovered) || 0));
  const n = Math.max(0, Math.floor(Number(policeCount) || 0));
  if (!total || !n) return { perEarning: 0, prestigeEach: 0, stateShare: total };
  const perEarning = Math.floor((total * POLICE.BUST_EARN_RATIO) / n);
  const prestigeEach = Math.floor((total * POLICE.BUST_PRESTIGE_PER_GOLD) / n);
  return { perEarning, prestigeEach, stateShare: total - perEarning * n };
}

// Bir soygun sonucunun devlet defterine yansıması.
//   paidToCriminals: başarılı soygunda suçlulara ödenen toplam (devlet öder)
//   fines: yakalanan suçlulara yazılan cezaların toplamı (devlete gelir)
//   recoveredToState: polisin kurtardığı paranın devlete kalan kısmı
export function heistStateEntries({ paidToCriminals = 0, fines = 0, recoveredToState = 0, contraband = false } = {}) {
  const out = [];
  if (paidToCriminals > 0) out.push({ kind: 'out', cat: 'soygun_odeme', amount: Math.floor(paidToCriminals) });
  if (fines > 0) out.push({ kind: 'in', cat: contraband ? 'kacak_ceza' : 'soygun_ceza', amount: Math.floor(fines) });
  if (recoveredToState > 0) out.push({ kind: 'in', cat: 'soygun_kurtarma', amount: Math.floor(recoveredToState) });
  return out;
}
