# WebView geçişi — test listesi

Her maddeyi ✅ / ❌ + kısa not ile işaretle. ❌ olursa kapalı teste **yükseltme**.

**Aynı UID'nin kanıtı (en güvenilir yol):** Firebase Console → Authentication → **Users** → hesabının e-postasını ara.
WebView'da giriş yaptıktan sonra: bu e-posta için **tek satır** olmalı (yeni satır oluşmamalı), **User UID** değişmemeli ve
"Signed in" (son giriş) tarihi şimdiki zaman olmalı. Ayrıca oyunda karakter/altın/eşyalar aynı olmalı.
(İstersen bilgisayardaki Chrome'da `chrome://inspect` ile **debug** derlemesinin konsolunda `firebase` kullanıcısını da görebilirsin; release derlemesinde WebView hata ayıklaması kapalıdır.)

## A. Tarayıcı (web deploy'dan hemen sonra) — HİÇBİRİ DEĞİŞMEMİŞ OLMALI
Masaüstü Chrome, Android Chrome, iPhone Safari'de:
- [ ] Giriş (Google açılır penceresi) / çıkış
- [ ] Oyun akışı (harita, mekân, telefon)
- [ ] Geri tuşu davranışı (Android Chrome'da tarayıcı geri tuşu normal çalışıyor, "Çıkmak istiyor musun?" ÇIKMIYOR)
- [ ] Telefon → Zümrüt Mağazası açılıyor, Shopier linkleri görünüyor
- [ ] Ev/işletmede zümrüt yetmeyince yazı: "Zümrütün yetmiyor (Telefon › Zümrüt Mağazası)."
- [ ] Şarkı MP3 indirme normal indirme olarak geliyor
- [ ] Gizlilik / Koşullar / Hesap silme linkleri yeni sekmede açılıyor

## B. Eski TWA (versionCode 13, telefonda henüz güncellenmemiş) — DEĞİŞMEMİŞ OLMALI
- [ ] Açılış, giriş
- [ ] Zümrüt mağazası açılıyor, Play Faturalandırma fiyatları geliyor (Shopier YOK)
- [ ] HUD altın butonu Parara Bank açıyor
- [ ] Geri tuşu: ekran kapanır → ana sayfada kısa uyarı → çıkış onayı

## C. Yeni WebView (dahili test kanalından, Play imzalı)
1. - [ ] **Mevcut hesapla giriş** → aynı karakter, aynı altın/eşyalar; Firebase Authentication'da aynı UID, yeni satır yok; referans kodu teşviki ÇIKMIYOR (`isNewPlayer` false).
2. - [ ] **Yeni Google hesabıyla giriş** → yeni oyuncu normal oluşuyor (referans kodu teşviki çıkıyor).
3. - [ ] Giriş **iptal** (hesap seçiciyi geri tuşuyla kapat) → hata yok, sessizce geri dönüyor.
   - [ ] **İnternet yokken** giriş → anlaşılır Türkçe mesaj.
   - [ ] **Çıkış** → sonra **başka hesapla** giriş (hesap seçici yeniden çıkıyor).
4. - [ ] Geri tuşu: telefon ekranı → kapanır; mekân → kapanır; 3D sahne → kapanır; ana sayfada önce kısa uyarı → ikinci geri → "Çıkmak istiyor musun?" → üçüncü geri / "Çık" → uygulama kapanır.
   - [ ] Kenardan kaydırma (hareketle gezinme) ile geri aynı şekilde.
   - [ ] **Çıkış onayından "Çık" ile uygulama kapanıyor.** ("Oyunda kal" → oyunda kalıyor, geri tuşu yine çalışıyor.)
5. - [ ] Ses: Flappy Kuş, yarış, şarkı stüdyosu, ev sesleri.
   - [ ] 3D mekânlar, park, stadyum, gezilebilir şehir akıcı.
6. - [ ] Şarkı dışa aktarma → "İndirildi: …mp3" bildirimi → dosya İndirilenler'de, çalıyor (uzun şarkı da: 3+ dk).
   - [ ] Sohbette mesaja uzun bas → "Kopyala" (ChatsApp, grup, çete sohbeti) panoya kopyalıyor.
   - [ ] Play Store linki (güncelleme bandı vb.) **Play Store uygulamasında** açılıyor.
   - [ ] Instagram (Bi fikrin mi var?) Instagram'da / tarayıcıda; hesap silme e-postası mail uygulamasında açılıyor.
7. - [ ] Zümrüt mağazası **hiçbir yoldan** açılmıyor (telefon ikonu yok, HUD altın butonu Parara Bank açıyor, rehber linkleri).
   - [ ] Shopier **hiçbir yerde** görünmüyor (mağaza, SMS'ler, koşullar sayfası `?p=android`).
   - [ ] Zümrüt yetmeyince yazı sadece "Zümrütün yetmiyor." (mağaza adı yok).
8. - [ ] **Yasal linkler** (Gizlilik, Koşullar, Hesap Silme — giriş ekranı ve ana sayfa altı) **tarayıcıda açılıyor**; tarayıcıdan geri dönünce **oyun yeniden yüklenmiyor** (açık ekran/konum aynen duruyor).
9. - [ ] Arka plana al, 10 dk sonra dön → oyun yerinde (gerekirse veriler tazelenir, çökme yok).
   - [ ] Ekranı kilitle-aç.
   - [ ] Uçak modu aç → oyun içinde bağlantı uyarısı / yeniden açılışta "Bağlantı yok — Tekrar dene"; kapat → "Tekrar dene" ile oyun açılıyor.
10. - [ ] Android 7, 10, 13, 15 (en az emülatör): içerik durum çubuğunun ve gezinme çubuğunun **altına girmiyor**; çubuklar koyu (#070A12), ikonlar açık renk; açılışta beyaz flaş yok.
    - [ ] Sohbette klavye açılınca yazı kutusu klavyenin üstünde kalıyor.
11. - [ ] Sixtagram'da uzun gezinme (oyuncunun "iki kez attı" bildirdiği yer) → çökme yok. Çökme olursa oyun kendiliğinden yeniden açılmalı (beyaz/siyah ekranda takılmamalı). Logcat: `adb logcat -s NeonSehir chromium`.
12. - [ ] Uzun oturum (30+ dk): telefon aşırı ısınmıyor, bellek uyarısı / kapanma yok.
13. - [ ] Firebase Console → Firestore → Kullanım: test öncesi/sonrası okuma-yazma sayıları kıyaslanabilir (cihaz başına ilk açılıştaki bir kerelik önbellek dolumu hariç artış yok).
14. - [ ] Dışarıdan `https://cetelerinsavasi.com/...` linkine tıklayınca (ör. WhatsApp'tan) oyun açılıyor, ikinci bir oyun penceresi açılmıyor.
