# v155 — Zümrüt Mağazası (Google Play Faturalandırma) · WebView v15

Sunucu DEĞİŞMEDİ: `functions/`, `firestore.rules`, `database.rules.json`, `firestore.indexes.json` aynı.
`verifyPlayPurchase` aynen kullanılıyor. `LATEST_ANDROID_APP_VERSION` = 14 (dokunulmadı).
Firestore/RTDB okuma-yazma artmadı (yeni dinleyici/yazma yok; sadece mevcut `verifyPlayPurchase` çağrıları).

## 1. Değişen / eklenen dosyalar
**Android (`android-webview/`)**
- `app/.../PlayBilling.kt` (YENİ) — uygulama bağlamında tek `BillingClient` (PBL 9.1.0), `enablePendingPurchases(…enableOneTimeProducts())`, bağlantı koparsa üstel bekleme (1 sn → 60 sn), sadece INAPP, aynı anda tek akış, `setObfuscatedAccountId` (sadece 64 hex özet), sonuçta `quantity`. Asla zümrüt yüklemez / Firestore'a dokunmaz / kendi başına tüketmez.
- `NeonBridge.kt` — `getInfo().billing`, `billingGetDetails`, `billingPurchase`, `billingListPurchases` (sadece PURCHASED), `billingConsume`.
- `LauncherActivity.kt` — PlayBilling'i başlatır/bağlar; arkadayken tamamlanan ödeme varsa öne gelince `ns-play-purchases-updated` olayı; kapanınca bağlantıyı kapatır.
- `app/build.gradle.kts` — `versionCode 15`, `versionName 1.2.0`, `billing-ktx:9.1.0` (Kotlin 2.1.20 ile derlenmezse düz `billing:9.1.0`; Kotlin yükseltilmedi). UA/`av` sürüm kodundan otomatik.
- `README.md` (7. bölüm: lisans testi, dahili test, kapatma anahtarı, derleme notu), `SURUM-NOTU.txt`, `WEBVIEW-TEST-LISTESI.md` (D bölümü).

**Web**
- `src/lib/nativeBridge.js` — `hasNativeBilling()` (senkron, önbellekli) + 4 Promise sarmalayıcı (20 sn / satın alma 10 dk).
- `src/lib/playBilling.js` — native adaptör; `NATIVE_PLAY_BILLING_ON` (kapatma anahtarı **sadece satın almayı** kapatır; sessiz geri yükleme sürer); adet koruması (`quantity > 1` → sunucuya gönderilmez, tüketilmez → Google 3 günde iade eder); UID'nin SHA-256 özeti Play'e; aynı jetonu aynı anda tek doğrulama kilidi; `alreadyOwned` → önce geri yükleme; zaman aşımı → "zümrütlerin yüklenecek". TWA yolu (Digital Goods) DEĞİŞMEDİ.
- `PhoneScreen.jsx` — WebView'da mağaza sadece köprüde faturalandırma varsa + anahtar açıkken (senkron, titreme yok).
- `App.jsx` — sessiz geri yükleme v15'te: açılışta 4 sn sonra + öne gelince + `ns-play-purchases-updated`; v14'te hiçbir şey yapmaz; anahtar kapalıyken de çalışır.
- `GoldStoreScreen.jsx` — UID ile satın alma, Play kullanılamıyorsa düğme "Bu cihazda kullanılamıyor", yarım kalan satın alma mesajı.
- `HouseScreen.jsx`, `BizRequirements.jsx` — "(Telefon › Zümrüt Mağazası)" yazısı mağaza açıksa görünür.
- `tests/webview/*` — 12 yeni test (aşağıda).

## 2. Test sonuçları (bu ortamda)
- `vite build` ✓ · oxlint: yeni hata yok.
- `node --test tests/webview/webview.test.mjs` → **32/32** (20 eski + 12 yeni): tarayıcı / eski TWA / v14 (`billing` yok) / v15 (`billing:true`) mağaza görünürlüğü + servis seçimi; Play fiyatları; "kullanılamıyor"; satın al → UID özeti (ham UID gitmez) → sunucu → tüketme (doğrulamadan SONRA); adet > 1 → doğrulama/tüketme yok (satın alma + geri yükleme); bekleyen; vazgeç / hata / kullanılamıyor; zaten sahip → geri yükleme; aynı jeton aynı anda → tek doğrulama; **kapatma anahtarı kapalı → mağaza + satın alma gizli, sessiz geri yükleme ÇALIŞIYOR**.
- `PlayBilling.kt`: Play Billing 8/9 API imzalarını taklit eden taslaklara karşı Kotlin 2.0.21 ile **hatasız derlendi** (sözdizimi, null güvenliği, geri çağrı imzaları). Gerçek kütüphaneyle tam derleme bu ortamda yapılamadı (Google Maven erişimi kapalı) → ilk gerçek derleme `aab-olustur.bat` ile senin bilgisayarında.

## 3. Yayın sırası
a) `deploy-v155.bat` (web) → tarayıcı + eski TWA + v14 WebView test (README/test listesi A–C) ·
b) `android-webview\aab-olustur.bat` → `NeonSehir-webview-v15.aab` → **dahili test** → lisans test hesabıyla D bölümü ·
c) sorun yoksa kapalı teste yükselt. v15 yayına girince `LATEST_ANDROID_APP_VERSION`'ı 15'e sen çekeceksin.

## 4. Geri dönüş
`src/lib/playBilling.js` → `NATIVE_PLAY_BILLING_ON = false` → push. v15'te mağaza ve "Satın Al" gizlenir, açılıştaki geri yükleme sürer (bekleyen ödemeler yüklenir). Yeni AAB gerekmez.

## 5. Kapalı test sürüm notu (tr-TR, 346 karakter)
Bkz. `android-webview/SURUM-NOTU.txt`.

## 6. Play Console'da senin kontrol edeceklerin
- Lisans testi: Gmail'in, RESPOND_NORMALLY.
- `zumrut_50`, `zumrut_200` etkin; **"Birden çok adet" kapalı**.
