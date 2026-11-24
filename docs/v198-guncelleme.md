# v198 — oyuncu bildirimleri (24.11 gece)

Yükleme: `_v198\v198-yukle.bat` (dosyaları kopyalar → `deploy-push.bat`: derleme → testler → Firebase fonksiyonları → git push → Cloudflare). `BUILD 203`, `minBuild 203`.

## Asıl sebep: şehre taşınınca eski ekranın eylemleri gelmemişti
v196'da evler ve mekânlar şehrin içine taşındı ama eski ev / mekân ekranının (HouseScreen) eşya eylemleri şehre aktarılmadı. Bu güncellemede eski davranışlar şehirde yeniden kuruldu:
- **Kumarhane:** slot, rulet, 10 Numara, piyango ve bar istasyonları şehirde hiç yoktu (`cityEngine` istasyon listesinde gazino eksikti). Artık makineye / masaya yaklaşınca düğme çıkar.
- **Evde çalgılar:** piyano / davul taburesine oturunca "Çal" (aynı anda tek kişi, evdeki herkes duyar — Realtime Database, Firestore yok). Mikser konsolu ("Müzik yap") ve tuval ("Resim çiz") ev sahibine. Sunucu: kendi evindeki mikser için housePresence aranmıyor (`venue.js isOwnHome`).
- **Evde eşya eylemleri:** lamba / TV / şömine aç-kapat, buzdolabı / kahve makinesinden ürün al (elde 2 dk). Sadece cihazda, Firestore'a yazmaz.
- **Duvar bölücüler** (2 m, 4 m, kapılı) yine o katın duvar kaplamasıyla aynı desende.
- **Büyük bitki** evde gerçek modeliyle; şehirde/mekânlarda hafif hali de artık yapraklı (top değil).
- **Cafe / bar:** "geldi" yazıp hiçbir şey gelmiyordu → garson ürünü elinde getirir, yanına gelince ürün eline geçer. Tezgâha yaklaşınca da "Sipariş ver".
- **Spor salonu:** sıradaki görevin aletine (ör. boks torbası) yaklaşınca alt ortada "⭐ Görev" düğmesi.

## Yeni
- **Oto Tamirci:** hastane ile belediyenin yanındaki binanın (6,0) zemin katı — açık kepenkli atölye, Usta Rıfat. İçeride "🔧 Araba tamiri". Haritada 🔧 simgesi. **Borsa hissesi `mk_tamirci`** (Oto Tamirci): diğer mekânlar gibi %50 masraf + belediye vergisi (`isTamirci`, Ticaret › İşletme Vergileri, varsayılan %10), kalanı hissedarlara.
- **Modifiye Garajı:** sol üstte "🔧 Modifiye Garajı" → sadece Geliştir + Modifiye. Tamir artık tamircide (eski uygulamalar modifiyede tamir yapabilir, sunucu kabul eder).
- **Desensiz Halı** (12.000) ve **Desensiz Yolluk** (6.000) — 12 renk.
- **Modern Yemek Takımı** (30.000) — masa + 4 sandalye tek parça, sandalyelere oturulur.
- **Savaş paneli** (tır sabotajı, savunma, bahisli savaş, operasyon): ortada güç çubuğu; solda savunan (mavi), sağda saldıran (kırmızı), senin tarafında "SEN". Bahiste teklif eden saldıran sayılır.

## Düzeltmeler
- **Yol tarifi stadyumun içinden geçiyordu:** yol ızgarası elle yazılmıştı, stadyum v196'da taşınınca eski yer kapalı / yeni yer açık kalmıştı. Izgara artık şehir planından türetiliyor (deniz tarafındaki hayali yol da kalktı; doğu ve kuzey servis yolları eklendi).
- **Kervankent:** gişelerden sonra kasabaya 4 m kala yaya her yerde duruyordu → giriş caddesi yayaya açık.
- **Ev merdiveni:** merdivenin altı baş hizasından yüksekse yürünür (eskiden komple duvardı). Telefonda merdivene dokununca diğer kata yürünür.
- **Otobüs / araba içinden çekilen fotoğraf** gövdenin içinden, ekrandakinden farklı çıkıyordu: sunucu iç kamera bilgisini siliyordu (`cityPhoto.js cleanCam`).
- **"👣 bugün" sayacı** hesap başına (aynı hesap gün içinde kaç kez girerse girsin 1). Ziyaretçi listesi ev belgesinde (`popU`), istemciye gönderilmez. Aynı kişi tekrar girince hiç yazma yapılmaz.
- **Müstakil Evler listesi:** "Evim" satırı yok, her evde içerideki kişi sayısı.
- **İnternet kafe:** kasa salona dönük, kasiyer arkasında. Yayın izleyenler kafenin gerçek halini görür (eskiden sadece bilgisayarlar vardı).

