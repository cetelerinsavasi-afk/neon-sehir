// v77 — İşletme sunucu hata kodlarını oyuncunun anlayacağı cümlelere çevirir.
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const MAT_NAMES = { tamirMalzemesi: 'tamir malzemesi', silahUpgrade: 'silah geliştirme malzemesi', arabaGelistirme: 'araba geliştirme malzemesi' };
// v124 — kapanınca kalan fabrika/işletmelerin kullanamayacağı malzemeler
export const materialBlockText = (list) =>
  `Envanterinde ${list.map((k) => MAT_NAMES[k] || k).join(', ')} olduğu için bu işletmeyi kapatamazsın — kalan fabrika / işletmelerin bu malzemeyi kullanamıyor. Önce Envanter › Mağaza'dan anında sat (Mağaza'daki ilanlarını da iptal et).`;

const MAP = {
  gold: 'Altının yetmiyor.',
  gem: 'Zümrütün yetmiyor.',
  'already-listed': 'Bu ürün zaten ilanda.',
  'ban-today': 'Bugün vitrinden geri aldığın ürünü yarına kadar tekrar vitrine koyamazsın.',
  'remove-penalty': 'Saat 00:00 geçti — vitrinden geri alırsan ömrü 1 gün kısalır. Tekrar dene ve onayla.',
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
  'position-today': 'Mevkini bugün değiştirdin. 19:00\'dan sonra tekrar değiştirebilirsin.',
  'position-pro': '200 güce ulaştığın için mevkin artık değişmez.',
  'position-listed': 'İlandayken mevki değişmez.',
  'position-offer': 'Bekleyen teklifin varken mevki değişmez.',
  'position-team': 'Takımdayken mevki değiştirilemez.',
  'shop-short': 'Dükkânda yeterli malzeme yok.',
  'stock-mine': 'Envanterinde o kadar malzeme yok.',
  'stock-shop': 'Dükkân stoğunda o kadar malzeme yok.',
  'too-fast': 'Biraz daha devam et.',
  'vitrin-full': 'Vitrin dolu (en fazla 10 ürün).',
  'wrong-equipment': 'Bu alet sıradaki görevin değil.',
  'price-band': 'Fiyat izin verilen aralıkta değil.',
  'biz-required': 'Bu mobilya işletme için gerekli.',
  // v93 home ofisler / stüdyo
  'studio-session': 'Stüdyo süren bitti; projeyi kaydetmek için mikser konsolunda yeniden başlat.',
  // v100 ofisler
  'office-free': 'Bu ürün artık ücretsiz, tekrar dene.',
  'office-owner': 'Kendi ofisinde ürünler sana ücretsiz.',
  'office-donate-off': 'Bu bağış kutusu kapalı.',
  'mixer-private': 'Bu mikseri sadece sahibi kullanabilir.',
  // v124 Faz 6 gazino
  'biz-casino-table': 'Gazinoda açık 10 Numara masası varken gazino kapatılamaz. Masalar kapanınca tekrar dene.',
  'casino-short': 'Makinede o kadar yok.',
};

export function bizErrText(err) {
  const m = String(err?.message || err || '');
  if (MAP[m]) return MAP[m];
  if (m.startsWith('biz-close-materials:')) return materialBlockText(m.slice('biz-close-materials:'.length).split(',').filter(Boolean));
  if (m.startsWith('price-changed')) return `Fiyat az önce değişti (yeni fiyat: ${fmt(m.split(':')[1])}). Kontrol edip tekrar dene.`;
  if (m.startsWith('limit:')) return `Bir mekânda günde en fazla ${fmt(10000)} altın harcayabilirsin.`;
  if (m.startsWith('tip-limit:')) return `Bir sanatçıya günde en fazla ${fmt(10000)} altın destek verebilirsin (bugün ${fmt(m.split(':')[1])}).`;
  if (m.startsWith('tip-song-limit:')) return `Bir şarkıya en fazla ${fmt(5000)} altın destek verebilirsin (bu şarkıya ${fmt(m.split(':')[1])}).`;
  if (m.startsWith('project-max:')) return `En fazla ${fmt(m.split(':')[1])} projen olabilir. Eski bir projeni sil.`;
  if (m.startsWith('membership-open')) return 'Bitmemiş bir üyeliğin var; önce onu tamamla (ya da süresi dolsun).';
  if (m.startsWith('position-lock:')) return `Mevkini ${new Date(Number(m.split(':')[1])).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar değiştiremezsin.`;
  if (m.startsWith('office-limit:')) return `Bir mekânın ücretli ürünlerine günde en fazla ${fmt(10000)} altın harcayabilirsin (bugün ${fmt(m.split(':')[1])}).`;
  if (m.startsWith('office-paid:')) return `Bu ürün ücretli (${fmt(m.split(':')[1])} altın).`;
  if (m.startsWith('price-band:') && m.split(':').length === 3) return `Fiyat ${fmt(m.split(':')[1])}–${fmt(m.split(':')[2])} arasında olmalı.`;
  if (m.startsWith('price-band')) return MAP['price-band'];
  if (m.startsWith('job-')) return 'Bu işlem bu ürün için yapılamaz.';
  return m || 'İşlem yapılamadı.';
}
