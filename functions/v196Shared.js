// =============================================================================
// v196Shared.js — v196 BÜYÜK GÜNCELLEME: sunucu + istemci ortak saf sabitler
// -----------------------------------------------------------------------------
// • Kapanış modu metni ve kapatılan işlemler (functions/v196Closing.js)
// • Oyunun mekânları ve hisseleri (Neon Borsa "mekân" hisseleri)
// • Faz 5 katalog: kaldırılan / taşınan eşyalar, kaldırılan kapı türleri
// Bu dosya hiçbir şey okumaz/yazmaz.
// =============================================================================

export const V196_FLAG_DOC = 'migrations/v196';
export const CLOSING_TEXT =
  '🔄 Büyük güncelleme hazırlığı: evler, ofisler ve işletmeler kapanıyor. Bu işlem şu an yapılamaz. Elindekilerin hepsi geçişte iade edilecek.';

// Kapanış modunda reddedilen işlemler (op adları). houseAction / shopAction / streamAction
// yönlendiricileri ve tekil fonksiyonlar (buyFactoryMachine, buyInvestment[stock], createListing[material]).
export const CLOSING_HOUSE_OPS = ['buy', 'bizOpen', 'bizIntent', 'furnBuy', 'furnList'];
export const CLOSING_SHOP_OPS = [
  'stockAdd', 'vitrinAdd', 'prices', 'stockPrices', // dükkân stoğu / fiyat
  'menuPrices', 'netPrice', 'gymPrice', 'casinoPrice', 'depoPrice', // işletme fiyatı
  'officeSet', // ofis açma / ofis fiyatları
];
export const CLOSING_STREAM_OPS = ['price'];

// ---- Oyunun mekânları (v196: haritadaki bütün mekânlar oyuna ait) ---------------------
// Gelir paylaşımı (casino ve depo hariç): brüt → %50 masraf (oyundan çıkar) + belediye vergisi
// (brüt üzerinden, mekânın oranı) + kalan → mekân hissedarları (Neon Borsa).
export const VENUE_SHARE_TYPES = ['silahci', 'galeri', 'motogaleri', 'modifiye', 'spor', 'cafe', 'bar', 'internet'];
export const VENUE_EXPENSE_FRAC = 0.5;
// Belediye vergi kalemi (belediyeRates.js 'isletme' grubu)
export const VENUE_TAX_ITEM = {
  silahci: 'isSilahci',
  galeri: 'isGaleri',
  motogaleri: 'isMotoGaleri',
  modifiye: 'isModifiye',
  spor: 'isSpor',
  cafe: 'isKafe',
  bar: 'isBar',
  internet: 'isInternet',
};
// Neon Borsa şirket kimlikleri (BORSA_COS'a eklenir)
export const VENUE_CO_ID = {
  silahci: 'mk_silahci',
  galeri: 'mk_galeri',
  motogaleri: 'mk_motogaleri',
  modifiye: 'mk_modifiye',
  spor: 'mk_spor',
  cafe: 'mk_cafe',
  bar: 'mk_bar',
  internet: 'mk_internet',
};
export const VENUE_CO_NAME = {
  silahci: 'Silahçı',
  galeri: 'Araba Galerisi',
  motogaleri: 'Motor Galerisi',
  modifiye: 'Modifiyeci',
  spor: 'Spor Salonu',
  cafe: 'Cafe',
  bar: 'Bar',
  internet: 'İnternet Kafe',
};
// Neon Borsa gelir sayacı kodu (stateLedger stat hs_<sk>)
export const VENUE_CO_SK = { silahci: 'ms', galeri: 'mg', motogaleri: 'mo', modifiye: 'mm', spor: 'mp', cafe: 'mc', bar: 'mb', internet: 'mi' };
// Saf: mekânın brüt gelirinin paylaşımı. taxFrac: belediyenin o mekân için oranı (0..0,5)
export function venueIncomeSplit(amount, taxFrac) {
  const gross = Math.max(0, Math.round(Number(amount) || 0));
  const expense = Math.round(gross * VENUE_EXPENSE_FRAC);
  const tax = Math.min(gross - expense, Math.round(gross * Math.max(0, Math.min(0.5, Number(taxFrac) || 0))));
  return { gross, expense, tax, share: gross - expense - tax };
}
export const GIFT_SHARES_PER_TYPE = 10; // Faz 6.11: sahip olunan her tür için 10 hisse

