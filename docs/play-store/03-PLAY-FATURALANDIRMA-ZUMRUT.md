# Google Play Zümrüt Mağazası — adım adım rehber (v91)

> **Amaç:** Android uygulamasında (Play Store sürümü) oyuncular zümrütü **Google Play ile** satın alabilsin.
> Kod tarafı bu pakette **hazır**. Senin yapacakların aşağıda, sırasıyla. Her adımın sonunda "✅ Kontrol" satırı var. O tutmuyorsa sonraki adıma geçme.

**Nasıl çalışıyor (kısaca):**
1. Oyuncu Android uygulamasında Telefon › **Zümrüt Mağazası**'nı açar ve "Satın Al"a basar.
2. Google Play'in kendi ödeme penceresi açılır. Kart bilgisi Google'da kalır, bize hiç gelmez.
3. Ödeme bitince sunucumuz (`verifyPlayPurchase`) satın almayı **Google'a sorup doğrular**. Ardından zümrütü **bir kez** yükler ve Google'a "teslim edildi" der.
   - Google, 3 gün içinde "teslim edildi" denmeyen satın almaları otomatik iade eder. Bu adım bu yüzden önemli.
4. İnternet kesilip bir satın alma yarım kalırsa, mağaza bir sonraki açılışta onu kendiliğinden tamamlar.

Web sürümünde hiçbir şey değişmedi: Shopier aynen devam ediyor. Android'de ise Shopier bağlantısı ve teslimat kodu **hiç görünmez** (Google Play kuralı).

| Play ürün kimliği | Ne verir | Önerilen fiyat |
|---|---|---|
| `zumrut_50` | 50 Zümrüt | 29 TL |
| `zumrut_200` | 200 Zümrüt | 99 TL |

> Ürün kimlikleri koddaki adlarla **birebir aynı** olmalı (küçük harf, alt çizgi). Bu adlar `functions/playBilling.js` ve `src/lib/playBilling.js` dosyalarında geçiyor. Ürün kimliği sonradan değiştirilemez.

---

## ADIM 1 — Kodu yayınla (sunucu + web)
Bu paketteki dosyaları projenin üstüne kopyala, ardından:

```bash
cd functions
npm install                 # yeni paket: google-auth-library
cd ..
firebase deploy --only functions
npm run build
npx wrangler deploy         # (web'i her zaman nasıl yayınlıyorsan öyle)
```

✅ **Kontrol:** Firebase Console › Functions listesinde **verifyPlayPurchase** ve **playBillingSweep** görünüyor.

> ⚠️ **"Quota exceeded" (429 / CPU quota) hatası alırsan:** Google, 200'den fazla fonksiyonun aynı anda güncellenmesine izin vermiyor. Hata alan fonksiyonlar eski sürümde kalıyor.
>
> Bu durumda proje klasöründe şunu çalıştır:
> ```powershell
> powershell -ExecutionPolicy Bypass -File .\deploy-parcali.ps1
> ```
> Betik fonksiyonları 5'erli gruplarla, aralarında bekleyerek yükler. Sonunda "TAMAM" yazmalı.

---

## ADIM 2 — Google Play Developer API'yi aç (bir kerelik)
Sunucunun Google'a "bu satın alma gerçek mi?" diye sorabilmesi için bu API gerekli.

1. Şu adrese git: `https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com?project=neon-sehir`
   - Firebase hesabınla aynı Google hesabıyla giriş yap.
2. **Etkinleştir (Enable)** düğmesine bas.

✅ **Kontrol:** Sayfada "API etkin" ya da "Yönet (Manage)" yazıyor.

---

## ADIM 3 — Sunucunun hesabına Play Console'da izin ver (bir kerelik)
Cloud Functions, Google'a bir **servis hesabı** ile bağlanır. Bu hesaba Play Console'da sipariş görme izni vermen gerekiyor.

**3a. Servis hesabının e-postası**

Senin projende bu e-posta:

```
751782476133-compute@developer.gserviceaccount.com
```

Bu, Cloud Functions 2. nesil fonksiyonlarının varsayılan hesabı. Proje numaran (751782476133) deploy çıktısında görünüyor.

İstersen doğrulayabilirsin:
1. `https://console.cloud.google.com/run/services?project=neon-sehir` adresini aç.
   - Not: "Most used resources" sayfası sadece son kullanılanları gösterir; bu adres tam servis listesini açar.
