# v154 · Faz 5 — Şehir sağlamlığı (madde 2 ve 3)

## 1) Araç sürerken "ara ara 1 saniye donma"
**Sebep (ölçüldü):** otomatik grafik ayarı kaliteyi oyun sırasında hem düşürüyor hem geri artırıyordu.
Her seviye değişimi ışık sayısını ve gölgeleri değiştirip sahnedeki **tüm shader'ları yeniden derletiyor**
(seviye başına ~7 program), ekran tamponunu yeniden boyutlandırıyordu. Telefon rahatlayınca kalite artıyor →
zorlanıyor → düşüyor → 20 sn sonra yine artıyor… her turda 0,5–1 sn donma.
**Düzeltme:** oyun sırasında kalite sadece düşebilir (zorlanınca). Telefon rahatsa bir üst kalite **sonraki
açılışta** denenir. Oturum içinde tekrar eden derleme yok.
Not: Donma sunucudan gelmiyor — konum yazımları zaten beklemeden (arka planda) gidiyor; oyun hiçbir
yerde sunucu cevabı beklerken durmuyor.

## 2) Oyunun "sıfırlanıp yeniden açılması" ve yarım kalan görev
- Android uygulamasında WebView çökünce (genelde bellek dolunca) uygulama oyunu baştan yüklüyor —
  "sıfırlanıp açılma" bu. Yukarıdaki kalite dalgalanması aynı zamanda bellek dalgalanmasıydı (büyük ekran
  tamponu + gölge haritası tekrar tekrar ayrılıyordu); artık yok.
- **Yarım kalan meslek işi artık kaybolmuyor:** iş ilerlemesi (aşama, durak, yolcular, süre, çarpmalar)
  cihazda saklanır. Oyun kapanır / çöker / yenilenirse: aynı ticari aracı çağır → "İşe başla" → iş
  **kaldığı yerden** sürer (otobüste aynı durak, aynı yolcular). Sunucu yarım işi zaten araç belgesinde
  tutuyordu; ek Firestore okuması / yazması yok. 45 dk'dan eski ya da başka araca ait kayıt devam ettirilmez.
  "İşi bırak" denirse kayıt silinir. Polis kovalamacasında şüpheli ilk görüldüğü yerden tekrar kaçar.

## 3) Bilgisayarda ışınlanan arabalar / yolcu
**Sebep (ölçüldü):** uzak arabanın "şu an nerede" tahmini, gönderenin saatiyle alıcının saatini
karşılaştırıyordu. Telefonların saati internetten ayarlı (aynı), bilgisayar saati sık sık birkaç saniye
kayık. Bilgisayar saati gerideyse tahmin kapanıyor, araba sadece kayıt gelince zıplıyordu; ilerideyse hep
ileri gidip geri sıçrıyordu. Yolcuyken de aynı araba kodu kullanıldığı için yolculuk da ışınlanıyordu.
**Düzeltme:** her uzak araba / oyuncu için "benim saatim − onun saati" farkı gelen kayıtlardan ölçülüyor ve
zamanlar cihazın kendi saatine çevriliyor. Test: izleyicinin saati 3 sn geriyken eski kodda araba karelerin
çoğunda neredeyse durup büyük sıçramalar yapıyordu (en büyük adım ortalamanın 31 katı); yeni kodda saati
doğru cihazla aynı akıcılıkta. Yürüyen oyuncular için de aynı düzeltme.

## Dosyalar
- `src/components/City/cityEngine.js` — kalite döngüsü, saat farkı (araba + yürüyen), tanı fonksiyonları
- `src/components/City/cityJobs.js` — yarım kalan işi saklama / kaldığı yerden sürdürme
- Yeni test: `tests/city/jobs-resume.test.mjs`

## Yayın
Sadece web deploy. Sunucu değişmedi.

## Telefonda kontrol listesi
1. Uzun süre (10+ dk) araç sür → periyodik donma olmamalı.
2. Otobüs işi başlat, birkaç durak sonra uygulamayı tamamen kapat → aç → otobüsü çağır → "İşe başla" →
   "↩️ Yarım kalan iş kaldığı yerden devam ediyor" ve aynı durak.
3. Bilgisayardan gir, telefondaki biri araba sürsün → akıcı. Bilgisayardan onun arabasına yolcu ol → akıcı.
