# v76 — Başarı farkı + ATM

1. **Başarı ödül farkı (tek seferlik):** ödüller artırılmadan önce kazanılmış başarıların farkı (yeni − eski) bir kez yüklenir: Banka soy +1, Sixtagram 100 beğeni +1, Cabrio şampiyonu +2, Banka soyguncusu yakala +2, Mafya Babası +2, İstihbarat Başkanı +1, Süper Kupa +1 (İmam, Piyango, 1. Lig şampiyonu zaten aynı). Oyuncuya tek SMS gider.
   - Yayından sonraki ilk saatlik taramada (achievementsSweep) herkes için otomatik yapılır; ayrıca oyuncu Başarılar ekranını açınca da kontrol edilir. İkinci kez verilmez (her başarıya "verilen ödül" kaydı yazılır; toplu tarama bayrakla bir kez çalışır).
2. **ATM:** evdeki ATM'ye yaklaşınca "🏧 Parara Bank" → telefonda Parara uygulaması açılır (yatırım, kredi, ceza işlemleri).

Yayınlama:
```
firebase deploy --only functions:achievementsSweep,functions:syncAchievements
```
+ web.

---

# v75 — Oyun Salonu (evde konsol / bilgisayar / atari)

**Nereden açılır:** Atari Makinesi, Oyuncu Bilgisayarı, İnternet Kafe İstasyonu, Konsol & TV Seti → "🎮 Oyna". Bu eşyalardan birinin 3 m yakınındaki bir koltuğa/sandalyeye oturunca da oturduğun yerden "🎮 Oyna" çıkar.

**4 oyun:**
- ⚽ **Kafa Topu** — 60 sn, koca kafalı futbol (◀ ▶ · zıpla · şut).
- 🥊 **Sokak Dövüşü** — 3 raunt, 2 raunt alan kazanır (yumruk · tekme · rakibin tersine basılı tut = blok).
- 🏎️ **Neon Yarış** — kuşbakışı pist, 4 tur, kamera kendi arabanı izler, mini harita (direksiyon · gaz · fren).
- 🧱 **Tuğla Kırma** — mevcut atari oyunu (tek kişilik).

**Modlar (ilk üç oyun):**
- 🤖 **Bota karşı** — hemen başlar. Botlar dengelendi (bot-bot yüzlerce maçta iki taraf eşit kazanıyor; kendi kalesine gol / sıra avantajı hataları giderildi).
- 🌐 **Online** — "Oda kur" → odan herkesin "Açık odalar" listesinde görünür, biri katılınca maç başlar (beklerken "Bota karşı oyna"ya geçebilirsin). Farklı evlerden/cihazlardan bağlanılır. Rakip çıkarsa kalan kazanır.
- Telefon: ekrandaki büyük butonlar; bilgisayar: klavye (← → ↑ · Boşluk/J · K).

**Online için bir kerelik kurulum (Firebase Realtime Database):** Firestore'da her hareket ücretli okuma/yazma olurdu; Realtime Database bant genişliğiyle ücretlenir ve bu kullanımda ücretsiz kotada kalır, ayrıca daha hızlıdır.
1. Firebase Console → Build → **Realtime Database** → Create Database → konum **Belgium (europe-west1)** → "Locked mode".
2. Açılan sayfadaki adresi kopyala (`https://…-default-rtdb.europe-west1.firebasedatabase.app`) → `.env` dosyasına: `VITE_FIREBASE_DATABASE_URL=<adres>`
3. `firebase deploy --only database` (kurallar: `database.rules.json` — sadece giriş yapmış oyuncular; odayı sadece kuran yönetir, konuk sadece kendi girdisini yazar).
4. Web'i derle/yayınla.
Bu adımlar yapılmadan web yayınlanırsa oyunlar **bota karşı** çalışır, online seçeneği "yakında" yazar — hiçbir şey bozulmaz.
⚠️ `firebase.json`'a database eklendi: veritabanı oluşturulmadan düz `firebase deploy` (hepsi) hata verir; `--only` ile yayınlamaya devam et.

Yayınlama: sadece web (+ hazır olunca `firebase deploy --only database`). Cloud Functions değişmedi.

---

# v74 — Android adres çubuğu + revizeler

1. **Android adres çubuğu:** `public/.well-known/assetlinks.json` içine Play imza anahtarının SHA-256'sı işlendi (0D:A9:…:02:F8). Web yayınlanınca telefonda uygulamayı kapatıp aç; hemen kalkmazsa uygulamanın önbelleğini temizle / yeniden yükle. Uygulamayı yeniden derlemek gerekmez. Kontrol: `node scripts/check-assetlinks.mjs`.
2. **Başarı ödülleri:** 1, 1, 2, 2, 3, 3, 4, 4, 5, 5 zümrüt (toplam 30). Önceden kazanılanlara fark verilmez; ekranda onlar için kazanılan eski ödül sayılır.
3. **Tır sabotajı:**
   - Haraç/rüşvet ödendikten sonra tıra saldıran kimse kalmadıysa savunma savaşı da **hemen biter** (eskiden gece yarısına kadar aktif kalıyordu). Başka saldırgan varsa savunma sürer.
   - Savunan çete ("⚠️ Tırlarımıza saldırı" kartı) ve saldıran çete ("💣 Saldırdığımız tırlar" kartı) da artık müttefikin gördüğü **🏆 Sıralama** ve **🔥 En çok katkı** detaylarını görür (savunma tarafları + saldırganlar tek listede). Saldıran çete diğer saldırganları göremez (gizli kalır).
