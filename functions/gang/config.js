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
  // v64: saygı HAFTALIK — her oyuncuya haftada en fazla 1 kez (hafta Pazartesi 00:00'da başlar).
  // Bu sürümden önce gösterilmiş saygılar (hafta bilgisi olmayan) bu haftaya sayılır;
  // ilk sıfırlanma bir sonraki Pazartesi 00:00.
  RESPECT_LEGACY_WEEK: '2026-09-28',

  // --- Prestij kaynakları ---
  DONATION_PRESTIGE_PER_GOLD: 5, // ONAYLI: 1 altın bağış = 5 prestij
  // v38: dilimler 8'e çıktığı için savaş prestiji hasarın YARISI (500.000 hasar → 250.000 prestij)
  WAR_PRESTIGE_PER_POWER: 0.5,
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

  // --- Haraç / rüşvet (ONAYLI: alt/üst sınır yok) — v38: son dilim (21:00) başlayana kadar ödenir ---
  HARAC_PAY_DEADLINE_HOUR: 21,
  ATTACK_ANNOUNCE_HOUR: 12, // saldırılar tır sahibine 12:00'de duyurulur

  // --- Bahisli savaş ---
  BET_MIN_STAKE: 10_000, // VARSAYIM
  // ONAYLI: en fazla = iki çetenin 00:00 kasalarından KÜÇÜĞÜNÜN 1/4'ü
  BET_MAX_RATIO_OF_SMALLER_MIDNIGHT_KASA: 0.25,
  BET_OFFERS_PER_DAY: 1, // ONAYLI: çete başına günde 1 teklif
  // ONAYLI: bahis teklifi Cumartesi ve Pazar gönderilemez (Pzt–Cum açık).
  BET_OFFER_WEEKDAYS: [1, 2, 3, 4, 5],
  // v35: kabul edilen bahis bir sonraki saldırı diliminde başlar, 24 saat (v38: 8 dilim) sürer
  BET_DURATION_MS: 24 * MS_HOUR,
  // İstihbarat ihbar/açma/operasyon için son an: v38'de ilk 2 dilimin (6 saat) sonu
  BET_INTEL_WINDOW_MS: 6 * MS_HOUR,

  // --- Sabotaj / Operasyon — SABİT ücret (artık her yeni sabotaj/operasyonla
  // ARTMAZ). Çete sabotajı 50.000, İstihbarat operasyonu 100.000 altın. ---
  SABOTAGE_PRICE: 50_000,
  INTEL_OP_PRICE: 100_000,
  SABOTAGE_START_DEADLINE_HOUR: 12,
  ATTACK_PHASE_1_START_HOUR: 12, // sabotaj/operasyon 12:00–24:00 = 4 dilim (v38)

  // --- Ticaret yolu (ONAYLI) ---
  // v50: günlük sipariş limiti = o pazar savaşına katılan TÜM tarafların
  // (çeteler + İstihbarat) toplam gücünün %0,5'i. Yolu kazanan çete alır.
  // v67: %0,5 → %1 (mevcut yolların limiti de bir kez 2 katına çıkarılır — ensureRouteLimitV67)
  // v75: %1 → %0,5 (mevcut yolların limiti de bir kez yarıya indirilir — ensureRouteLimitV75)
  TRADE_ORDER_LIMIT_TOTAL_RATIO: 0.005,
  // v39 (ESKİ): kazanan çetenin kendi gücünün %1'i. Artık yalnızca tek seferlik
  // v39 geçişinde (ensureRouteLimitV39) kullanılır; yeni savaşları etkilemez.
  TRADE_ORDER_LIMIT_RATIO: 0.01,
  TRADE_ROUTE_BUY_RATIO: 0.5, // mağaza (yasaklı madde: Amazor) fiyatının yarısı
  ROUTE_HOLD_DAYS: 21, // kazanan yolu 21 gün elinde tutar
  // v67: sipariş Pzt–Cmt, 00:00–12:00 arası. Tır siparişten sonraki ilk 3 saatlik
  // dilimde (03·06·09·12) yola çıkar, o gecenin 00:00'ında depoya varır.
  // Yola çıktıktan sonraki 6 saat: ihbar / içerik sızdırma / sabotaj / operasyon.
  // Ardından saldırı (savunma) başlar ve 24:00'te biter. Haraç/rüşvet 21:00'e kadar.
  ORDER_WEEKDAYS: [1, 2, 3, 4, 5, 6],
  ORDER_DEADLINE_HOUR: 12,
  TRUCK_INTEL_WINDOW_MS: 6 * MS_HOUR,

  // --- Tır (ONAYLI) ---
  TRUCK_PRICE: 100_000,
  TRUCK_LIFE_DAYS: 21, // gün (sefer değil); v108: son gününde de sipariş verilebilir (ömrü 0 olunca verilemez)
  TRUCK_CAPACITY: { araba: 10, silah: 10, yasakliMadde: 100 }, // tek tür ürün
  // v125: her çete (yolu olmasa da) günde ÜYE SAYISI × 1.250 altınlık yasaklı madde
  // sipariş edebilir (00:00'daki üye sayısı — gangState.orderBase). Yasaklı madde
  // yolunu tutan çetenin limiti = savaştan kazandığı limit + bu hak.
  // v127: 1.250 → 2.500 (ör. 5 üyeli çete günde 12.500 altınlık = 10 adet)
  CONTRABAND_ORDER_PER_MEMBER: 2500,

  // --- Depo (ONAYLI) --- her alım +100 kapasite, ömürsüz, satılamaz
  DEPOT_PRICE: 100_000,
  DEPOT_CAPACITY_PER_PURCHASE: 100,
  // v71 — 2. el çete ilanına reklam (oyuncu ilanlarıyla aynı: 1000 altın / 24 saat, kasadan)
  MARKET_AD_PRICE: 1000,
  MARKET_AD_DURATION_MS: 24 * 60 * 60 * 1000,
  DEPOT_UNIT_SIZE: { araba: 10, silah: 10, yasakliMadde: 1 },

  // --- Aktiflik (ONAYLI: 30 gün hiçbir savaşa katılmayan atılır; Baba dahil) ---
  INACTIVE_WARN_DAYS: 29,
  INACTIVE_REMOVE_DAYS: 30,
  // v125: 10 gün OYUNA GİRMEYEN üye de çeteden çıkarılır (polislikteki kuralla aynı;
  // kural ilk çalıştığı andan itibaren sayılır — gangLoginInactivityFromMs)
  LOGIN_INACTIVE_DAYS: 10,

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

