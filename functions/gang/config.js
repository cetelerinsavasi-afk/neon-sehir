// =============================================================================
// ÇETE & İSTİHBARAT SİSTEMİ — TÜM SAYISAL KURALLAR TEK YERDE
// -----------------------------------------------------------------------------
// "ONAYLI" işaretli değerler talimattaki kesin kurallardır, değiştirilmemeli.
// "VARSAYIM" işaretli değerler talimatta sayısı verilmemiş, kaynak tasarımda
// olduğu belirtilen ama elimizdeki dosyalarda bulunmayan değerlerdir — oyun
// tasarımcısı tarafından onaylanana kadar bu dosyada tek satırdan
// değiştirilebilir. (Bkz. docs/cete-sistemi/ACIK-KARARLAR.md)
// =============================================================================

export const MS_HOUR = 60 * 60 * 1000;
export const MS_DAY = 24 * MS_HOUR;

export const GANG = {
  // --- Kurma (ONAYLI şartlar) ---
  CREATE_MIN_GOLD: 1_000_000,
  CREATE_MIN_REPUTATION: 100,
  CREATE_MIN_POWER: 40_000,
  // VARSAYIM: 1.000.000 altın şartı aynı zamanda kuruluş ücreti olarak
  // düşülür (para sistemden çıkar). 0 yapılırsa sadece "sahip olma" şartı olur.
  CREATE_FEE: 1_000_000,
  FOUNDER_START_PRESTIGE: 10_000_000, // ONAYLI

  // --- Rütbe (ONAYLI) ---
  SAG_KOL_SLOTS: 2,
  KIDEMLI_SLOTS: 4,
  RANK_THRESHOLD: 1_000_000, // altı → Çömez
  RESPECT_PRESTIGE: 1_000_000, // Mafya Babası saygısı

  // --- Prestij kaynakları ---
  DONATION_PRESTIGE_PER_GOLD: 5, // ONAYLI: 1 altın bağış = 5 prestij
  WAR_PRESTIGE_PER_POWER: 1, // ONAYLI: 1 güç = 1 prestij
  WITHDRAW_PRESTIGE_PER_GOLD: 5, // ONAYLI: Baba kendi hesabına aldığı her altın için 5 prestij kaybeder

  // --- Kasa & dağıtım (ONAYLI) ---
  // 00:00 kasasının %20'si "serbest": dağıtım + Baba'nın kendine aktarımı +
  // başka çeteye gönderim bu TEK hakkı paylaşır.
  DISTRIBUTABLE_RATIO: 0.2,
  DISTRIBUTION_TTL_MS: 24 * MS_HOUR,
  DIST_RANKED_SLOTS: 7, // rütbeliler dağıtımı: sabit 7 kişi
  DIST_MIN_SLOTS: 7, // diğer gruplar: en az 7 kişi
  DIST_MAX_SLOTS: 500,
  MIN_DONATION: 100,

  // --- Haraç / rüşvet (ONAYLI: alt/üst sınır yok; 18:00'e kadar ödenir) ---
  HARAC_PAY_DEADLINE_HOUR: 18,
  ATTACK_ANNOUNCE_HOUR: 12, // saldırılar tır sahibine 12:00'de duyurulur

  // --- Bahisli savaş ---
  BET_MIN_STAKE: 10_000, // VARSAYIM
  // ONAYLI: en fazla = iki çetenin 00:00 kasalarından KÜÇÜĞÜNÜN 1/4'ü
  BET_MAX_RATIO_OF_SMALLER_MIDNIGHT_KASA: 0.25,
  BET_OFFERS_PER_DAY: 1, // ONAYLI: çete başına günde 1 teklif
  // ONAYLI: bahis teklifi Cumartesi ve Pazar gönderilemez (Pzt–Cum açık).
  BET_OFFER_WEEKDAYS: [1, 2, 3, 4, 5],
  // v35: kabul edilen bahis bir sonraki saldırı diliminde başlar, 24 saat (4 dilim) sürer
  BET_DURATION_MS: 24 * MS_HOUR,
  // İstihbarat ihbar/açma/operasyon için son an: ilk dilimin sonu
  BET_INTEL_WINDOW_MS: 6 * MS_HOUR,

  // --- Sabotaj (ONAYLI) — ücret OYUN GENELİNDE her yeni sabotaj/operasyonla
  // 10.000 artar, 00:00'da sıfırlanır ---
  SABOTAGE_BASE_PRICE: 10_000,
  SABOTAGE_PRICE_STEP: 10_000,
  SABOTAGE_START_DEADLINE_HOUR: 12,
  ATTACK_PHASE_1_START_HOUR: 12,
  ATTACK_PHASE_2_START_HOUR: 18,

  // --- Ticaret yolu (ONAYLI) ---
  TRADE_ORDER_LIMIT_RATIO: 0.05, // günlük sipariş limiti = kazanırken kullanılan gücün %5'i
  TRADE_ROUTE_BUY_RATIO: 0.5, // mağaza (yasaklı madde: Amazor) fiyatının yarısı
  ROUTE_HOLD_DAYS: 21, // kazanan yolu 21 gün elinde tutar
  ORDER_WEEKDAYS: [1, 2, 3, 4, 5], // sipariş sadece Pzt–Cum

  // --- Tır (ONAYLI) ---
  TRUCK_PRICE: 100_000,
  TRUCK_LIFE_DAYS: 21, // gün (sefer değil); son 1 gün sipariş verilemez
  TRUCK_CAPACITY: { araba: 10, silah: 10, yasakliMadde: 100 }, // tek tür ürün

  // --- Depo (ONAYLI) --- her alım +100 kapasite, ömürsüz, satılamaz
  DEPOT_PRICE: 100_000,
  DEPOT_CAPACITY_PER_PURCHASE: 100,
  DEPOT_UNIT_SIZE: { araba: 10, silah: 10, yasakliMadde: 1 },

  // --- Aktiflik (ONAYLI: 30 gün hiçbir savaşa katılmayan atılır; Baba dahil) ---
  INACTIVE_WARN_DAYS: 29,
  INACTIVE_REMOVE_DAYS: 30,

  // --- Oylama (ONAYLI) ---
  DEVIRME_MIN_RATIO: 0.51, // >= %51
  AYAKLANMA_MIN_RATIO_EXCLUSIVE: 0.66, // > %66 (2-1, 4-2 geçer)
  KICK_MIN_RATIO_EXCLUSIVE: 0.51, // ONAYLI: %51'den fazla
  // ONAYLI: başarısız ayaklanmada başlatan çeteden atılır.
  AYAKLANMA_FAIL_KICKS_INITIATOR: true,
  // v33: oylamalar 00:00–12:00 arasında başlatılır, ANINDA başlar ve o gecenin 00:00'ında biter.
  VOTE_START_DEADLINE_HOUR: 12,
  SUGGESTION_MIN_INTERVAL_MS: 60 * 1000,

  // --- Metin limitleri ---
  NAME_MIN: 3,
  NAME_MAX: 24,
  NOTE_MAX: 160,
  CHAT_MAX: 300,
  CHAT_MIN_INTERVAL_MS: 1500,
};

