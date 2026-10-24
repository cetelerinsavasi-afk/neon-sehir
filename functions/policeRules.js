// =============================================================================
// v108 — Soygun ve devlet kuralları (saf fonksiyonlar — test edilebilir).
// functions/index.js (attemptHeist / executeHeistPlan / sellContrabandAtPark)
// bu hesapları kullanır; para hareketleri devlet kasası defterine yazılır
// (functions/stateTreasury.js).
// =============================================================================
import { POLICE } from './gang/config.js';

// v123 — ŞÜPHE KİLİDİ: şüphesi 50 ve üstü olan oyuncu suç işleyemez —
// tek başına soygun / haraç (attemptHeist), ekip soygunu kurma / katılma /
// başlatma (ekipte biri 50+ ise plan başlatılamaz; v124: ekip kurmak ve
// katılmak serbest, başlatmada şüphesi 50+ olanların adı söylenir), parkta yasaklı madde
// satışı (riskli ve güvenli). Şüphe gece düştükçe kilit kendiliğinden kalkar.
export const CRIME_SUSPICION_LOCK = 50;
export const CRIME_LOCK_TEXT = 'Şüphen 50+ iken suç işleyemezsin.';
export const CRIME_LOCK_TEAM_TEXT = 'Ekipte şüphesi 50+ olan var ({names}) — şüphesi 50+ olan oyuncu suç işleyemez, soygun başlatılamaz.';
export function crimeLockedBySuspicion(suspicion) {
  return Number(suspicion || 0) >= CRIME_SUSPICION_LOCK;
}

// Polis(ler) ekip soygununu durdurdu: v109 — kurtarılan paranın %25'i polislere
// eşit bölünür, kalanı (yuvarlama artığı dahil) devlete; her polis
// (kurtarılan × 4) / polis sayısı prestij kazanır (Polis Teşkilatı prestiji).
//   ör. 2 polis 500.000 kurtardı → kişi başı 62.500 altın + 1.000.000 prestij,
//   devlete 375.000.
// v127: pay oranını Güvenlik Bakanlığı belirler (functions/belediyeRates.js soygunPay) — ratio
export function policeBustSplit(recovered, policeCount, ratio = POLICE.BUST_EARN_RATIO) {
  const total = Math.max(0, Math.floor(Number(recovered) || 0));
  const n = Math.max(0, Math.floor(Number(policeCount) || 0));
  if (!total || !n) return { perEarning: 0, prestigeEach: 0, stateShare: total };
  const r = Math.min(1, Math.max(0, Number(ratio) || 0));
  const perEarning = Math.floor((total * r) / n);
  const prestigeEach = Math.floor((total * POLICE.BUST_PRESTIGE_PER_GOLD) / n);
  return { perEarning, prestigeEach, stateShare: total - perEarning * n };
}

// Bir soygun sonucunun devlet defterine yansıması.
//   paidToCriminals: başarılı soygunda suçlulara ödenen toplam (devlet öder → gider)
//   fines: yakalanan suçlulara yazılan cezaların toplamı (devlete gelir)
//   policeShare: v123 — polis ekibi yakaladığında polislere ödenen %25 pay
//                (cezanın içinden çıkan komisyon → devlete GİDER)
// v123: eski `recoveredToState` (soygun_kurtarma geliri) KALDIRILDI. Polis ekibi
// yakaladığında devlet suçlulara hiç ödeme yapmamıştır; "kurtarılan para" diye
// ayrı bir nakit yoktur — tek gelir sivillerin cezasıdır. Eskiden ceza + %75
// kurtarma ikisi birden gelir yazılıyordu (çift sayım).
export function heistStateEntries({ paidToCriminals = 0, fines = 0, policeShare = 0, contraband = false } = {}) {
  const out = [];
  if (paidToCriminals > 0) out.push({ kind: 'out', cat: 'soygun_odeme', amount: Math.floor(paidToCriminals) });
  if (fines > 0) out.push({ kind: 'in', cat: contraband ? 'kacak_ceza' : 'soygun_ceza', amount: Math.floor(fines) });
  if (policeShare > 0) out.push({ kind: 'out', cat: 'soygun_polis_payi', amount: Math.floor(policeShare) });
  return out;
}