4. **Cami:** "X. Vakitteki Cemaat (Y)" — hem menü düğmesinde hem panel başlığında kişi sayısıyla.
5. **Miktar butonları (oyunun tamamı):** değer üst sınırdayken de tüm butonlar basılabilir; sayı artmaz ama adım seçilir, böylece [−] ile istenen miktarda azaltılabilir.

Yayınlama (sadece değişenler):
```
firebase deploy --only functions:gangAction,functions:achievementsSweep,functions:syncAchievements,functions:applyForImam,functions:attemptHeist,functions:executeHeistPlan,functions:toggleSixtagramLike,functions:dailyReset,functions:resolveStuckRewardsNow,functions:resolveFutbolMatchdayReveal
```
+ web (assetlinks dosyası web ile gider).

---

# v73 — Maliyet optimizasyonu (Firestore okumaları)

Görünür oyun davranışı aynı; aşağıdakiler arka planda daha az okuma/yazma yapar.

## Mekânlar ve evler (en büyük kalem)
- Park + 7 mekânda yürürken konum 0,3 sn yerine **1 sn'de bir** yazılır (bekleme nabzı 12 → 20 sn). Diğer oyuncular aradaki boşlukta ekranda **yumuşakça kayar**, yürüme animasyonu yerelde üretilir — eskisinden daha akıcı görünür. Her konum yazımı mekândaki herkese bir okuma demekti → ~%65 azalma.
- Evde konum 0,22 sn yerine **~0,65 sn'de bir** yazılır; oturma/hareket (dans vb.) anında gider. Diğerleri yumuşak takip edilir.
- **Ev listesi:** tüm evlerdeki herkesin her adımını canlı dinliyordu (evin İÇİNDEYKEN bile). Artık kişi sayıları 30 sn'de bir, sadece aktif kayıtlar okunarak güncellenir; evin içindeyken liste hiç dinlenmez.
- **Mekânlar > Ziyaret:** 8 mekânın + tüm evlerin canlı konum dinleyicisi kaldırıldı → 30 sn'de bir 3 küçük sorgu.

## Her oyuncuda sürekli açık olanlar
- Genel sohbet rozeti/bildirim şeridi her açılışta **100 mesaj** okuyordu → artık 1 (sohbet ekranı yine 100).
- SMS'ler: alınan TÜM SMS'ler (hiç silinmiyor) her açılışta okunuyordu → son 100.
- Aktif yarış odası kontrolü: oyuncunun girdiği TÜM yarış odaları (bitmişler dahil) okunuyordu → sadece bitmemiş odalar (yeni indeks; indeks hazır değilse eski sorguya düşer, oyun bozulmaz).
- Sixtagram "yeni gönderi" rozeti: en yeni gönderiye gelen her beğeni/yorum çevrimiçi herkese okuma yazdırıyordu → 60 sn'de bir tek okuma.

## Ekranlar
- Fabrika listesi: tüm fabrikalar + her fabrikanın makineleri canlı dinleniyordu (her üretim izleyenlere okuma) → açılışta bir kez + 90 sn'de bir yenileme.
- Sixtagram akışı: Anasayfa'ya her girişte 150 gönderi → 90 sn içinde tekrar girilirse son liste kullanılır (yeni paylaşım/elle yenileme her zaman taze çeker; beğeni sayısı ve silme önbellekte de güncellenir).
- Soygun planı kartı: her izleyici 15 sn'de bir tüm katılımcıların kullanıcı + silah belgelerini yeniden hesaplatıp hepsini yeniden yazıyordu → plan başına en fazla 40 sn'de bir, sadece değişen katılımcı yazılır; istemci 45 sn.

## Sunucu
- Futbol transfer bakımı **her saat tüm futbolcuları** okuyordu → mevki başına en güçlü 30 oyuncu (yeni indeks). Sonuç birebir aynı (test edildi); indeks yoksa eski taramaya düşer.

## Yayınlama (SIRA ÖNEMLİ)
1. `firebase deploy --only firestore:indexes` → Firebase Console > Firestore > Indexes'te iki yeni indeks "Enabled" olana kadar bekle (birkaç dk).
2. Sadece değişen fonksiyonlar: `firebase deploy --only functions:futbolTransferMarketHourlyMaintenance,functions:forceRefreshFutbolTransferMarket,functions:resetFutbolTransferMarket,functions:refreshHeistPlanParticipants`
3. Web.

