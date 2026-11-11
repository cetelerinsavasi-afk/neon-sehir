# v154 · Faz 6 — Şehir içi paneller, pist, taksi durağı, stadyum otoparkı

Sunucu (functions/), kurallar ve Firestore okuma/yazma sayısı DEĞİŞMEDİ. Hepsi istemci + 3D şehir.

## Madde 1 — Fabrika şehir içinde açılır
- `CityScreen.jsx`: Fabrika kapısı artık şehirden çıkarmadan alt panel (Sheet) olarak `FactoryScreen` açar
  (`IN_CITY_REGIONS`). Panel lazy yüklenir.

## Madde 6 — Yarış pisti
- `areas.js`: kerb (kırmızı-beyaz bordür) yönleri düzeltildi, başlangıç çizgisi düz yatırıldı,
  tribünün önüne çarpışma kutusu eklendi.
- Pit kulübesi → **PIT LOUNGE**: epoksi zemin, neon tabela, koltuk, berjer, TV duvarı, bar masası + 3 tabure,
  içecek dolabı, takım dolabı, lastik yığını. Hepsi oturulabilir.
- Pit alanında veya tribün koltuğunda otururken **🏁 Yarış Pisti** düğmesi çıkar; panel şehirde açılır
  (Şampiyona / Bahisli / Antrenman). Yarışa girince şehir duraklar, yarış tam ekran üstte açılır.
- Pist kapısı artık direkt "serbest" değil, aynı yarış panelini açar.

## Madde 7 — Taksi durağı (şehrin dışı)
- Doğu dış halka, stadyumun karşısı (hücre 6,3): `jobBuildings.buildTaksiDuragi`.
  Kulübe, dama şeritli saçak, "TAKSİ DURAĞI" neon tabela, bank, "TAKSİ" totemi, sıra çizgileri ve bekleyen 3 sarı taksi.
- Girilmez / sunucu verisi yok; ana sayfa haritası eşlemesi etkilenmez (MAP_PX'te yok).

## Madde 10 — Stadyum otoparkı
- `stadium.js` `buildStadiumParking`: stadyumun ön (güney) kaldırım şeridinde 2 × 7 = 14 park yeri,
  asfalt zemin + beyaz çizgiler + iki mavi "P OTOPARK" tabelası. Ana giriş önü yayalara açık,
  kaldırım lamba/ağaç hizaları boş bırakıldı. Arabalar bu şeride zaten girebiliyordu (fizik değişmedi).

## Test
- `vite build` ✓ · oxlint: hata yok (yalnız eski uyarılar) · functions testleri 575/575 ✓
- tests/city ✓ (tests/webview/probe.mjs cihaz gerektirir, önceden de başarısızdı)
- Playwright görsel kontrol: pit lounge, yarış paneli, taksi durağı, stadyum otoparkı.
