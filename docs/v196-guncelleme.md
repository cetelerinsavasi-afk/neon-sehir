# v196 — Mekânlar oyunun, 3 katlı ev, yeni fabrika

## Özet
- **Oyuncu evleri / ofisleri / işletmeleri kapandı.** Bütün mekânlar oyunun: sabit fiyat; gelir: %50 masraf, belediye vergisi (brüt üzerinden, oran sınırları aynı: %1–20), kalan Neon Borsa hissedarlarına.
- **8 mekân hissesi** (silahçı, galeri, motor galerisi, modifiye, spor, cafe, bar, internet kafe). Casino ve depo hissesiz. Geçişte her oyuncuya her mekândan 10 hediye hisse.
- **Eksik 5 mekân** oyuna eklendi (cafe, bar, internet kafe, casino, depo — 3D parçaları `venueGameParts.jsx`).
- **Fabrika:** işçi sistemi kalktı. Herkes herhangi bir fabrikada **Çalış** → günde 1 kez 5.000. Kuruluş: 100.000 + 2 kripto + 2 elmas makinesi. Elmas makinesi = 20 elmas değeri, ortalama kripto makinesinin 10 katı elmas. Malzeme makineleri tek havuzda elmas makinesine çevrildi. Liste: son 10 gün ortalama geliri > 0 olanlar.
- **Elmas** 10.000–20.000 arasında alındıkça düşen / satıldıkça yükselen rejim (kripto 100–200 bin gibi).
- **Çete ticareti:** mal 0,25'e alınır, varınca 0,5'e kendiliğinden satılır (kasa + kayıt + çete sohbeti). Depo kapasitesi ve 2. el ilanları kalktı (geçişte iade / iptal). Soyulan tır yükü soyana geçer, onun adına satılır.
- **Hisse senedi yatırımı kalktı** (elinde kalan satılabilir; geçişte iade).
- **Stadyum** güneydoğu köşesine, deniz kenarına taşındı (eski taksi durağının karesi + köşe kare: 4 parsel). Eski yerinde sıradan bloklar var. Stadyum otobüs durağı stadyumun batısındaki caddeye (x = 120), dondurmacı stadyumun şehir tarafındaki köşesine taşındı; kurye / taksi noktaları buna göre. Şehir içi harita kendiliğinden doğru; **ana sayfadaki harita resmi** (`sehir-haritasi.webp`) çizim olduğu için stadyumu hâlâ eski yerinde gösterir — resmi yenilersen stadyumun yeni piksel yerini `cityMapMath.js` `MAP_PX`'e ekle.
- **Yeni oyuncu:** 5.000 altın (referansla 10.000).
- **Şampiyona ödülleri** yükseldi (tablo `functions/championshipPrizes.js`).
- **3 katlı ev:** Müstakil'deki ev binası herkesin kendi evi (`houses/home_{uid}`, ilk girişte kurulur). Giriş / üst kat / çatı katı, merdivenler, kesit görünüm. **⚙️ Ayarlar** tek düğme: tasarım modu açılır (kat seç, ekle, taşı, döndür, renk, kaldır, kaydet, satın al) ve aynı yerden evin adı, ziyaretçi kilidi, ana kapı (ahşap / beyaz / çift / salon), garajdaki araç, **Evler** listesi (10+ eşya + açık kapı, 20 gün girmeyen düşer, içinde biri olan evler de görünür), her ev ayrı oda (başka evdekiler görünmez). Evden para kazanılmaz.
- **Katalog:** kalkan kategori / eşyalar satılmaz ve listelenmez (mekânlar çizmeye devam eder), taşınan eşyalar yeni kategorisinde, "Cami" → "İbadet", kalkan kapı türleri (döner, hastane, market, metal, cam).
- **Neon Şehir uygulaması (rehber)** yeni kurallara göre yazıldı; Rıza Amca'nın fabrika görevi "Çalış'a bas".
- Eski istemciden gelen kalkmış işlemler kibar mesajla reddedilir. `BUILD 196`, `minBuild 196` (eski sayfalar oyuncu boştayken kendiliğinden yenilenir).

