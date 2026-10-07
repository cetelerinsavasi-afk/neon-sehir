// v77 — İşletme sunucu hata kodlarını oyuncunun anlayacağı cümlelere çevirir.
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

const MAP = {
  gold: 'Altının yetmiyor.',
  gem: 'Zümrütün yetmiyor.',
  'already-listed': 'Bu ürün zaten ilanda.',
  'ban-today': 'Bugün vitrinden geri aldığın ürünü yarına kadar tekrar vitrine koyamazsın.',
  'biz-closed': 'Bu işletme kapalı.',
  'device-full': 'Bu cihaz dolu, başka bir cihaz dene.',
  'gym-equipment': 'Salonda yeterli alet yok (en az 3 farklı alet gerekli).',
  'in-team': 'Takımdaki oyuncu salonda bireysel antrenman yapamaz.',
  life0: 'Ömrü bitmiş ürün vitrine konamaz.',
  listed: 'Bu ürün ilanda; önce ilandan kaldır.',
  'membership-today': 'Bugünkü antrenmanını yaptın. Yeni gün 19:00\'da başlar.',
  mortgaged: 'İpotekli ya da bankanın el koyduğu ürün vitrine konamaz.',
  'no-membership': 'Aktif üyeliğin yok.',
  'not-in-shop': 'Bu ürün dükkânında değil.',
  'not-on-menu': 'Bu ürün menüde yok.',
  'not-owner': 'Bu ürün senin değil.',
  'not-present': 'Bunun için mekânın içinde olmalısın.',
  'own-short': 'Envanterinde yeterli malzeme yok.',
  'police-last': 'Polissin: son silahını satamaz / vitrine koyamazsın.',
  'position-required': 'Önce Futbol › Futbolcu ekranından mevkini seç.',
  'position-today': 'Mevkini bugün zaten değiştirdin. Yarın 19:00\'dan sonra tekrar değiştirebilirsin.',
  'position-pro': '200 güce ulaştığın için mevkin artık değişmez.',
  'position-team': 'Takımdayken mevki değiştirilemez.',
  'shop-short': 'Dükkânda yeterli malzeme yok.',
  'stock-mine': 'Envanterinde o kadar malzeme yok.',
  'stock-shop': 'Dükkân stoğunda o kadar malzeme yok.',
  'too-fast': 'Biraz daha devam et.',
  'vitrin-full': 'Vitrin dolu (en fazla 10 ürün).',
  'wrong-equipment': 'Bu alet sıradaki görevin değil.',
  'price-band': 'Fiyat izin verilen aralıkta değil.',
  'biz-required': 'Bu mobilya işletme için gerekli.',
};

export function bizErrText(err) {
  const m = String(err?.message || err || '');
  if (MAP[m]) return MAP[m];
  if (m.startsWith('price-changed')) return `Fiyat az önce değişti (yeni fiyat: ${fmt(m.split(':')[1])}). Kontrol edip tekrar dene.`;
  if (m.startsWith('limit:')) return `Bir mekânda günde en fazla ${fmt(10000)} altın harcayabilirsin.`;
  if (m.startsWith('membership-open')) return 'Bitmemiş bir üyeliğin var; önce onu tamamla (ya da süresi dolsun).';
  if (m.startsWith('position-lock:')) return `Mevkini ${new Date(Number(m.split(':')[1])).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar değiştiremezsin.`;
  if (m.startsWith('price-band')) return MAP['price-band'];
  if (m.startsWith('job-')) return 'Bu işlem bu ürün için yapılamaz.';
  return m || 'İşlem yapılamadı.';
}
