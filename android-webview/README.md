# android-webview/ — Neon Şehir Android uygulaması (WebView kabuğu)

Oyun (`https://cetelerinsavasi.com`) artık Chrome'un içinde (TWA) değil, **uygulamanın kendi sürecindeki WebView'da** çalışır. Kotlin, tek ekran, Capacitor/Cordova yok.

| | |
|---|---|
| Paket adı | `com.cetelerinsavasi.twa` (eski TWA ile **aynı** — Play'de aynı uygulamanın güncellemesi) |
| Sürüm | `versionCode 14`, `versionName 1.1.0` |
| SDK | `minSdk 24` (Android 7), `targetSdk 36`, `compileSdk 36` |
| İmza | `../android/android.keystore`, alias `android` (eski TWA ile aynı) |
| Açılış adresi | `https://cetelerinsavasi.com/?src=app&av=14` |
| Derleme araçları | Gradle 8.11.1 + Android Gradle Plugin 8.9.1 + Kotlin 2.1.20 (eski TWA projesiyle aynı Gradle/AGP) |

Eski TWA projesi (`../android/`) **olduğu gibi duruyor** — geri dönüş için (bkz. "Geri dönüş planı").

---

## 1. Gerekenler (bir kez)

**Java 17 (JDK 17)** ve **Android SDK (platform 36)**. Bubblewrap ile TWA derlediğin için ikisi de bilgisayarında büyük ihtimalle zaten var:

| Ne | Bubblewrap'ın kurduğu yer (Windows) |
|---|---|
| JDK 17 | `C:\Users\<sen>\.bubblewrap\jdk\jdk-17.x.x+x` |
| Android SDK | `C:\Users\<sen>\.bubblewrap\android_sdk` |

Emin değilsen `C:\Users\<sen>\.bubblewrap\config.json` dosyasını aç — `jdkPath` ve `androidSdkPath` orada yazar.

Yoksa: [Android Studio](https://developer.android.com/studio)'yu kur. İçinde JDK (`C:\Program Files\Android\Android Studio\jbr`) ve SDK (`%LOCALAPPDATA%\Android\Sdk`) gelir. Android Studio → SDK Manager → **Android 16 (API 36)** platformunu işaretle.

> Java 21 de genelde çalışır ama sorun çıkarsa 17 kullan. **Java 8 / 11 çalışmaz.**

## 2. İmza ayarı (bir kez)

1. `keystore.properties.example` dosyasını aynı klasöre **`keystore.properties`** adıyla kopyala.
2. İçine eski TWA'da kullandığın keystore şifrelerini yaz:

```properties
storeFile=../android/android.keystore
storePassword=KEYSTORE_SIFRESI
keyAlias=android
keyPassword=ANAHTAR_SIFRESI
```

`keystore.properties` git'e **eklenmez** (`.gitignore`). İstersen dosya yerine ortam değişkeni de kullanabilirsin: `NEON_STORE_FILE`, `NEON_STORE_PASSWORD`, `NEON_KEY_ALIAS`, `NEON_KEY_PASSWORD`.

> Bubblewrap iki şifre sorar (keystore + key). İkisi aynıysa iki satıra da aynısını yaz.

## 3. Google girişi — WEB_CLIENT_ID (bir kez)

WebView'da Google, açılır giriş penceresini engeller. Bu yüzden uygulama Google hesabını **Android'in kendi hesap seçicisinden** alır (Credential Manager) ve web'e sadece kimlik jetonunu verir; Firebase oturumunu web açar → **aynı Google hesabı = aynı Firebase UID = aynı karakter.**

**a) Web istemci kimliğini kopyala:**
Firebase Console → **Authentication** → **Sign-in method** → **Google** → kalem/aç → **Web SDK configuration** → **Web client ID** (sonu `.apps.googleusercontent.com`).
(Aynı değer: Google Cloud Console → APIs & Services → Credentials → "Web client (auto created by Google Service)".)

**b) Yaz:** `app/build.gradle.kts` dosyasının başındaki satır:

```kotlin
val webClientId = "WEB_CLIENT_ID_BURAYA.apps.googleusercontent.com"
```

Yer tutucu değiştirilmezse release derlemesi **bilerek durur** ve uyarır. Bu değer gizli değildir (web sitesinde de var), git'e girebilir.

> ⚠️ **Android** istemci kimliği değil, **Web** istemci kimliği. Yanlışı yazılırsa giriş "hesap bulunamadı" gibi hata verir.

## 4. Firebase'e Android uygulaması + SHA-1 (bir kez, AAB'den ÖNCE)

