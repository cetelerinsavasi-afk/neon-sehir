# v138: Maliyeti sıfıra yaklaştırma (v137'yi de içerir)

Hedef: Sunucuya (Firebase) yüklenen işi azaltmak, işi mümkün olduğunca oyuncunun cihazına ve ücretsiz kotalara taşımak.

## 1. Tek zamanlayıcı (`cronTick`): Cloud Scheduler ~₺96 → ~₺0
- Eskiden 29 ayrı zamanlanmış iş vardı; iş başına aylık ~₺3,3 ödeniyordu. Google ilk 3 işi ücretsiz veriyor.
- Artık yalnızca 3 iş var: **cronTick** (dakikada bir), **dailyReset**, **dailyResetRecovery**.
- Kodda `onSchedule({ schedule }, fn)` tanımları aynen duruyor. `onSchedule` işi kaydediyor; cronTick her dakika zamanı gelen işleri çalıştırıyor. Ayrıntılar `functions/cron.js` dosyasında.
- Her iş eski sıklığında çalışıyor (testte doğrulandı):
  - 5 dakikalık işler 5 dakikada bir.
  - Saatlik işler saatte bir; aynı dakikaya yığılmasın diye dakikalara yayıldı.
  - Futbol işleri 18:00 ve 19:00'da, `businessRollover` her saatin 5. dakikasında, `playerNameSweep` Pazartesi 04:40'ta.
  - Günlük işler İstanbul saatiyle 04:xx'te.
- Bir işin hatası diğerlerini durdurmuyor. Dakikada bir çalışan iş sunucuyu sıcak tuttuğu için soğuk başlatma maliyeti de kalkıyor.

## 2. "Mekânda kaç kişi var": anlık, doğru ve neredeyse bedava
- Eskiden her giriş ve çıkışta bir Cloud Function çalışıyor, sunucu Firestore'dan sayıyordu. Uygulaması kapanan oyuncu 1,5–10 dakika "içeride" görünüyordu.
- Artık mekâna giren oyuncu Realtime Database'te `occ/{yer}/{uid}` kaydı açıyor.
  - Bu kayıt RTDB sunucusunda **bağlantı kopunca, uygulama kapanınca ya da arka plana alınınca kendiliğinden siliniyor**.
  - Bağlantı geri gelince kayıt kendiliğinden yeniden yazılıyor.
- Listeyi açan oyuncunun cihazı sayıyor. Firestore okuması ve fonksiyon çağrısı yok; RTDB okuma başına değil veri başına ücretlendiriyor ve bu ağaç birkaç KB.
- Mekân içindeki "diğer oyuncular" listesinde, RTDB'de kaydı olmayan ve 70 saniyedir nabız atmayan oyuncu gösterilmiyor (eskiden 90 saniye kalıyordu).
- `mekanSayac*` 6 tetikleyicisi silindi. `presenceSummary` (10 dakikada bir) eski sürümde kalan oyuncular için bir süre daha çalışacak.
- RTDB'ye ulaşılamazsa sayımlar eski yönteme (stats/presence) dönüyor; oyun bozulmuyor.

## 3. Firestore yerel önbelleği (cihazda)
- Bir ekrana (çete listesi, sohbet, ev listesi…) dönüldüğünde sorgu baştan okunmuyor. 30 dakika içinde yeniden açılan sorgularda yalnızca **değişen** belgeler faturalanıyor.
- Ekranlar önbellekten anında açılıyor.
- IndexedDB yoksa (gizli sekme vb.) SDK kendiliğinden eski moda dönüyor.
- Acil kapatma: tarayıcı konsolunda `localStorage.setItem('neon.noFsCache','1')`.

## 4. Mekân nabzı 30 → 60 saniye
- Konum zaten RTDB'den akıyor; Firestore'a 60 saniyede bir nabız yeterli. Sunucu 2 dakikaya kadar kabul ediyor.
- Aynı mekândaki herkese yazdırılan okumalar yarıya iniyor.
- 3D evlerde "durunca" yapılan Firestore yazımı en fazla 15 saniyede bir yapılıyor.

## Yükleme
`deploy-v138.bat` dosyasını çift tıkla; soru sormadan sırayla şunları yapıyor:
1. RTDB kurallarını yükler.
2. 32 eski işi siler.
3. Hemen ardından cronTick'i yükler (arada ~1–2 dakika boşluk).
4. Tüm fonksiyonları yükler.
5. Hepsi başarılıysa commit ve push yapar.

23:00–01:00 ve 17:45–19:15 arasında çalışmıyor.
