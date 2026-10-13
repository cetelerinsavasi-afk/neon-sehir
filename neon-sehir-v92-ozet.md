# Neon Şehir v92 — değişiklik özeti

## Faz 1 — Hızlı düzeltmeler
- **Silah dolabından alınan silahlar** elde dolaptaki modelin aynısı (boy/görünüm): tüfek, pompalı, tabanca. Dolap da artık 2 tüfek, 2 pompalı ve rafta 2 tabanca gösteriyor.
- **"NEON ŞEHİR" neonu:** yazı tabelaya sığacak şekilde otomatik küçülüyor.
- **8 yeni manzaralı pencere:** Gün Batımında Yol, Gündüz Şehir, Deniz, Orman, Karlı Dağlar, Kuzey Işıkları, Boğaz, Uzay.
- **Davet butonu:** davet edilen arkadaşın yanında ✓ çıkıyor.
- **iPhone'da soldan sağa kaydırma** artık "oyundan çık" ekranını açmıyor. Android'de geri tuşuyla çıkmak için iki kez basmak gerekiyor.
- **Mekânların 2D görünümü:** her yere kaydırılabiliyor, iki parmakla yakınlaştırılıp çevrilebiliyor. 🎯 butonu kamerayı oyuncuya döndürüyor.

## Faz 2 — Yeni mobilyalar
- ~60 yeni eşya, 11 yeni kategoride: Müzik Stüdyosu, Yayın Seti, Sinema, Havuz & Bahçe, Boks, Mafya, Hapishane, Benzinlik, Helikopter, Çiftlik, Kamp. Ayrıca Market Arabası, Simit Arabası ve "AÇIK" neonu.
- Bilardo, koltuklar, avize gibi zaten var olanlar tekrar eklenmedi. Casino Royale, Mahkeme ve Arcade konseptleri eklenmedi.
- **Sinema perdesi:** 1 dakikalık çizgi film oynatıyor (Kedi ile Fare). Açılıp kapatılabiliyor ve herkes aynı sahneyi görüyor.
- **Market:**
  - Raf 5 ürün taşıyor: çikolata, cips, bisküvi, makarna, kola.
  - Market arabası alınıp itilebiliyor. Araba eldeyken raftan alınanlar arabaya giriyor (en fazla 12 ürün).
  - Araba bırakılınca ya da mekândan çıkılınca içindekilerle birlikte kayboluyor.
- **Yeni zeminler:** otopark, asfalt, yol, çim, kum ve diğerleri. **Yeni duvarlar:** 14 manzara/tema duvarı.
- **Patron Masası:** 8 renk seçeneği var.

## Faz 3 — Tasarla modu
- **👁️ Göz butonu:** sahip, satın alınmamış (deneme) eşyaları gerçek haliyle görüyor. Bu görünümü sadece o kişi görüyor.
- **➕ Yetki ver:** arkadaşlar listesinde "Yetki ver" ve "Yetkiyi kaldır" var.
  - Yetkili kişi, sahibin envanterinden ve mağazadan (deneme olarak) eşya koyup kaldırabiliyor.
  - Satın alma sadece sahipte.
  - Değişiklikler canlı olarak herkese yansıyor.

## Faz 4 — Garson (Cafe / Bar)
- Sol üstteki "Garson ol" butonuna basınca buton "Garson: isim" olarak değişiyor. Bir mekânda tek garson olabiliyor; garson mekândan çıkarsa görevi düşüyor.
- Garson varken menüden verilen siparişler garsona gidiyor. Garsonun "Menü" butonu "Siparişler (n)" oluyor ve her sipariş için 20 saniyelik sayaç işliyor.
- **Zamanında teslim:** 100 altınlık siparişten 10 vergi, 10 garson maaşı, 80 sahibe gidiyor.
- **Geç teslim:** ürün müşteriye kendiliğinden gidiyor, maaş ödenmiyor ve garson görevden alınıyor (hemen yeniden başvurabilir).
- Dükkân sahibi de garson olabiliyor. Aynı kurallar geçerli, tek fark maaş almaması.
- Cafe/Bar günlük raporunda artık **Maaş** gideri ayrı satır olarak görünüyor.

## Faz 5 — Profil › 📊 Günlük Rapor
- Bugün (canlı) ve önceki 2 gün için cebe giren ve çıkan altın kaynak kaynak listeleniyor: işletme, maaş, soygun, mağaza vb.
- Sunucuda tüm altın değişimleri tek noktadan sayılıyor (`goldLedger` tetikleyicisi). Kaynağı bilinmeyen değişimler "Diğer" altında görünüyor.

## Faz 6 — Maç sohbeti ve yayın
- **Stadyum › Maçlar › Maç Sohbeti:** her gün 00:00'da açılıyor ve ertesi 00:00'a kadar sürüyor. Dokununca büyüyor, tekrar dokununca küçülüyor.
- **Bağışçı listesi:** ilk 3 kişi gösteriliyor. Günlük 10.000 tavanına ulaşan her bağışçı listeye bir satır ekliyor (en fazla 10).
- **Bağış bildirimi:** dokununca kapanıyor (yayıncıda da izleyicide de).
- **Yayıncı kendi mesajlarını** sohbette "🎥 Sen" olarak görüyor.
- **⚽ Maç butonu:** 18:00–19:00 arası (şampiyonluk kutlaması günü hariç) sol altta çıkıyor.
  - Basınca yayın köşeye küçülüyor ve Maçlar açılıyor.
  - Yazılanlar yayın sohbetine gidiyor (avatarın üstünde balon çıkmıyor).
  - Maç sohbeti salt okunur.

