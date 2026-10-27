# v134 — Değişiklikler

Bu klasördeki dosyaları proje klasörünün (neon-sehir) üstüne kopyala (aynı yollar). Sadece değişen / yeni dosyalar var.

## Deploy
- **Frontend:** her zamanki gibi (push → canlı).
- **Functions:** `houseAction, gangAction, gangClock, shopAction, hourlyInvestmentUpdate, dailyReset, dailyResetRecovery, resignFromPolice`
  - Yeni fonksiyon adı YOK, Firestore kuralı / index değişikliği YOK.
  - Misafir ekranları `houseAction` ve `gangAction` yüklenmeden boş kalır → önce functions, sonra frontend.

## Yapılanlar
| Madde | Nerede |
|---|---|
| Piyasa değeri — fabrika / Mağaza ilan ekranı (diğer satıcıların en ucuzu, ilan yoksa oyunun fiyatı) | MarketplaceScreen.jsx (MagazaSellForm) |
| Piyasa değeri — silahçı / galerici fiyatlar (oyunun mağazasının o anki fiyatı = diğer dükkânların en ucuzu) | ShopOwnerPanels.jsx, useShopOffers.js |
| Piyasa değeri — çete 2. el ilanı (galericinin alacağı fiyat: %75 alış ya da daha ucuz sıfır ilan) | gang/actions/market.js `quoteMarketValue`, TradeTab.jsx |
| Piyasa değerine dokununca fiyat ona ayarlanır | aynı yerler |
| Vitrine eklerken ucuz alış: eski fiyat üstü çizili + yeni fiyat | ShopOwnerPanels.jsx (StockAdd) |
| Çete araba / silah ilanı avantajlıysa 7 gün sonra oyuna satılır + "7 gün içinde otomatik satılır" yazısı | market.js, TradeTab.jsx |
| Silahçıdan alınca butonda "Satın Alındı ✓" (son adet alınınca ürün hemen kaybolmaz) | WeaponShopScreen.jsx, ShopShowcase.jsx |
| Mekâna girince ana kapının baktığı yöne dönük doğma | houseDoor.js `doorSpawnYaw`, houseEngine.js |
| Mekân botlarına dokunulmaz (dokunuş arkadaki zemine gider) | houseEngine.js |
| Günlük faiz yazısı kısaldı + 100.000'de MAX | BankScreen.jsx |
| Soygun: güç çubuğu 40.000'de dolu · kendi ekibin en üstte · (i) kaldırıldı | SoygunTab.jsx, HeistPanel.jsx |
| Gazete: günün en büyük belediye bağışçısı | belediye.js, GazeteScreen.jsx |
| Kripto: 50.000 altında %75 yukarı, 400.000 üstünde %75 aşağı | index.js hourlyInvestmentUpdate |
| Polislikten istifa teşkilat sohbetinde görünür | gang/actions/intel.js |
| Ticaret Bakanlığı: 2. el satış vergisi kutusu kaldırıldı | BakanliklarTab.jsx |
| Cafe/bar: garson varsa Menü butonu yok; garson yoksa Menü solda | HouseScreen.jsx |
| Ziyaret: "Ofisler" kategorisi (Evler listesinden ofisler ayrıldı) | VisitTab.jsx |
| Misafir paneli: oyunun mekânları yeni 3D hâliyle gezilir, oyuncu işletme/ofislerine girilir, Çeteler + Savaşlar, Stadyum puan durumu, Belediye (ücretsiz çay/su) | Guest/*, GuestGangs.jsx, GuestFutbol.jsx, houses.js, gang/system.js, App.jsx, BusinessHub.jsx |
| Futbol › Oyuncu sat: "Anında sat" kalktı, "Listele" → "Oyuncuyu sat", anında sat Max'ın altında (onaylı) | FutbolTransfer.jsx |
| Mekânda diğer oyuncuları görememe hatası (cihaz saati yanlış olunca herkes "bayat" sayılıyordu) | presenceClock.js, HouseScreen.jsx, useInteriorPresence.js, useParkPresence.js |
| Mekân sohbeti mesajları 1 saat sonra kaybolur | HouseScreen.jsx |
| Profil › Günlük rapordaki iki açıklama yazısı kaldırıldı | DailyReport.jsx |

Kontrol: oxlint (hata yok), vite build başarılı, functions testleri 503/503.