// v109 — İSTİHBARAT ve POLİS BİRLEŞTİ: bu teşkilatın oyuncuya görünen adı artık
// "Polis Teşkilatı". Kod içindeki kimlikler (intel, baskan, sef, …) aynı kaldı —
// mevcut üyelerin verisine dokunulmadı. Teşkilat üyesi = polis
// (users.profession === 'polis'); katılım/ayrılık mesleği de birlikte değiştirir.
export const INTEL = {
  JOIN_MIN_REPUTATION: 50, // ONAYLI
  JOIN_MAX_SUSPICION: 0, // v109: polis olmak için şüphe %0 olmalı
  // v109: istifa eden / atılan / oylamayla çıkarılan / pasiflikten görevden alınan
  // 24 saat yeniden başvuramaz (memberships/{uid}.intelCooldownUntilMs)
  REJOIN_COOLDOWN_MS: 24 * MS_HOUR,
  // v123: başvuru formu yok — şartları sağlayan anında polis olur; yeni katılan
  // polis katıldığı andan itibaren 24 saat atılamaz (doğrudan ya da oylamayla).
  NEW_MEMBER_KICK_GUARD_MS: 24 * MS_HOUR,
  CODENAME_MIN: 3,
  CODENAME_MAX: 16,
  REPORT_PRESTIGE: 500_000, // v109: tır ihbarı (1.000.000 → 500.000)
  LEAK_PRESTIGE: 500_000, // v109: tır içeriği sızdırma (1.000.000 → 500.000)
  // v33: bahisli savaşa müdahale — ihbar/açma ödülü tırlarla aynı; operasyon sabit ücret
  BET_REPORT_PRESTIGE: 500_000, // v109
  BET_LEAK_PRESTIGE: 500_000, // v109
  BET_OP_PRICE: 100_000,
  TAKEDOWN_PRESTIGE: 10_000_000, // ONAYLI: çete çökertme
  // v50: pazar savaşını kazanırsa kasaya, savaşa katılan TÜM tarafların
  // (çeteler + İstihbarat) toplam gücünün %5'i girer (eskiden kendi gücünün 1/10'u).
  WAR_WIN_KASA_TOTAL_RATIO: 0.05,
  // v50: şüpheyle yakalanma cezasının (soygun / yasaklı madde) bir kısmı kasaya
  // girer (v94: %25); kalanı yakılır (ekonomiden çıkar). Oyuncunun borcu değişmez.
  SUSPICION_FINE_KASA_RATIO: 1 / 4, // v94: %50 → %25
  // v88: kasa sınırı = üye sayısı × bu tutar. v94: sınır SADECE ceza gelirine uygulanır (çökertme, tır
  // operasyonu, savaş vb. kasayı sınırın üstüne çıkarabilir; o zaman ceza payı girmez).


  KASA_CAP_PER_MEMBER: 100_000,
  KASA_RESET_V88: 1_000_000, // tek seferlik: kasa bu tutara indirilir
  KICK_BASKAN_MIN_RATIO_EXCLUSIVE: 0.66, // Başkan'ı atmak: > %66
  KICK_MIN_RATIO: 0.51, // diğerleri: >= %51
  // v61 (istismar önlemi): İstihbaratta en az bu kadar üye yoksa kimse atılamaz,
  // çıkarma oylaması başlatılamaz/uygulanmaz (kendi isteğiyle ayrılmak serbest).
  KICK_MIN_MEMBERS: 8,
  // v61: dağıtım yapılabilmesi için hedef grupta en az bu kadar üye olmalı
  // (Rütbeliler / Ajanlar / Muhbirler / Tüm üyeler — her biri ayrı sayılır).
  DIST_MIN_GROUP_MEMBERS: 5,
  NAME: 'Polis Teşkilatı', // v109 (eski adı: İstihbarat)
  LOGO: { emoji: '🚓', color: '#5b9bff', bg: '#071a3a' },
  // v108 — başvuru formu (kod adı + beyan edilen çete/rütbe + neden). Başkan ve
  // Şefler inceler; 12 saat içinde yanıt gelmezse otomatik onaylanır. Teşkilatta
  // Başkan ya da Şef yoksa başvuru anında otomatik onaylanır.
  // v109: "Hangi çetedesin?" — aktif çetelerden biri ya da bu seçenek (o zaman rütbe sorulmaz)
  APP_NO_GANG: 'Hiçbir çetede değilim',
  APP_REASON_MIN: 10,
  APP_REASON_MAX: 300,
  APP_GANG_MAX: 24,
  APP_AUTO_APPROVE_HOURS: 12,
  JOIN_REQUIRES_WEAPON: true,
  JOIN_REQUIRES_ONBOARDING: true,
};

