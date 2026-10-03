// ---------------------------------------------------------------
// BÖLGE LİSTESİ — koordinatlar yüzde (%) cinsinden: left, top, width, height
// YENİ GENİŞLETİLMİŞ HARİTA (kare, 1000x1000): yüzdeler artık haritanın
// tamamına (sağa doğru genişlemiş hâline) göre. Değerler, tasarım
// prototipindeki (Şehir_Haritası.html) tıklama alanlarından dönüştürüldü:
// prototipte merkez (x,y) + genişlik/yükseklik verilmişti; burada
// left = x - w/2, top = y - h/2 olarak sol-üst köşeye çevrildi.
//
// screen: 'yakinda' → henüz yapılmamış mekan, tıklanınca "Çok yakında" yazar.
// screen: 'futbol'  → Stadyum, tıklanınca doğrudan Futbol paneli açılır.
// ---------------------------------------------------------------

// Her bölgeye bir `emoji` eklendi (yeni istek: "Soygun'daki tüm mekanları
// emojilerle görsel olarak daha iyi hale getireceğiz — her mekanın bi
// emojisi olsun"). TEK bir kaynaktan geldiği için Soygun/Şüphe/Ziyaret
// sekmelerinin hepsi (bkz. MekanlarScreen/*) AYNI emojiyi kullanıyor —
// aralarında sürüklenme (drift) olmasın diye.
export const regions = [
  { id: 'camii', name: 'Camii', screen: 'ibadet', emoji: '🕌', left: 3.5, top: 16, width: 15, height: 18 },
  { id: 'karakol', name: 'Karakol', screen: 'rüşvet', emoji: '🚔', left: 17, top: 16, width: 12, height: 10 },
  { id: 'banka', name: 'Banka', screen: 'banka', emoji: '🏦', left: 35.7, top: 10, width: 12, height: 20 },
  { id: 'spor_salonu', name: 'Spor Salonu', screen: 'yakinda', emoji: '🏋️', left: 54.5, top: 15, width: 21, height: 16 },
  { id: 'belediye', name: 'Belediye Binası', screen: 'yakinda', emoji: '🏛️', left: 74.5, top: 21.5, width: 21, height: 19 },
  { id: 'silah_magazasi', name: 'Silah Mağazası', screen: 'silah-magazasi', emoji: '🔫', left: 0.5, top: 29, width: 10, height: 10 },
  { id: 'araba_galerisi', name: 'Araba Galerisi', screen: 'araba-galerisi', emoji: '🚗', left: 28.5, top: 24.5, width: 13, height: 11 },
  { id: 'fabrika', name: 'Fabrika', screen: 'fabrika', emoji: '🏭', left: 43, top: 27, width: 14, height: 14 },
  { id: 'internet_kafe', name: 'İnternet Kafe', screen: 'yakinda', emoji: '🖥️', left: 57.5, top: 37.5, width: 16, height: 15 },
  { id: 'modifiye_garaji', name: 'Modifiye Garajı', screen: 'modifiye-garaji', emoji: '🔧', left: 13.5, top: 32.5, width: 13, height: 10 },
  { id: 'casino', name: 'Casino', screen: 'casino', emoji: '🎰', left: 0.5, top: 39.5, width: 16, height: 13 },
  { id: 'park', name: 'Park', screen: 'park', emoji: '🌳', left: 31.5, top: 43.5, width: 14, height: 16 },
  { id: 'bar', name: 'Bar', screen: 'yakinda', emoji: '🍸', left: 70.5, top: 46, width: 15, height: 13 },
  { id: 'cafe', name: 'Cafe', screen: 'yakinda', emoji: '☕', left: 84, top: 57, width: 13, height: 12 },
  { id: 'yaris_pisti', name: 'Yarış Pisti', screen: 'yaris-pisti', emoji: '🏁', left: 15.5, top: 53, width: 20, height: 16 },
  { id: 'stadyum', name: 'Stadyum', screen: 'futbol', emoji: '🏟️', left: 50.5, top: 60, width: 30, height: 24 },
  { id: 'ev', name: 'Ev', screen: 'ev', emoji: '🏠', left: 37.5, top: 69, width: 12, height: 11 },
  { id: 'liman_depo', name: 'Liman', screen: 'liman-depo', emoji: '🚢', left: 8, top: 67, width: 22, height: 18 },
  { id: 'seyyar_satici_3', name: 'Dönerci', screen: 'seyyar-satici', emoji: '🥙', left: 37.65, top: 38.15, width: 5.7, height: 5.7 },
  { id: 'seyyar_satici_1', name: 'Kokoreçci', screen: 'seyyar-satici', emoji: '🌯', left: 15.15, top: 44.65, width: 5.7, height: 5.7 },
  { id: 'seyyar_satici_2', name: 'Simitçi', screen: 'seyyar-satici', emoji: '🥯', left: 3.15, top: 53.15, width: 5.7, height: 5.7 },
  { id: 'seyyar_satici_4', name: 'Köfteci', screen: 'seyyar-satici', emoji: '🍖', left: 31.65, top: 77.15, width: 5.7, height: 5.7 },
];

// Bölge id -> görünen ad (tekil liste, modal başlıkları ve menüler için)
export const regionLabels = regions.reduce((acc, r) => {
  if (!acc[r.id]) acc[r.id] = r.name;
  return acc;
}, {});

// Bölge id -> emoji (tekil liste — bkz. yukarıdaki not).
export const regionEmojis = regions.reduce((acc, r) => {
  if (!acc[r.id]) acc[r.id] = r.emoji;
  return acc;
}, {});