export const INTEL = {
  JOIN_MIN_REPUTATION: 50, // ONAYLI (polislik şartı YOK)
  CODENAME_MIN: 3,
  CODENAME_MAX: 16,
  REPORT_PRESTIGE: 1_000_000, // ONAYLI: tır ihbarı
  LEAK_PRESTIGE: 1_000_000, // ONAYLI: tır içeriği sızdırma
  // v33: bahisli savaşa müdahale — ihbar/açma ödülü tırlarla aynı; operasyon sabit ücret
  BET_REPORT_PRESTIGE: 1_000_000,
  BET_LEAK_PRESTIGE: 1_000_000,
  BET_OP_PRICE: 100_000,
  TAKEDOWN_PRESTIGE: 10_000_000, // ONAYLI: çete çökertme
  POLICE_REWARD_PRESTIGE_PER_GOLD: 1, // ONAYLI: yakalama ödülü = prestij (1:1)
  WAR_WIN_KASA_RATIO: 1 / 10, // ONAYLI: pazar savaşı kazanırsa kullanılan gücün 1/10'u
  KICK_BASKAN_MIN_RATIO_EXCLUSIVE: 0.66, // Başkan'ı atmak: > %66
  KICK_MIN_RATIO: 0.51, // diğerleri: >= %51
  NAME: 'İstihbarat',
  LOGO: { emoji: '🕵️', color: '#19e8ff', bg: '#06222b' },
};

