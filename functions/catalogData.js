// functions/catalogData.js
// src/data/vehicleCatalog.js ve weaponCatalog.js ile senkron tutulmalı.
// İstemci sadece hangi katalog ID'sini seçtiğini gönderir; fiyat ve
// istatistikler HER ZAMAN burada, sunucu tarafında doğrulanır — istemcinin
// "bunu 1 altına aldım" gibi sahte bir istekle kandırmasını engeller.

export const VEHICLE_CATALOG = {
  1: { name: 'Klasik Tur Arabası', gearLevel: 2, baseTank: 100, price: 1000, storage: 1, turboCount: 0 },
  2: { name: 'Şehir Hatchback', gearLevel: 3, baseTank: 100, price: 5000, storage: 5, turboCount: 0 },
  3: { name: 'Pickup', gearLevel: 2, baseTank: 150, price: 15000, storage: 20, turboCount: 0 },
  4: { name: 'Klasik Spor Coupe', gearLevel: 3, baseTank: 150, price: 20000, storage: 5, turboCount: 1 },
  5: { name: 'Sedan M-Sport', gearLevel: 4, baseTank: 100, price: 30000, storage: 5, turboCount: 1 },
  6: { name: 'Klasik Muscle Car', gearLevel: 4, baseTank: 150, price: 50000, storage: 10, turboCount: 2 },
  7: { name: 'Lüks GT Coupe', gearLevel: 5, baseTank: 100, price: 100000, storage: 5, turboCount: 1 },
  8: { name: 'Track-Spec Süper Spor', gearLevel: 5, baseTank: 100, price: 150000, storage: 5, turboCount: 3 },
  9: { name: 'GT Yarış Arabası', gearLevel: 5, baseTank: 150, price: 200000, storage: 5, turboCount: 3 },
  10: { name: 'Üstün Cabrio', gearLevel: 5, baseTank: 200, price: 300000, storage: 5, turboCount: 3 },
};

export const WEAPON_CATALOG = {
  1: { name: 'Tabanca', power: 1000, price: 100 },
  2: { name: 'Yarı Otomatik Tabanca', power: 3000, price: 5000 },
  3: { name: 'Revolver', power: 5000, price: 10000 },
  4: { name: 'Hafif Otomatik (SMG)', power: 8000, price: 30000 },
  5: { name: 'Av/Tüfek (Bolt-Action)', power: 10000, price: 50000 },
  6: { name: 'Taarruz Tüfeği', power: 20000, price: 100000 },
};
