// İstemci tarafı sabitler — functions/gang/config.js ile senkron tutulmalı.
// Buradaki değerler SADECE gösterim içindir; tüm kurallar sunucuda doğrulanır.
export const RANK_LABELS = {
  baba: 'Mafya Babası',
  sagkol: 'Sağ Kol',
  kidemli: 'Kıdemli',
  tetikci: 'Tetikçi',
  comez: 'Çömez',
  // v109 — Polis Teşkilatı (eski İstihbarat; kimlikler aynı, adlar polis rütbeleri)
  baskan: 'Emniyet Genel Müdürü',
  sef: 'Emniyet Amiri',
  uzman: 'Başkomiser',
  ajan: 'Komiser',
  muhbir: 'Polis Memuru',
};
export const RANK_ICONS = {
  baba: '👑',
  sagkol: '🗡️',
  kidemli: '🎖️',
  tetikci: '🔫',
  comez: '🐣',
  baskan: '⭐',
  sef: '🎖️',
  uzman: '🛡️',
  ajan: '🚔',
  muhbir: '👮',
};
export const GANG_RANK_ORDER = ['baba', 'sagkol', 'kidemli', 'tetikci', 'comez'];
export const INTEL_RANK_ORDER = ['baskan', 'sef', 'uzman', 'ajan', 'muhbir'];
const EQUIV = { baskan: 'baba', sef: 'sagkol', uzman: 'kidemli', ajan: 'tetikci', muhbir: 'comez' };

export function rankLevel(rank) {
  const i = GANG_RANK_ORDER.indexOf(EQUIV[rank] || rank);
  return i === -1 ? 99 : i;
}
export function atLeast(rank, min) {
  return rankLevel(rank) <= GANG_RANK_ORDER.indexOf(min);
}

export const GANG_RULES = {
  CREATE_MIN_GOLD: 1_000_000,
  CREATE_MIN_REPUTATION: 100,
  CREATE_MIN_POWER: 40_000,
  CREATE_FEE: 1_000_000,
  FOUNDER_PRESTIGE: 10_000_000,
  INTEL_MIN_REPUTATION: 50,
  RESPECT_PRESTIGE: 1_000_000,
  RANK_THRESHOLD: 1_000_000,
  DONATION_PRESTIGE_PER_GOLD: 5,
  WITHDRAW_PRESTIGE_PER_GOLD: 5,
  DISTRIBUTION_HOURS: 24,
  DIST_RANKED_SLOTS: 7,
  DIST_MIN_SLOTS: 7,
  ORDER_LIMIT_RATIO: 0.005, // v75: savaşa katılan tüm tarafların (Polis Teşkilatı dahil) toplam gücünün %0,5'i
  ORDER_WEEKDAYS: [1, 2, 3, 4, 5, 6], // v67: Pzt–Cmt
  ORDER_DEADLINE_HOUR: 12, // v67: sipariş 00:00–12:00
  ROUTE_DAYS: 21,
  TRUCK_PRICE: 100_000,
  TRUCK_LIFE_DAYS: 21,
  TRUCK_CAPACITY: { araba: 10, silah: 10, yasakliMadde: 100 },
  CONTRABAND_ORDER_PER_MEMBER: 1250, // v125: her çete günde 00:00'daki üye × 1.250 altınlık yasaklı madde
  DEPOT_PRICE: 100_000,
  DEPOT_STEP: 100,
  UNIT_SIZE: { araba: 10, silah: 10, yasakliMadde: 1 },
  BET_MIN: 10_000,
  BET_OFFER_WEEKDAYS: [1, 2, 3, 4, 5],
  NAME_MIN: 3,
  NAME_MAX: 24,
  NOTE_MAX: 160,
  CHAT_MAX: 300,
  CODENAME_MIN: 3,
  CODENAME_MAX: 16,
  APP_REASON_MIN: 10,
  APP_REASON_MAX: 300,
  APP_GANG_MAX: 24,
  APP_NO_GANG: 'Hiçbir çetede değilim', // v109 — sunucu: INTEL.APP_NO_GANG
  REJOIN_COOLDOWN_HOURS: 24, // v109 — istifa / atılma sonrası
};

