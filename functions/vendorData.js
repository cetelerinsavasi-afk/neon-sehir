// =============================================================================
// vendorData.js — v145 SEYYAR SATICILAR (sunucu + istemci ortak, küçük dosya)
// =============================================================================
// v145 — seyyar satıcılar: harita kimliği → mekân, ürün ve menü (altın). Alışveriş
// (günde 1, VENDOR_COST) ürünü ele verir, şüpheyi düşürür; menü serbest. Seyyar
// satıcı gelirlerinin tamamı devlet kasasına (Ticaret Bakanlığı · seyyar_satis).
// v221: festival alanındaki satıcılar (pist girişi) sadece menü (bağış / haraç yok) — istemci menuOnly.
// v221: seyyar geliri vergisiz: yarısı masraf, yarısı hissedarlara (borsa.vendorIncomeSplit).
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
// v221 — YOL KENARI / KERVANKENT SATICILARI (karpuzcu, mısırcı, bal tezgâhı, çaycılar, köy fırını, lokanta):
// sadece alışveriş (bağış / haraç yok). Ürün ele gelir (karpuz → dilim karpuz). Gelirin yarısı masraf,
// yarısı Seyyar Satıcılar hissedarlarına (vergi yok) — buyFromVendor ile aynı yol.
export const ROAD_VENDOR_ID = 'yol_satici';
VENDORS[ROAD_VENDOR_ID] = { venue: null, road: true, name: 'Yol Kenarı Satıcıları', product: null, menu: { karpuz: 60, kozmisir: 40, bal: 250, peynir: 180, cay: 10, gozleme: 60, ekmek: 15, corba: 120 } };
// yol üstü noktalarının eylem kimliği → menü ürünü
export const ROAD_ACT_ITEM = { karpuz: 'karpuz', misir: 'kozmisir', bal: 'bal', peynir: 'peynir', cay: 'cay', gozleme: 'gozleme', ekmek: 'ekmek', yemek: 'corba' };
export const VENDOR_IDS = Object.keys(VENDORS);
export const vendorVenueKey = (vendorId) => VENDORS[vendorId]?.venue || null;

