// ---------------------------------------------------------------
// BÖLGE LİSTESİ — koordinatlar yüzde (%) cinsinden: left, top, width, height
// Orijinal interaktif-harita.html dosyasından birebir taşındı.
// liman_depo iki ayrı tıklama kutusuna sahip ama aynı id'yi taşıdığı için
// ikisi de aynı ekrana yönlendirilir.
// ---------------------------------------------------------------

export const regions = [
  { id: 'camii', name: 'Camii', screen: 'ibadet', left: 6.6, top: 14.5, width: 26.0, height: 16.0 },
  { id: 'karakol', name: 'Karakol', screen: 'rüşvet', left: 34.0, top: 16.0, width: 22.0, height: 10.2 },
  { id: 'banka', name: 'Banka', screen: 'banka', left: 61.0, top: 9.4, width: 23.4, height: 21.0 },
  { id: 'araba_galerisi', name: 'Araba Galerisi', screen: 'araba-galerisi', left: 45.6, top: 27.6, width: 24.7, height: 6.5 },
  { id: 'silah_magazasi', name: 'Silah Mağazası', screen: 'silah-magazasi', left: 1.3, top: 31.2, width: 15.0, height: 6.5 },
  { id: 'modifiye_garaji', name: 'Modifiye Garajı', screen: 'modifiye-garaji', left: 24.7, top: 34.9, width: 30.0, height: 7.3 },
  { id: 'fabrika', name: 'Fabrika', screen: 'fabrika', left: 78.1, top: 30.5, width: 21.9, height: 16.0 },
  { id: 'casino', name: 'Casino', screen: 'casino', left: 1.3, top: 40.7, width: 27.3, height: 10.2 },
  { id: 'park', name: 'Park', screen: 'park', left: 52.1, top: 43.6, width: 39.1, height: 11.6 },
  { id: 'yaris_pisti', name: 'Yarış Pisti', screen: 'yaris-pisti', left: 19.5, top: 55.2, width: 71.6, height: 13.8 },
  { id: 'liman_depo', name: 'Liman & Depo', screen: 'liman-depo', left: 0.0, top: 66.9, width: 36.5, height: 18.9 },
  { id: 'liman_depo', name: 'Liman & Depo (sağ)', screen: 'liman-depo', left: 30.0, top: 75.0, width: 18.0, height: 14.0 },
  { id: 'ev', name: 'Ev', screen: 'ev', left: 65.1, top: 71.2, width: 26.0, height: 10.2 },
  { id: 'seyyar_satici_1', name: 'Kokoreçci', screen: 'seyyar-satici', left: 26.0, top: 44.0, width: 15.6, height: 7.4 },
  { id: 'seyyar_satici_2', name: 'Simitçi', screen: 'seyyar-satici', left: 1.3, top: 51.5, width: 15.6, height: 7.4 },
  { id: 'seyyar_satici_3', name: 'Dönerci', screen: 'seyyar-satici', left: 65.1, top: 37.8, width: 15.6, height: 5.5 },
  { id: 'seyyar_satici_4', name: 'Köfteci', screen: 'seyyar-satici', left: 54.7, top: 77.0, width: 15.6, height: 8.5 },
];

// Bölge id -> görünen ad (tekil liste, modal başlıkları ve menüler için)
export const regionLabels = regions.reduce((acc, r) => {
  if (!acc[r.id]) acc[r.id] = r.name;
  return acc;
}, {});
