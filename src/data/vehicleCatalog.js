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
  { id: 1, name: 'Klasik Tur Arabası', gearLevel: 2, baseTank: 100, price: 3000, storage: 1, turboCount: 0, image: v01 },
  { id: 2, name: 'Şehir Hatchback', gearLevel: 3, baseTank: 100, price: 10000, storage: 5, turboCount: 0, image: v02 },
  { id: 3, name: 'Pickup', gearLevel: 2, baseTank: 150, price: 25000, storage: 20, turboCount: 0, image: v03 },
  { id: 4, name: 'Klasik Spor Coupe', gearLevel: 3, baseTank: 100, price: 50000, storage: 5, turboCount: 1, image: v04 },
  { id: 5, name: 'Sedan M-Sport', gearLevel: 4, baseTank: 100, price: 100000, storage: 5, turboCount: 1, image: v05 },
  { id: 6, name: 'Klasik Muscle Car', gearLevel: 4, baseTank: 150, price: 250000, storage: 10, turboCount: 1, image: v06 },
  { id: 7, name: 'Lüks GT Coupe', gearLevel: 5, baseTank: 100, price: 400000, storage: 5, turboCount: 2, image: v07 },
  { id: 8, name: 'Track-Spec Süper Spor', gearLevel: 5, baseTank: 100, price: 600000, storage: 5, turboCount: 3, image: v08 },
  { id: 9, name: 'GT Yarış Arabası', gearLevel: 5, baseTank: 150, price: 800000, storage: 5, turboCount: 2, image: v09 },
  { id: 10, name: 'Üstün Cabrio', gearLevel: 5, baseTank: 150, price: 1000000, storage: 5, turboCount: 3, image: v10 },
  // v151 — ticari araçlar (meslek) ve motorlar: görseli 3D modelden (CarImg); tamir/geliştirme yok
  { id: 11, kind: 'ticari', job: 'tir', name: 'Tır', gearLevel: 1, baseTank: 400, price: 500000, storage: 200, turboCount: 0, seats: 2, desc: 'Limandan yükle, depoya teslim et' },
  { id: 12, kind: 'ticari', job: 'otobus', name: 'Otobüs', gearLevel: 1, baseTank: 300, price: 200000, storage: 30, turboCount: 0, seats: 28, desc: '10 durak, sırayla sefer' },
  { id: 13, kind: 'ticari', job: 'taksi', name: 'Taksi', gearLevel: 3, baseTank: 100, price: 100000, storage: 5, turboCount: 0, seats: 4, desc: 'Çağrı al, yolcu taşı' },
  { id: 14, kind: 'ticari', job: 'polis', name: 'Polis Aracı', gearLevel: 4, baseTank: 100, price: 400000, storage: 5, turboCount: 0, seats: 4, desc: 'İhbar, kovalamaca, devriye' },
  { id: 15, kind: 'ticari', job: 'ambulans', name: 'Ambulans', gearLevel: 2, baseTank: 120, price: 300000, storage: 10, turboCount: 0, seats: 4, desc: '112 vakaları, hastaneye yetiştir' },
  { id: 21, kind: 'motor', name: 'Scooter', gearLevel: 1, baseTank: 10, price: 15000, storage: 0, turboCount: 0, seats: 2 },
  { id: 22, kind: 'motor', name: 'Cross Motor', gearLevel: 2, baseTank: 12, price: 35000, storage: 0, turboCount: 0, seats: 1 },
  { id: 23, kind: 'motor', name: 'Chopper', gearLevel: 2, baseTank: 20, price: 60000, storage: 0, turboCount: 0, seats: 2 },
  { id: 24, kind: 'motor', name: 'Spor Motor', gearLevel: 3, baseTank: 18, price: 95000, storage: 0, turboCount: 0, seats: 2 },
];
// v151: araç türü (araba / ticari / motor) — galeri sekmeleri
export const vehicleKindOfId = (id) => vehicleCatalog.find((v) => v.id === Number(id))?.kind || 'araba';
export const isCarCatalogId = (id) => vehicleKindOfId(id) === 'araba';