## Faz 7 — 📋 Hatırlatıcı
- Araba galerisinde araba yoksa: "1 araba galerinin envanterine ekle".
- Silahçıda silah, tamir malzemesi ya da silah geliştirme malzemesi yoksa, her eksik için ayrı hatırlatma çıkıyor.
- Günlük spor salonu antrenmanı (19:00–19:00) yapılmadıysa hatırlatma çıkıyor. Futbol takımındaki oyuncuya çıkmıyor.

## Faz 8 — Mekânlar 3D
- **3D'ye taşınan mekânlar:** Camii, Banka, Gazino, Karakol, Araba Galerisi, Silah Mağazası, Modifiye Garajı ve Park. Spor salonu gibi 3D gezilebiliyorlar.
- **İşlevler aynı kaldı:** ibadet, imam, dilenciler, banka, numara alma, slot, piyango, 10 Numara, bar, rüşvet, komiser, araba alma, silah alma/atölye, usta, büfe, şüpheli adam ve soygun butonları.
- **NPC'ler:** veznedarlar, barmen, biletçi, memur, komiser, galerici, silahçı, usta, şüpheli adam ve büfeci. Hepsi konuşuyor; NPC'ye dokununca oyuncu yanına yürüyor ve ilgili panel açılıyor. İmam ve dilenciler camide gerçek oyuncular olarak görünüyor.
- **Park açık hava:** tavan yok, gökyüzü görünüyor.
- Gazino ve parkta alınan ya da ısmarlanan içecek 3D'de de elde görünüyor.
- Fotoğraf çekme (Sixtagram), sohbet, hareketler, 2D/3D görünüm ev ekranındaki gibi çalışıyor. Fotoğraflarda NPC'ler de çıkıyor.
- **Eski konum kayıtları korunuyor:** ziyaret sayaçları, "kaç kişi var", ısmarlama ve mekân kontrolleri eskisi gibi çalışıyor.
- **Yedek davranış:**
  - Giriş yapmamış oyuncu eski 2D mekânı görüyor.
  - Sunucuya ulaşılamazsa da 2D mekân açılıyor.
- **32 yeni mekân mobilyası.**
  - Satılanlar: Seccade, Cami Avizesi, Rahle, Ayakkabılık, Çini Pano, Yer Minderi, Bağış Kutusu, Vezne Gişesi, Sıramatik, Sıra Ekranı, Kasa Dairesi Kapısı, Sıra Bariyeri, Bekleme Koltuğu, Slot Makinesi, Rulet Masası, Kart Masası, Piyango Gişesi, Polis Bankosu, Türk Bayrağı, Arananlar Panosu, Döner Sergi Platformu, Showroom Tabelası, Atış Hedefi, Araba Lifti, Fıskiyeli Havuz, Kaydırak, Salıncak, Büfe Kulübesi, Park Çöp Kutusu, Güvercinler.
  - Mihrap ve Minber satılmıyor; sadece Camii'de var.
  - Fiyatlar benzer eşyalara göre ayarlandı.
- Oyunun mekânlarında eşyadan ücretsiz ürün alınamıyor (bar ve büfe ücretli).

## Rehber
- Garson, Tasarım Yetkisi, Yayında Maç ve 3D Mekânlar için yeni sayfalar eklendi.

## Yükleme sırası (önemli)
1. **Önce kurallar:**
   ```
   firebase deploy --only firestore:rules
   ```
   Yeni alanlar (market arabası, garson, rapor, maç sohbeti) kurallardan önce web'e çıkarsa bazı yazmalar reddedilir.
2. **Sonra fonksiyonlar.** Neredeyse hepsi değişti; yeni tetikleyici `goldLedger` da var.
   ```
   firebase deploy --only functions
   ```
   Kota hatası çıkarsa `deploy-parcali.ps1` kullanın; listeye `goldLedger`, `houseAction`, `shopAction`, `streamAction`, `businessRollover`, `expireInteriorPresence`, `buyFromBufe`, `buyFromGazinoBar`, `giftHeldItem` eklenmeli.
3. **En son web/uygulama:**
   ```
   npm run build
   ```
   ve ardından hosting / Android.
- 3D mekân evleri (`houses/game_*`) ilk girişte kendiliğinden kuruluyor. Ek bir işlem gerekmiyor.
- **Maliyet notu:** `goldLedger`, `users` belgesi her güncellendiğinde çalışır. Altın değişmediyse hiçbir şey yazmadan hemen çıkar.

## Kontroller
- `npm --prefix functions test`: 332/332 geçti.
- `npm run build`: başarılı.
- Lint: hata yok.
- Tüm fazlar önizlemede ekran görüntüsüyle denendi.
