// v67 — Başarılar: hem sunucu (functions/achievements.js) hem istemci
// (src/components/AchievementsScreen) aynı listeyi kullanır.
// reward = zümrüt. Her başarı oyuncu başına BİR kez kazanılır.
// v141: steps → aşamalı başarı (her aşama 1 zümrüt; hepsi bitince tamamlanır).
// Liste sırası = ekrandaki sıra: davet en üstte, belediye başkanı en altta.
export const ACHIEVEMENTS = [
  { id: 'davet', emoji: '🤝', title: 'Referans kodunla arkadaşını davet et', desc: 'Kodunla katılan her yeni oyuncu 1 aşama: 1 zümrüt. 10 aşamada toplam 10 zümrüt.', reward: 10, steps: 10 },
  { id: 'imam', emoji: '🕌', title: 'İmam ol', desc: 'Şehrin imamı ol.', reward: 1 },
  { id: 'piyango', emoji: '🎟️', title: 'Piyango kazan', desc: 'Günün piyangosunu kazan.', reward: 1 },
  { id: 'bankaSoy', emoji: '🏦', title: 'Banka soy', desc: 'Bankayı yakalanmadan soy (tek başına ya da ekiple).', reward: 2 },
  { id: 'sixtagram100', emoji: '❤️', title: "Sixtagram'da 100 beğeni", desc: "Sixtagram gönderilerin toplam 100 beğeniye ulaşsın.", reward: 2 },
  { id: 'cabrioSampiyon', emoji: '🏎️', title: 'Üstün Cabrio şampiyonu', desc: 'Üstün Cabrio ile şampiyonayı 26 saniyenin altında bitir (250.000 / 500.000 ödül).', reward: 3 },
  { id: 'polisBanka', emoji: '🚔', title: 'Banka soyguncusunu yakala', desc: 'Polis olarak bir banka soygununda suçluları yakala.', reward: 3 },
  { id: 'mafyaBabasi', emoji: '🕴️', title: 'Mafya Babası ol', desc: 'Bir çetenin Mafya Babası ol.', reward: 4 },
  { id: 'istihbaratBaskani', emoji: '⭐', title: 'Emniyet Genel Müdürü ol', desc: 'Polis Teşkilatının başına geç.', reward: 4 },
  { id: 'superKupa', emoji: '🏆', title: 'Süper Kupa', desc: 'Sahip olduğun takımla süper kupayı kazan.', reward: 5 },
  { id: 'ligSampiyonu', emoji: '🥇', title: '1. Lig şampiyonu', desc: 'Sahibi olduğun takımla 1. Lig şampiyonu ol.', reward: 5 },
  { id: 'belediyeBaskani', emoji: '🏛️', title: 'Belediye başkanı ol', desc: 'Seçimi kazanarak ya da darbe yaparak belediye başkanı ol.', reward: 10 },
];
// v141 — davet başarısı: referans sahibine ilk 10 davette 1 zümrüt (+ her davette 10.000 altın)
export const REFERRAL_STEP_EMERALD = 1;
export const REFERRAL_STEPS = 10;
// v74: ödüller artırıldı (toplam 30). v141: davet + belediye başkanı ile toplam 50. Önceden kazanılanlara fark VERİLMEZ;
// o başarılarda ekranda kazanılan eski ödül gösterilir (users.achievementRewards
// yoksa bu tablo kullanılır).
export const LEGACY_ACHIEVEMENT_REWARDS = { imam: 1, piyango: 1, bankaSoy: 1, sixtagram100: 1, cabrioSampiyon: 1, polisBanka: 1, mafyaBabasi: 2, istihbaratBaskani: 3, superKupa: 4, ligSampiyonu: 5 };
export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