## Maliyet için ayrıca önemli
- **Projede 210 fonksiyon var.** `firebase deploy --only functions` her seferinde 210'unun hepsini yeniden derler (Cloud Build dakikası + Artifact Registry'de her biri için yeni imaj). Sık tam yayın, Firestore'dan bağımsız ciddi maliyet yaratabilir. Bundan sonra sadece değişen fonksiyonları yayınla (notlarda listeyi vereceğim).
- Eski fonksiyon imajlarını otomatik silmek için: `firebase functions:artifacts:setpolicy` (firebase-tools güncel olmalı).
- Neyin ne kadar tuttuğunu kesin görmek için: Google Cloud Console > Billing > Reports > "Group by: SKU".

---

# v72 — Kare ev fotoğrafı + Sixtagram'da resim çizme + ChatsApp yanıt/tepki

1. **Ev fotoğrafı yine KARE, ama çekildiği açıyla:** dikey çekimde yatay görüş açısı korunur, üstten/alttan kırpılır (yatay çekimde yanlardan). Çekim önizlemesi de aynı kare kırpılmış hâli gösterir, paylaşılanla birebir aynı. İsim/balon kadrajın üstünden taşacaksa aşağı itilir, kesilmez.
2. **Sixtagram → Görsel Ekle → 🎨 Resim Çiz** (listenin en üstünde):
   - Boş kare tuval, 12 renk, 3 fırça kalınlığı.
   - **↩️ Geri al:** son fırça darbesini siler (art arda basılabilir).
   - **Tuval rengi:** 8 zemin rengi; istediğin an değiştirilebilir, çizim korunur.
   - **🗑️ Temizle** (yanlışlıkla silmesin diye iki kez basılır).
   - "Bitti" → gönderide önizleme (✏️ Çizimi düzenle ile geri dönülebilir) → Paylaş. Akışta normal fotoğraf gibi kare görünür.
   - Görsel YÜKLENMEZ: fırça darbeleri saklanır ve her telefonda yeniden çizilir. Sunucu renkleri/kalınlıkları/koordinatları doğrular. Bir tablo en fazla 500 darbe ve 8.000 nokta olabilir; tuvalin altındaki çubuk kalan yeri gösterir.
3. **ChatsApp (Neon Şehir grubu + arkadaş sohbetleri):** mesaja basılı tutunca açılan panelde:
   - En üstte **emoji tepkileri** (👍 ❤️ 😂 😮 😢 🙏 🔥 👏). Mesajın altında sayılarıyla görünür. Kişi başı bir tepki; aynı emojiye tekrar basınca kalkar. Balonun altındaki rozete dokunarak da tepki verilebilir.
   - **↩️ Yanıtla:** mesaj kutusunun üstünde "Yanıtlanıyor · İsim" çubuğu çıkar (✕ ile iptal). Gönderilen mesajın içinde alıntı görünür; alıntıya dokununca asıl mesaja kayar ve vurgulanır.
   - Alıntı sunucuda asıl mesajdan okunur (sahte alıntı yazılamaz). Silinmiş/gizlenmiş mesaja yanıt verilemez. Engellediğin oyuncunun alıntılanan metni gösterilmez.

Testler: 214 test geçiyor (çizim doğrulama, DM yanıt/tepki eklendi).

Yayınlama: `firebase deploy --only functions` (yeni: `reactChatMessage`; güncel: `sendChatMessage`, `socialAction`, `createSixtagramPost`) + web. Kurallarda değişiklik yok.

---

# v71 — Düzeltmeler + mekân hareketleri + çete reklamı

1. **Mobilya SMS'i kaldırıldı:** mobilya/duvar/zemin alışverişinden sonra "Mobilya Mağazası" mesajı gelmez.
2. **2. El – tahmini değer:** "yıpranma X puan → en yüksek fiyatın %Y'i" alt yazısı kaldırıldı; sadece "💡 Tahmini değer: … altın" görünür.
3. **L koltuk alınamıyordu ("Sepet tutarı değişti"):** sunucudaki eşya kodu kontrolü büyük harfe izin vermiyordu, `sofaL` sepetten sessizce düşüyor, iki taraf farklı tutar hesaplıyordu. Düzeltildi (aynı sebeple L koltuk kaydedilmiyordu da).
4. **Camlı silah dolabı:** gövde dolu bir kutuydu, silahlar içinde kalıyordu (denemede yarı saydam olduğu için görünüyordu). Dolap artık içi boş (arka, yan, üst, taban panelleri + cam kapak). Satın aldıktan sonra da silahlar görünüyor.
5. **Ev fotoğrafları:**
   - Paylaşılan kare artık **çekildiği en/boy oranıyla** çiziliyor (eskiden hep kare çiziliyordu, bu yüzden dikey telefonda çekilen fotoğraf çok daha geniş açılı görünüyordu). Sixtagram'daki çerçeve de aynı oranda.
   - **İsim etiketleri ve mesaj balonları** fotoğrafta çıkıyor: hem çekim önizlemesinde hem paylaşılan karede. Balonlar, çekim anında ekranda olan mesajlardır (sunucu ev sohbetinden alır; istemci metin gönderemez).
   - Çekim önizlemesi artık kırpılmıyor (paylaşılanla birebir aynı).
   - Eski paylaşımlar kare olarak görünmeye devam eder.
