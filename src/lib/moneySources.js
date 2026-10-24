// v92 — Profil › Günlük Rapor: altın hareketlerinin kaynak adları
// (sunucu: functions/moneyLog.js · goldTag('kaynak'))
export const MONEY_SOURCES = {
  menu: { icon: '☕', label: 'Kafe / bar menüsü' },
  garson: { icon: '🧑‍🍳', label: 'Garson maaşı' },
  isletme: { icon: '🏪', label: 'İşletme geliri' },
  internet: { icon: '🖥️', label: 'İnternet kafe' },
  spor: { icon: '🏋️', label: 'Spor salonu' },
  atolye: { icon: '🛠️', label: 'Atölye (tamir / geliştirme)' },
  vitrin: { icon: '🪟', label: 'Vitrin satışı' },
  yayin: { icon: '🔴', label: 'Canlı yayın' },
  ev: { icon: '🏠', label: 'Ev satın alma' },
  mobilya: { icon: '🛋️', label: 'Mobilya / ev eşyası' },
  aksesuar: { icon: '🐾', label: 'Aksesuar & evcil hayvan' },
  referans: { icon: '🎁', label: 'Davet ödülü' },
  fabrika: { icon: '🏭', label: 'Fabrika' },
  fabrikaHisse: { icon: '📈', label: 'Fabrika hissesi' },
  piyango: { icon: '🎟️', label: 'Piyango' },
  sampiyona: { icon: '🏆', label: 'Şampiyona ödülü' },
  arac: { icon: '🚗', label: 'Araç alımı' },
  silah: { icon: '🔫', label: 'Silah alımı' },
  amazor: { icon: '📦', label: 'Amazor alışverişi' },
  malzeme: { icon: '🔩', label: 'Malzeme satışı' },
  banka: { icon: '🏦', label: 'Banka (yatır / çek)' }, // v92.3 öncesi kayıtlar
  yatirim: { icon: '💹', label: 'Yatırım' }, // v92.3 öncesi kayıtlar
  yatirimKz: { icon: '💹', label: 'Yatırım kâr / zarar' },
  komisyon: { icon: '🧾', label: 'Yatırım satış komisyonu' },
  faiz: { icon: '🏦', label: 'Banka faizi' },
  kredi: { icon: '💳', label: 'Kredi' },
  devletBorcu: { icon: '🏛️', label: 'Devlet borcu ödemesi' },
  slot: { icon: '🎰', label: 'Slot makinesi' },
  rulet: { icon: '🎡', label: 'Rulet' }, // v124
  imam: { icon: '🕌', label: 'İmam maaşı' },
  polis: { icon: '👮', label: 'Polis maaşı' },
  belediyeMaas: { icon: '🏛️', label: 'Belediye maaşı' }, // v127
  belediyeBagis: { icon: '🎁', label: 'Belediyeye bağış' }, // v127
  mobilyaKasa: { icon: '🏦', label: 'Mobilya kasası' }, // v127
  dilenci: { icon: '🤲', label: 'Dilenci bağışı' },
  rusvet: { icon: '🤝', label: 'Rüşvet' },
  seyyar: { icon: '🌭', label: 'Seyyar satıcı' },
  kacak: { icon: '💊', label: 'Kaçak satışı' },
  mekan: { icon: '🍹', label: 'Mekân alışverişi' },
  liman: { icon: '⚓', label: 'Liman siparişi / iadesi' },
  depo: { icon: '📦', label: 'Depo (yasaklı madde)' }, // v124
  gazino: { icon: '🎰', label: 'Gazino (piyango bilet kârı)' }, // v124 Faz 6
  gazinoVergi: { icon: '🏛️', label: 'Gazino kasa çekim vergisi (%10)' }, // v124 Faz 6
  soygun: { icon: '💰', label: 'Soygun' },
  yaris: { icon: '🏁', label: 'Yarış' },
  ikinciEl: { icon: '🛒', label: '2. El Pazarı' },
  onNumara: { icon: '🃏', label: 'On Numara' },
  futbol: { icon: '⚽', label: 'Futbol takımı' },
  futbolcuMaas: { icon: '👟', label: 'Futbolcu maaşı' },
  iddaa: { icon: '🎯', label: 'İddaa' },
  zumrut: { icon: '💎', label: 'Zümrüt teklifi' },
  altinMagaza: { icon: '🪙', label: 'Altın mağazası' },
  cete: { icon: '🦂', label: 'Çete' },
  // v93 home ofisler / müzik
  mescit: { icon: '🕌', label: 'Mescit bağışı' },
  sinema: { icon: '🍿', label: 'Sinema büfesi' },
  studyo: { icon: '🎛️', label: 'Müzik stüdyosu' },
  sanatci: { icon: '🎵', label: 'Şarkı desteği (gelen)' },
  sanatciDestek: { icon: '💛', label: 'Şarkı desteği (verilen)' },
  // v100 ofisler
  ofis: { icon: '🏢', label: 'Ofis geliri' },
  ofisAlis: { icon: '🛍️', label: 'Ofis alışverişi' },
  ofisBagis: { icon: '🤲', label: 'Bağış kutusu' },
  diger: { icon: '•', label: 'Diğer' },
};
export const moneySource = (k) => MONEY_SOURCES[k] || { icon: '•', label: k };
