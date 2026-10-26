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
// v130: belediye kadrosu (başkan, yardımcılar, bakanlar) soygun / haraç yapamaz, ekip kuramaz / katılamaz
export const BELEDIYE_CRIME_TEXT = 'Belediye görevlileri soygun yapamaz, haraç kesemez ve soygun ekibine katılamaz.';
export const BELEDIYE_CRIME_TEAM_TEXT = 'Ekipte belediye görevlisi var ({names}) — belediye görevlileri soygun yapamaz, soygun başlatılamaz.';
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

// v132 — Teşkilat Bakanlığı raporu: soygun analiz sayaçları (stateLedger.stat).
// Haraç (seyyar satıcı) ayrı tutulur. Hedef: banka, casino, araba_galerisi,
// modifiye_garaji, fabrika… (seyyar satıcılar tek kalem: seyyar).
//   outcome: 'success' | 'caught' (şüpheden yakalandı) | 'stopped' (polis durdurdu)
//   paid: suçlulara ödenen · fine: yazılan cezalar · recovered: polisin kurtardığı · policeShare: polise giden pay
export const HEIST_STAT_TARGETS = ['banka', 'casino', 'araba_galerisi', 'modifiye_garaji', 'fabrika', 'seyyar'];
export function heistTargetKey(target) {
  const t = String(target || '');
  if (t.startsWith('seyyar_satici')) return 'seyyar';
  return HEIST_STAT_TARGETS.includes(t) ? t : 'diger';
}
export function heistStat(target, { outcome, team = false, paid = 0, fine = 0, recovered = 0, policeShare = 0 } = {}) {
  const t = heistTargetKey(target);
  const p = t === 'seyyar' ? 'har' : 'soy';
  const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const st = { [`${p}_n`]: 1, [`sh_${t}_n`]: 1 };
  if (team) st.soy_ekip_n = 1;
  if (outcome === 'success') {
    st[`${p}_bas_n`] = 1;
    st[`${p}_bas_tutar`] = n(paid);
    st[`sh_${t}_bas`] = 1;
    st[`sh_${t}_odeme`] = n(paid);
  } else if (outcome === 'caught') {
    st[`${p}_yak_n`] = 1;
    st[`${p}_yak_ceza`] = n(fine);
    st[`sh_${t}_yak`] = 1;
  } else if (outcome === 'stopped') {
    st.soy_dur_n = 1;
    st.soy_dur_tutar = n(recovered);
    st.soy_dur_ceza = n(fine);
    st.soy_pol_pay = n(policeShare);
    st[`sh_${t}_dur`] = 1;
  }
  return st;
}
