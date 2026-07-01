// Faz 3 — Araba Galerisi katalog verisi (Bölüm 8.1-8.2, Bölüm 13).
// Bu dosya henüz hiçbir ekrana bağlanmadı; sadece Faz 3'te
// `araba_galerisi` ekranı geliştirilirken kullanılmak üzere hazırlandı.
//
// Alanlar:
//   id            — katalog sırası (1-10)
//   gearLevel     — başlangıç vites seviyesi (vites geliştirme malzemesiyle +1 yükselir, bkz. Bölüm 8.1)
//   baseTank      — başlangıç depo/yakıt kapasitesi (litre)
//   price         — galeri satış fiyatı (altın)
//   storage       — depolama/bagaj kapasitesi
//   turboCount    — araçla birlikte gelen sabit turbo sayısı (Bölüm 8.7'de yarışta kullanılır)
//   image         — galeri/profil görseli

import v01 from '../assets/vehicles/vehicle-01.jpg';
import v02 from '../assets/vehicles/vehicle-02.jpg';
import v03 from '../assets/vehicles/vehicle-03.jpg';
import v04 from '../assets/vehicles/vehicle-04.jpg';
import v05 from '../assets/vehicles/vehicle-05.jpg';
import v06 from '../assets/vehicles/vehicle-06.jpg';
import v07 from '../assets/vehicles/vehicle-07.jpg';
import v08 from '../assets/vehicles/vehicle-08.jpg';
import v09 from '../assets/vehicles/vehicle-09.jpg';
import v10 from '../assets/vehicles/vehicle-10.jpg';

export const vehicleCatalog = [
  { id: 1, name: 'Klasik Tur Arabası', gearLevel: 2, baseTank: 100, price: 1000, storage: 1, turboCount: 0, image: v01 },
  { id: 2, name: 'Şehir Hatchback', gearLevel: 3, baseTank: 100, price: 5000, storage: 5, turboCount: 0, image: v02 },
  { id: 3, name: 'Pickup', gearLevel: 2, baseTank: 150, price: 15000, storage: 20, turboCount: 0, image: v03 },
  { id: 4, name: 'Klasik Spor Coupe', gearLevel: 3, baseTank: 150, price: 20000, storage: 5, turboCount: 1, image: v04 },
  { id: 5, name: 'Sedan M-Sport', gearLevel: 4, baseTank: 100, price: 30000, storage: 5, turboCount: 1, image: v05 },
  { id: 6, name: 'Klasik Muscle Car', gearLevel: 4, baseTank: 150, price: 50000, storage: 10, turboCount: 2, image: v06 },
  { id: 7, name: 'Lüks GT Coupe', gearLevel: 5, baseTank: 100, price: 100000, storage: 5, turboCount: 1, image: v07 },
  { id: 8, name: 'Track-Spec Süper Spor', gearLevel: 5, baseTank: 100, price: 150000, storage: 5, turboCount: 3, image: v08 },
  { id: 9, name: 'GT Yarış Arabası', gearLevel: 5, baseTank: 150, price: 200000, storage: 5, turboCount: 3, image: v09 },
  { id: 10, name: 'Üstün Cabrio', gearLevel: 5, baseTank: 200, price: 300000, storage: 5, turboCount: 3, image: v10 },
];