6. **Hareketler (Dans et, El salla, Alkışla, Zıpla, Kalp at) tüm mekânlarda:** Park, Banka, Karakol, Camii, Gazino, Araba Galerisi, Silah Mağazası, Modifiye Garajı. Sağ sütunda 👥'nin üstünde 😀 düğmesi. Herkes görür; mekâna sonradan giren eski hareketleri oynatmaz.
7. **Çete ilanlarına reklam:** Ticaret → "🏪 2. eldeki ilanlarımız" satırında **📢 Reklam** (Baba / Sağ Kol). 1.000 altın çete kasasından, 24 saat; ilan 2. El Pazarı'nda "📢 Reklam Verilen Ürünler" bölümüne girer. Süre dolmadan tekrar reklam verilemez, ücret iade edilmez (oyuncu ilan reklamıyla aynı kurallar). Kasa yetmezse verilemez; aynı anda birkaç kez basılsa da tek ücret alınır.

Testler: 207 çete/sistem testi + yeni ev testleri (L koltuk, SMS yok, fotoğraf oranı/balonlar) + çete reklam testi geçiyor.

Yayınlama: `firebase deploy --only functions,firestore:rules` (houseAction: L koltuk + SMS + fotoğraf; gangAction: `advertiseDepotListing`; kurallar: mekân hareketleri için `emote`/`emoteTs` alanları) + web.
⚠️ Kurallar yayınlanmadan web yayınlanırsa hareketler sadece kendi ekranında görünür (başkalarına gitmez); başka hiçbir şey etkilenmez.

---

# v70 — Düzeltmeler

