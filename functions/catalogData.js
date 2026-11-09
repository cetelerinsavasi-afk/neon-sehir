// functions/catalogData.js
// src/data/vehicleCatalog.js ve weaponCatalog.js ile senkron tutulmalı.
// İstemci sadece hangi katalog ID'sini seçtiğini gönderir; fiyat ve
// istatistikler HER ZAMAN burada, sunucu tarafında doğrulanır — istemcinin
// "bunu 1 altına aldım" gibi sahte bir istekle kandırmasını engeller.

export const VEHICLE_CATALOG = {
  1: { name: 'Klasik Tur Arabası', gearLevel: 2, baseTank: 100, price: 3000, storage: 1, turboCount: 0 },
  2: { name: 'Şehir Hatchback', gearLevel: 3, baseTank: 100, price: 10000, storage: 5, turboCount: 0 },
  3: { name: 'Pickup', gearLevel: 2, baseTank: 150, price: 25000, storage: 20, turboCount: 0 },
  4: { name: 'Klasik Spor Coupe', gearLevel: 3, baseTank: 100, price: 50000, storage: 5, turboCount: 1 },
  5: { name: 'Sedan M-Sport', gearLevel: 4, baseTank: 100, price: 100000, storage: 5, turboCount: 1 },
  6: { name: 'Klasik Muscle Car', gearLevel: 4, baseTank: 150, price: 250000, storage: 10, turboCount: 1 },
  7: { name: 'Lüks GT Coupe', gearLevel: 5, baseTank: 100, price: 400000, storage: 5, turboCount: 2 },
  8: { name: 'Track-Spec Süper Spor', gearLevel: 5, baseTank: 100, price: 600000, storage: 5, turboCount: 3 },
  9: { name: 'GT Yarış Arabası', gearLevel: 5, baseTank: 150, price: 800000, storage: 5, turboCount: 2 },
  10: { name: 'Üstün Cabrio', gearLevel: 5, baseTank: 150, price: 1000000, storage: 5, turboCount: 3 },
  // v151 — TİCARİ araçlar (meslek: İşe başla). Tamir / geliştirme YOK, modifiye VAR, 20 gün ömür.
  11: { name: 'Tır', kind: 'ticari', job: 'tir', gearLevel: 1, baseTank: 400, price: 500000, storage: 200, turboCount: 0 },
  12: { name: 'Otobüs', kind: 'ticari', job: 'otobus', gearLevel: 1, baseTank: 300, price: 200000, storage: 30, turboCount: 0 },
  13: { name: 'Taksi', kind: 'ticari', job: 'taksi', gearLevel: 3, baseTank: 100, price: 100000, storage: 5, turboCount: 0 },
  14: { name: 'Polis Aracı', kind: 'ticari', job: 'polis', gearLevel: 4, baseTank: 100, price: 400000, storage: 5, turboCount: 0 },
  15: { name: 'Ambulans', kind: 'ticari', job: 'ambulans', gearLevel: 2, baseTank: 120, price: 300000, storage: 10, turboCount: 0 },
  // v151 — MOTORLAR (mobilyadaki 4 motor, artık şehirde sürülür). Tamir / geliştirme YOK, modifiye VAR.
  21: { name: 'Scooter', kind: 'motor', gearLevel: 1, baseTank: 10, price: 15000, storage: 0, turboCount: 0 },
  22: { name: 'Cross Motor', kind: 'motor', gearLevel: 2, baseTank: 12, price: 35000, storage: 0, turboCount: 0 },
  23: { name: 'Chopper', kind: 'motor', gearLevel: 2, baseTank: 20, price: 60000, storage: 0, turboCount: 0 },
  24: { name: 'Spor Motor', kind: 'motor', gearLevel: 3, baseTank: 18, price: 95000, storage: 0, turboCount: 0 },
};

// Fiyatlar (kullanıcı revizesi) — tamir/geliştirme malzemesi miktarı
// (fiyat/100) ve 2. el satış değeri bu fiyata bağlı formüllerle otomatik
// hesaplandığı için (bkz. repairRequiredQty, upgradeWeapon,
// instantSellListing/createListing'deki `base = WEAPON_CATALOG[...].price`)
// sadece burayı güncellemek yeterli. Güce (power) dokunulmadı.
export const WEAPON_CATALOG = {
  1: { name: 'Tabanca', power: 1000, price: 1000 },
  2: { name: 'Yarı Otomatik Tabanca', power: 3000, price: 10000 },
  3: { name: 'Revolver', power: 5000, price: 20000 },
  4: { name: 'Hafif Otomatik (SMG)', power: 8000, price: 30000 },
  5: { name: 'Av/Tüfek (Bolt-Action)', power: 10000, price: 50000 },
  6: { name: 'Taarruz Tüfeği', power: 20000, price: 100000 },
};
