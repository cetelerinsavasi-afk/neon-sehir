# v195 — Pasif mekân, mağaza satış sırası, araç ömrü 10 + 10, ticari tamir, ödül ayarları

v194'ün üstüne kurulur. Yükleme: `_v195\yukle-v195.bat` · geri alma: `_v195\geri-al-v195.bat`.

## Senin kararların (soruldu)
- Ofisler (kind `ofis`) de pasif olur (çete karargâhı hariç).
- Liste filtresi istemcide: zaten okunan ev belgesindeki bayrağa bakılır (ek okuma / yazma / indeks yok).
- Pasiflikten ÖNCE ödenip SONRA biten iş (başlamış spor üyeliği, eski garson siparişi, açık 10 Numara
  masası, çekilmemiş piyango) tamamlanır, para eskisi gibi sahibine gider.

## 1) 20 gün oyuna girmeyen oyuncunun mekânları
- Bayrak: `houses/{id}.biz.passive` (ofiste `office.passive`) + `passiveAtMs`. Ortak kural
  `functions/bizPassive.js` `isBizPassive(h)` (sunucu + istemci). Oyunun mekânları (`__game__`, `bizGame`)
  ve çete karargâhı muaf.
- Gizlenme: `useBusinessList` (Silahçılar, galeriler, cafe/bar, spor… bütün işletme listeleri),
  `useOfficeList`, `DepoSellSheet` (pasif deponun görünümü artık hiç okunmuyor), misafir listesi
  (`houses.js guestPlaces`), futbol bot salon seçimi, modifiye "en az kazanan" yönlendirmesi.
- Para kazanamaz:
  - `business.recordIncomeTx` pasif mekânda işlemi iptal eder (hiçbir yazma işlenmez). Buraya giden bütün
    yollar böylece kapandı: oyunun mağazasından yönlendirilen satış ve doğrudan stok alımı (shop.js
    stockSaleTx), atölye işçilik + malzeme, modifiye, eski dükkân ilanı (index.js buyListing), cafe/bar/sinema
    menüsü, internet kafe / stüdyo dakikası, yayın dakikası (stream.js), mescit bağışı, spor salonu
    (üyelik başlatma + takım antrenmanı + bot antrenmanı), depo al/sat + çete deposundan depoya satış.
  - recordIncomeTx'e gitmeyen gelir yolları ayrıca kapatıldı: gazino (slot, rulet, piyango bileti, 10 Numara
    masası açma), ofis ücretli ürün / bağış / mikser dakikası (office.js chargeTx).
  - `shopOffers/{weapon|vehicle}` ve `shopOffers/depo` haritasından pasif dükkânın teklifleri okumadan
    silinir → `gameStoreBuy` / depo piyasası onları hiç aday görmez. Yine de görürse (eski kayıt) teklifini
    siler ve atlar.
- Gece işi: mevcut gün kapanışı (`businessRollover` → `business.rollover`, her tür günde bir kez) zaten
  o türün ev listesini okuyor; aynı listeyle kontrol edilir. Yeni tam koleksiyon taraması yok.
  - Kimin ne zaman yeniden bakılacağı sunucuya özel `bizIdle/{tür}` belgesinde: `{ next: { evId: ms } }`.
    Herkese açık ev belgesine giriş zamanı yazılmaz. Kurallarda eşleşme yok → istemci okuyamaz.
  - Zamanı gelen evin sahibinin `users/{uid}/private/meta.lastSeenAtMs` kaydı okunur (aynı sahip bir kez):
    20 gün içinde girmişse sonraki kontrol "giriş + 20 gün" → aktif oyuncu için ~20 günde 1 okuma.
    Girmemişse işlem içinde giriş kaydı yeniden okunur ve pasif yapılır.
  - Ofisler: ofis listesi gece okunmadığı için `bizIdle/ofis` = `{ v, own: { evId: sahip }, next }` dizini.
    İlk gece mevcut ofisler bir kez sorgulanır; sonra ev ofis olduğu an `officeSet` dizine ekler.
- Girişte otomatik aktif: `users/{uid}.bizPassive = true` yazılır. `initializePlayer` bu belgeyi ZATEN
  okuyor → bayrağı olmayan oyuncuya giriş başına ek okuma 0. Bayrak varsa giriş kaydı yazıldıktan sonra
  `business.reactivateOwner`: sahibin evleri (1 sorgu), pasif olanların bayrağı silinir, stok dükkânı /
  depo tekliflerini stoktan geri yazar, bayrağı kaldırır, tek SMS ("mekânların yeniden açıldı").
- Stok, eşya, depo malı, gazino kasası, para olduğu gibi kalır; hiçbir şey silinmez / satılmaz.
- Bilinen kenar durum: sahip tam gece kontrolü (00:05, spor 19:05) sırasında, aynı milisaniyelerde girerse
  mekân pasif kalabilir; bir sonraki girişte açılır.

