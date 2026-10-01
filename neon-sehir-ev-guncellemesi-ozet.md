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