1. **Başarılar** telefonun sağ sayfasında, "Bi fikrin mi var?"ın sağında.
2. **2. el – çete ilanları** oyuncu ilanlarıyla aynı kartlarda (satıcı = çete adı). Aynı çete aynı ürünü aynı fiyata koyarsa ilan birleşir (sunucu yeni ilanı mevcut ilana ekler). Fiyatı uygunsa "Avantajlı Ürünler"e girer. Ayrı "Çete ilanları" bölümü kalktı.
3. **Adım butonları:** sayı butonuna basınca değer o kadar ARTAR ve buton seçili olur; tekrar bastıkça artmaya devam eder. [+] seçili kadar artırır, [−] seçili kadar azaltır.
4. **Ev 2D modu:** açı değiştirirken sıçrama/titreme giderildi (görünür alan hesabı 45°'de eksen değiştiriyordu; kamera da iki kez yumuşatılıyordu).
5. **Ev kamerası:** fotoğraf siyah çıkıyordu (WebGL tamponu okunmadan temizleniyordu) — kare artık çekim anında çizilip okunuyor.
6. **"Ev sahibi seni evden çıkardı" yanlış uyarısı:** girişte ilk (önbellek) görüntüde kayıt henüz yok diye çıkarılmış sayılıyordu. Artık sadece ev sahibi gerçekten çıkardıysa (15 dk yasak) uyarı çıkar; kayıt başka sebeple düşerse (ör. uygulama arka planda kaldı) sessizce yeniden girilir.
7. **Evde eldeki ürün** artık diğer mekânlardaki gibi karakterin elinde görünüyor (herkes görür).
8. **Ev fiyatı** 500.000 altın.
9. **Banka kredisi** adımlarına +100.000 ve +1M eklendi.
10. **Makam masası:** koltuk masanın arkasına (ekranın olduğu tarafa) alındı.

Yayınlama: `firebase deploy --only functions` (houseAction fiyat, gangAction ilan birleştirme) + web.

---

# v69 — Faz 4 (Android) + son istekler

## Krediler
- Devlete borcu olan oyuncu da kredi çekebilir. Çekilen kredinin **tamamı** hesaba yatar (yarısı borca kesilmez).
- Aktif kredisi olan yeni kredi çekemez (aynı anda tek kredi).

## Evler
- Ev sayısı sınırı (5) kaldırıldı — istediği kadar ev alınabilir.

## Çeteler: savaş izleme
- Savaş sekmesinin en altında **👁️ Devam eden savaşlar**: bize ait olmayan, şu an süren savaşlar canlı izlenir (20 sn'de bir yenilenir).
- Çetesi olmayan oyuncular da **Savaş** sekmesine girip savaşları izleyebilir (katılamaz; diğer sekmeler kilitli).
- Gizli bilgi gösterilmez: bahis tutarı, tır yükü/ödül değeri, haraç/rüşvet tutarı, sabotaj ücreti. Tır saldırıları ancak saldırı başlayıp tır sahibine duyurulduktan sonra listede görünür.
- Sunucu: yeni salt-okunur çete işlemi `watchWars` (15 sn önbellek).

## Android (TWA)
- **Adres çubuğu sorununun sebebi bulundu:** sitedeki `https://cetelerinsavasi.com/.well-known/assetlinks.json` dosyasında imza parmak izleri hâlâ yer tutucu (`REPLACE_WITH_...`). Android, uygulamanın siteye ait olduğunu doğrulayamayınca adres çubuğunu gösterir. Çözüm (kod hazır, sadece SHA-256 değeri gerekiyor):
  1. Play Console → uygulama → **Test ve yayınla → Uygulama bütünlüğü → Uygulama imzalama** → "Uygulama imzalama anahtarı sertifikası" altındaki **SHA-256** değerini kopyala.
  2. (İsteğe bağlı, dahili test/yerel APK için) yükleme anahtarının SHA-256'sı: `keytool -list -v -keystore android/android.keystore -alias android`
  3. Proje kökünde: `node android/configure.mjs --app-signing-sha=AA:BB:... --upload-sha=CC:DD:...`
  4. Web'i yayınla, sonra `node scripts/check-assetlinks.mjs` ile kontrol et. Uygulamayı kapatıp açınca adres çubuğu kaybolur (APK'yı yeniden derlemek gerekmez; ama yeni ikon için aşağıdaki derleme gerekir).
- **Geri tuşu:** açık telefon uygulaması → telefon → mekân / ekran → ana sayfa sırasıyla kapanır. Ana sayfada geri tuşu "Çıkmak istiyor musun?" sorar; bir kez daha geri tuşu uygulamayı kapatır, "Oyunda kal" soruyu kapatır. Sadece Android uygulamasında ve ana ekrana eklenmiş uygulamada çalışır; web tarayıcısının geri tuşuna dokunulmaz.
- **iPhone 11'de görevler paneli taşması** düzeltildi: panel görünür ekran yüksekliğine (dvh, çentik dahil) sığar, liste kendi içinde kayar, ipucu balonları ekrandan taşmaz.
- **Yeni ikon:** `android/store-assets/play-icon-512.png` ve sitedeki `pwa-icon-*.png` güncel. Android ikonunun değişmesi için: `android/twa-manifest.json`'da `appVersionCode`'u Play'deki son sürümden büyük yap (`node android/configure.mjs --version-code=N --version-name=1.x.y`), sonra `bubblewrap update --skipVersionUpgrade && bubblewrap build` ve yeni .aab'yi yükle.

---

# v68 — Faz 3: Çete siparişleri ve tır takvimi

## Yeni takvim
- **Sipariş:** Pazartesi–**Cumartesi**, **00:00–12:00** arası (Baba / Sağ Kol).
- **Kalkış:** siparişten sonraki ilk 3 saatlik dilim (03:00 · 06:00 · 09:00 · 12:00). Ör. 07:20 siparişi 09:00'da yola çıkar.
- **6 saatlik pencere:** yola çıktıktan sonraki 6 saat ihbar, içerik sızdırma, sabotaj (ve sabotaj talebi) ve İstihbarat operasyonu zamanı.
- **Saldırı:** pencere bitince başlar (ör. 09:00 kalkış → 15:00) ve 24:00'te biter; tır sahibine o anda duyurulur.
- **Haraç / rüşvet:** 21:00'e kadar (değişmedi).
- **Teslim:** aynı gecenin 00:00'ında depoda (eskiden ertesi gece). Bir tır günde tek sefer yapar; yola çıkan sipariş iptal edilemez.
- **Günlük sipariş limiti:** savaşa katılan tüm tarafların toplam gücünün %0,5'i → **%1'i**. Şu an elde tutulan yolların limiti bir kez **2 katına** çıkarılır (otomatik, tek seferlik).
- Bu sürümden önce verilmiş, henüz yola çıkmamış siparişler kalkış günü 00:00'da çıkar (saldırı 06:00'da başlar); zaten yoldaki tırlar eski kuralla (saldırı 12:00) biter.

## Çete deposu
- Depodaki ürünler artık **anında satılamaz ve dağıtılamaz**; sadece 2. el pazarına konur. İlan çetenin adıyla görünür, para çete kasasına girer.
- 2. elde çete ilanlarında "Tahmini değer: … · çete ürünü, değer kaybı yok" yazıyor (ürünler yeni, ilanların süresi dolmuyor).

## Operasyon ekranı
- Her ihbarlı tırda kendi geri sayımı: operasyon için kalan süre; operasyon başladıysa **saldırının başlamasına kalan süre** (ör. "⚔️ saldırı 15:00'de başlar").
- Ticaret ekranında sipariş verirken kalkış / pencere / saldırı / teslim saatleri gösteriliyor; yoldaki her tırın kendi sabotaj geri sayımı var.

## Yayınlama
1. `firebase deploy --only functions` (çete sistemi: `gangAction`, `gangClock`). Kural ve indeks değişikliği yok.
2. Web build + yayın.
3. İlk saat turunda yol limitleri bir kez 2 katına çıkar (`routeLimitV67` bayrağı).

---

# v67 — Faz 2: Ekonomi & uygulamalar

