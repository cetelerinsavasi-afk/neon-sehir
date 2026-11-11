// =============================================================================
// vendorData.js — v145 SEYYAR SATICILAR (sunucu + istemci ortak, küçük dosya)
// =============================================================================
// v145 — seyyar satıcılar: harita kimliği → mekân, ürün ve menü (altın). Alışveriş
// (günde 1, VENDOR_COST) ürünü ele verir, şüpheyi düşürür; menü serbest. Seyyar
// satıcı gelirlerinin tamamı devlet kasasına (Ticaret Bakanlığı · seyyar_satis).
export const VENDOR_COST = 1000;
export const VENDORS = {
  seyyar_satici_1: { venue: 'kokorecci', name: 'Kokoreçci', product: 'kokorec', menu: { kokorec: 250, ayran: 50, cay: 20, su: 20 } },
  seyyar_satici_2: { venue: 'simitci', name: 'Simitçi', product: 'simit', menu: { simit: 50, cay: 20, ayran: 50, su: 20 } },
  // v154: Dönerci → Balık Ekmekçi (kimlikler aynı kaldı: seyyar_satici_3 / donerci — oyuncu verisi bozulmasın)
  seyyar_satici_3: { venue: 'donerci', name: 'Balık Ekmekçi', product: 'balikekmek', menu: { balikekmek: 250, ayran: 50, kola: 60, su: 20 } },
  seyyar_satici_4: { venue: 'kofteci', name: 'Köfteci', product: 'kofte', menu: { kofte: 250, ayran: 50, cay: 20, su: 20 } },
  // v154 — iki yeni satıcı (haritanın sağı: Bar'ın yanı ve Stadyumun yanı)
  seyyar_satici_5: { venue: 'midyeci', name: 'Midyeci', product: 'midye', menu: { midye: 250, kola: 60, ayran: 50, su: 20 } },
  seyyar_satici_6: { venue: 'dondurmaci', name: 'Dondurmacı', product: 'dondurma', menu: { dondurma: 150, kola: 60, su: 20 } },
};
export const VENDOR_IDS = Object.keys(VENDORS);
export const vendorVenueKey = (vendorId) => VENDORS[vendorId]?.venue || null;

