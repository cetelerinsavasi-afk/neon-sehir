# v222 — Yön ve yerleşim düzeltmeleri

## 1. Seyyar satıcılar
- Şehirdeki ve festival alanındaki seyyar satıcıların yönü verilmiyordu: ilk karede kameraya dönüp öyle kalıyorlardı. Artık tezgâhlarına / müşteriye dönük (`buildings.js › buildVendor` yerel yön + `cityEngine` kit dönüşü).
- Festival satıcıları tezgâhın başında sabit duruyor (dolaşmıyor).

## 2. Silahçı
- Silahçı Kemal iki vitrinin arasında yan duruyordu → kapıya / müşteriye dönük.

## 3. Karakol — Komiser
- Makam masası ters duruyordu (koltuk ziyaretçi tarafındaydı) → masa çevrildi, koltuk duvar tarafında.
- **Komiser Yusuf koltuğunda oturuyor** (`chair` işareti: "Komiser" adlı NPC'ler normalde ayakta).

## 4. Araba galerisi
- Galericinin masası da ters duruyordu → çevrildi, Galerici Yusuf koltuğunda müşteri sandalyelerine bakıyor.

## 5. İnternet kafe
- Kasiyer (Kasada Emre) tezgâhın öbür tarafına geçti; tezgâhın duruşu aynı.
- Duvardan dışarı taşan eşyalar içeri alındı: 2 yayın seti (arka duvar), sağdaki koltuk ve içecek dolabı, soldaki 4 atari makinesi.
- Köşedeki hoparlör içeriye dönük (cama / dışarıya bakıyordu).

## 6. Benzinlik marketi
- Kasa tezgâhı ters çevrildi; kasiyer aynı yerde. (Neon Şehir, yol üstü ve Kervankent marketleri aynı yerleşimi kullanır.)

## 7. Kervankent camii ve benzinlik — kamera
- Kervankent 10 m yüksekte olduğu için mekân kamerası oyuncuyu "spor salonunun 2. katında" sanıyordu → kamera tavanın üstüne fırlıyordu.
  Kat yüksekliği artık mekânın kendi zeminine göre (`cityEngine.js`). Kervankent otogarı ve yol üstü marketler de düzeldi.

## Notlar
- Oyunun mekân dosyası (`functions/venueLayouts.js`, sunucuyla ortak) değişmedi; düzeltmeler şehir tarafında (`world/layouts.js › MOVE / NPC_FIX`).
- Sunucu, kurallar, Firestore okuma/yazma değişmedi. Sadece site yayını gerekir.

## Yayın
`v222-yayinla.bat`: dosyaları proje klasörüne kopyalar, testler, derleme, commit, push, Cloudflare.
