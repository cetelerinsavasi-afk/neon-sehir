# Pist 2 prototipi (süre hedefi olmadan tasarlanan pist)

İlk prototipten (`pist.html`) bağımsızdır; o aynen duruyor. Bu pistte tek hedef iyi bir pist:
süre kısıtı yok, şehirdeki sürüş mekaniği (yokuş fiziği dahil) aynen korunuyor.

## Çalıştırma

```
npm run preview:gangs
```
Tarayıcıda: `http://127.0.0.1:5199/pist2.html` — kontroller ve test paneli ilk prototiple aynı.

## Dosyalar

| Dosya | Ne |
|---|---|
| `functions/pist2Sim.js` | Pist 2 geometrisi (yükseklik, köprü, değişken bariyer) + fizik + `replayRun`. |
| `preview/pist2.html`, `preview/pist2-app.js` | 3D prototip: arazi, köprü, tribün, pit, test paneli. |
| `preview/pist2Best.js` | Otomatik: her araç × seviye için mükemmel tur (tuş kaydı + süre). |

## Pist

- **"8" şeklinde kapalı devre, ≈ 2,28 km**, 14 m asfalt. Pist kendi üstünden **köprüyle** geçer:
  ilk geçişte alttan, tepeden dönüşte 10 m yüksekteki köprünün üstünden.
- **18 m yükselti farkı**, en dik yer ≈ %6. Yokuş şehirdeki gibi: yukarı yavaşlatır, aşağı hızlandırır.
- Bölümler: uzun ana düzlük → **T1 firkete** (sert fren) → kuzeydoğuya düzlük → köprünün altı →
  **tırmanan S'ler** → **tepe firketesi** → tepede düzlük → uzun sol **kaşık** → inişle **köprü** →
  hızlı **130R** sağ → şikan → son viraj → ana düzlük.
- Sıkı virajlarda iç duvar yaklaşır, dış tarafta geniş çakıl havuzu (gerçek pistler gibi).
- Kapladığı alan ≈ **460 × 640 m** (bariyerler dahil). İlk pistten büyük; haritaya konacaksa
  yer seçimi buna göre yapılmalı ya da `PIST_SCALE` küçültülmeli.

## Süreler

Süre hedefi yok. Panelde "📊 Tüm araçlar" tablosu her araç × seviye için mükemmel turu (bilgisayarın
bulduğu tavan) gösteriyor; yeni ödül süreleri istenirse bu sütun baz alınabilir. Oyuncuların eski
pistte mükemmel tura ≈ %1,5 yaklaştığı görüldü.

## Fizik

`pistSim.js` ile aynı (şehirdeki `stepDrive`), ek olarak şehirdeki yokuş kuralı:
araç yönündeki eğim `gp` (±0,2, yumuşatılmış) ile `v -= ileri × 9,8 × gp × 0,3 × dt`.
Sunucu doğrulaması (tuş kaydını oynatma) aynı şekilde çalışır.
