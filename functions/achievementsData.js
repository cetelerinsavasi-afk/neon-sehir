// v67 — Başarılar: hem sunucu (functions/achievements.js) hem istemci
// (src/components/AchievementsScreen) aynı listeyi kullanır.
// reward = zümrüt. Her başarı oyuncu başına BİR kez kazanılır.
export const ACHIEVEMENTS = [
  { id: 'imam', emoji: '🕌', title: 'İmam ol', desc: 'Şehrin imamı ol.', reward: 1 },
  { id: 'piyango', emoji: '🎟️', title: 'Piyango kazan', desc: 'Günün piyangosunu kazan.', reward: 1 },
  { id: 'bankaSoy', emoji: '🏦', title: 'Banka soy', desc: 'Bankayı yakalanmadan soy (tek başına ya da ekiple).', reward: 1 },
  { id: 'sixtagram100', emoji: '❤️', title: "Sixtagram'da 100 beğeni", desc: "Sixtagram gönderilerin toplam 100 beğeniye ulaşsın.", reward: 1 },
  { id: 'cabrioSampiyon', emoji: '🏎️', title: 'Üstün Cabrio şampiyonu', desc: 'Üstün Cabrio şampiyonasını kazan.', reward: 1 },
  { id: 'polisBanka', emoji: '🚔', title: 'Banka soyguncusunu yakala', desc: 'Polis olarak bir banka soygununda suçluları yakala.', reward: 1 },
  { id: 'mafyaBabasi', emoji: '🕴️', title: 'Mafya Babası ol', desc: 'Bir çetenin Mafya Babası ol.', reward: 2 },
  { id: 'istihbaratBaskani', emoji: '🕵️', title: 'İstihbarat Başkanı ol', desc: "İstihbarat'ın başına geç.", reward: 3 },
  { id: 'superKupa', emoji: '🏆', title: 'Süper Kupa', desc: 'Sahibi olduğun takımla 1. ya da 2. Lig kupasını kazan.', reward: 4 },
  { id: 'ligSampiyonu', emoji: '🥇', title: '1. Lig şampiyonu', desc: 'Sahibi olduğun takımla 1. Lig şampiyonu ol.', reward: 5 },
];
export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