// ---- Sabit fiyatlar (Faz 2.3) -------------------------------------------------------------
// Silahçı / modifiyeci: tamir = ürünün mağaza fiyatının %10'u, geliştirme = mağaza fiyatının tamamı
// (kullanıcı kararı: 100.000'lik silahın 1 tamiri 10.000, 1 geliştirmesi 100.000; araçlar aynı oran).
// Malzeme fiyatı (eski AMAZOR): gereken adet × bu fiyat = %10 / %100 kuralı (itemRules adet formülleriyle)
export const WORKSHOP_MATERIAL_PRICE = Object.freeze({ tamirMalzemesi: 10, silahUpgrade: 100, arabaGelistirme: 500 });
export const v196WorkshopPrice = (job) => Math.max(0, Math.floor(Number(job?.qty) || 0)) * (WORKSHOP_MATERIAL_PRICE[job?.material] || 0);
export const V196_GONE_TEXT = '🏙️ Oyuncu işletmeleri kapandı. Bütün mekânlar artık oyunun — mekâna gir, panelden işini yap.';
export const REPAIR_PRICE_FRAC = 0.1;
export const UPGRADE_PRICE_FRAC = 1;
export const GYM_DAY_PRICE = 1000;
export const NET_MINUTE_PRICE = { play: 100, stream: 200 };
export const SLOT_SPIN_PRICE = 1400;
export const LOTTERY_TICKET_PRICE = 100;
export const DEPO_CONTRABAND_BUY_PRICE = 2000; // oyuncu depodan alır
export const MENU_PRICES = Object.freeze({
  cay: 50, su: 50, kola: 100, ayran: 100, meyveSuyu: 100, kahve: 100, espresso: 150, latte: 150, enerji: 150,
  simit: 100, kurabiye: 150, tost: 150, pasta: 200, sosisli: 200, pizza: 300, kebap: 300, kokteyl: 300, viski: 500,
});

// ---- Çete ticareti (Faz 2.4) ------------------------------------------------------------
export const GANG_CONTRABAND_ORDER_PRICE = 1000; // adet
export const GANG_CONTRABAND_ORDER_PER_MEMBER = 3000; // altın (üye başına 3 adet)
export const GANG_ROUTE_BUY_RATIO = 0.25; // silah / araba: mağaza fiyatının %25'i
export const GANG_AUTO_SELL_CONTRABAND = 1500;
export const GANG_AUTO_SELL_RATIO = 0.5; // silah / araba: mağaza fiyatının %50'si

// ---- Fabrika (Faz 2.5) --------------------------------------------------------------------
export const WORK_BUTTON_REWARD = 5000;
// Elmas makinesi (kullanıcı kararı, 24 Kas): fiyatı 20 elmas değerinde; kademe mining ile aynı oranda
//   fiyat = (20 + 2 × ⌊sahip olunan / 10⌋) × elmas fiyatı  (mining: (2 + 0,2 × ⌊n/10⌋) × kripto)
//   üretim = mining'in kripto üretiminin 10 katı elmas (ortalama), elektrik %30
export const DIAMOND_MACHINE_MULT = 20;
export const DIAMOND_MACHINE_TIER_STEP = 2;
export const DIAMOND_PROD_FACTOR = 10;
export function diamondMachinePriceOf(owned, diamondPrice) {
  const n = Math.max(0, Math.floor(Number(owned) || 0));
  return Math.ceil((DIAMOND_MACHINE_MULT + DIAMOND_MACHINE_TIER_STEP * Math.floor(n / 10)) * Math.max(0, Number(diamondPrice) || 0));
}
// n elmas makinesinin bugünkü toplam değeri
export function diamondFleetValueOf(count, diamondPrice) {
  let t = 0;
  for (let i = 0; i < Math.max(0, Math.floor(Number(count) || 0)); i++) t += diamondMachinePriceOf(i, diamondPrice);
  return t;
}
// Fabrika kurulumu: 100.000 + 2 mining + 2 elmas makinesi (+ makine vergileri)
export const FACTORY_STARTER_V196 = Object.freeze({ mining: 2, elmas: 2 });
export const NEW_PLAYER_GOLD = 5000;
export const REFERRAL_NEW_PLAYER_BONUS_V196 = 5000;