## Oyuncular için
- **Krediler (Banka › Krediler) yenilendi:** Araç ipoteği kalktı. Artık **kredi puanı** var:
  %20 × (araç + silah + malzemelerin anında satış değeri + fabrika değeri (sende kalan hisse oranıyla) + sahibi olduğun futbol takımının değeri).
  Puanın kadar kredi çekebilirsin (en az 1.000). Aynı anda tek kredi, 10 gün vade, %20 faiz, dilim dilim ödeme.
  Vade dolunca ödenmeyen kısım devlete borca yazılır (borç bitene kadar kazancın yarısı kesilir). (v68: devlete borcu olan da kredi çekebilir; çekilen kredinin tamamı hesaba yatar, yarısı borca kesilmez. Aktif kredisi olan yeni kredi çekemez.)
  Ödemesi süren eski araç kredileri aynı ekranda ödenmeye devam eder; biri kapanmadan yeni kredi çekilemez.
  Görev 14 bilgisi: "Kredi puanını yükselterek daha fazla kredi çekebilirsin."
- **🏆 Başarılar** (telefon ana ekranı): 10 başarı, her biri bir kez, ödül zümrüt (1-1-1-1-1-1-2-3-4-5), kazanınca SMS. Tamamlananlar karartılır.
  İmam ol · Piyango kazan · Banka soy · Sixtagram'da toplam 100 beğeni · Üstün Cabrio şampiyonası · Polis olarak banka soyguncularını yakala · Mafya Babası ol · İstihbarat Başkanı ol · Takımınla 1./2. Lig kupası · Takımınla 1. Lig şampiyonluğu.
  Şu an imam / Mafya Babası / İstihbarat Başkanı olanlar başarıyı uygulamayı açınca (ya da saatlik taramada) alır.
- **Adım sistemi her yerde:** − değer + · Adım: 1 / 10 / 100 / 1.000 / 10.000 (seçilen adım kadar artar/azalır, varsayılan 1) · Max · Sıfırla. Çete ekranlarındaki miktar seçici de aynı.
- **Bahisli yarış:** en fazla 100.000 altın (sunucuda da sınır), 10.000 adımı ve Max butonu.
- **SMS:** "✓ Tümünü okundu yap".
- **Profil:** "Hesabımı Sil"in yanına **Çıkış Yap** (onaylı).
- **Bi fikrin mi var?:** ❤️ beğeni. Son 24 saatte yazılanlar en üstte (yeniden eskiye), sonra beğeniye göre. Kendi yazdığını beğenemezsin.
- **Soygun › Şüphe:** altını yetmeyen rüşvet/alışverişte buton yerine "Yetersiz altın".
- **Dilenci:** servet sınırı kalktı, herkes dilenci olabilir (bedeli: saygınlık 0). Bir dilenciye günde **toplam** en fazla 10.000 altın bağışlanabilir (eskiden son bağış sınırı aşabiliyordu); bağış ekranı kalan tutarı gösterir.
- **Polis de imam olabilir** (meslekler bağımsız; imamın 5 vakit + nasihat görevi geçerli).
- **Fabrika › Sponsorluk:** kabul edilen teklifte tutar ve "19:00'a kadar daha yüksek teklif kabul edilirse anlaşma ona geçer" uyarısı.
- **2. El:** Avantajlı ürünler ana sayfadan her kategorinin içine (en üste) taşındı. Araç/silahlarda **Tahmini değer**: tamir 2 puan, geliştirme 10 puan → 0-9: %90 · 10-19: %80 · 20-29: %70 · 30+: %60 (en yüksek fiyatın). İlan verirken de görünür. (Bilgi amaçlı; fiyat aralığı kuralları değişmedi.)
- **Yatırımlar:** ters rejimde (düşüş eğilimi ya da alıcılar çoğunlukta >%50) artış/düşüş eşit: kripto %1-20 / %1-20, hisse %1-10 / %1-10, elmas %1-5 / %1-5. Alış oranı hesabında en büyük alıcı ve en büyük satıcı hariç tutulur.
- **Shopier:** aynı paketten 2 adet alınan siparişte yalnızca biri yükleniyordu → adet (productcount / sepet ayrıntısı) okunuyor; yine eksik kalırsa ödenen tutar paket fiyatlarının tek bir kombinasyonuyla birebir karşılanıyorsa eklenip sipariş elle kontrol için işaretleniyor.
- **Açılış/sekme kasması:** ana paket 1,65 MB → 0,74 MB (gzip 470 → 209 KB). Tam ekran sayfalar ve mekân dünyaları ayrı parçalara bölündü, açılıştan 3 sn sonra arka planda önceden indiriliyor. Açılışta her seferinde çağrılan 6 eski göç fonksiyonu 20 sn sonraya ve cihaz başına günde bire indirildi.

## Yayınlama
1. `firebase deploy --only functions` (yeni: `markAllMessagesRead`, `toggleFeedbackLike`, `getCreditInfo`, `takeCredit`, `repayCredit`, `processCreditDefaults`, `syncAchievements`, `achievementsSweep`; güncellenen: `takeVehicleLoan` (kapalı), `createRaceRoom`, `becomeBeggar`, `donateToBeggar`, `applyForPolice`, `applyForImam`, `hourlyInvestmentUpdate`, `shopierOsbWebhook`, soygun/piyango/şampiyona/kupa/sezon sonu, `toggleSixtagramLike`)
2. Web build + yayın. Kural değişikliği yok.