// Çete rütbeleri (sıra = yetki sırası, küçük = daha yetkili)
export const GANG_RANKS = ['baba', 'sagkol', 'kidemli', 'tetikci', 'comez'];
export const INTEL_RANKS = ['baskan', 'sef', 'uzman', 'ajan', 'muhbir'];
export const RANK_LABELS = {
  baba: 'Mafya Babası',
  sagkol: 'Sağ Kol',
  kidemli: 'Kıdemli',
  tetikci: 'Tetikçi',
  comez: 'Çömez',
  baskan: 'Başkan',
  sef: 'Şef',
  uzman: 'Uzman',
  ajan: 'Ajan',
  muhbir: 'Muhbir',
};
// İstihbarat rütbesinin çete eşdeğeri (yetki kontrolünü tek fonksiyonla yapmak için)
export const INTEL_TO_GANG_EQUIV = { baskan: 'baba', sef: 'sagkol', uzman: 'kidemli', ajan: 'tetikci', muhbir: 'comez' };

export function rankLevel(rank) {
  const g = INTEL_TO_GANG_EQUIV[rank] || rank;
  const i = GANG_RANKS.indexOf(g);
  return i === -1 ? 99 : i;
}
export function atLeast(rank, minGangRank) {
  return rankLevel(rank) <= GANG_RANKS.indexOf(minGangRank);
}
export function isRanked(rank) {
  return atLeast(rank, 'kidemli');
}

// --- Logo seçenekleri (sunucu doğrular) ---
export const LOGO_EMOJIS = ['💀', '🐍', '🦂', '🐺', '🦅', '🐉', '🔥', '⚡', '🗡️', '🎯', '👑', '🃏', '🌹', '🕷️', '🦈', '💎', '⚔️', '🔱', '☠️', '🐅'];
export const LOGO_COLORS = ['#ff2e8c', '#19e8ff', '#ffd23f', '#7cff6b', '#b16bff', '#ff7a2e', '#ffffff', '#ff3b3b'];
export const LOGO_BGS = ['#1a0610', '#06222b', '#231c05', '#0b2208', '#170b26', '#2a1206', '#101318', '#2a0808'];

// --- Ticaret ürünleri (ONAYLI: 3 ürün, her pazar sıradaki: yasaklı madde →
// silah → araba). kind: material → AMAZOR fiyatı; weapon/vehicle → katalog.
export const TRADE_PRODUCTS = [
  { id: 'yasakliMadde', label: 'Yasaklı Madde', emoji: '💊', kind: 'material', material: 'yasakliMadde' },
  { id: 'silah', label: 'Silah', emoji: '🔫', kind: 'weapon' },
  { id: 'araba', label: 'Araba', emoji: '🚗', kind: 'vehicle' },
];
export const TRADE_PRODUCT_IDS = TRADE_PRODUCTS.map((p) => p.id);
export function productById(id) {
  return TRADE_PRODUCTS.find((p) => p.id === id) || null;
}

// Dağıtım hedef grupları
export const DIST_GROUPS = ['rutbeli', 'tetikci', 'comez', 'hepsi'];

// Savaş katılım pencereleri: 00,06,12,18 → slot 0..3 (ONAYLI)
export const WINDOW_HOURS = 6;
export const WAR_SHARDS = 8;