export const LOGO_EMOJIS = ['💀', '🐍', '🦂', '🐺', '🦅', '🐉', '🔥', '⚡', '🗡️', '🎯', '👑', '🃏', '🌹', '🕷️', '🦈', '💎', '⚔️', '🔱', '☠️', '🐅'];
export const LOGO_COLORS = ['#ff2e8c', '#19e8ff', '#ffd23f', '#7cff6b', '#b16bff', '#ff7a2e', '#ffffff', '#ff3b3b'];
export const LOGO_BGS = ['#1a0610', '#06222b', '#231c05', '#0b2208', '#170b26', '#2a1206', '#101318', '#2a0808'];
// v109 — Polis Teşkilatı (kodda "intel"): ad + logo — sunucu: functions/gang/config.js INTEL
export const INTEL_NAME = 'Polis Teşkilatı';
export const INTEL_LOGO = { emoji: '🚓', color: '#5b9bff', bg: '#071a3a' };
// rütbe maaşları (devlet öder, her gece 00:00) — sunucu: functions/gang/config.js SALARIES
export const SALARIES = { baskan: 25_000, sef: 20_000, uzman: 15_000, ajan: 10_000, muhbir: 5_000 };
export const INTEL_RANKED = ['baskan', 'sef', 'uzman'];
export const ROLE_INACTIVE_DAYS = 10;

// Ticaret ürünleri — her Pazar sıradaki: yasaklı madde → silah → araba
export const PRODUCTS = [
  { id: 'yasakliMadde', label: 'Yasaklı Madde', emoji: '💊', kind: 'material', storePrice: 2500 },
  { id: 'silah', label: 'Silah', emoji: '🔫', kind: 'weapon' },
  { id: 'araba', label: 'Araba', emoji: '🚗', kind: 'vehicle' },
];
export function productOf(id) {
  return PRODUCTS.find((p) => p.id === id) || { id, label: id, emoji: '📦' };
}

export const DIST_GROUPS = [
  { id: 'rutbeli', label: 'Rütbeliler', intelLabel: 'Rütbeliler', icon: '🎖️' },
  { id: 'tetikci', label: 'Tetikçiler', intelLabel: 'Komiserler', icon: '🔫' },
  { id: 'comez', label: 'Çömezler', intelLabel: 'Polis Memurları', icon: '🐣' },
  { id: 'hepsi', label: 'Tüm üyeler', intelLabel: 'Tüm üyeler', icon: '👥' },
];

export const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

export function productOfKey(key) {
  const k = String(key || '');
  return k.startsWith('silah:') ? 'silah' : k.startsWith('araba:') ? 'araba' : k;
}
export function unitsOf(key, qty) {
  return (GANG_RULES.UNIT_SIZE[productOfKey(key)] || 0) * Number(qty || 0);
}
export const LEADERS = ['baba', 'sagkol'];
export const INTEL_LEADERS = ['baskan', 'sef'];
// v108/v109 — polislik başvuru formu: çetedeki rütbe seçenekleri ('yok' = hiçbir çetede değil)
export const APP_GANG_RANKS = [
  { id: 'baba', label: 'Mafya Babası' },
  { id: 'sagkol', label: 'Sağ Kol' },
  { id: 'kidemli', label: 'Kıdemli' },
  { id: 'tetikci', label: 'Tetikçi' },
  { id: 'comez', label: 'Çömez' },
];
export const appRankLabel = (id) => (id === 'yok' ? 'Çetesi yok' : APP_GANG_RANKS.find((r) => r.id === id)?.label || '—');

// v116 — çeteden ayrılan / atılan 24 saat çeteye, polisliğe, imamlığa giremez
// (sunucu: functions/gang/config.js gangExitBlockText). Kalan saat (0 = serbest).
export function gangExitHoursLeft(membership, now = Date.now()) {
  const until = Number(membership?.gangCooldownUntilMs || 0);
  return until > now ? Math.max(1, Math.ceil((until - now) / 3_600_000)) : 0;
}
export const gangExitText = (h) => `🔒 Çeteden ayrıldıktan ya da atıldıktan sonra 24 saat geçmeden tekrar giremezsin (${h} saat kaldı).`;
