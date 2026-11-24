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

## v197 — ek (24.11 akşam)
- **Yarış NİTRO çubuğu:** HUD'da sol (süre + mini harita) ve sağ (hız) sütunlar sabit 132 px'ti; telefonda orta sütun ~0'a düşüp çubuk görünmüyordu. Yan sütunlar içerik kadar, orta en az 110 px (360 px ekranda çubuk ~150 px; tarayıcıda denendi). Dar ekranda süre / hız yazısı biraz küçüldü.
- **Antrenman / lobi araç resimleri:** üstten (kuşbakışı) çizim yerine aracın gerçek 3D modeli (`CarThumb` → `CarImg`, oyunun her yerindeki resimle aynı).
- **Tavan / zemin modu düğmeleri kalktı** (karargah ve ev). Evde tavan eşyası (avize) hâlâ seçilir: dokunulan yerde yer / duvar eşyası yoksa tavandaki.
- **Ev duvar kaplaması 4 kenarda aynı ölçekte:** çatı katının üçgen alınlıklarında doku metre başına 3 kat sıktı (2 duvar küçük, 2 duvar büyük tuğla). Alınlık UV'si diğer duvarlarla aynı ölçeğe alındı; çatı katının kesit dibi de kendi katının kaplamasını kullanıyor (1. katınkini gösteriyordu). Tarayıcıda yan yana çizilip karşılaştırıldı.
- **Bar taburesi (ve kafe masası, bar masası, manken, gitar standı) tabanı halının altında kalıyordu:** ince taban (0–3 cm) halının (1,1–1,3 cm) içine gömülüyordu; taban halının üstüne alındı.
- **İnternet kafe girişi açıldı:** v197'de girişe konan bekleme köşesi (armut koltuklar + sehpa) kapının önünü kapatıyordu; kaldırıldı.
- **Deneme eşyalar evde kalır:** Bitti'de sepet doluysa "Sonra al (evde kalsın)" — eşyalar yarı saydam olarak evde durur, parası yetince 🛒 Sepet'ten alınır (sepetteki İptal kaldırır). Ziyaretçi satın alınmamış duvar / zemin kaplamasını görmez.
- **Para güvenliği:** sunucu satın alırken envanterde aynı eşya varsa önce onu kullanır (aynı eşya iki kez ödenmez; sepet de bunu gösterir); "Onayla ve Satın Al"a çift dokunuş tek istek gönderir; aynı anda iki satın alma isteğinden biri reddedilir. Testler: `functions/scripts/v197.test.mjs`.
- **Garajdan çıkış:** binince araç "sıkıştı" sayılıp garaj duvarından yana itiliyordu (sola kayıp çıkamıyordu). Garajın içinde ve ağzında araç duvara çarpmış sayılmaz, garajın ortasında düz ileri / geri gider; ağızdan çıkınca normal sürüş.
- **Tasarla › ✓ Bitti = kaydet ve çık:** satın almak şart değil; deneme eşyalar evde yarı saydam kalır, istenince 🛒 Sepet › Alışverişi Tamamla ile alınır. Kayıt olmazsa da çıkılır.
- **Yarım kalan tasarım kaybolmaz:** her değişiklik cihaza taslak olarak yazılır (localStorage, Firestore'a ek okuma / yazma yok). Oyundan atılınca eve tekrar girildiğinde Tasarla kendiliğinden açılır, kaldığı yerden devam edilir. Kaydedilince taslak silinir; ev başka cihazdan değiştiyse eski taslak atılır. Sunucu kayıt / satın alma yanıtında `updatedAtMs` döner.
- **Arkadaşın evine girince kendi evine giriliyordu:** Evler listesi artık dışarıda (çitlerin içinde) açıldığı için seçilen ev, içeri girmeden önce sıfırlanıyordu. Ziyaret sadece evden çıkınca sıfırlanır.
- **Kitaplık:** tabanı halının üstüne alındı (süpürgelik eklendi). Kutusu olan eşyalar artık duvara sıfır oturur (döndürülmüş kutunun kenarı duvara değer, 20 cm yakında mıknatıs); sunucudaki duvar payı 0,30–0,35 m → 0,10 m (`WALL_GAP`, çatı katının yan duvarları aynı).
- **Camii imamı:** şehirdeki camide imam NPC'si oyundaki imamın kendisi (adı + görünüşü, "🕌 İmam Ad"); imam yoksa NPC yok. İmamın son vaazı (nasihatı) 30 sn'de bir başının üstünde balon olur (vaaz yoksa "Namaza gelin…"). Veri zaten dinlenen `imamState/current` belgesinden — ek Firestore okuması yok.