## Geçişte ne ödenir (tek SMS)
- Ev 500.000 (1M'a alınan tek ev de bu fiyattan — onaylandı) + satın alınmış mobilya / kaplama mağaza fiyatından; **zümrütle alınanlar zümrüt olarak eksiksiz**. İşletme açma / seviye ücreti yoktu, iade de yok.
- Dükkân stoğu **dükkâncının ödediği fiyattan** (ör. galerici Cabrio'yu 750.000'e aldıysa 750.000). Vitrindeki araç / silah sahibine döner.
- Malzemeler (oyuncu envanteri, açık malzeme ilanları, eski dükkân envanteri `businessInventories`) Amazor fiyatının %75'i.
- Sahip olunan her dükkân türü için o mekândan **10 hisse** (1 silahçı + 1 modifiye → 10 silahçı + 10 modifiye hissesi).
- Malzeme makineleri tek havuzda elmas makinesine; artan değer altın. **Geçişte vergi yok** (belediye bu geçişten para almaz).
- Gazino / depo kasası, piyango biletleri, dakika kredileri, hisse senedi (o anki fiyattan, komisyonsuz).
- Spor: bugün ödeyenlerin üyeliği oyunun salonunda aynen devam eder; ödemeyenler yeni sistemle (günlük 1.000).
- Karargahta kalkan mobilya varsa kaldırılır, bedeli çete kasasına.
- Çete: depo kapasitesi iadesi, depodaki mallar ve 2. el ilanlar otomatik satış fiyatından kasaya (yasaklı madde 1.500).

## Yükleme sırası (önemli — veri kaybı olmasın diye iki aşama)
1. **`_v196\asama1\yukle-v196-asama1.bat`** — v195'in üstüne sadece *kapanış modu + geçiş adresi* gider (oyun aynen çalışır; kapanış kapalı). Testler → Firebase fonksiyonları → git push.
2. **`_v196\gecis-v196.bat`** ile sırayla:
   1. **Yedek** (`backup`) → birkaç dakika sonra **Yedek durumu** (`backupStatus`) `ok:true` olana kadar bekle.
   2. **Kapat** (`close`) — yeni ev / işletme / stok / fiyat / makine / hisse senedi alımı kapanır, eski veriler donar.
   3. **Deneme** (`dryRun`) — hiçbir şey değiştirmez; `migrations/v196Report` yazar. Çıkan raporu (`status`) Claude'a gönder. **Onay gelmeden 4. adıma geçme.**
3. **`_v196\yukle-v196.bat`** — v196'nın tamamı: derleme, testler, Firebase fonksiyonları + Firestore indeksleri, git push, Cloudflare beklemesi.
4. **`_v196\gecis-v196.bat` → Uygula** (`apply&approve=<rapor kimliği>`) — `partial:true` dönerse aynı adımı tekrar çalıştır (kaldığı yerden devam eder, ödenen kimse iki kez ödenmez: `migrations/v196/payouts/{uid}`). 23:30–00:40 arası gece işleriyle çakışmasın diye kapalıdır.
5. **Durum** (`status`) — sayılar raporla aynı mı bak.

### Yedek alınamazsa (yetki hatası)
Fonksiyonun hizmet hesabına "Cloud Datastore Import Export Admin" rolü ve kovaya yazma izni gerekir. Olmazsa elle:
```
gcloud firestore export gs://neon-sehir.appspot.com/v196-yedek/elle --project=neon-sehir
```
Bitince: `gecis-v196.bat` → "Elle yedek kaydet" ve yolu yaz (`gs://neon-sehir.appspot.com/v196-yedek/elle`).

### Geri alma
- `geri-al-v196.bat` dosyaları eski haline koyar (silinen eski testler dahil). Yayından da almak için `firebase deploy --only functions` + commit + push.
- **Geçiş (apply) geri alınmaz** — bu yüzden önce yedek. Gerekirse yedekten `gcloud firestore import` ile dönülür (Claude'a sor).

## Okuma / yazma
- Ev: girişte 1 okuma (tx). İlk girişte 1 yazma (+ garaj aracı için bir kez araç sorgusu ≤ 30 belge). Kaydet / satın al: tek işlem. Ziyaret sayacı: ziyaretçi girişinde 1 yazma (sahibi sayılmaz).
- Evler listesi: sadece açılınca tek sorgu (≤ 60) + içinde biri olan en fazla 10 ev. Doluluk ağdaki (RTDB) oyuncu kayıtlarından — ek okuma yok.
- Fabrikalar listesi: tek sorgu (`dailyIncomeAvg10 > 0`, en fazla 40).
- Gece işleri azaldı (işçi maaşı, işletme günlükleri, ofis, pasif işletme, fabrika hisse temettüsü kalktı).
- Ağ paketi: evin içindeyken `hm` (ev kimliği) + `y` (kat yüksekliği) eklenir; başka evdeki oyuncular çizilmez.

## Performans
- Ev yapısı birleştiriliyor: ~1.700 parça → yapı ~75 çizim (kat / duvar / çatı grupları), mobilya ayrı. Evin içindeyken şehir çizilmez (karargah gibi yalıtılmış).
- Dokular mevcut önbellekten (ek dosya indirme yok).
- **Cihazda ölçülmedi** — telefonda evin içinde FPS'e bakıp Claude'a yaz.

## Yeni indeks
`houses`: `listable ASC, popN DESC` (Evler listesi). Yüklemeden sonra birkaç dakika kurulur; kurulana kadar liste hata verir.

## Bilinen eksikler / sorular
- Ev: pencere rengi / modeli, kat başına zemin / duvar kaplaması seçimi (sunucu hazır, arayüz yok), evdeki koltuklara oturma, Evler listesine evin dışından erişim — sonraki sürüm.
- Karargah kapısının değiştirilememesi + karargah garaj kapısı, tablo / yuvarlak halı / kapı tuğlası kozmetik düzeltmeleri, firestore.rules'taki eski eşleşmelerin temizliği, admin paneli: sonraki sürüm.
- Eski oyuncu evi testleri (`houses`, `business`, `furn-market`, çete `market`) kaldırıldı; kalan eski testlerden kalkan sistemi deneyenler gerekçeli olarak atlandı.
