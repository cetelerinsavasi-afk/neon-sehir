// v67 — Başarılar: hem sunucu (functions/achievements.js) hem istemci
// (src/components/AchievementsScreen) aynı listeyi kullanır.
// reward = zümrüt. Her başarı oyuncu başına BİR kez kazanılır.
export const ACHIEVEMENTS = [
  { id: 'imam', emoji: '🕌', title: 'İmam ol', desc: 'Şehrin imamı ol.', reward: 1 },
  { id: 'piyango', emoji: '🎟️', title: 'Piyango kazan', desc: 'Günün piyangosunu kazan.', reward: 1 },
  { id: 'bankaSoy', emoji: '🏦', title: 'Banka soy', desc: 'Bankayı yakalanmadan soy (tek başına ya da ekiple).', reward: 2 },
  { id: 'sixtagram100', emoji: '❤️', title: "Sixtagram'da 100 beğeni", desc: "Sixtagram gönderilerin toplam 100 beğeniye ulaşsın.", reward: 2 },
  { id: 'cabrioSampiyon', emoji: '🏎️', title: 'Üstün Cabrio şampiyonu', desc: 'Üstün Cabrio şampiyonasını kazan.', reward: 3 },
  { id: 'polisBanka', emoji: '🚔', title: 'Banka soyguncusunu yakala', desc: 'Polis olarak bir banka soygununda suçluları yakala.', reward: 3 },
  { id: 'mafyaBabasi', emoji: '🕴️', title: 'Mafya Babası ol', desc: 'Bir çetenin Mafya Babası ol.', reward: 4 },
  { id: 'istihbaratBaskani', emoji: '🕵️', title: 'İstihbarat Başkanı ol', desc: "İstihbarat'ın başına geç.", reward: 4 },
  { id: 'superKupa', emoji: '🏆', title: 'Süper Kupa', desc: 'Sahibi olduğun takımla 1. ya da 2. Lig kupasını kazan.', reward: 5 },
  { id: 'ligSampiyonu', emoji: '🥇', title: '1. Lig şampiyonu', desc: 'Sahibi olduğun takımla 1. Lig şampiyonu ol.', reward: 5 },
];
// v74: ödüller artırıldı (toplam 30). Önceden kazanılanlara fark VERİLMEZ;
// o başarılarda ekranda kazanılan eski ödül gösterilir (users.achievementRewards
// yoksa bu tablo kullanılır).
export const LEGACY_ACHIEVEMENT_REWARDS = { imam: 1, piyango: 1, bankaSoy: 1, sixtagram100: 1, cabrioSampiyon: 1, polisBanka: 1, mafyaBabasi: 2, istihbaratBaskani: 3, superKupa: 4, ligSampiyonu: 5 };
export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