## Faz 3'e kalanlar (çete siparişleriyle aynı kodlar)
- İstihbarat operasyonunda başlama saatine geri sayım
- Çete eşyalarının anında satılamaması/dağıtılamaması, 2. elde çete adıyla listelenmesi ve değer kaybetmemesi

---

# v66 — Faz 1: Evler herkese açık + Zümrüt

## Oyuncular için
- **Ev Satın Al +** (1.000.000 altın; v69: ev sayısı sınırı yok). Ev boş gelir; ilk girişte doğrudan **Gez** modundasın.
- Ev ekranında **Evlerim** ve **Girebileceğin Evler** listesi (ev adı, sahibinin profil fotoğrafı, içerideki kişi sayısı). Mekanlar › Ziyaret sekmesinde içinde en az 1 kişi olan evler de listelenir.
- Üst çubuk: **3D / 2D** (gezide), **Tasarla / Gez** ve **⚙️ Ayarlar** (ev sahibine). Ayarlar: ev adı + tür (🌐 herkese açık / 👥 arkadaşlar / 🔒 gizli — gizlide içeridekiler atılmaz, davetliler girebilir).
- Gez: joystick yok — **dokunduğun yere yürür**, eşyaya dokununca yanına gider. Etkileşim butonlarında E/F harfleri yok.
- Sağdaki butonlar: 😀 hareketler (dans, selam, alkış, zıpla, kalp — açılır/kapanır), 👥 kişiler (ısmarla, davet et (SMS), ev sahibi için evden çıkar), 💬 sohbet, 📱 telefon, 📷 kamera (Sixtagram'da paylaşılabilir ev fotoğrafı).
- **Tasarla:** altta **Mağaza / Envanter**. Mağazadan seçilen ürün odaya **deneme** olarak (yarı saydam) gelir, odadaki herkes görür. Üstte sepet toplamı (altın + zümrüt) → **İptal** ya da **Alışverişi Tamamla** → onay ekranı. Satın alınmış eşyayı kaldırınca Envanter'e gider, envanterden yerleştirince envanterden düşer. Renk satın aldıktan sonra da değişir.
- 150 eşya, 18 kategori (yeni: Dükkân, Duvar, Halı, Dış Mekân — market rafı, kasa, cam tezgâh, içecek dolabı, dondurma dolabı, manav, kafe tezgâhı, pasta vitrini, kıyafet askılığı, manken, sahne mikrofonu, disko topu, çamaşır/kurutma makinesi, çit, bank, sokak lambası, çim, ofis masası, PC, konsol, piyano, ATM, spor aletleri, langırt, masa tenisi, gitar, halılar, tablolar, duvar saati (gerçek saati gösterir), perde, vazo…). Fiyatlar senin listenle birebir; yeni eşyalar o dengeye göre fiyatlandı. Duvar/zemin: kırık beyaz & meşe parke ücretsiz, tuğla/beyaz tuğla/ahşap panel/siyah mermer 5 zümrüt, diğerleri 100.000 altın (yeni: parlak siyah epoksi + düz renk duvar/zeminler).
- Eşyalardan alma: buzdolabı/içecek dolabı içecek, kahve makinesi kahve, yemek masası meyve/yemek, bar kokteyl/viski, silah dolabı/askılığı silah… Elindeki ürün 2 dk durur, diğer mekânlardaki gibi ısmarlanabilir.
- **Atari** makinesi → Tuğla Kırma (sesli). **Müzik kutusu** → 3 şarkı (Kulüp 77 / Ağır Abi / Son Kadeh), aç/kapat/değiştir; evdeki herkes aynı şarkıyı duyar.
- **Zümrüt Mağazası** (eski Altın Mağazası, sadece web): üstte zümrüt paketleri (29 TL → 50 💎, 99 TL → 200 💎), altta harcama: 49 💎 → 30.000 altın, 199 💎 → 100.000 altın + ekstralar. Yeni uygulama ikonu (PWA + Play ikonu dosyası).
- Oyunun ara sıra donup yeniden başlatma gerektirmesi: 3D sahne artık tek bir ortak WebGL bağlamı kullanıyor (eskiden her giriş yeni bağlam açıyordu); bağlam kaybolursa sahne kendini yeniden kuruyor; telefon/atari açıkken çizim duruyor.

## Güvenlik
- Tüm satın almalar sunucuda, transaction içinde: altın/zümrüt yetmezse işlem reddedilir; istemcinin gönderdiği sepet toplamı sunucunun hesabıyla birebir tutmazsa reddedilir. Envanter farkları sunucuda doğrulanır (sahip olmadığın eşyayı "envanterden" koyamazsın). Deneme eşyalar kullanılamaz (oturma/alma yok).
- Evden atılan 15 dk giremez; davet 24 saat geçerli; gizli eve davetsiz girilemez.

## Yayınlama (sırayla)
1. `npm install`
2. `firebase deploy --only firestore:rules` (yeni kurallar: `houses` (+ `houses/{id}/chat`), `houseInventories`, `houseInvites`, `housePresence`)
3. `firebase deploy --only functions` (yeni: `houseAction`, `buyEmeraldOffer`; güncellenen: Shopier/kod ile paket teslimi zümrüt veriyor, `giftHeldItem`, `createSixtagramPost`, `deleteAccount`, `expireInteriorPresence`)
4. **Shopier panelinde** iki ürünün fiyatını 29 TL ve 99 TL, adlarını "50 Zümrüt" / "200 Zümrüt" yap (ürün ID'leri aynı kaldı).
5. Web build + yayın. Yeni ikonun Play'de görünmesi için TWA'nın yeniden derlenmesi gerekiyor (Faz 4'te URL çubuğu düzeltmesiyle birlikte).

## Teknik
- Ortak fiyat listesi: `functions/houseCatalogData.js` (hem sunucu hem istemci aynı dosyayı kullanır).
- Sunucu: `functions/houses.js` (`houseAction` op'ları: buy, enter, save, quote, checkout, settings, invite, kick, chat, take, music) + `functions/scripts/houses.test.mjs`.
- İstemci: `HouseHub.jsx` (liste + satın alma), `HouseScreen.jsx`, `houseEngine.js`, `houseAudio.js`, `ArcadeGame.jsx`, `HousePhoto.jsx`, `hooks/useHouseList.js`. `HouseGate.jsx` ve `HouseMaintenance.jsx` kaldırıldı.

---

# v65 — 3D Ev Güncellemesi (admin testi)

## Oyuncular için değişenler
- Alt çubuğa 5. sekme olarak **👤 Profil** eklendi (en sağda). Eskiden haritadaki "Ev"den açılan profil ekranı artık buradan açılıyor.
- Haritadaki **Ev** artık oyunculara **"Ev Tadilatta"** ekranı gösteriyor.
- Görevler: 16 → "Profile gir ve avatarını düzenle", 19 → "Profile gir ve silahını geliştir".

## Admin için: 3D Ev
- **Tasarla modu:** alttaki raftan eşya seç → odaya eklenir. Eşyayı sürükle = taşı, dokun = seç (döndür 45°, renk, kopyala, sil). ↶ geri al. Duvara asılan eşyalar (TV, silah askılığı, tablo, neon, pencere…) en yakın duvara kendiliğinden yapışır; avize/pervane tavana asılır.
- **Duvar & Zemin:** 17 duvar + 13 zemin kaplaması.
- **Gez modu:** 3. şahıs kamera, joystick / WASD, sürükle = etrafa bak. **E** otur/kalk/arabaya bin, **F** TV, lamba, neon, şömine, far vb. aç/kapat.
- **98 eşya**, 14 kategori; çoğunda 5–15 renk seçeneği (koltuklar 12, arabalar ve motorlar 15 renk/kaplama → yüzlerce kombinasyon).
- Her eşyanın fiyatı var: 🪙 altın ya da 💎 elmas (ileride gerçek parayla satılacak para birimi). Üstte "Ev değeri" görünüyor. Test modunda admin her şeyi ücretsiz yerleştiriyor.
- Tasarım ~1,2 saniyede bir otomatik kaydediliyor (`houses/{uid}`).

## Online test
- 👥 Davet paneli (sadece admin): oyuncu adıyla ya da arkadaş listesinden davet et. Davetli oyuncu haritada Ev'e tıklayınca admin'in evine girer (sadece gezer, düzenleyemez), yaptığın değişiklikleri canlı görür.
- Evdekiler birbirini görür: avatarlar oyundaki SVG avatarların birebir aynısı, kameraya dönük "kağıt figür" olarak çiziliyor. Oturma herkese görünür.
- Altta sohbet: mesajlar hem listede hem kafanın üstünde balon olarak görünür (susturma kuralları geçerli).

## Yayınlama
1. `npm install` (yeni bağımlılık: `three`)
2. `firebase deploy --only firestore:rules` (yeni: `houses`, `houseInvites`, `housePresence`)
3. `firebase deploy --only functions` (yeni: `houseAction`; `expireInteriorPresence` artık ev kayıtlarını da süpürüyor)
4. Web build + TWA her zamanki gibi.

## Teknik
- İstemci: `src/components/HouseScreen/` — `houseEngine.js` (three.js motoru), `houseCatalog.js` (eşyalar), `houseTextures.js` (kodla çizilen dokular), `HouseScreen.jsx` (arayüz), `HouseGate.jsx` (admin/davet kontrolü; three.js sadece girebilecek kişiye yüklenir, ~170 KB gzip ayrı paket).
- Sunucu: `functions/houses.js` + `functions/scripts/houses.test.mjs`.
- Önizleme (sadece geliştirme): `npm run preview:gangs` sonra `/house.html` (sadece motor) ve `/house-app.html` (tam ekran, sahte misafirle).
- Satışa geçerken: fiyat listesi sunucuya taşınmalı, `save` sadece sahip olunan eşyalara izin vermeli (houses.js'teki not).
