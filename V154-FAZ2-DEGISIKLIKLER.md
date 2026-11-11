# v154 · Faz 2 — Soygun ayarları, yeni satıcılar, kafe şüphe düşürme kaldırıldı

## Yeni soygun tablosu (sunucu `HEIST_CONFIG` + oyun `HEIST_LABELS` aynı)
| Hedef | Ödül | Gereken güç | Şüphe |
|---|---|---|---|
| Köfteci | 2.000 | 1.000 | 5 |
| Balık Ekmekçi (eski Dönerci) | 3.000 | 1.500 | 5 |
| Simitçi | 4.000 | 3.000 | 5 |
| Kokoreçci | 5.000 | 4.500 | 5 |
| **Midyeci (yeni)** | 6.000 | 6.000 | 5 |
| **Dondurmacı (yeni)** | 7.000 | 7.500 | 5 |
| **İnternet Kafe (yeni hedef)** | 10.000 | 10.000 | 10 |
| Fabrika | 25.000 | 20.000 | 15 |
| **Silahçı (yeni hedef)** | 50.000 | 40.000 | 20 |
| Galeri | 125.000 | 60.000 | 30 |
| Casino | 250.000 | 80.000 | 40 |
| Banka | 500.000 | 100.000 | 50 |

- **Modifiye Garajı soygun listesinden çıktı.** Açık kalmış eski Modifiye ekip planı başlatılamaz
  ("Bu mekân artık soyulamıyor"), ekip ayrılabilir, plan 24 saatte kendiliğinden kapanır.

## Seyyar satıcılar
- **Dönerci → Balık Ekmekçi:** oyundaki her yerde adı, ürünü (balık ekmek), arabası (yeni balık ekmek
  arabası + mavi neon) ve satıcının sözleri değişti. **İç kimlikler aynı** (`seyyar_satici_3`, `donerci`) —
  oyuncuların günlük kayıtları, istatistikleri bozulmaz. Oyuncuların kendi evlerindeki "Döner Arabası"
  eşyası olduğu gibi duruyor.
- **2 yeni satıcı:** Midyeci (`seyyar_satici_5`, Bar'ın köşesi) ve Dondurmacı (`seyyar_satici_6`,
  Stadyumun kuzeydoğu köşe meydanı). Şehirde yerleri, arabaları (midye tezgâhı, Maraş dondurma arabası),
  satıcıları, menüleri, bağış (−5 şüphe) ve haraç var; harita tıklanınca şehirde yanlarına gidilir.
- Yeni arabalar ve tabelalar **sadece oyunda** — mobilya mağazasında satışa çıkmaz.
- **Şehirde Balık Ekmekçi ile Köfteci'nin yerleri değişti:** artık haritadaki yerleriyle aynı
  (Balık Ekmekçi fabrikanın önünde, Köfteci evlerin yanında). Eskiden şehirde ters duruyorlardı.
- **Harita resmi** (`src/assets/sehir-haritasi.jpg`) yeni etiketli harita oldu (6 satıcının adı yazıyor),
  dosya boyutu eskisinden küçük (547 KB).

## Kafe & Bar şüphe düşürme kaldırıldı
- Şüphe sekmesindeki Kafe & Bar kartı ve kafe/bar içindeki "−10 şüphe" butonu yok.
- Sunucu kafe/bar harcamasını artık biriktirmiyor (menü alışverişinde **1 okuma + 1 alan yazımı daha az**).
- Eski uygulama çağırırsa: "Kafe & Bar şüphe düşürme kaldırıldı."

## Belediye › Teşkilat Bakanlığı › Soygunlar
- Hedef listesi yeni tabloya göre (Silahçı, İnternet Kafe eklendi). Haraç artık **satıcı satıcı ayrı satır**
  (önceden tek "Haraç" satırıydı). Dünkü raporda eski "Haraç" / "Modifiye" satırları varsa onlar da görünür.
- Ticaret Bakanlığı seyyar satıcı satışları: Balık Ekmekçi, Midyeci, Dondurmacı satırları.

## Firestore maliyeti
Yeni dinleyici / yeni okuma yok. Menü alışverişinde 1 okuma azaldı. İstatistikler aynı yazımın içinde.

## Yayın sırası
1. `firebase deploy --only functions` — önce sunucu (yeni satıcılar ve tablo sunucuda tanınsın).
2. Hemen ardından web build + deploy.
   (Arada eski istemci Modifiye'yi soymaya çalışırsa "Geçersiz soygun hedefi" alır — zararsız.)
3. Faz 1'deki `firebase deploy --only database` yapılmadıysa onu da yap.

## Dosyalar
Sunucu: `functions/index.js`, `vendorData.js`, `venueLayouts.js`, `houseCatalogData.js`, `policeRules.js`,
`venue.js`, `visits.js`, testler (`scripts/v145`, `venue`, `houses`).
Oyun: `src/data/regions.js`, `HeistPanel.jsx`, `SoygunTab.jsx`, `SuspicionTab.jsx`, `HouseScreen.jsx`,
`NewspaperScreen.jsx`, `BakanliklarTab.jsx`, `Venue3D/VenueLayer.jsx`, `City/buildings.js`, `City/cityPlan.js`,
`HouseScreen/houseCatalogV145.js` (3 araba + 3 tabela), `HouseScreen/heldArt.js` (balık ekmek, midye),
`src/assets/sehir-haritasi.jpg`. Silindi: `Venue/CafeCalmButton.jsx`.
Önizleme (build'e girmez): `preview/mekan.html`, `preview/mekan-app.jsx`.

## Telefonda kontrol listesi
1. Haritada 6 satıcının adı doğru; Midyeci ve Dondurmacı'ya tıklayınca şehirde yanlarında doğuluyor.
2. Midyeci / Dondurmacı: Bağış yap (−5 şüphe) · Haraç kes · Menü (midye / dondurma ele geliyor).
3. Balık Ekmekçi: fabrikanın önünde, mavi balık ekmek arabası; menüden balık ekmek ele geliyor.
4. Mekanlar › Soygun: yeni liste ve değerler; Modifiye yok.
5. Mekanlar › Şüphe: 6 satıcı, Kafe & Bar kartı yok; kafede "−10 şüphe" butonu yok.
6. Belediye › Teşkilat raporu ertesi gün satıcı satıcı haraç satırlarını gösteriyor.