2. Üstteki filtre kutusuna `verify` yaz → **verifyplaypurchase** servisine tıkla.
3. **Güvenlik (Security)** sekmesindeki "Hizmet hesabı" satırı yukarıdaki e-postayla aynı olmalı.

**3b. Play Console'a davet et**
1. Play Console'da sol menünün en üstündeki **Kullanıcılar ve izinler**'e git (uygulamanın içinde değil, hesap düzeyinde).
2. **Yeni kullanıcı davet et** → e-posta alanına 3a'daki adresi yapıştır.
3. **Uygulama izinleri** sekmesi → **Uygulama ekle** → *Neon Şehir*'i seç. Şu iki izni işaretle:
   - ☑️ **Finansal verileri, siparişleri ve iptal anketi yanıtlarını görüntüleme**
   - ☑️ **Siparişleri ve abonelikleri yönetme**
4. **Kullanıcıyı davet et** → onayla.

> ⏳ Bu izin bazen hemen, bazen **birkaç saat (en fazla ~1 gün)** sonra devreye girer. Bu sürede test satın almasında "sunucu Google Play ile doğrulama yapamadı" mesajı görebilirsin. **Para kaybolmaz.** İzin aktifleşince mağazayı tekrar açman yeterli, zümrüt kendiliğinden yüklenir.

✅ **Kontrol:** Kullanıcılar ve izinler listesinde servis hesabı görünüyor.

---

## ADIM 4 — Yeni Android paketi (.aab) üret
Play Console'daki *"Tek seferlik ürün eklemek için APK'nıza FATURALANDIRMA iznini eklemeniz gerekir"* uyarısını bu adım çözer.

Bu pakette `android/twa-manifest.json` dosyası güncellendi:
- **Play Faturalandırma açıldı:** `features.playBilling` ve `alphaDependencies` ayarları.
- **`enableNotifications: true` yapıldı:** Ödemenin çalışması için gereken Android servisini Bubblewrap bu ayarla açıyor. Oyun bildirim göndermiyor; bu ayar sadece servisi açıyor.
- **Sürüm 8 / 1.0.9 yapıldı.**

**4a. Önce sürüm numarasını kontrol et**
1. Play Console › Neon Şehir › **Test ve yayınla › Uygulama paketi gezgini** (App bundle explorer) sayfasını aç.
2. En son yüklediğin paketin **Sürüm kodu**na (version code) bak.
3. Bu sayı 8 ya da daha büyükse, bir fazlasını ver (ör. son 9 ise 10):
   ```bash
   node android/configure.mjs --version-code=10 --version-name=1.0.10
   ```

