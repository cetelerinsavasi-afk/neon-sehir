# v197 — oyuncu bildirimleri (24.11 akşam)

Yükleme: kök klasördeki **`deploy-push.bat`** (temizlik → derleme → testler → Firebase fonksiyonları → git push → Cloudflare). `BUILD 201`, `minBuild 201`.

## Ev
- **Tasarla modu = karargah tasarımı:** önce dokunarak seç, seçili eşyayı parmakla sürükle (tuttuğun yerden, zıplamaz); seçili olmayan eşyanın / boş yerin üstünden sürükleyince kamera döner; boş yere dokununca seçim kalkar (eşya artık ışınlanmaz). İki parmak: **parmakların altındaki noktaya** yakınlaş / uzaklaş + kaydır (eskiden sadece ortaya). Fare: tekerlek imlecin altına, sağ tuş kaydırır. Fark: üstte kat seçici.
- Karargahtaki **👁️ Göz** (deneme eşyaları gerçek haliyle), **tavan modu** (avize / pervane seçilir; kapalıyken tavan eşyaları altındakileri kapatmaz) ve **↶ Geri al** eklendi.
- **Duvar / zemin kaplaması:** satın alınca o oturumda da hemen "senin" (sepete tekrar girmiyordu → zümrüt istiyor gibi görünüyordu). Bir kez alınan kaplama bütün katlarda ücretsiz; sunucu iki katta seçilen aynı kaplamayı tek kez ücretlendirir (test: `functions/scripts/v197.test.mjs`). Kaydettikten / satın aldıktan sonra çıkışta ev yeniden yüklenir (bayat sepet yok).
- **Evler** düğmesi sadece müstakil evlerin bahçe çitlerinin içinde (yolda / kaldırımda çıkmaz).

## Araçlar
- Profildeki ❤️ kalktı; **🚗 Arabalarım** listesinde her aracın sağ üstünde ❤️.
- **Garajda herkes kendi aracını görür** (kimin evinde olursa olsun, dışarıdan da): `users.favGarage` (❤️ ve eve girişte sunucu yazar — ek okuma yok). Araç yoksa garaj boş.
- Garajdaki araca yaklaşınca **🚗 Bin** → araç garajdan çıkar, sürersin; araç kaldırılınca garaja geri gelir.

## Fabrika
- Kuruluşta ve makine alırken fiyatın altında **vergi tutarı** yazar (fiyat vergi dahil); kuruluşta toplam vergi satırı.
- Günlük raporda **Toplam ciro** (`dailyGrossIncome`).
- ✏️ ikinci kez basınca isim düzenleme kapanır.

## Belediye
- **Ticaret Bakanlığı "Ekran yüklenemedi":** v196'da kalkan oranlar (sıfır satış, gazino / ofis / depo) `RATE_BY_ID[...]` boş olunca ekranı çökertiyordu. Bilinmeyen oran artık "—"; eski sıfır satış tablosu sadece kayıt varsa görünür.
- Sanayi'deki **işçi maaş vergisi** kutusu kalktı (işçi sistemi yok; eski kayıt varsa "(eski)" olarak görünür).

## Mekânlar
- **Spor salonu:** üyelik alınamıyordu (sunucu oyunun salonunu "kapalı" sayıyordu, oyuncu salonları da v196'da kalktığı için hiçbir salon kalmamıştı). Üyelikten sonra antrenman şehirdeki salonda: üstte sıradaki alet düğmesi + sağ üstte görev ağacı → mini oyun → güç sonucu.
- **Spor salonu ↔ Camii yer değiştirdi** (camii (4,0), spor (4,1)). Otobüs durağı 3 "Spor Salonu" oldu, kurye adresleri güncellendi, Rıza Amca'nın camii görevi doğru yere gider (v196'dan beri eski yerdeydi). Ana sayfadaki harita resmi çizim — salonu eski yerinde gösterir; resim yenilenirse `cityMapMath.js` `MAP_PX`'e salonun yeni pikseli eklenir.
- **İnternet kafe:** ayakta oynanmaz / yayın açılmaz. Bilgisayarın karşısındaki koltuğa (konsolda kanepeye) oturunca **🎮 Oyun oyna**, yayın setinin koltuğuna oturunca **🔴 Yayın aç** (+ 🧍 Kalk). Yayın masalarının arkasındaki kameralar kalktı; arka duvara neon tabela, konsol köşesine halı, girişe armut koltuklu bekleme köşesi. Evdeki oyun cihazları da aynı kural (arcade makinesi ayakta oynanır).
- **Cafe / Bar "menü boş":** oyunun mekânlarında menü sabit fiyat listesinden (`MENU_PRICES`) gelir; cafe ve bar ayrı menü.

## Görünüm
- **Rüşvet Ver, Polis Teşkilatına Katıl, İmam, Polis / İmam Kitapçığı** panelleri yeni tasarımda (cam panel, ikonlu başlık, etki çipleri, büyük düğmeler; kitapçıklar sayfa noktalı). Ortak: `NeonBooklet`, `RolePanels.css`, `SimpleActionScreen` (yeni `icon / title / chips` alanları).

## Okuma / yazma
- Garaj: ek okuma yok (oyuncu belgesi zaten dinleniyor). ❤️'de ve eve girişte (değiştiyse) 1 alan yazılır.
- Spor: değişmedi (üyelik + 3 adım).
