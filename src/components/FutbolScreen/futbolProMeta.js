// v77 Faz 5 — gerçek futbolcu ekranlarının ortak parçaları
import { PRO_SALARY, PRO_MIN_POWER } from '../../../functions/futbolPro.js';

export { PRO_SALARY, PRO_MIN_POWER };
export const POS_META = {
  GK: { icon: '🧤', name: 'Kaleci' },
  DEF: { icon: '🛡️', name: 'Defans' },
  MID: { icon: '🎯', name: 'Orta Saha' },
  FWD: { icon: '⚽', name: 'Forvet' },
};
export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
export const pw = (n) => (Math.round(Number(n || 0) * 10) / 10).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export function hoursLeft(ms) {
  const h = Math.max(0, (Number(ms) - Date.now()) / 3600000);
  return h >= 1 ? `${Math.floor(h)} sa` : `${Math.max(1, Math.round(h * 60))} dk`;
}

const ERR = {
  'not-footballer': 'Önce Futbolcu ekranından mevkini seç, sonra salonda antrenman yap.',
  'in-team': 'Takımdayken ilana çıkılamaz.',
  'same-team': 'Bu futbolcu zaten bu takımda.',
  'position-required': 'Önce mevki seç.',
  'not-pro': `${PRO_MIN_POWER} güç gerekli.`,
  'rejoin-wait': "Bu takıma 19:00'dan sonra dönebilirsin.",
  'salary-band': `Maaş ${fmt(PRO_SALARY.min)}–${fmt(PRO_SALARY.max)} arası olmalı.`,
  'offer-closed': 'Teklif artık geçerli değil.',
  'offer-gone': 'Teklif bulunamadı.',
  'team-bot': 'Takımın şu an yöneticisi yok.',
  'not-listed': 'Futbolcu artık ilanda değil.',
  'raise-low': 'Yeni maaş mevcut maaştan yüksek olmalı.',
  'no-request': 'Bekleyen zam isteği yok.',
  'no-contract': 'Sözleşme bulunamadı.',
  'locked-hour': '18:00–19:00 maç saatinde fesih yok.',
};
export function proErrText(err) {
  const m = String(err?.message || err || '');
  if (m.startsWith('price-changed:')) return `Maaş değişti: ${fmt(m.split(':')[1])}`;
  return ERR[m] || m || 'İşlem yapılamadı.';
}