Google'ın hesap seçicisi, uygulamayı **paket adı + imza SHA-1** ile tanır. İki SHA-1 gerekir (Play'den kurulan uygulama Play'in anahtarıyla, senin yüklediğin dosya yükleme anahtarıyla imzalıdır).

1. **Play Console** → Neon Şehir → **Test edin ve yayınlayın** → **Uygulama bütünlüğü** → **Uygulama imzalama** sekmesi:
   - "Uygulama imzalama anahtarı sertifikası" → **SHA-1** parmak izini kopyala.
   - "Yükleme anahtarı sertifikası" → **SHA-1** parmak izini kopyala.
   (Elinde sadece SHA-256'lar var; aynı sayfada SHA-1'ler de yazıyor.)
   - Yükleme anahtarının SHA-1'ini bilgisayarından da görebilirsin:
     `keytool -list -v -keystore ..\android\android.keystore -alias android` → "SHA1:" satırı.
     Doğrulama: bu komuttaki **SHA256** satırı `CC:FC:76:A5:…:69:DA` olmalı.
2. **Firebase Console** → ⚙️ Proje ayarları → **Genel** → "Uygulamalarınız" → **Uygulama ekle** → **Android**:
   - Android paket adı: `com.cetelerinsavasi.twa`
   - Takma ad: `Neon Şehir Android`
   - SHA-1: birini yaz → **Uygulamayı kaydet**.
   - `google-services.json` indirme adımını **atla** (gerekmiyor — uygulamada native Firebase yok). Diğer adımları da "İleri" ile geç.
3. Aynı sayfada yeni Android uygulamasının altında **Parmak izi ekle** → ikinci SHA-1'i ekle. (İstersen iki SHA-256'yı da ekleyebilirsin, zararı yok.)
4. Kontrol: Google Cloud Console → APIs & Services → **Credentials** → "OAuth 2.0 Client IDs" altında **Android client** (paket `com.cetelerinsavasi.twa`) görünmeli. Değişikliğin Google tarafına yayılması **5–30 dakika** sürebilir.

Bu adım **web girişini etkilemez**, mevcut kullanıcılara dokunmaz, Firestore'a hiçbir şey yazmaz.

## 5. AAB üretme — tek komut

**Kolay yol:** `aab-olustur.bat` dosyasına çift tıkla. Java ve SDK'yı bulur (gerekirse `local.properties` yazar), imza ayarını kontrol eder, derler ve sonucu `NeonSehir-webview-v14.aab` olarak bu klasöre kopyalar.

**Komut satırı (aynısı):**

```bat
cd android-webview
set JAVA_HOME=C:\Users\<sen>\.bubblewrap\jdk\jdk-17.0.11+9
gradlew.bat bundleRelease
```

Çıktı: `app\build\outputs\bundle\release\app-release.aab`

İlk derleme internetten bağımlılık indirir (birkaç dakika). `local.properties` yoksa bir kez oluştur:

```properties
sdk.dir=C\:\\Users\\<sen>\\.bubblewrap\\android_sdk
```

Birim testleri (isteğe bağlı): `gradlew.bat test`

## 6. Dahili teste yükleme

1. Play Console → **Test edin ve yayınlayın** → **Test** → **Dahili test** → **Yeni sürüm oluştur**.
2. AAB'yi sürükle. Sürüm notu: aşağıdaki taslak.
3. **İncele** → **Dahili teste yayınla**. Kendini dahili test listesine ekle (Testçiler sekmesi), katılım linkinden telefonuna kur.
4. Telefonda Play Store'dan "Neon Şehir"i güncelle (sürüm 1.1.0).

