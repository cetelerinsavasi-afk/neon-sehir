# Google Play — Android paketi (TWA) ve .aab alma rehberi

> Android uygulaması, web oyununu tam ekran açan bir **Trusted Web Activity (TWA)** kabuğudur. Oyun kodu **web'de** kalır. Web'e yapılan her deploy Android'de de **anında** geçerli olur, yeni .aab gerekmez. Yeni .aab yalnızca Android kabuğu değiştiğinde (ad, ikon, renk, sürüm, alan adı, SDK) alınır.

| Ayar | Değer |
|---|---|
| Paket adı | `com.cetelerinsavasi.twa` (Faz 1'de onaylandı; **yayından sonra değiştirilemez**) |
| Açılış adresi | `https://cetelerinsavasi.com/?src=twa` (oyun Android modunu buradan tanır: Altın Mağazası/Shopier gizli) |
| Araç | Bubblewrap CLI **1.25.0** (targetSdk **36**, minSdk 21) |
| Yapılandırma | `android/twa-manifest.json` (tek yerden doldurmak için: `android/configure.mjs`) |
| Web tarafı | `public/manifest.json`, `public/.well-known/assetlinks.json`, `public/sw.js`, `public/offline.html` |

Play'in hedef API şartı: yeni uygulamalar ve güncellemeler **31 Ağustos 2026'dan itibaren Android 16 (API 36)** hedeflemeli. Bubblewrap 1.25.0 şablonu zaten 36 hedefliyor.

---

## 0. Bir kerelik kurulum (kendi bilgisayarında)
1. Node.js 18+ kur.
2. `npm i -g @bubblewrap/cli@1.25.0`
3. `bubblewrap doctor`
   - İlk çalıştırmada JDK 17 ve Android SDK'yı indirmeyi önerir: **Evet** de.
   - Kendi kurulumun varsa yollarını gösterebilirsin.

## 0.5 ÖNCE web'i (v55) deploy et — zorunlu
`bubblewrap update` ikonları **canlı siteden** indirir (`https://cetelerinsavasi.com/pwa-icon-512.png` ve `pwa-maskable-512.png`). v55 yayında değilse maskable ikon bulunamaz ve komut hata verir.

Kontrol ettim (27.09.2026): canlıda v54 var. `manifest.json` eski, maskable ikonlar yok, `assetlinks.json` yer tutucu hâlinde. Deploy sonrası `https://cetelerinsavasi.com/manifest.json` içinde `"purpose": "maskable"` görmelisin.

## 1. Alan adı — ✅ zaten işli
`cetelerinsavasi.com`, `twa-manifest.json` içindeki alan adı, ikon, manifest ve kapsam adreslerinin hepsine yazılı. Bu adımı atlayabilirsin. Alan adı ileride değişirse `node android/configure.mjs --host=YENI-ALAN` ile tek komutta güncellenir.

## 2. İmza anahtarı (upload key) oluştur ve yedekle
```bash
cd android
keytool -genkeypair -v -keystore android.keystore -alias android -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore android.keystore -alias android      # "SHA256:" satırını kopyala
cd ..
node android/configure.mjs --upload-sha=<SHA256 satırı>
```
- `android.keystore` ve şifreleri **iki ayrı güvenli yerde** yedekle. `.gitignore` dosyası keystore'u zaten dışarıda tutuyor.
- Play App Signing kullanıldığı için bu anahtar yalnızca **yükleme** anahtarıdır. Kaybolursa Play Console'dan sıfırlama istenebilir; yine de kaybetme.

## 3. Android projesini üret ve .aab al
```bash
cd android
bubblewrap update --skipVersionUpgrade
bubblewrap build
```
- `update`, projeyi `twa-manifest.json`'dan üretir. Yalnızca Bubblewrap'ın kendi dosyalarını siler/yeniden yazar; `configure.mjs`, `README.md` ve `store-assets/` korunur.
- `--skipVersionUpgrade` şart: sürümü biz `configure.mjs` ile yönetiyoruz.
- `build` keystore şifrelerini sorar. Sormasın istersen `BUBBLEWRAP_KEYSTORE_PASSWORD` ve `BUBBLEWRAP_KEY_PASSWORD` ortam değişkenlerini tanımla.
- **Çıktılar:**
  - `android/app-release-bundle.aab` → Play Console'a yüklenecek dosya.
  - `android/app-release-signed.apk` → telefona doğrudan kurup denemek için.
- **Alternatif:** Üretilen `android/` klasörünü Android Studio ile aç → *Build › Generate Signed Bundle / APK* → Android App Bundle.

## 4. Play'e ilk yükleme ve Digital Asset Links
1. Play Console'da uygulamayı oluştur, **Test › Dahili test**e `app-release-bundle.aab` yükle. Play App Signing varsayılan olarak açıktır.
2. *Test ve yayınla › Uygulama bütünlüğü › Uygulama imzalama* sayfasından **Uygulama imzalama anahtarı sertifikası SHA-256**'yı kopyala.
3. Parmak izini ekle:
   ```bash
   node android/configure.mjs --app-signing-sha=<SHA-256>
   ```
   Bu komut `public/.well-known/assetlinks.json` dosyasını iki parmak izini de içerecek şekilde günceller.
4. **Web'i deploy et.** Sonra kontrol et:
   ```bash
   node scripts/check-assetlinks.mjs          # varsayılan: https://cetelerinsavasi.com
   ```
   Beklenen çıktı `SONUÇ: Geçti ✓`. Kontrol edilenler: 200 yanıtı, yönlendirme olmaması, `application/json` içerik türü ve parmak izi formatı.
5. Dahili testten uygulamayı kur. **Üstte adres çubuğu görünmüyorsa** doğrulama tamamdır.
   - Adres çubuğu görünüyorsa assetlinks eşleşmiyordur. Genellikle Play imzalama SHA'sı eksiktir ya da dosya deploy edilmemiştir.
   - `adb shell pm get-app-links com.cetelerinsavasi.twa` komutu `verified` göstermeli.

## 5. Kontrol listesi (dahili testte)
- [ ] Açılışta koyu (#070A12) açılış ekranı, ardından adres çubuğu olmadan oyun.
- [ ] HUD'daki altın düğmesi Parara Bank'ı açıyor. Telefonda Altın Mağazası simgesi yok, Shopier bağlantısı yok (Faz 2).
- [ ] Google ile giriş çalışıyor. Firebase giriş penceresi TWA içinde Chrome sekmesi olarak açılıp kapanmalı.
- [ ] Profil (Ev) altında "Gizlilik Politikası · Kullanım Koşulları · Hesap Silme" bağlantıları ve "Hesabımı Sil" var.
- [ ] Uçak modunda gezinmede "İnternet bağlantısı yok" sayfası çıkıyor, bağlantı gelince otomatik yenileniyor.
- [ ] Geri tuşu oyunda geri gidiyor, en başta uygulamayı kapatıyor.

## 6. Sonraki sürümler
```bash
node android/configure.mjs --version-code=2 --version-name=1.0.1
cd android && bubblewrap update --skipVersionUpgrade && bubblewrap build
```
`versionCode` her yüklemede bir öncekinden **büyük** olmalı; betik küçük ya da eşit değeri reddeder. Yalnızca web değiştiyse bu adımlara gerek yok.

## 7. Web tarafında yapılanlar (bu pakette)
- **`manifest.json`:**
  - `id`, `lang: tr` ve `categories` eklendi; açıklama genişletildi.
  - İkonlar `any` ve `maskable` olarak **ayrıldı**. Eskiden aynı ikon "any maskable" idi; köşeleri şeffaf olduğu için Android'in adaptif ikon kırpmasına uygun değildi.
  - Yeni tam kare ikonlar: `pwa-maskable-192.png`, `pwa-maskable-512.png`. İçerik güvenli bölgede.
- **`sw.js` ve `offline.html`:** İnternet yokken gezinmede Chrome'un hata ekranı yerine "İnternet bağlantısı yok" sayfası çıkar. Oyun verisi hâlâ önbelleğe alınmaz; önbellekte yalnızca bu tek sayfa durur.
- **Profil (Ev) ekranı:** Gizlilik, Koşullar ve Hesap Silme bağlantıları eklendi. Rehber ve giriş ekranında zaten vardı.
- **Mağaza görselleri:** `android/store-assets/play-icon-512.png` (Play yüksek çözünürlüklü ikon) ve `feature-graphic-1024x500.png` (öne çıkan görsel).