// ---- Faz 5: katalog -----------------------------------------------------------------------
// Kategoriler tamamen kalkar (içlerinden TAŞINANLAR hariç)
export const REMOVED_CATEGORIES = ['zemin_parca', 'duvar_parca', 'tavan', 'dis', 'ciftlik', 'banka', 'motor', 'araba', 'hapis', 'liman', 'garaj', 'eglence', 'dukkan'];
// Kategorisi kalan ama kendisi kalkan eşyalar
export const REMOVED_ITEMS = [
  // pencereler + neon tabelalar (duvar süsleri)
  'window', 'win_yol', 'win_sehir', 'win_deniz', 'win_orman', 'win_dag', 'win_kuzey', 'win_bogaz', 'win_uzay', 'win_kafe',
  'neon1', 'neon2', 'neon3', 'neon4', 'neon_acik', 'neon_kokorec', 'neon_doner', 'neon_simit', 'neon_kofte', 'neon_balik', 'neon_midye', 'neon_dondurma',
  // tek tek
  'bagiskutusu', 'camiavize', 'newsdesk',
  // spor / dövüş / lüks
  'windsock', 'padlight', 'helicopter', 'helipad', 'atm', 'bleacher', 'gong', 'cornerstool', 'ring',
  // kapılar
  'door_doner', 'door_hastane', 'door_market', 'door_metal', 'door_cam',
];
// Kalkan kategorilerden başka kategoriye TAŞINANLAR (kalır)
export const MOVED_ITEMS = Object.freeze({
  bayrak: 'karargah', bunk: 'karargah', bars: 'karargah', crates: 'karargah', bosstable: 'karargah', barrel: 'karargah',
  tires: 'karargah', aranan: 'karargah', interrog: 'karargah', celldoor: 'karargah', guarddesk: 'karargah', wire: 'karargah',
  watercooler: 'mutfak', caysemaver: 'mutfak', cafecounter: 'mutfak', drinkfridge: 'mutfak',
  mirrorfull: 'yatak', filecab: 'yatak', clothesrack: 'yatak', mannequin: 'yatak',
  discoball: 'luks',
});
export const RENAMED_CATEGORIES = Object.freeze({ cami: 'İbadet' });
// Kalkan kapı türleri (houseDoor.js DOOR_TYPES) → yerine varsayılan kapı
export const REMOVED_DOOR_TYPES = ['doner', 'hastane', 'market', 'metal', 'cam'];
export const DEFAULT_DOOR_TYPE = 'ahsap';

// k: eşya kimliği, cat: bugünkü kategorisi (istemci kataloğundan) → v196'da satılık mı
export function isRemovedItem(k, cat) {
  if (REMOVED_ITEMS.includes(k)) return true;
  if (Object.prototype.hasOwnProperty.call(MOVED_ITEMS, k)) return false;
  return Boolean(cat && REMOVED_CATEGORIES.includes(cat));
}
// Üretildi (istemci kataloğu v195): kaldırılan BÜTÜN eşya kimlikleri — sunucu kategoriyi bilmez, bu listeye bakar
export const REMOVED_ITEM_KEYS = Object.freeze(new Set(['airpump', 'atm', 'bagiskutusu', 'balikekmekarabasi', 'baskanmasa', 'belediyeamblem', 'beltcheckout', 'bleacher', 'bollard', 'bufe', 'bulb', 'cakecase', 'camiavize', 'campfire', 'canopy', 'canteen', 'car_classic', 'car_muscle', 'car_pickup', 'car_sedan', 'car_sport', 'car_super', 'car_suv', 'carlift', 'carplatform', 'cart', 'carwash', 'checkout', 'cone', 'container', 'copkutusu', 'cornerstool', 'crane', 'crate', 'diveboard', 'dondurmaarabasi', 'donerarabasi', 'door_cam', 'door_doner', 'door_hastane', 'door_market', 'door_metal', 'dp_akustik', 'dp_beton_blok', 'dp_col', 'dp_daglar', 'dp_deniz', 'dp_gece', 'dp_gokyuzu', 'dp_grafiti', 'dp_gunbatimi', 'dp_kogus', 'dp_kumsal', 'dp_neon_sehir', 'dp_orman', 'dp_sabika', 'dp_tarla_ufku', 'dp_uzanan_yol', 'dp_uzay', 'dp_yesil_perde', 'fence', 'fiskiye', 'flamingo', 'forklift', 'fruitstand', 'glasscounter', 'gong', 'guvercin', 'hay', 'helicopter', 'helipad', 'icecream', 'kartmasa', 'kaydirak', 'koftearabasi', 'kokorecarabasi', 'korkuluk', 'lifeguard', 'lounger', 'mangal', 'meclispano', 'menuboard', 'midyetezgahi', 'moto_chopper', 'moto_cross', 'moto_scooter', 'moto_sport', 'neon1', 'neon2', 'neon3', 'neon4', 'neon_acik', 'neon_balik', 'neon_dondurma', 'neon_doner', 'neon_kofte', 'neon_kokorec', 'neon_midye', 'neon_simit', 'newsdesk', 'numarator', 'padlight', 'pallets', 'parkbench', 'piyangogise', 'planter', 'polismasa', 'poolout', 'portlight', 'pricesign', 'pump', 'ring', 'rulet', 'salincak', 'scarecrow', 'searchlight', 'sehirmaketi', 'shelf', 'showroom', 'simit', 'simittezgahi', 'siraekran', 'slotm', 'stagemic', 'stanchion', 'streetlamp', 'tent', 'toolchest', 'toolwall', 'tractor', 'tree', 'truck', 'turf', 'tv_bulutlu', 'tv_gece', 'tv_gunbatimi', 'tv_gunesli', 'tv_kuzey', 'tv_yildizli', 'umbrella', 'vaultdoor', 'vegbed', 'vezne', 'vz_deniz', 'vz_yaya', 'vz_yol', 'waitseats', 'win_bogaz', 'win_dag', 'win_deniz', 'win_kafe', 'win_kuzey', 'win_orman', 'win_sehir', 'win_uzay', 'win_yol', 'window', 'windsock', 'workbench', 'zp_asfalt', 'zp_cakil', 'zp_cim', 'zp_dans_pisti', 'zp_havuz_karo', 'zp_kaldirim', 'zp_kar', 'zp_kum', 'zp_metal_izgara', 'zp_otopark', 'zp_spor_zemin', 'zp_su', 'zp_tarla', 'zp_yol']));
export const isRemovedKey = (k) => REMOVED_ITEM_KEYS.has(k);