Yerel deneme (isteğe bağlı, Play'den önce): `gradlew.bat assembleRelease` → `app\build\outputs\apk\release\app-release.apk`. Telefonda Play'den kurulu Neon Şehir varsa imzalar farklı olduğu için **önce kaldırman** gerekir (sunucudaki oyun verisi kaybolmaz). Google girişinin çalışması için yükleme anahtarının SHA-1'i Firebase'de olmalı (4. adım).

---

## Yayın sırası (bunu aynen uygula)

1. **Web'i deploy et** (`npm run build` + mevcut deploy betiğin) → **tarayıcıda** (masaüstü, Android Chrome, iPhone Safari) ve **eski TWA uygulamasında** test et: giriş/çıkış, oyun, geri tuşu, zümrüt mağazası + Shopier (web) / Play Faturalandırma (TWA) — hiçbiri değişmemiş olmalı.
2. **Firebase'e Android uygulaması + iki SHA-1** (4. adım). 5–30 dk bekle.
3. **AAB'yi dahili test** kanalına yükle → kendi telefonunda `WEBVIEW-TEST-LISTESI.md` testleri.
4. Sorun yoksa **aynı AAB'yi kapalı test** kanalına yükselt (Dahili test → sürüm → "Sürümü yükselt" → Kapalı test). versionCode 14 aynı kalır.

`src/lib/androidAppVersion.js` → `LATEST_ANDROID_APP_VERSION` **şimdi değiştirilmedi** (12). WebView sürümü kapalı testte yayına girdikten sonra güncellersen eski TWA kullanıcılarına "Yeni güncelleme var" uyarısı çıkar. Erken güncellenirse sürüm Play'de görünmeden uyarı çıkar. (Güncellemek için: `node android/configure.mjs --version-code=14` — bu komut `android/twa-manifest.json`'daki sürümü de yazar; TWA'yı ayrıca derlemeyeceksen zararsızdır.)

## Geri dönüş planı

WebView'da ciddi sorun çıkarsa: eski TWA projesinden (`../android/`) **versionCode 15** ile AAB üret (`android\aab-olustur.bat` → sürüm kodu sorulunca `15`) ve kapalı teste yükle. Sürüm kodu geriye gidemez, bu yüzden 15. Web değişiklikleri TWA'yı bozmadığı için **web'de geri alma gerekmez**: `?src=twa` gelen her açılış eskisi gibi TWA sayılır, zümrüt mağazası Play Faturalandırma ile çalışır.

---

## Sık karşılaşılan hatalar (ilk derleme)

| Hata mesajı (kısaltılmış) | Sebep → Çözüm |
|---|---|
| `SDK location not found. Define a valid SDK location with an ANDROID_HOME…` | `local.properties` yok/yanlış → 5. adımdaki `sdk.dir=` satırını yaz (ters bölüleri **çift** yaz: `C\:\\Users\\…`). |
| `Android Gradle plugin requires Java 17 to run. You are currently using Java 11` / `Unsupported class file major version` | Yanlış Java → `set JAVA_HOME=…jdk-17…` sonra tekrar. `java -version` ile kontrol. |
| `RELEASE DERLEMESİ DURDU: webClientId hâlâ yer tutucu` | 3. adım yapılmadı. |
| `RELEASE DERLEMESİ DURDU: Keystore şifreleri yok` / `Keystore bulunamadı` | 2. adım: `keystore.properties` yok ya da `storeFile` yolu yanlış. Yol `android-webview` klasörüne göredir: `../android/android.keystore`. |
| `Keystore was tampered with, or password was incorrect` | `storePassword` yanlış. |
| `Cannot recover key` / `Given final block not properly padded` | `keyPassword` yanlış. |
| `No key with alias 'android' found in keystore` | `keyAlias=android` olmalı (Bubblewrap varsayılanı). |
| `Failed to find target with hash string 'android-36'` / `checkReleaseAarMetadata … compileSdk` | SDK'da API 36 yok → `"%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager" "platforms;android-36" "build-tools;35.0.0"` ya da Android Studio → SDK Manager. |
| `You have not accepted the license agreements of the following SDK components` | `sdkmanager --licenses` → hepsine `y`. |
| `Could not resolve com.android.tools.build:gradle:8.9.1` / `Could not GET https://dl.google.com/…` | İnternet/proxy/antivirüs engeli. Tarayıcıda `https://dl.google.com` açılıyor mu bak; VPN kapat; tekrar dene. |
| `Your project path contains non-ASCII characters` | Proje yolu Türkçe karakter içeriyor (ör. `Masaüstü`). Klasörü `C:\neon-sehir` gibi bir yere taşı (ya da `gradle.properties`'e `android.overridePathCheck=true` ekle). |
| `Java heap space` / `Daemon … disappeared unexpectedly` | `gradle.properties` → `org.gradle.jvmargs=-Xmx3072m`. |
| `'gradlew.bat' is not recognized` | Komutu `android-webview` klasörünün **içinde** çalıştır. |
| Play Console: **"Yüklediğiniz paket yanlış anahtarla imzalanmış"** | Yanlış keystore. SHA-256 `CC:FC:76:A5:…:69:DA` olan `android/android.keystore` kullanılmalı. |
| Play Console: **"Sürüm kodu 14 zaten kullanılıyor"** | Daha önce 14 yüklenmiş → `app/build.gradle.kts`'te `versionCode = 15` yap **ve** web'deki açılışın sürümü otomatik `av=15` olur (koddan okunur). |
| Telefonda: **"Bu telefonda Google hesabı bulunamadı"** ama hesap var | Neredeyse her zaman SHA-1 / istemci kimliği: (1) 4. adımdaki **iki** SHA-1 de ekli mi, (2) `webClientId` **Web** istemcisi mi, (3) 30 dk beklendi mi. Ayrıntı: `adb logcat -s NeonSignIn`. |
| Telefonda: "Google Play Hizmetleri bulunamadı" | Emülatörde "Google Play" sistem görüntüsü kullan (Google APIs değil). |

Hata çözülmezse `What went wrong:` ile başlayan bölümü kopyalayıp Claude'a gönder.

---

## Nasıl çalışıyor (kısa)

| Dosya | Görev |
|---|---|
| `LauncherActivity.kt` | WebView, açılış ekranı, kenardan kenara (sistem çubukları kadar boşluk + klavye), geri tuşu, dış linkler, "Bağlantı yok" ekranı, render süreci ölünce yeniden kurma, dosya seçici |
| `NeonBridge.kt` | `window.NeonAndroid` köprüsü — sadece `https://cetelerinsavasi.com` sayfasında çalışır |
| `GoogleSignIn.kt` | Credential Manager ile Google ID token |
| `FileSaver.kt` | Şarkı MP3'ünü İndirilenler'e kaydetme (izin istemez) |
| `UrlPolicy.kt` | Hangi adres içeride / dışarıda açılır (birim testli) |

**Köprü fonksiyonları** (web: `src/lib/nativeBridge.js`). Asenkron olanların ilk argümanı `requestId`; sonuç `window.__neonNative.resolve("<JSON>")` ile döner.

| Fonksiyon | Ne yapar |
|---|---|
| `getInfo()` | `{"shell":"webview","versionCode":14,"versionName":"1.1.0","sdk":N}` |
| `signInWithGoogle(requestId)` | Hesap seçici → `{ok:true,idToken}` / `{ok:false,cancelled:true}` / `{ok:false,error}` |
| `signOutGoogle()` | Kayıtlı hesap seçimini temizler |
| `exitApp()` | Uygulamayı kapatır (çıkış onayındaki "Çık") |
| `copyText(text)` | Panoya yazar — sadece `navigator.clipboard` başarısız olursa kullanılır |
| `saveFile(requestId, ad, mime, base64)` | ≤ 512 KB dosya |
| `saveFileBegin / saveFileChunk / saveFileEnd / saveFileAbort` | Büyük dosya, 512 KB'lık parçalar |
| `openExternal(url)` | Dışarıda aç (web şu an kullanmıyor; Play linkleri native tarafta yakalanıyor) |

**Köprü güvenliği:** Köprü sadece ana sayfa `https://cetelerinsavasi.com` iken çalışır. Android, `addJavascriptInterface` köprüsünü sayfadaki **her iframe'e** de koyar. Oyunda şu an üçüncü taraf iframe yok (Firebase'in kendi `neon-sehir.firebaseapp.com` giriş iframe'i dışında). İleride **reklam / gömülü video / başka site iframe'i eklenirse**, önce köprüyü `androidx.webkit` `WebViewCompat.addWebMessageListener` (köken kontrollü) yapısına taşı.

**Linkler:** `cetelerinsavasi.com` içeride açılır. `/gizlilik`, `/kosullar`, `/hesap-silme` **tarayıcıda** açılır (oyun yeniden yüklenmez). Play Store linkleri Play Store uygulamasında; Instagram, `mailto:`, `tel:`, `intent:` ilgili uygulamada açılır. `file:`, `content:`, `data:` gezinmeleri engellenir.

**Bilinen farklar (TWA'ya göre):**
- WebView'ın depolaması Chrome'dan ayrı: TWA'dan gelen oyuncu ilk açılışta **bir kez** yeniden giriş yapar (veri kaybı yok). Firestore yerel önbelleği de boş başlar → her cihazda ilk açılışta bir kerelik biraz fazla okuma görünür.
- Zümrüt mağazası bu sürümde WebView'da kapalı (native Play Faturalandırma sonraki adım).
- Android 7–9'da şarkı dosyası `Android/data/com.cetelerinsavasi.twa/files/Download` klasörüne kaydedilir (izin istememek için). Android 10+'da normal İndirilenler klasörü.
- Yazı boyutu oyun düzeni bozulmasın diye %100'de sabit (telefonun yazı boyutu ayarı oyunu büyütmez).
- `allowBackup=false`: telefon yedeğinden geri yüklemede eski WebView verisi taşınmaz (oyun verisi sunucuda, etkilenmez).
- Tabletlerde (Android 16+) sistem portre kilidini yok sayabilir; ekran dönünce oyun yeniden yüklenmez.
