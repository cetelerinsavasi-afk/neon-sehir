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
  seyyar_satici_3: { venue: 'donerci', name: 'Dönerci', product: 'doner', menu: { doner: 250, ayran: 50, kola: 60, su: 20 } },
  seyyar_satici_4: { venue: 'kofteci', name: 'Köfteci', product: 'kofte', menu: { kofte: 250, ayran: 50, cay: 20, su: 20 } },
};
export const VENDOR_IDS = Object.keys(VENDORS);
export const vendorVenueKey = (vendorId) => VENDORS[vendorId]?.venue || null;