// ---- Oyunun cafe / bar / internet kafe belgeleri (houses/game_*) ------------------------
// Sunucunun cihaz doğrulaması bu kimliklere bakar; istemcideki 3D mekân (src/components/City/world/venues.js)
// aynı kimlikleri cihazlara verir. Konumlar (x, z) sadece yayın seti eşleşmesi için (koltuk ↔ bilgisayar).
export const GAME_VENUE_HOUSES = Object.freeze({
  cafe: { id: 'game_cafe', name: 'Neon Cafe', items: [] },
  bar: { id: 'game_bar', name: 'Neon Bar', items: [] },
  internet: {
    id: 'game_internet',
    name: 'Neon İnternet Kafe',
    items: [
      { i: 'npc1', k: 'pc', x: -7.6, z: -6.1, r: 0, c: 0, p: 1 },
      { i: 'npc5', k: 'pc', x: -7.6, z: -2.6, r: 0, c: 0, p: 1 },
      { i: 'npc2', k: 'pc', x: -5.6, z: -6.1, r: 0, c: 0, p: 1 },
      { i: 'npc6', k: 'pc', x: -5.6, z: -2.6, r: 0, c: 0, p: 1 },
      { i: 'npc3', k: 'pc', x: -3.6, z: -6.1, r: 0, c: 0, p: 1 },
      { i: 'npc7', k: 'pc', x: -3.6, z: -2.6, r: 0, c: 0, p: 1 },
      { i: 'npc4', k: 'pc', x: -1.6, z: -6.1, r: 0, c: 0, p: 1 },
      { i: 'npc8', k: 'pc', x: -1.6, z: -2.6, r: 0, c: 0, p: 1 },
      { i: 'nps1', k: 'console', x: 3.6, z: -1.6, r: 0, c: 0, p: 1 },
      { i: 'nps2', k: 'console', x: 7, z: -1.6, r: 0, c: 0, p: 1 },
      // iki yayın seti: oyuncu koltuğu + bilgisayar (dakikası 200)
      { i: 'nspc', k: 'pc', x: 3.6, z: -6.1, r: 0, c: 0, p: 1 },
      { i: 'nsch', k: 'gamer', x: 3.6, z: -5.15, r: 4, c: 0, p: 1 },
      { i: 'nspc2', k: 'pc', x: 7, z: -6.1, r: 0, c: 0, p: 1 },
      { i: 'nsch2', k: 'gamer', x: 7, z: -5.15, r: 4, c: 0, p: 1 },
    ],
  },
});

