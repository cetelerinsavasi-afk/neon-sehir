# v194 — Sade şehir ana ekranı + borsa ekranı düzeltmeleri

v191, v192 ve v193'ü de İÇERİR. Bu sürümün eklediği değişiklikler sadece ekranda (Firebase'e bu sürüm için
ek yükleme yok); paket v193'ün borsa / şehir fotoğrafı fonksiyonlarını da yüklediği için `yukle-v194.bat`
Firebase adımını çalıştırır (borsaAction, cronTick, cityAction). Kurallar değişmedi.

## Şehir ana ekranı (giriş yapmış + misafir)
1. Şüphe ve altın tek hap: `🕵️ %x | (altın) miktar`. Şüphe rengi eski mantıkla (%30 sarı, %60 kırmızı),
   altın sarı. Dokununca telefonda Zümrüt Mağazası açılır. Misafirde aynı yerde "🔓 Giriş yap".
2. Sağ sütundaki 👥 kalktı; üst çubuktaki "👥 N kişi yakında ›" (noktalı alt çizgi) Yakındakiler'i açar
   (son mesaj + bildir aynı). NearbyPlayersButton'a `renderTrigger(open)` eklendi.
3. 3D/2D düğmesi mini haritanın alt kenarının ortasında küçük çip.
4. Araba düğmesi: 🚗 yerine çizim araba ikonu (turkuaz, 26 px; yatay ekranda 22 px).
5. Kapalı sohbette son 2 mesaj.
Dokunulmadı: 📷 sağda, 😀 solda, ⏪ 3 yıl önce, mekân düğmeleri sol üstte, Çeteler / Soygun / Profil.
Test: tests/ui/city-hud.test.mjs

## Borsa ekranı
- "‹ Borsa / ‹ mekân" şeridi yana kaydırma yapmıyor, Parara Bank çizgisine yapışık (boşluk yok).
- "Senin hissen" kısa: 28,806693 / 14,31741 → 28,8 / 14,3 (10 ve üstü 1, altı 2 küsurat).
- Sınıra kadar alırken miktar 0,01 hisseye yuvarlanır (yeni uzun küsuratlar oluşmaz).

## Kontrol listesi
- [ ] Hap: şüphe rengi, altın; dokun → Zümrüt Mağazası.
- [ ] "N kişi yakında ›" dokun → Yakındakiler listesi; bir oyuncu → kart / bildir.
- [ ] Mini haritanın altında 3D çipi; dokun → 2D/3D.
- [ ] Araba düğmesi çizim ikon; yatay ekranda da düzgün.
- [ ] Kapalı sohbet 2 satır.
- [ ] Misafir: sol üstte "Giriş yap" hapı.
- [ ] Borsa detayında aşağı kaydır: şerit üstte, yana kayma yok; "Senin hissen" kutuya sığıyor.