## Oyundan atma / kasma
- **Bellek sızıntısı (ana şüpheli):** evde her tasarım değişikliğinde ve her ev ziyaretinde 3 katın bütün eşyaları yeniden kuruluyor, eskileri ekran kartı belleğinden hiç silinmiyordu. Telefonda bellek dolunca WebView kapanıp oyun baştan açılıyordu. Artık eski eşyaların geometri / malzeme / dokuları bırakılıyor (`houseFloors.js freeObj`).
- Gereksiz kod: kullanılmayan importlar, iki kez tanımlı `homeId`, hiç çağrılmayan `upper`, `cow`, `sheep` fonksiyonları silindi.

## Okuma / yazma
- Ev ziyareti: aynı gün tekrar girişte yazma **yok** (azaldı).
- Kumarhane, çalgılar, eşya eylemleri, garson, spor düğmesi, yol tarifi: ek Firestore okuma / yazma yok.
- Tamirci: modifiye garajındaki tamirle aynı (1 işlem).

## Testler
- `functions/scripts/v196-home.test.mjs`: ziyaret sayacı hesap başına.
- `functions/scripts/v147-cityphoto.test.mjs`: iç kamera alanları korunur.

## Satın alınan eşyaların evden gitmesi (v198 ek)
**Sebep:** Tasarla'daki ↶ Geri al, satın almadan önceki hâli (eşyalar "deneme") geri getiriyordu. Kaydedince sunucu "bu eşyalar artık evde konmuş satın alınmış eşya değil" sayıp onları evden alıp envantere koyuyordu; deneme kopyaları da Sepet › İptal ile siliniyordu → oyuncu için eşya "kayboluyordu". Ayrıca satın alma isteğinin cevabı (internet / uygulama kapanması) gelmezse aynı şey oluyordu.
**Düzeltme (HomePanel.jsx `normalizeOwned`):** her kayıtta ve geri almada liste, sunucudaki sahip olunan sayıya göre düzeltilir — sahip olunan eşya hep "senin", olmayan hep deneme. Satın almadan sonra geri al geçmişi silinir. Eşyalar hiçbir yolla silinmiyordu: kaybolan eşyalar oyuncunun **Envanter**'inde duruyor, oradan tekrar konabilir.

## Kökten: aynı evi iki farklı düzenleyici kaydediyordu (v198 ek 2)
- **Satın alınan eşyalar evde de envanterde de yok:** kişisel ev (houses/home_…) iki yoldan düzenlenebiliyordu: şehirdeki Tasarla (yeni sistem, envanter ev belgesinde) ve eski ev ekranı (HouseScreen — Mekanlar › Ziyaret, eski bağlantılar). Eski ekranın kaydı eşyaları **eski envantere** (houseInventories/{uid}) yazıyordu → oyuncu hiçbir yerde göremiyordu.
  - Sunucu: kişisel ev artık eski ev işlemleriyle (save / checkout / take / botSet / petSet / music) kaydedilemez (`houses.js`).
  - İstemci: kişisel ev eski ev ekranında açılmaz (`HouseHub.jsx`).
  - **Kurtarma:** oyuncu evine ilk girişinde, büyük geçişten (v196) SONRA eski envantere düşmüş eşyalar kişisel evin envanterine taşınır (bir kez, `inv198` bayrağı; geçişte iade edilenler tekrar verilmez). Test: `v196-home.test.mjs`.
- **Hayvan ve bot eşyaları:** şehirdeki evde sadece platform çiziliyordu; eski ekrandaki gibi platformun üstünde hayvan (oyunun evcil hayvan çizimi) ve bot (ayarındaki görünüş / ad / sözler) durur. Tasarla'da gizlenir (platform seçilebilsin).
- **İçerideyken dışarıya dokunma:** mekânın / evin içindeyken duvarın ötesine ya da evin köşesine dokununca avatar dışarı yürüyordu. Artık içeriden dışarıya sadece kapının önüne (≈4 m) dokununca gidilir.