**4b. Paketi üret** (bilgisayarında, önceki .aab'yi nasıl ürettiysen):
```bash
cd android
bubblewrap update --skipVersionUpgrade
bubblewrap build
```
- Keystore şifreleri sorulur. Önceki paketi imzaladığın **aynı** `android.keystore` ile imzala. Bu dosyayı kaybetme.
- Çıktı: `android/app-release-bundle.aab`

✅ **Kontrol:** `android/app/build.gradle` içinde `com.google.androidbrowserhelper:billing` satırı var. `android/app/src/main/AndroidManifest.xml` içinde `PaymentActivity` geçiyor.

---

## ADIM 5 — Paketi kapalı test kanalına yükle
1. Play Console › **Test ve yayınla › Test › Kapalı test** → kullandığın kanal → **Yeni sürüm oluştur**.
2. `app-release-bundle.aab` dosyasını yükle. Sürüm notuna "Zümrüt mağazası eklendi" yaz.
3. **Kaydet → İncele → Yayınla.**

✅ **Kontrol:** Yükleme sonrası **Para kazanma › Ürünler › Tek seferlik ürünler** sayfasındaki "FATURALANDIRMA izni" uyarısı kalkıyor. Bazen birkaç dakika sürer, sayfayı yenile.

---

## ADIM 6 — Tek seferlik ürünleri oluştur (iki ürün)
Play Console › **Google Play ile para kazanın (Monetize with Play) › Ürünler › Tek seferlik ürünler › Tek seferlik ürün oluştur**

**Ürün 1:**

| Alan | Yazılacak |
|---|---|
| Ürün kimliği | `zumrut_50` |
| Ad | 50 Zümrüt |
| Açıklama | Neon Şehir'de kullanılacak 50 zümrüt. |
| Vergi / uyumluluk | Dijital içerik (varsayılanlar uygun) |
| Satın alma seçeneği kimliği | `standart` |
| Satın alma türü | **Satın al (Buy)** |
| Fiyat | Türkiye: **29 TL** → "Fiyatları ayarla". Diğer ülkeleri Google otomatik çevirir. |

En sonda **Etkinleştir (Activate)** düğmesine bas.

**Ürün 2:** Aynısını şu değerlerle tekrarla:
- Ürün kimliği: `zumrut_200`
- Ad: 200 Zümrüt
- Fiyat: **99 TL**

> Fiyatı sonradan istediğin zaman değiştirebilirsin; oyun fiyatı Play'den canlı okur. Ürün kimliğini ise değiştiremezsin.
>
> Google, satıştan **%15** hizmet bedeli alır (yıllık ilk 1 milyon dolarlık satış için).

✅ **Kontrol:** İki ürün de listede **Etkin** görünüyor.

---

## ADIM 7 — Ücretsiz test satın alması için kendini "lisans test kullanıcısı" yap
Play Console'un **ana sayfası** (uygulama dışı) › **Ayarlar › Lisans testi** → telefonundaki Gmail adresini ekle → Kaydet.

Böylece test satın almalarında kartından **para çekilmez**. Ödeme ekranında "Test kartı, her zaman onaylanır" seçeneği çıkar.

---

## ADIM 8 — Telefonda dene
1. Telefonda kapalı test sürümünü güncelle: Play Store › Neon Şehir › **Güncelle**.
   - Güncelleme çıkmazsa birkaç saat bekle ya da Play Store önbelleğini temizle.
2. Oyunu aç → Telefon › **Zümrüt Mağazası**.
   - Fiyatlar Play'den gelmeli (ör. "₺29,00").
3. **Satın Al** → Google ödeme penceresi → "Test kartı, her zaman onaylanır" → Satın al.
4. "50 zümrüt hesabına yüklendi! 💎" mesajı gelmeli. Zümrüt bakiyen artmalı.

✅ **Kontrol:**
- Firebase Console › Firestore › `playPurchases` koleksiyonunda yeni bir kayıt var.
- Kayıtta `purchaseType: 0` yazıyor. Bu, test satın alması demek; gerçek satışlarda bu alan boştur.

---

## ADIM 9 — Play Console beyanlarını güncelle ("ücretli satış yok" kısmı)
Oyunu ilk yüklerken satın alma olmadığını beyan etmiştin. Herkese açmadan önce bunları düzelt:

1. **Uygulama ücretsiz kalsın.** Play Console › Mağazada görünme › Fiyatlandırma kısmında uygulama **Ücretsiz** olmalı.
   - Bunu değiştirme. Uygulama içi satın alma için ücretli uygulama gerekmez.
   - Ücretsiz bir uygulama zaten sonradan ücretliye çevrilemez.
2. **İçerik derecelendirmesi (IARC):** Politika › Uygulama içeriği › İçerik derecelendirmesi › anketi **yeniden düzenle**.
   - "Kullanıcılar dijital ürün satın alabilir mi?" sorusuna **Evet** de ve kaydet.
3. **Veri güvenliği:** Finansal bilgiler › **Satın alma geçmişi** → **Toplanıyor**.
   - Amaç: Uygulama işlevselliği + Dolandırıcılık önleme. Paylaşılmıyor.
   - Kart bilgisi toplamıyoruz; o Google'da kalıyor.
4. **Uygulama içi satın alma etiketi:** Ürünler etkin olunca mağaza sayfasında "Uygulama içi satın alma içerir" etiketi çıkar.
   - Bir yerde "Uygulama içi satın alma: Hayır" seçeneği görürsen **Evet** yap.
5. **Ödeme profili:** Ayarlar › Ödeme profili tamamlanmış olmalı. Bunu zaten yaptın.

---

## İade koruması (oyunu dolandırmasınlar diye)
Büyük oyunlar (Supercell, King vb.) Google'ın **İptal edilen satın almalar (Voided Purchases) API**'sini düzenli tarar. Bizde de aynısı var.

- **Tarama:** **playBillingSweep** fonksiyonu 30 dakikada bir Google'a "iade edilen, chargeback yapılan ya da iptal edilen satın alma var mı?" diye sorar.
- **Zümrüt geri alma:** Bulunan her satın almanın zümrütü oyuncudan **geri alınır** ve oyuncuya SMS gider.
- **Eksi bakiye:** Oyuncu zümrütü çoktan harcadıysa bakiyesi **eksiye** düşer (ör. −150).
  - Eksi bakiyeyle hiçbir şey alınamaz.
  - Sonra aldığı zümrütlerden önce bu borç düşülür.
  - Böylece "zümrüt al → altına çevir → parayı iade al" hilesi işe yaramaz.
- **Tekrar yüklenemez:** İade edilmiş bir satın alma hiçbir yolla tekrar yüklenemez.
- **Kısıtlama:** **3 kez** iade alan hesapta zümrüt satın alma kapanır. Oyuncuya "destek e-postasına yaz" mesajı gösterilir.
- **Kayıtlar:** Her iade Firestore › `playRefunds` koleksiyonunda tutulur. Kayıtta oyuncu, sipariş no, sebep, önceki ve sonraki bakiye yer alır.
- **Ek önlem:** Play Console › Sipariş yönetimi'nden bir oyuncuya kendin iade yaparsan **"Hakkı kaldır" (Revoke)** kutusunu işaretle. Bu kutuyu işaretlemesen de tarama zümrütü yine geri alır.

> Bu tarama da Adım 3'teki izinle çalışır. İzin aktif değilse Firebase günlüklerinde `playBilling voided sweep 403` görürsün.

## Teslim güvencesi (kimse mağdur olmasın)
Ödeme yapan her oyuncu ya zümrütünü alır ya da parasını geri alır. Arada kalan durum yok:

| Durum | Ne oluyor |
|---|---|
| Ödeme sonrası internet kesildi / uygulama kapandı | Uygulama bir sonraki açılışında (ya da öne gelince) yarım kalanı **sessizce tamamlar**. Zümrüt yüklenir, SMS gider. |
| Sunucu o an Google'a ulaşamadı | Uygulama 3 kez dener. Olmazsa oyuncuya "Ödemen güvende, birkaç dakika içinde yüklenecek" der ve sonraki açılışta tamamlar. |
| Zümrüt yüklendi ama Google'a "teslim edildi" denemedi | 30 dakikalık tarama bunu tekrar dener. Yapılmazsa Google 3 gün sonra iade ederdi; oyuncu zümrütü bedavaya almış olurdu. |
| Oyuncu "bekleyen" ödeme yöntemiyle ödedi (ör. nakit) | Ödeme onaylanınca uygulama açılışında yüklenir. |
| Hiçbir yolla teslim edilemedi (oyuncu uygulamayı hiç açmadı vb.) | Google 3 gün içinde parayı **otomatik iade eder**. |
| Aynı satın alma iki kez gönderildi / iki cihaz | Tek sefer yüklenir. |

**Destek talebi gelirse** ("para çekildi, zümrüt gelmedi"):
1. Oyuncudan Google'ın e-postadaki sipariş numarasını iste (`GPA.xxxx-xxxx-...`).
2. Firestore › `playPurchases` koleksiyonunda `orderId` alanına göre ara.
   - **Kayıt varsa** zümrüt yüklenmiştir.
   - **Kayıt yoksa** oyuncu uygulamayı açınca yüklenir. 3 gün geçtiyse Google zaten iade etmiştir.

## Test planı (yayından önce mutlaka)
Otomatik testler (`functions/scripts/play-billing.test.mjs`, 12 senaryo) şunları sahte bir Google ile deniyor:
- tek yükleme ve aynı anda gelen istekler,
- başka hesabın token'ı ve ucuz paketin token'ıyla pahalı paket alma denemesi,
- bekleyen ödeme ve Google izni yokken para kaybolmaması,
- tüketme tekrarı,
- iade, chargeback ile eksi bakiye ve iade edilmişin tekrar yüklenmemesi,
- 3 iadede kısıtlama ve sayfalı iade listesi.

Hepsi geçiyor. Gerçek cihazda **lisans test hesabıyla** (Adım 7) şunları sırayla dene. Ödeme ekranında Google sana test kartları sunar, para çekilmez:

| # | Ne yap | Beklenen |
|---|---|---|
| 1 | 50'lik paket → **"Test kartı, her zaman onaylanır"** | "50 zümrüt yüklendi", bakiye +50, `playPurchases`'ta kayıt, `consumedAt` dolu |
| 2 | Aynı paketi **tekrar** al | Yine yüklenir (paket tekrar alınabilir olmalı) |
| 3 | **"Test kartı, her zaman reddedilir"** | Hata mesajı, bakiye değişmez |
| 4 | Satın almayı başlat, Google penceresini **kapat** | Hiçbir şey olmaz, hata yok |
| 5 | **"Yavaş test kartı, birkaç dakika sonra onaylanır"** | Önce "ödemen onay bekliyor" mesajı. Birkaç dakika sonra uygulamayı kapatıp aç → zümrüt yüklenir + SMS |
| 6 | Ödeme biter bitmez uygulamayı **kapat** (arka plandan sil), sonra aç | Birkaç saniye içinde zümrüt yüklenir + SMS |
| 7 | 200'lük paketi al, Play Console › **Sipariş yönetimi**'nden o siparişi **iade et** ("Hakkı kaldır" işaretli) | En geç ~30 dk içinde zümrüt geri alınır, SMS gelir, `playRefunds`'ta kayıt oluşur |
| 8 | (7'den önce) zümrütleri altına çevir, sonra iade et | Bakiye eksiye düşer, mağazada "eksi bakiye" uyarısı çıkar |

> Test siparişleri Sipariş yönetimi'nde görünmezse 7–8'i gerçek bir 29 TL'lik satın alma ile dene, sonra kendine iade et.

---

## Sorun giderme
| Görülen | Sebep / Çözüm |
|---|---|
| Mağazada *"uygulamanın en yeni sürümü gerekiyor"* | Telefondaki uygulama eski (Adım 4–5 öncesi). Ya da telefonda Chrome çok eski (101+ gerekir). Play Store'dan uygulamayı ve Chrome'u güncelle. |
| *"Ödeme alındı ama sunucu Google Play ile doğrulama yapamadı"* | Adım 2 veya 3 eksik, ya da izin henüz aktifleşmedi (~1 gün sürebilir). Para kaybolmaz; izin aktifleşince mağazayı tekrar açınca otomatik yüklenir. |
| *"Google Play bu satın almayı tanımadı"* | Ürün kimliği yanlış yazılmış (`zumrut_50` / `zumrut_200`) ya da ürün **Etkin** değil. |
| Ürün listesi boş / fiyat yerine "29 TL" yazıyor | Ürünler henüz etkin değil ya da Play'e yeni eklendi. Birkaç saat içinde gelir. |
| Ayrıntılı hata kaydı | Firebase Console › Functions › Günlükler (Logs) → `playBilling verify` satırları. |

## Teknik not (geliştirici için)
- **Sunucu:** `functions/playBilling.js`
  - Google Play Developer API ile `purchases.products.get` + `:consume`.
  - Kimlik doğrulama Application Default Credentials ile yapılır.
  - Her purchaseToken'ın SHA-256'sı `playPurchases/{hash}` belgesi olur. Bu belge transaction içinde yazıldığı için aynı satın alma **asla iki kez** yüklenmez.
  - Başka bir hesap aynı token'ı kullanamaz.
  - İade taraması ve tüketme tekrarı: `playBillingSweep` (30 dk). Voided Purchases API (`type=0`) kullanılıyor; kontrol noktası `system/playVoidedSweep` belgesinde, 2 saat örtüşmeyle tutuluyor.
- Testler: `functions/scripts/play-billing.test.mjs`
- **İstemci:** `src/lib/playBilling.js` (Digital Goods API + Payment Request API) ve `src/components/GoldStoreScreen/GoldStoreScreen.jsx` (`PlayEmeraldSection`).
- **Android:** `android/twa-manifest.json`
  - `features.playBilling.enabled`
  - `alphaDependencies.enabled`
  - `enableNotifications: true` (DelegationService'i açar; Digital Goods API bu servis üzerinden çalışır)

Kaynaklar:
- [Receive payments via Google Play Billing (Chrome for Developers)](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)
- [Overview of one-time products (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/16430488?hl=en)
- [Google Play Developer API — Getting Started](https://developers.google.com/android-publisher/getting_started)
- [Voided Purchases API](https://developers.google.com/android-publisher/voided-purchases)
