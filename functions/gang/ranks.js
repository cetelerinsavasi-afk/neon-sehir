// Rütbe hesabı (saf fonksiyonlar — test edilebilir).
// Çete: Mafya Babası sabit; kalanlar prestije göre sıralanır (eşitlikte
// çeteye daha önce katılan önde, sonra kimlik). Rütbe için en az
// 1.000.000 prestij gerekir; altındakiler Çömez.
//   ilk 2 uygun → Sağ Kol, sonraki 4 → Kıdemli, kalan uygunlar → Tetikçi
// Polis Teşkilatı (v109; eski İstihbarat): kurucusu olmadığı için en üst rütbe de
// prestijle belirlenir: 1 Emniyet Genel Müdürü (baskan), 2 Emniyet Amiri (sef),
// 4 Başkomiser (uzman), kalan uygunlar Komiser (ajan), altı Polis Memuru (muhbir).
import { GANG } from './config.js';

function sortByPrestige(list) {
  return [...list].sort(
    (a, b) =>
      (Number(b.prestige) || 0) - (Number(a.prestige) || 0) ||
      (Number(a.joinedAtMs) || 0) - (Number(b.joinedAtMs) || 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function computeGangRanks(members, babaId) {
  const out = {};
  const others = sortByPrestige(members.filter((m) => m.id !== babaId));
  if (members.some((m) => m.id === babaId)) out[babaId] = 'baba';
  let i = 0;
  for (const m of others) {
    const eligible = (Number(m.prestige) || 0) >= GANG.RANK_THRESHOLD;
    if (!eligible) out[m.id] = 'comez';
    else if (i < GANG.SAG_KOL_SLOTS) out[m.id] = 'sagkol';
    else if (i < GANG.SAG_KOL_SLOTS + GANG.KIDEMLI_SLOTS) out[m.id] = 'kidemli';
    else out[m.id] = 'tetikci';
    if (eligible) i += 1;
  }
  return out;
}

// Kurucusu olmayan teşkilat (Polis Teşkilatı — eski İstihbarat): 1 · 2 · 4 · kalan uygunlar · altı.
// names: [1., 2., 3., 4. kademe, en alt]
function computeOrgRanks(roster, [top, second, third, fourth, low]) {
  const out = {};
  let i = 0;
  for (const r of sortByPrestige(roster)) {
    const eligible = (Number(r.prestige) || 0) >= GANG.RANK_THRESHOLD;
    if (!eligible) out[r.id] = low;
    else if (i < 1) out[r.id] = top;
    else if (i < 1 + GANG.SAG_KOL_SLOTS) out[r.id] = second;
    else if (i < 1 + GANG.SAG_KOL_SLOTS + GANG.KIDEMLI_SLOTS) out[r.id] = third;
    else out[r.id] = fourth;
    if (eligible) i += 1;
  }
  return out;
}

export function computeIntelRanks(roster) {
  return computeOrgRanks(roster, ['baskan', 'sef', 'uzman', 'ajan', 'muhbir']);
}

// v108 — İstihbarat başvurularını SADECE Başkan + Şefler inceler. İkisi de
// yoksa başvuru anında otomatik onaylanır; varsa ve 12 saat içinde yanıt
// gelmezse otomatik onaylanır (bkz. intel.applyIntel / settleIntelApplications).
export const INTEL_REVIEW_RANKS = ['baskan', 'sef'];
export function intelReviewRanks() {
  return INTEL_REVIEW_RANKS;
}
export function hasIntelReviewers(ranks) {
  return (ranks || []).some((r) => INTEL_REVIEW_RANKS.includes(r));
}