## 2) Oyunun mağazasında satışın gideceği dükkân (shop.js gameStoreBuy)
1. En ucuz fiyat. 2. Eşitse BUGÜN en az kazanan (`bizDayKey(tür)`: spor 19:00, diğerleri 00:00).
3. O da eşitse dünkü sıra (`bizRank`, en altta olan). Pasif aday olmaz, alıcının kendi dükkânı atlanır,
hiçbir dükkânda stok yoksa oyun satar.
- Gizlilik: `shopOffers`, `shopStocks`, `gameVenues`, `houses` istemciye açık → oraya tutar yazılmadı.
  Bugünkü kazanç sadece sahibinin okuyabildiği `businessDaily/{ev}_{gün}.revenue`'dan, **sadece en ucuz
  fiyatta 2+ geçerli aday varsa** ve sadece o adaylar için (en fazla 12) okunur. İşlemin okuma kümesine
  katılmaz (`db.getAll`) → o dükkânlardaki başka satışlar alımı yeniden denetmez.

## 3) Araç ömrü: 10 gün + 10 tamir (tamir +1 gün) — motorlar değişmedi
- `functions/itemRules.js`: `VEHICLE_WEAPON_INITIAL_LIFE_DAYS` 20 → 10, `REPAIR_LIFE_BONUS_DAYS` 2 → 1,
  `VEHICLE_WEAPON_MAX_REPAIRS` 10. Yeni `MOTOR_LIFE_DAYS = 20`, `vehicleLifeCap(katalogNo|belge)`;
  `lifeCapOf(kind, katalogNo|belge)` motoru 20 sayar (yeni araç, ömür düşürme, tamir, değer, sıfır sayılma).
