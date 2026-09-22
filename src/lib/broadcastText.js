// broadcastText.js — TAMAMEN jenerik metin bölme yardımcıları. Hem
// Sixtagram röportaj videosu HEM DE TV uygulamasının 3 kanalı (Haber/Spor/
// Yatırım) aynı "cümle cümle altyazı" motorunu (bkz. useTalkingBroadcast)
// kullanıyor — bu yüzden metni cümlelere bölme mantığı burada TEK yerde.

// splitSentences — bir metni nokta/ünlem/soru işaretine (ve bunların Türkçe
// tırnak/parantez ile birlikte kullanımına) göre cümlelere böler. Boş/çok
// kısa parçalar (ör. "Dr." gibi kısaltmalardan artakalan) elenmez — bu basit
// bölücü oyun metinleri için yeterli, NLP kütüphanesi KURULMUYOR (genel kural).
export function splitSentences(text) {
  if (!text) return [];
  const raw = String(text)
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return [];
  // Noktalama işaretinden SONRA böl, işareti cümlenin sonunda tut.
  const parts = raw.split(/(?<=[.!?…])\s+/g);
  const cleaned = parts.map((p) => p.trim()).filter(Boolean);
  return cleaned.length ? cleaned : [raw];
}

// estimateReadMs — bir cümlenin "okunma süresi" tahmini: TV spikeri/röportaj
// konuşması için karakter başına sabit bir süre + taban süre. Çok kısa
// cümleler (ör. "Evet.") ekranda gözden kaybolmasın diye bir taban süresi var.
export function estimateReadMs(sentence, { msPerChar = 58, baseMs = 900, maxMs = 7000 } = {}) {
  const len = (sentence || '').length;
  return Math.min(maxMs, Math.max(baseMs, Math.round(len * msPerChar)));
}
