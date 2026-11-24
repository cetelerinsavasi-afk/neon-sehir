# Pist prototipi (yeni yarış pisti)

## Çalıştırma

```
npm run preview:gangs
```
Tarayıcıda: `http://127.0.0.1:5199/pist.html`

Klavye: W/↑ gaz · S/↓ fren-geri · A/D direksiyon · Shift (veya N) nitro · Space el freni ·
R yarışı başlat · F serbest tur · C kamera. Telefonda ekranda düğmeler çıkar.

## Dosyalar

| Dosya | Ne |
|---|---|
| `functions/pistSim.js` | Pist geometrisi + yarış fiziği (şehirdeki `stepDrive`'ın deterministik kopyası), tuş kaydı, `replayRun` (sunucu doğrulaması). three.js'e bağlı değil; sunucuda da çalışır. |
| `preview/pist.html`, `preview/pist-app.js` | 3D prototip: şehirdeki araba modelleri (`vehicles.js`), pist görselleri, HUD, serbest tur / yarış, test paneli. |
| `preview/pistBest.js` | Otomatik üretildi: her araç × seviye için "mükemmel tur" (tuş kaydı + süre) ve eski pistteki karşılıkları. |

## Pist

- Kapalı devre, **1.208 m**, 13 m asfalt, virajlarda kerb, sıkı virajların dışında çakıl havuzu,
  merkezden 17 m'de bariyer (beton duvar + lastik + tel çit). Yarış **tek tur**, grid'den kalkış.
- Bölümler: uzun ana düzlük → T1 firkete (sert fren) → kısa düzlük → hızlı S'ler → şikan →
  arka düzlük → uzun sol kavis → çift tepe noktalı son viraj.
- Kapladığı alan bariyerlerle ≈ **550 × 190 m**. Uzun kenarı doğu-batı yönünde konursa
  maden (z ≈ −634) ile park (z ≈ −372) arasındaki ≈ 260 m'lik şeride sığar; karargahlar–köy
  arasında da aynı ölçüde bir şerit yeterli. Ölçek tek sabitten: `PIST_SCALE`.

## Zorluk ayarı (kalibrasyon)

"Mükemmel tur" = bilgisayarın binlerce tuş dizisini deneyerek (beam search) bulduğu en hızlı tur.

- Eski pist (raceSim.js), Üstün Cabrio sv3: aynı yöntemle **24,15 sn**; oyuncu rekoru 24,5 sn.
- Yeni pist, Üstün Cabrio sv3: **24,15 sn** → 25 sn altı yine ancak neredeyse hatasız turla.
- Yöntem eski pistte rekorun 0,35 sn altını buluyor, yani oyuncular tavana çok yakın; yeni
  pistte de aynı ilişki beklenir.

## Fizik (şehirle aynı)

`cityEngine.js → stepDrive` birebir: aynı direksiyon, ivme, sürtünme, yol tutuşu, el freni.
Yarışa özel eklemeler:
- **Seviye (1-3)**: hız ×1 / 1,06 / 1,12 · ivme ×1 / 1,08 / 1,16 · yol tutuş ×1 / 1,04 / 1,08 (`LEVEL_MUL`).
- **Nitro**: süre ve gücü eski yarıştaki formülden (fiyat + seviye). Shift ile.
- **Zemin**: çim ve çakıl yavaşlatır, yol tutuşu düşürür; bariyer çarpınca hız kaybettirir.
- Sadece `+ − × ÷ √` ve raceSim'deki `dsin/dcos/dexp` → aynı tuş kaydı her cihazda ve
  sunucuda aynı süreyi verir (prototipte sonuç ekranındaki "Sunucu doğrulaması" bunu gösterir).

## Hız dengesi (karar gerekiyor)

Şehirdeki araç değerleriyle ucuz araçlar eski piste göre çok daha yavaş (ör. Klasik Tur sv3:
eski 50,7 sn → yeni 75,2 sn). Şampiyona ödülü süreye bağlı ve tüm araçlar için ortak tablo olduğu
için bu, ucuz/orta araçların ödüllerini düşürür. Panelde iki seçenek var:
- **Şehirdeki gibi**: araçlar şehirdeki hızlarıyla.
- **Eski yarış dengesi**: araç × seviye başına küçük bir hız+ivme çarpanı (`DENGE_ESKI`) ile her
  aracın mükemmel turu eski pistteki mükemmel turuna denk gelir → ödül tablosu hiç değişmez.

## Oyuna entegrasyon (öneri)

1. Pisti dünya koordinatına yerleştir (öteleme + dönüş); `pistSim` pist yerel koordinatında kalır.
2. Pistin bir girişi olur (bariyerde boşluk); yarış dışında araba ile girilip serbest tur atılır.
3. "Yarışı başlat": oyuncu grid'e ışınlanır, giriş kapanır (bariyer kesintisiz), 5 ışık, tek tur.
4. Sunucu: `raceTa.finish` içinde `raceSim.replayRun` yerine oda motoru `pist` ise
   `pistSim.replayRun(catalogId, level, runs, { nitro, denge })`. Süre yine sunucuda hesaplanır;
   hızlandırılmış saat koruması aynen kalır.
5. Eski 2D yarış ekranı (`TimeAttackRace`) yerine şehir motorunun pist bölgesi kullanılır.

## Bilinen sınırlar (prototip)

- Pist düz (yokuş yok) — determinizm ve basitlik için.
- Rakip yok; hayalet (mükemmel tur / rekorum) var.
- Rekorlar sadece bu tarayıcıda (localStorage) tutulur.
