// Faz 3 — Silah Mağazası katalog verisi (Bölüm 8.3).
// Bu dosya henüz hiçbir ekrana bağlanmadı; sadece Faz 3'te
// `silah_magazasi` ekranı geliştirilirken kullanılmak üzere hazırlandı.
//
// Alanlar:
//   id      — katalog sırası (1-6)
//   power   — başlangıç güç (Seviye 1). Seviye 2/3 yükseltmeleri Bölüm 8.3'teki
//             formülle (×1.5, sonra ×2 toplam) çalışma zamanında hesaplanır.
//   price   — mağaza satış fiyatı (altın)
//   image   — mağaza/envanter görseli

import w01 from '../assets/weapons/weapon-01.png';
import w02 from '../assets/weapons/weapon-02.png';
import w03 from '../assets/weapons/weapon-03.png';
import w04 from '../assets/weapons/weapon-04.png';
import w05 from '../assets/weapons/weapon-05.png';
import w06 from '../assets/weapons/weapon-06.png';

export const weaponCatalog = [
  { id: 1, name: 'Tabanca', power: 1000, price: 100, image: w01 },
  { id: 2, name: 'Yarı Otomatik Tabanca', power: 3000, price: 5000, image: w02 },
  { id: 3, name: 'Revolver', power: 5000, price: 10000, image: w03 },
  { id: 4, name: 'Hafif Otomatik (SMG)', power: 8000, price: 30000, image: w04 },
  { id: 5, name: 'Av/Tüfek (Bolt-Action)', power: 10000, price: 50000, image: w05 },
  { id: 6, name: 'Taarruz Tüfeği', power: 20000, price: 100000, image: w06 },
];