// v109 — Soygun durdurma (functions/policeRules.js): kurtarılan paranın %25'i
// polislere (eşit), kalanı devlete; her polis (kurtarılan × 4) / polis sayısı
// prestij kazanır (Polis Teşkilatı prestiji).
//   ör. 2 polis 500.000 kurtardı → kişi başı 62.500 altın + 1.000.000 prestij
export const POLICE = {
  BUST_EARN_RATIO: 0.25,
  BUST_PRESTIGE_PER_GOLD: 4,
};

// v109 — Rütbe maaşları (devlet öder, her gece 00:00'da otomatik + SMS).
// Rütbe kimlikleri eski İstihbarat kimlikleri; adları polis rütbeleri (RANK_LABELS).
// İmam maaşı functions/index.js (IMAM_SALARY).
export const SALARIES = {
  baskan: 25_000, // Emniyet Genel Müdürü
  sef: 20_000, // Emniyet Amiri
  uzman: 15_000, // Başkomiser
  ajan: 10_000, // Komiser
  muhbir: 5_000, // Polis Memuru
};
// v108.1 — Karakol rüşveti (functions/index.js bribePolice ile aynı). Bir günün
// rüşvetleri o gecenin 00:00'ında o an polis olanlara eşit bölünüp maaşla
// birlikte otomatik yatar. O gün hiç polis yoksa devlet kasasına gelir yazılır.
export const BRIBE_COST = 3000;
// v108 — 10 gün oyuna girmeyen polisler görevden alınır.
export const ROLE_INACTIVE_DAYS = 10;

// Çete rütbeleri (sıra = yetki sırası, küçük = daha yetkili)
export const GANG_RANKS = ['baba', 'sagkol', 'kidemli', 'tetikci', 'comez'];
export const INTEL_RANKS = ['baskan', 'sef', 'uzman', 'ajan', 'muhbir'];
export const RANK_LABELS = {
  baba: 'Mafya Babası',
  sagkol: 'Sağ Kol',
  kidemli: 'Kıdemli',
  tetikci: 'Tetikçi',
  comez: 'Çömez',
  // v109 — teşkilat rütbeleri (kimlikler eski İstihbarat adları)
  baskan: 'Emniyet Genel Müdürü',
  sef: 'Emniyet Amiri',
  uzman: 'Başkomiser',
  ajan: 'Komiser',
  muhbir: 'Polis Memuru',
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

// Savaş katılım pencereleri — v38: 3 saatlik 8 dilim (00,03,06,…,21 → slot 0..7)
export const WINDOW_HOURS = 3;
// v38 öncesi 6 saatlik dilim (geçiş günü çift saldırı koruması için)
export const LEGACY_WINDOW_HOURS = 6;
export const WAR_SHARDS = 8;

// v116 — çeteden AYRILAN (kendi isteğiyle) ya da ATILAN oyuncu 24 saat boyunca
// hiçbir çeteye giremez, çete kuramaz, polisliğe başvuramaz, imam olamaz.
// memberships/{uid}.gangCooldownUntilMs. Başka çeteye doğrudan geçiş / yeni
// çete kurarken eski çeteden çıkmak ve aktiflik temizliği bu yasağı koymaz.
export const GANG_EXIT_COOLDOWN_MS = 24 * MS_HOUR;
export function gangExitBlockText(membership, now = Date.now()) {
  const until = Number(membership?.gangCooldownUntilMs || 0);
  if (!(until > now)) return null;
  const hrs = Math.max(1, Math.ceil((until - now) / MS_HOUR));
  return `Çeteden ayrıldıktan ya da atıldıktan sonra 24 saat geçmeden tekrar giremezsin (${hrs} saat kaldı). Bu sürede çeteye, polisliğe ya da imamlığa giremezsin.`;
}
