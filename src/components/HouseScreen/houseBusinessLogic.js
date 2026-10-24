import { checkBizRequirements } from '../../../functions/businessCatalogData.js';

// v77 — HouseBusiness.jsx'in bileşen dışı yardımcıları.

// Seçili eşyayı kaldırmak açık işletmeyi kapatır mı?
export function removalBreaksBiz(houseDoc, items, sel) {
  const type = houseDoc?.biz?.type;
  if (!type || !sel || sel.p !== 1) return false;
  const rest = (items || []).filter((it) => it.i !== sel.i);
  return !checkBizRequirements(type, rest).ok;
}

// Sunucu hatası → { kind:'required'|'locked', people, untilMs } | null
export function parseBizError(err) {
  const m = String(err?.message || '');
  if (m.startsWith('biz-required')) return { kind: 'required' };
  // v124: kalan fabrika/işletmelerin kullanamayacağı malzeme var
  if (m.startsWith('biz-close-materials:')) return { kind: 'materials', list: m.slice('biz-close-materials:'.length).split(',').filter(Boolean) };
  const lk = m.match(/^biz-locked:(\d+):(\d+)/);
  if (lk) return { kind: 'locked', people: Number(lk[1]), untilMs: Number(lk[2]) };
  return null;
}
