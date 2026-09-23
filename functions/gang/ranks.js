// Rütbe hesabı (saf fonksiyonlar — test edilebilir).
// Çete: Mafya Babası sabit; kalanlar prestije göre sıralanır (eşitlikte
// çeteye daha önce katılan önde, sonra kimlik). Rütbe için en az
// 1.000.000 prestij gerekir; altındakiler Çömez.
//   ilk 2 uygun → Sağ Kol, sonraki 4 → Kıdemli, kalan uygunlar → Tetikçi
// İstihbarat: kurucusu olmadığı için Başkan da prestijle belirlenir:
//   1 Başkan, 2 Şef, 4 Uzman, kalan uygunlar Ajan, altı Muhbir.
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

export function computeIntelRanks(roster) {
  const out = {};
  let i = 0;
  for (const r of sortByPrestige(roster)) {
    const eligible = (Number(r.prestige) || 0) >= GANG.RANK_THRESHOLD;
    if (!eligible) out[r.id] = 'muhbir';
    else if (i < 1) out[r.id] = 'baskan';
    else if (i < 1 + GANG.SAG_KOL_SLOTS) out[r.id] = 'sef';
    else if (i < 1 + GANG.SAG_KOL_SLOTS + GANG.KIDEMLI_SLOTS) out[r.id] = 'uzman';
    else out[r.id] = 'ajan';
    if (eligible) i += 1;
  }
  return out;
}
