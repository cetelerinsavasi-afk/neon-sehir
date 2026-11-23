# v191 — Kalabalıkta akıcılık + harita açıkken atma + takılma kaydı

Sunucu (Firebase fonksiyonları, kurallar, indeksler) DEĞİŞMEDİ. Firestore ve RTDB okuma/yazma
sayısı aynı (artmaz). Oyuncu verisine dokunulmaz. Sadece site (arayüz) güncellenir.

## Değişenler

### 1. Kalabalıkta kasma (asıl düzeltme) — `src/components/City/cityNet.js`
Şehirde biri hareket edince RTDB hücrenin tamamını yeniden verir. Eski kod bu durumda hücredeki
HERKESİ motora yeniden gönderiyordu; motor da her seferinde her oyuncunun avatarını (birkaç KB)
metne çevirip karşılaştırıyordu. İş, oyuncu sayısının karesiyle büyüyordu.

Sahte RTDB ile ölçüldü (3 sn, herkes aynı bölgede yürüyor, `tests/city/city-net-load.test.mjs`):

| Oyuncu | Konum kaydı | Motora giden güncelleme (eski) | (yeni) |
|---|---|---|---|
| 10 | 90 | 920 | 89 |
| 30 | 270 | 8.160 | 266 |
| 100 | 900 | 90.200 | 886 |

Artık aynı anda gelen hücre güncellemeleri birleştirilir (en sık ~20 kez/sn) ve motora yalnızca
kaydı değişen oyuncu / araba gider. Motordaki avatar karşılaştırması da aynı nesne gelince atlanır.
Ağdan inen veri ve yazım sıklığı aynı.

### 2. Büyük harita açıkken — `CityScreen.jsx` (CityBigMap) + `cityEngine.js` (setLite)
Harita açıkken arkadaki 3D şehir tam hızda (60 kare/sn) çizilmeye devam ediyordu, harita da her
karede baştan çiziliyordu: iki ağır çizim aynı anda → zayıf telefonda ısınma, kasma, bellek taşıp
oyundan atma. Artık harita açıkken şehir yavaş çizilir (sürerken 30, yürürken/dururken 12 kare/sn;
oyun mantığı aynen sürer) ve harita sadece sürükleme/yakınlaştırmada hemen, yoksa ~8 kez/sn çizilir.
Harita kapanınca şehir normal hızına döner. Kalite seviyesi bu yüzden düşmez.

### 3. Açılış: ev motoru şehirle yüklenmiyor
Şehir, ev motorundan (houseEngine.js) sadece ortak çiziciyi, ifadeleri, evcil hayvan / ateş aurası
süslerini ve eşya küçük resmini kullanıyordu ama dosyanın tamamını yüklüyordu. Bunlar küçük dosyalara
ayrıldı (`sharedRenderer.js`, `figureFx.js`, `itemThumbs.js`); houseEngine.js bunları aynı adlarla
yeniden dışa aktarır (diğer ekranlar değişmeden çalışır). Kazanç küçük: ilk açılışta ~66 KB (gzip
~25 KB) daha az kod. İlk yükün asıl ağırlığı three.js ve ev eşya katalogları (şehir mekânları
kullanıyor) — bkz. "Sonraki adımlar".

### 4. Takılma kaydı (tanı aracı, varsayılan KAPALI)
Telefonda tarayıcı konsolunda / uygulamada açmak için:
`localStorage.setItem('neon.hitch','1')` → sayfayı yenile → şehre gir.
120 ms'den uzun süren her karede sol üstte bir satır çıkar, ör.
`640 ms · +3 shader +2 doku · 9 oyuncu 2 araç · düşük 1.00 · sürüş`
- `shader` = ekran kartı yeni bir malzeme derledi (yeni araba / mekân / ışık değişimi)
- `doku` / `geo` = ekran kartına yeni resim / model yüklendi
- `GC` = çöp toplama (bellek temizliği)
- `?` = yukarıdakilerden hiçbiri (çoğunlukla ağır JavaScript ya da telefonun kendisi)
Kapatmak: `localStorage.removeItem('neon.hitch')`. Sunucuya hiçbir şey gönderilmez.

### 5. BUILD 189 → 191 (`src/lib/forceUpdate.js`)
`neon-flags.json` değişmedi (minBuild 189) → kimse zorla yenilenmez. Herkesin yeni sürüme hemen
geçmesi istenirse `public/neon-flags.json` içinde `"minBuild": 191` yapılıp gönderilir.

## Kontrol listesi (yayından sonra)
- [ ] Telefonda oyunu aç: şehir normal açılıyor, avatarın ve diğer oyuncular görünüyor.
- [ ] Diğer oyuncular yürürken akıcı hareket ediyor (ışınlanma / donma yok).
- [ ] Biri arabaya binip sürüyor: araba diğer ekranda akıcı.
- [ ] Mini haritaya dokun → büyük harita açılıyor, sürükle / yakınlaştır akıcı, oyuncu noktaları
      hareket ediyor. Kapat → şehir eskisi gibi akıcı.
- [ ] Arabayla giderken haritayı aç-kapat: araba durmuyor.
- [ ] Bir oyuncuyu engelle → kayboluyor; engeli kaldır → geri geliyor.
- [ ] Ev / mekân / modifiye ekranı, araba resimleri, Sixtagram şehir fotoğrafı normal.
- [ ] Ev eşya rafında küçük resimler çıkıyor.

Geri dönüş: `_v191\geri-al-v191.bat` (sonra commit + push).