- Kopyalar tek kaynağa bağlandı: `shopStockRules.js` (isPristineItem / isPristineListing artık itemRules'tan),
  `VehicleCard.jsx` (ikiz sabitler kalktı, import), `MarketplaceScreen`, `Workshop`, `CityScreen` (ticari
  satın alma kartı "/ 20 gün" yerine tavan + tamir hakkı), yorumlar.
- `newVehicleDoc` artık araç türüne göre ömür verir (araba / ticari 10, motor / bisiklet / at / deve 20).
- Eski ömür geçişleri (50→30→20, dailyReset'te bayrakla korunuyor) tarihî 20 tavanıyla donduruldu: yeni
  10 sabiti, bayrak eksik olsa bile motor / silahları çekemez.

### Tek seferlik geçiş — `migrations/vehicleLifeCap10`
- `functions/v195Migration.js`, sadece `runV195MigrationNow?secret=…` URL'si çağırır (girişte / App.jsx'te YOK).
- Araba (1–10) + ticari (11–15): `lifeDays > 10` → 10. 10 ve altı, `repairsUsed`, silah, motor dokunulmaz.
- Açık araç ilanında dondurulmuş `vehicleLifeDays > 10` → 10; fiyatı yeni tavanın (itemListingBand.max)
  üstündeyse tavana çekilir; ilan sahibine bir şey kesilmez.
- 400'lük batch'ler (araç arada değişirse o parça tek tek işlemle), bayrak işin başında işlem içinde alınır
  (iki çağrı aynı anda çalışmaz), tekrar açmak zararsız. Sonuç loglanır ve yanıtta döner.
- Tek genel duyuru: `newsEvents` türü `duyuru` → Neon TV Haber'de "Duyuru: …" (gazete ertesi gün gösterir).
- 23:45–00:30 arası reddeder (gece ömür azaltmasıyla çakışmasın).

## 4) Ticari araç: tamir var, geliştirme yok, gelir ×1,5
- `vehicleKinds.js`: `canRepairVehicle` = araba + ticari, yeni `canUpgradeVehicle` = sadece araba.
  `workshopJob` ve `itemListingBand` seviye çarpanı bunları ayrı kullanır; ticari değeri tamir haklarını sayar.
- Tamir malzemesi aynı: fiyat/100 (1.000.000 → 10.000, 500.000'lik tır → 5.000).
- `JOBS.avg`: tır 9.000, otobüs 18.750, taksi 2.250, ambulans 5.250 (farMul, jobPerf, vergi, şirket payı,
  polis, kurye aynı). Ekranlar ücreti JOBS'tan okuyor; sabit yazılmış yer yok.

## 5) Futbol transfer desteği ×2
`FUTBOL_TRANSFER_SUPPORT_UNIT` 20.000 → 40.000. Tavan (×5) ve bot / oto-bot kasa tavanı
(`futbolTreasuryCap = futbolTransferSupportCap`, senin "birebir aynı" kuralın) otomatik ikiye katlandı.
Ekran destek / tavanı sunucunun yazdığı alanlardan gösteriyor; rehberde rakam yok.

## 6) Çete yasaklı madde sipariş hakkı: üye × 3 adet
Adet fiyatı kodda doğrulandı: Amazor 2.500 × `TRADE_ROUTE_BUY_RATIO` 0,5 = 1.250.
`CONTRABAND_ORDER_PER_MEMBER` 2.500 → 3.750 (10 üye → 37.500 altın = 30 adet). İstemci
`gangConstants.js` artık değeri `functions/gang/config.js`'ten alıyor. Rehberdeki eski "× 1.250" yazısı
"her üye için 3 adet" oldu. Yol tutan çetenin savaş limiti değişmedi.

## 7) Değişmeyenler
Şampiyona ödülleri, silah ömrü / tamiri, motorlar.

## Ek okuma / yazma özeti
| Nerede | Ek okuma | Ek yazma |
|---|---|---|
| Oyunun mağazasından alım | en ucuz fiyatta tek geçerli aday: **0** · 2+ eşit aday: aday sayısı kadar (2–12) businessDaily | 0 |
| Giriş (normal oyuncu) | **0** (users belgesi zaten okunuyor) | 0 |
| Giriş (pasif mekânlı, bir kez) | 1 sorgu (sahibin evleri) + pasif stok dükkânı / depo başına 1 | ev başına 1 + teklif belgesi başına 1 + users 1 + SMS 1 |
| Gece (gün kapanışı) | tür başına 1 (bizIdle) ≈ 14/gün + kontrol zamanı gelen sahip başına 1 giriş kaydı (aktif sahip ~20 günde 1) | tür başına en fazla 1 ≈ 14/gün |
| Pasif yapılan ev (bir kez) | 2 (ev + giriş kaydı, işlem içinde) | 2–3 (ev, users, teklif) |
| İlk gece (bir kez) | işletme + ofis sahibi sayısı kadar giriş kaydı + ofis sayısı kadar (dizin kurulumu) | 14 |
| Ev ofis olduğunda (officeSet) | 0 | 1 (sadece ofis olduğu an) |
| Depo satış listesi | **azaldı**: pasif depoların görünümü okunmaz | — |
| Tek seferlik geçiş | vehicles koleksiyonu 1 kez (araç sayısı kadar) + açık araç ilanları 1 kez + 2 | değişen araç + değişen ilan + 2 bayrak + 1 duyuru |

## Firebase'de yüklenecekler
- **Fonksiyonlar: hepsi** (`firebase deploy --only functions`). Ortak modüller (itemRules, vehicleKinds,
  business, shop, gym, venue, office, depo, casino, houses, gang) index.js'teki fonksiyonların çoğunda
  kullanılıyor; seçerek yüklemek eski sabitle çalışan fonksiyon bırakırdı. Yeni fonksiyon: `runV195MigrationNow`.
- Kurallar: **değişmedi** (`bizIdle` varsayılan kapalı kuralla zaten okunamaz). İndeks: **değişmedi**
  (yeni sorgular tek alanlı / sadece eşitlik).

## Geçişin çalıştırılması
`yukle-v195.bat` fonksiyonlar yüklendikten sonra kendisi çağırır. Elle:
`https://europe-west1-neon-sehir.cloudfunctions.net/runV195MigrationNow?secret=<MAINTENANCE_SECRET>`
Yanıt: `{ ok, vehiclesRead, listingsRead, vehiclesCapped, listingsUpdated, listingLifeFixed, listingPriceCapped }`.
İkinci açışta `{ skipped: true }`. (Gerekirse `&again=1` yeniden dener; değişiklik yapmaz.)

## Testler
- `functions/scripts/v195.test.mjs` — değer / bant (araba, ticari, motor, silah), sıfır sayılma, ticari
  tamir / geliştirme yok, yeni araç ömrü, meslek ücreti, geçiş (15→10, 10→10, 5→5, ticari 18→10, motor 20,
  silah dokunulmaz, ilan alanı + fiyat, iki kez çalışma), satış sırası (bugün → dün → ucuz, pasif, kendi
  dükkânı), pasiflik (gizli + gelir yok + teklif silinir + girişte açılır), depo + ofis, recordIncomeTx
  kapısı, çete 10 üye → 30 adet, futbol ×2.
- `tests/ui/v195-ui.test.mjs` — liste filtreleri ek okuma yapmıyor, sabitler tek kaynaktan, ekran yazıları.
- Güncellenen eski testler: shop, credit, v151-jobs, fleet, gang/trade (yeni değerler).

## Kontrol listesi
- [ ] Silahçılar listesi: 20 gün girmeyenin dükkânı yok; o oyuncu girince geri geliyor (SMS).
- [ ] Oyunun silah mağazası: aynı fiyatta bugün az satan dükkân satıyor.
- [ ] Araba / ticari kartı: ömür x / 10, tamir hakkı 10; motor x / 20, tamir yazmıyor.
- [ ] Modifiye garajında ticari: Tamir çalışıyor (+1 gün), Geliştir "geliştirilemez".
- [ ] 2. el: ticari ilan ömür + tamir hakkı gösteriyor; fiyat bandı mantıklı.
- [ ] Tır / otobüs / taksi / ambulans kazancı ~1,5 kat.
- [ ] Çete Ticaret: yasaklı madde hakkı üye × 3 adet.
- [ ] Ertesi gün Neon TV Haber'de araç ömrü duyurusu.
