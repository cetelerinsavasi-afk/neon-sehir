// broadcastText.js — TAMAMEN jenerik metin bölme yardımcıları. Hem
// Sixtagram röportaj videosu HEM DE TV uygulamasının 3 kanalı (Haber/Spor/
// Yatırım) aynı "cümle cümle altyazı" motorunu (bkz. useTalkingBroadcast)
// kullanıyor — bu yüzden metni cümlelere bölme mantığı burada TEK yerde.

// splitSentences — bir metni parçalara böler. KULLANICI REVİZESİ: artık
// sadece cümle sonu noktalamasında (.!?…) değil, VİRGÜL ve noktalı
// virgülden SONRA da bölünüyor — kullanıcının gönderdiği örnekteki gibi
// ("tvde yaptığın gibi virgül ve nokta olan cümleleri ayrı ayrı altyazıya
// koyalım... sırayla girsin") her virgülle ayrılmış parça ayrı, sırayla
// giren bir altyazı gibi davranıyor. Bölme noktalamasından sonra kalan
// tek başına virgül/noktalı virgül kırpılır (böylece bir altyazı "...,"
// ile bitmiyor), nokta/ünlem/soru işareti ise cümle sonu hissi için
// kalıyor. Boş/çok kısa parçalar (ör. "Dr." gibi kısaltmalardan artakalan)
// elenmez — bu basit bölücü oyun metinleri için yeterli, NLP kütüphanesi
// KURULMUYOR (genel kural).
export function splitSentences(text) {
  if (!text) return [];
  const raw = String(text)
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return [];
  const parts = raw.split(/(?<=[.,!?;…])\s+/g);
  const cleaned = parts
    .map((p) => p.trim().replace(/[,;]$/, '').trim())
    .filter(Boolean)
    // Her parça, tek bir altyazı gibi kendi başına büyük harfle başlasın.
    .map((p) => p.charAt(0).toLocaleUpperCase('tr-TR') + p.slice(1));
  return cleaned.length ? cleaned : [raw];
}

// estimateReadMs — bir cümlenin "okunma süresi" tahmini: TV spikeri/röportaj
// konuşması için karakter başına sabit bir süre + taban süre. Çok kısa
// cümleler (ör. "Evet.") ekranda gözden kaybolmasın diye bir taban süresi var.
export function estimateReadMs(sentence, { msPerChar = 58, baseMs = 900, maxMs = 7000 } = {}) {
  const len = (sentence || '').length;
  return Math.min(maxMs, Math.max(baseMs, Math.round(len * msPerChar)));
}
