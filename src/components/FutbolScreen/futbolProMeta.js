// v77 Faz 5 — gerçek futbolcu ekranlarının ortak parçaları
import { PRO_SALARY, PRO_MIN_POWER, proSalaryBand } from '../../../functions/futbolPro.js';

export { PRO_SALARY, PRO_MIN_POWER, proSalaryBand };
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
  'in-team': 'Takımdaki futbolcu ilana çıkamaz ve doğrudan imzalanamaz; ona ancak teklif gönderilebilir.',
  'same-team': 'Bu futbolcu zaten bu takımda.',
  'position-required': 'Önce mevki seç.',
  'not-pro': `${PRO_MIN_POWER} güç gerekli.`,
  'rejoin-wait': "Bu takıma 19:00'dan sonra dönebilirsin.",
  'salary-band': 'Maaş, futbolcunun gücüne göre izin verilen aralıkta olmalı.',
  'offer-closed': 'Teklif artık geçerli değil.',
  'offer-gone': 'Teklif bulunamadı.',
  'team-bot': 'Takımın şu an yöneticisi yok.',
  'not-listed': 'Futbolcu artık ilanda değil.',
  'raise-low': 'Yeni maaş mevcut maaştan yüksek olmalı.',
  'no-request': 'Bekleyen zam isteği yok.',
  'no-contract': 'Sözleşme bulunamadı.',
  'locked-hour': '18:00–19:00 maç saatinde bu işlem yapılamaz.',
  'transfer-pending': 'Zaten bugün 19:00\'da gerçekleşecek bir transferin var.',
  'end-pending': 'Bu sözleşme zaten bugün 19:00\'da bitecek.',
  // v89
  'offer-wait': 'Bu futbolcuya az önce teklif gönderdin; 10 dakika sonra güncelleyebilirsin.',
  'raise-wait': 'Günde 1 kez zam isteyebilirsin.',
  'team-gone': 'Takım bulunamadı.',
};
export function proErrText(err) {
  const m = String(err?.message || err || '');
  if (m.startsWith('salary-band:')) {
    const [, lo, hi] = m.split(':');
    return `Bu güçteki futbolcunun maaşı ${fmt(lo)}–${fmt(hi)} arası olabilir.`;
  }
  if (m.startsWith('price-changed:')) return `Maaş değişti: ${fmt(m.split(':')[1])}`;
  return ERR[m] || m || 'İşlem yapılamadı.';
}