// Üretildi (istemci kataloğu v195): duvar / tavan eşyaları ve bütün katalog anahtarları (sunucu ev doğrulaması)
export const WALL_ITEM_KEYS = Object.freeze(new Set(['aranan', 'belediyeamblem', 'cini', 'cityframe', 'clock', 'curtain', 'dart', 'door_beyaz', 'door_cam', 'door_cift', 'door_doner', 'door_hastane', 'door_market', 'door_metal', 'door_salon', 'doordeco', 'dp_akustik', 'dp_beton_blok', 'dp_col', 'dp_daglar', 'dp_deniz', 'dp_gece', 'dp_gokyuzu', 'dp_grafiti', 'dp_gunbatimi', 'dp_kogus', 'dp_kumsal', 'dp_neon_sehir', 'dp_orman', 'dp_sabika', 'dp_tarla_ufku', 'dp_uzanan_yol', 'dp_uzay', 'dp_yesil_perde', 'extinguisher', 'fireplace', 'garagedoor', 'goldrecords', 'graffiti', 'gunrack', 'gunrackg', 'kupper', 'meclispano', 'menuboard', 'mirrorfull', 'neon1', 'neon2', 'neon3', 'neon4', 'neon_acik', 'neon_balik', 'neon_dondurma', 'neon_doner', 'neon_karargah', 'neon_kofte', 'neon_kokorec', 'neon_midye', 'neon_simit', 'opspano', 'painting', 'painting2', 'painting3', 'ps_tasma', 'showroom', 'siraekran', 'toolwall', 'triptych', 'tvwall', 'vaultdoor', 'wallshelf', 'win_bogaz', 'win_dag', 'win_deniz', 'win_kafe', 'win_kuzey', 'win_orman', 'win_sehir', 'win_uzay', 'win_yol', 'window']));
export const CEIL_ITEM_KEYS = Object.freeze(new Set(['bulb', 'camiavize', 'chandelier', 'discoball', 'fanc']));
export const CATALOG_KEYS = Object.freeze(new Set(['airpump', 'ammo', 'amp', 'aquarium', 'aranan', 'arcade', 'armchair', 'artlamp', 'artshelf', 'artstool', 'atm', 'ayakkabilik', 'babakoltuk', 'bag', 'bagiskutusu', 'balikekmekarabasi', 'bar', 'barrel', 'barreltable', 'bars', 'bartable', 'baskanmasa', 'bathtub', 'bayrak', 'beanbag', 'bed1', 'bed2', 'belediyeamblem', 'beltcheckout', 'bench', 'bike', 'bleacher', 'bollard', 'bookshelf', 'booth', 'bosstable', 'bot', 'bsink', 'bufe', 'bulb', 'bunk', 'cafecounter', 'cafetable', 'cakecase', 'camiavize', 'campfire', 'canopy', 'canteen', 'car_classic', 'car_muscle', 'car_pickup', 'car_sedan', 'car_sport', 'car_super', 'car_suv', 'carlift', 'carplatform', 'cart', 'carwash', 'caysemaver', 'celldoor', 'chairm', 'chairw', 'chandelier', 'checkout', 'chester', 'cinescreen', 'cineseat', 'cini', 'cityframe', 'clay', 'clock', 'clothesrack', 'column', 'cone', 'console', 'container', 'copkutusu', 'cornerstool', 'crane', 'crate', 'crates', 'curtain', 'cyc', 'dart', 'desk', 'discoball', 'diveboard', 'dj', 'dondurmaarabasi', 'donerarabasi', 'door_beyaz', 'door_cam', 'door_cift', 'door_doner', 'door_hastane', 'door_market', 'door_metal', 'door_salon', 'doordeco', 'dp_akustik', 'dp_beton_blok', 'dp_col', 'dp_daglar', 'dp_deniz', 'dp_gece', 'dp_gokyuzu', 'dp_grafiti', 'dp_gunbatimi', 'dp_kogus', 'dp_kumsal', 'dp_neon_sehir', 'dp_orman', 'dp_sabika', 'dp_tarla_ufku', 'dp_uzanan_yol', 'dp_uzay', 'dp_yesil_perde', 'dresser', 'drinkfridge', 'dropcloth', 'drums', 'dryer', 'dumbbells', 'easel', 'extinguisher', 'fanc', 'fence', 'filecab', 'fireplace', 'fiskiye', 'flamingo', 'foosball', 'forklift', 'fridge', 'fruitstand', 'gamer', 'garagedoor', 'glasscounter', 'glassdiv', 'goldbars', 'goldrecords', 'gong', 'graffiti', 'guarddesk', 'guitar', 'guncab', 'gunrack', 'gunrackg', 'guntable', 'guvenlikekran', 'guvercin', 'hay', 'hedef', 'helicopter', 'helipad', 'hy_aslan', 'hy_at', 'hy_baykus', 'hy_bulldog', 'hy_dalmacyali', 'hy_ejder', 'hy_golden', 'hy_hamster', 'hy_hindi', 'hy_kangal', 'hy_karakedi', 'hy_kurt', 'hy_marti', 'hy_maymun', 'hy_midilli', 'hy_mops', 'hy_ordek', 'hy_panda', 'hy_papagan', 'hy_penguen', 'hy_sokak', 'hy_tavsan', 'hy_tavuk', 'hy_tilki', 'hy_zengin', 'icecream', 'interrog', 'jacuzzi', 'jukebox', 'kartmasa', 'kaydirak', 'kcoffee', 'kcounter', 'kisland', 'koftearabasi', 'kokorecarabasi', 'korkuluk', 'ksink', 'kumtorbasi', 'kupper', 'kursu', 'lamp', 'lifeguard', 'lounger', 'mangal', 'mannequin', 'meclispano', 'menuboard', 'midyetezgahi', 'mihrap', 'minber', 'minder', 'mirrorfull', 'mixer', 'money', 'moto_chopper', 'moto_cross', 'moto_scooter', 'moto_sport', 'neon1', 'neon2', 'neon3', 'neon4', 'neon_acik', 'neon_balik', 'neon_dondurma', 'neon_doner', 'neon_karargah', 'neon_kofte', 'neon_kokorec', 'neon_midye', 'neon_simit', 'newsdesk', 'nightst', 'numarator', 'officedesk', 'onair', 'opspano', 'ottoman', 'padlight', 'paintbuckets', 'painting', 'painting2', 'painting3', 'painttable', 'pallets', 'palm', 'parasayma', 'parkbench', 'pc', 'pcstation', 'piano', 'pingpong', 'piyangogise', 'plantb', 'planter', 'plants', 'plastikmasa', 'plastiktabure', 'podium', 'polismasa', 'pool', 'poolout', 'popcorn', 'portlight', 'pricesign', 'ps_ahir', 'ps_cark', 'ps_cuval', 'ps_kafes', 'ps_kulube', 'ps_kumes', 'ps_kumkabi', 'ps_mama', 'ps_oyuncak', 'ps_saray', 'ps_su', 'ps_tasma', 'ps_tirmalama', 'ps_yatak', 'pullup', 'pump', 'rahle', 'ring', 'ringlight', 'rug', 'ruggeo', 'rugkilim', 'rugr', 'rugrunner', 'rugshag', 'rulet', 'safe', 'safeg', 'salincak', 'sancak', 'scarecrow', 'searchlight', 'seccade', 'sehirmaketi', 'shelf', 'shower', 'showroom', 'simit', 'simittezgahi', 'siraekran', 'slotm', 'sofa2', 'sofa3', 'sofaL', 'softbox', 'speaker', 'speedbag', 'stagemic', 'stanchion', 'statue', 'stool', 'stove', 'stratejimasa', 'streamcam', 'streamdesk', 'streetlamp', 'studiospk', 'synth', 'tcoffee', 'tdining', 'telsiz', 'tent', 'tires', 'toilet', 'toolchest', 'toolwall', 'toplantimasa', 'tractor', 'trash', 'treadmill', 'tree', 'triptych', 'tround', 'truck', 'tside', 'turf', 'tv_bulutlu', 'tv_gece', 'tv_gunbatimi', 'tv_gunesli', 'tv_kuzey', 'tv_yildizli', 'tvstand', 'tvwall', 'umbrella', 'vase', 'vaultdoor', 'vegbed', 'vezne', 'viskiaraba', 'vocalmic', 'vz_deniz', 'vz_yaya', 'vz_yol', 'waitseats', 'wall2', 'wall4', 'walldoor', 'wallshelf', 'wardrobe', 'washer', 'watercooler', 'win_bogaz', 'win_dag', 'win_deniz', 'win_kafe', 'win_kuzey', 'win_orman', 'win_sehir', 'win_uzay', 'win_yol', 'window', 'windsock', 'wingchair', 'wire', 'workbench', 'yogamat', 'zp_asfalt', 'zp_cakil', 'zp_cim', 'zp_dans_pisti', 'zp_havuz_karo', 'zp_kaldirim', 'zp_kar', 'zp_kum', 'zp_metal_izgara', 'zp_otopark', 'zp_spor_zemin', 'zp_su', 'zp_tarla', 'zp_yol']));
