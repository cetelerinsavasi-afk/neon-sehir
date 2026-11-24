# v196 — Faz 0: Keşif ve Plan

v195 kodundan (commit `472e5b8`) çıkarıldı. Satır numaraları bugünkü koddan yeniden doğrulandı.
Bu belge kod yazılmadan önceki durumdur; **"Sana sorular"** bölümü cevaplanmadan Faz 1'den sonrasına geçilmez.

---

## 0. Belgedeki referansların doğrulaması

| Belgedeki | Bugünkü kod | Durum |
|---|---|---|
| `CLOSED_SHOPS` | `src/components/City/world/outerWorld.js:42`: bar, cafe, netkafe, spor, galeri, silah, casino, modifiye, ev, ofis, liman | ✅ aynı |
| `cityEngine.js ~4191` iç mekân mesafesi | `:4191` `IS_MOBILE ? 24 : 32`, vitrinli binada `45 : 70` | ✅ (telefonda 24/45) |
| `cityEngine.js ~4455` `iso` | `:4455` `if (c.iso) vis = false`; `iso` `:3504/:3520`'de açılıp kapanıyor | ✅ |
| `getPerf` / `dbg.info` | `getPerf` `:5281` (sadece tier/dpr/drs veriyor, draw call yok). Draw call için `renderer.info` eklenecek | ⚠️ ölçüm alanı eklenecek |
| `cityPlan.js` mustakil | Yol `src/components/City/cityPlan.js` (belgede `world/` altında değil) | ⚠️ yol farklı |
| `index.js ~8122` ömür geçişi notu | `:8144` civarı, `migrateArabaGelistirmeUnification` notu (her açılışta tüm kullanıcıları tarayan eski hata) | ✅ |
| `GAME_SLOT_STATE_CUT` | `functions/casinoRules.js:26` = 100 | ✅ |
| `CRYPTO_LOW_BAND/HIGH_BAND` | `index.js:4584-4585` = 50.000 / 400.000 | ✅ |
| `INVESTMENT_REGIME_FLOOR_RATIO` | `index.js:4467` = 1/2; eşik elmas 20.000 → taban 10.000 | ✅ (bkz. §5.3) |
| `miningMachinePrice` / `miningFleetValue` | `index.js:925 / :944` (istemcide kopya: `FactoryScreen/factoryHelpers.js:30`) | ✅ |
| `MINING_ELECTRICITY_RATE` | `index.js:3478` = 0,3 (gece bloğu içinde yerel sabit) | ✅ |
| `tieredFleetValue` | `functions/factoryMachineRules.js:33` | ✅ Örnek doğru: 10 tamir = 545.000 → 25 elmas makinesi + 5.000 artan |
| `TRADE_ROUTE_BUY_RATIO` | `functions/gang/config.js:85` = 0,5 (`gang/core.js:598` kullanıyor) | ✅ |
| `CONTRABAND_ORDER_PER_MEMBER` | `gang/config.js:108` = 3.750; istemci `gangConstants.js:64` sunucudan okuyor (tek kaynak) | ✅ tek yer değişecek |
| `REFERRAL_NEW_PLAYER_BONUS` | `index.js:1269` yerel sabit = 2.000 | ✅ |
| Başlangıç altını | `index.js:1189` `gold: 2000` (`initializePlayer`) | ✅ |
| `recordGameIncomeTx` | `business.js`, çağıranlar `shop.js:372, 373, 482, 873` | ✅ |
| `BORSA_COS` | `borsa.js:79`: 6 seyyar + 4 şirket | ✅ |
| `BORSA_TAX_RATE_ID 'hisse'` | `belediyeRates.js:88` `hisse` | ✅ |
| `materials.buyoutValue` | `materials.js:48` | ✅ |
| `stockUnitCost` | `shopStockRules.js:35` | ✅ |
| Park güvenli satış 2.500 | `index.js:6574` `PARK_SAFE_SELL_PRICE = 2500` + çeteye 500 haraç + günde 10 adet | ✅ (bkz. soru 1) |
| `listFactoryShare` | `index.js:1887`. **`SHARE_SALES_CLOSED = true` (`:1869`)**: yeni ilan zaten kapalı, var olan sözleşmeler (10 ya da 20 gün) bitene kadar ödeniyor | ⚠️ durum belgeden farklı |
| 3 katlı ev prototipi | **Pakette yok.** Ne derlenmiş paket ne kaynak var | ❌ Faz 4 başlayamaz |

---

## 1. Envanter

### 1.1 Sunucu modülleri (functions/)

| Modül | Satır | Ne yapıyor | v196 |
|---|---|---|---|
| `houses.js` | 1.548 | Ev al/gir/kaydet/checkout/ayar/davet/sohbet, işletme aç-kapa (`bizOpen/bizClose`), `fund`, `furn*`, `hq*`, `venueEnsure`, `sellHouse`, `guestPlaces` | **Değişir**: tembel `home_{uid}`, kat alanı `f`, kilit, kapı türü, liste sorgusu. `buy`, `bizOpen`, `bizIntent`, `sellHouse`, `furn*` kalkar |
| `business.js` | 485 | `businessDaily`, `bizRank`, `businessRollups`, `rollover`, `sendShortageSms`, v195 pasif mekân | **Değişir**: sadece `game_*` gelir kaydı + gece vergi/hissedar dağıtımı. Oyuncu kısmı, `bizRank`, pasif kod, kıtlık SMS'i kalkar |
| `shop.js` | 1.210 | Silahçı/galeri/modifiye: stok, vitrin, fiyatlar, atölye (işçilik + malzeme), `stockBuy`, teklif yönlendirme | **Değişir**: sabit fiyat, işçilik yok, malzeme oyundan sınırsız. `stock*`, `vitrin*`, `prices`, `offersEnsure` kalkar |
| `shopStockRules.js` | 106 | Stok alış fiyatı, en ucuz teklif | Geçişte iade hesabı için kalır, sonra kalkar |
| `venue.js` | 562 | Cafe/bar menü, garson (`venueWaiters`, `venueOrders`), temizlik | **Değişir**: oyunun cafe/bar'ı, bot garson, sabit menü fiyatları |
| `office.js`, `officeData.js` | 321 | Ofis sistemi, dakika kredisi, ücretli ürün | **Kalkar** (geçişte kredi iadesi) |
| `homeOffice.js`, `homeOfficeData.js` | 336 | Ev ofisi | **Kalkar** |
| `depo.js` | 469 | Oyuncu depoları (`depots`, `depotView`, `shopOffers/depo`), al/sat, çete deposundan satış | **Değişir**: tek oyun deposu, yasaklı madde 2.000; tır otomatik satışını alır |
| `gym.js` | 437 | Salon üyeliği (`gymMemberships`), %10 bonus, `expireMemberships` | **Değişir**: tek oyun salonu, 1.000/gün, bonus kalkar |
| `casino.js`, `casinoRules.js` | 478 | Oyuncu gazinoları (`casinoMachines`, `casinoLottery`) | Oyuncu gazinosu **kalkar**; oyunun gazinosu kalır, slot 1.400, devlet payı 0 |
| `gameCasinoVault.js` | 103 | Gece oyunun gazino kasasını belediyeye aktarır | **Değişir**: aktarım durur |
| `stream.js` | 571 | Yayın (`streams`, `streamHouses`, `streamSeats`, `streamDonations`) | **Değişir**: sadece internet kafedeki yayın bilgisayarı, 200/dk |
| `furnMarket.js` | 240 | Mobilya pazarı (`furnListings`, `furnMarket`) | **Kalkar** |
| `autoSupply.js` | 109 | Oto tedarik (`ownListingStock`) | **Kalkar** |
| `materials.js` | 81 | Malzeme tutma, `buyoutValue` | Geçişte iade için kalır; üretim yolu kalkar |
| `factoryMachineRules.js` | 43 | Tamir/silah/araba makine fiyat ve üretim | Geçiş hesabı için `tieredFleetValue` kalır; geri kalanı kalkar |
| `borsa.js` | 828 | Neon Borsa | **Değişir**: 8 mekân hissesi (`kind: 'mekan'`), hisse vergisi muafiyeti |
| `belediyeRates.js` | 274 | Vergi kalemleri | **Değişir** (§2.7) |
| `stateTreasury.js` | 298 | Devlet defteri | Kalkan kalemlerin istatistik anahtarları sessizce yok sayılır |
| `bizPassive.js` | 17 | v195 pasif kural | **Kalkar** |
| `businessCatalogData.js` | — | İşletme türleri, gerekli mobilyalar | **Değişir**: sadece oyun mekânı tanımları kalır |
| `houseCatalogData.js` | 258 | Katalog fiyatları (istemciyle ortak) | **Değişir** (Faz 5) |
| `houseDoor.js` | — | Kapı tanımları | **Değişir** (Faz 5 kapıları) |
| `hq.js` | — | Karargah | Kapılar kilitlenir, garaj kapısı eklenir |
| `cityJobsData.js` | 193 | Taksi/otobüs/112 noktaları, `taksi_duragi`, `DROP_KEYS` (`ev`, `stadyum`) | **Değişir** (Faz 3 harita) |
| `gang/actions/trade.js`, `gang/config.js`, `gang/core.js`, `gang/clock.js` | 392 + 314 | Sipariş, tır, depo, limit | **Değişir** (§2.4) |
| `accountDeletion.js` | 1.100 | Hesap silme | **Değişir**: `home_{uid}`, kalkan koleksiyonlar çıkar |
| `adminPanel.js` | — | Admin | **Değişir**: v196 geçiş düğmeleri, kalkan ekranlar |
| `v124Migrations.js` | — | Eski malzeme iadesi (`buyoutValue` kullanıyor) | Dokunulmaz |

### 1.2 index.js içindeki fonksiyonlar

| Fonksiyon | Satır | v196 |
|---|---|---|
| `initializePlayer` | 1173 | Başlangıç 5.000. `bizPassive` dalı kalkar. Ev belgesi oluşturulmaz (tembel) |
| `applyReferralCode` | 1234 | `REFERRAL_NEW_PLAYER_BONUS` 5.000 |
| `createFactory`, `getFactoryValue`, `setFactoryName/Logo` | 1405–1720 | Kalır; değer hesabından malzeme makineleri çıkar, elmas makinesi eklenir |
| `buyFactoryMachine` | 1556 | Sadece `mining` + yeni `elmas`. Kapanış modunda kapalı |
| `setFactorySalary`, `joinFactoryMachine`, `autoJoinFactory`, `reassignEmployee`, `produceAtFactory`, `resignFromFactory`, `fireEmployee` | 1623–2606 | **Kalkar** (eski istemciye kibar hata) |
| `listFactoryShare`, `cancelFactoryShareListing`, `buyFactoryShare` | 1887–2140 | Zaten kapalı; sözleşmelere ne olacağı soru 3 |
| `triggerAllMining`, `runFactoryMachines` | 2538, 2562 | Elmas makinelerini de tetikler |
| `ensureFactoryMigrationsV38` | 2478 | Kontrol edilecek (her fabrika açılışında okuma yapıyorsa kalkar) |
| `dailyReset` gövdesi | 3011– | Bkz. §3 |
| `hourlyInvestmentUpdate` | 4586 | Hisse senedi kalkar; elmasa `DIAMOND_LOW/HIGH_BAND` |
| `buyInvestment` / `sellInvestment` | 4974 / 5021 | `stock` kalkar |
| `buyFromAmazor`, `sellMaterial`, `sellSilahMaterial` | 4792–4853 | Amazor v124'te zaten kapalı (eski istemciye ret). Malzeme pazarı kalkar; `AMAZOR_PRICES` (`itemRules.js`) %75 iade tabanı olarak kalır |
| `upgradeWeapon`, `repairItem`, `upgradeVehicle` | 4776–4842 | Oyunun silahçı/modifiyecisine bağlanır (10 / 100 / 500 altın malzeme) |
| `buyLotteryTicket` | 5501 | 100 altın, tamamı havuza; kazanç vergisi kalkar |
| `spinSlot` | 5569 | 1.400, devlet payı 0 |
| `sellContrabandAtPark` (`safe`) | 6626 / 6574 | Soru 1 |
| `buyFromGazinoBar` | 6924 | Cafe/bar fiyat tablosuna bağlanacak mı, kontrol edilecek |
| `placeLimanOrder` / `cancelLimanOrder` | 7013 / 7020 | Liman kapalı (v124); sadece kalan kayıt temizliği |
| `createListing` / `buyListing` (malzeme) | 10268 / 10928 | Malzeme ilanı kalkar; araç/silah 2. el kalır |
| `settleMaterialListingBatches` | 8537 | **Kalkar** |
| `expireOldFactoryShareListings` | 8679 | Soru 3'e bağlı |
| `runV195MigrationNow` | 2877 | Örnek alınacak (`onRequest` + secret + gece penceresi) |
| `businessRollover` | 438 | Bkz. §3 |
| `recordVenueVisit` | 358 | Ev popülerlik sayacına bağlanır |
| `enterInterior` / `expireInteriorPresence` | 6791 / 6826 | Ev odası ayrımı (`home_{uid}`) |

### 1.3 Koleksiyonlar

**Kalkacak (geçişte iade defterine işlendikten sonra silinir):**
`businessInventories`, `shopStocks`, `shopOffers`, `furnListings`, `furnMarket`, `houseFunds`, `depots`, `depotView`, `casinoMachines` (oyuncu gazinoları), `casinoLottery` (oyuncu gazinoları), `netSessions` (oyuncu kafeleri), `bizSpend`, `officeSpend`, `officeDaily`, `bizIdle`, `businessRollups` (oyuncu kısmı), `businessDaily` (oyuncu kısmı, `game_*` kalır), `venueWaiters`/`venueOrders` (oyuncu mekânları), `streamHouses`, `houseInvites` (oyuncu evleri), `houses/{id}/chat`, `factories/*/shares` (soru 3), `factories/*/machines` içindeki tamir/silah/araba türleri, `users/*/inventory` içindeki malzeme belgeleri, `marketplaceListings` içindeki malzeme ilanları.

**Değişecek:** `houses` (oyuncu evi → `home_{uid}`, karargah ve `game_*` aynen), `houseInventories`, `housePresence`, `interiorPresence`, `gymMemberships`, `gameVenues`, `borsa/*`, `belediye` oran belgeleri, `investments/current` (`stockPrice` kalır ama kullanılmaz), `users` (sayaçlar, hisse senedi alanı, `favVehicleId`), `dailyActions` (Çalış butonu), `gangs/*` depo/tır/sipariş.

**Yeni:** `migrations/v196` (bayrak, cursor, sabit elmas fiyatı), `migrations/v196Report`, `migrations/v196/payouts/{uid}`, `migrations/v196Gang/payouts/{gangId}` (karargah iadesi).

### 1.4 firestore.rules (kalkacak ya da daralacak eşleşmeler)
`houseFunds` 433 · `venueWaiters` 443 · `venueOrders` 447 · `businessInventories` 462 · `shopStocks` 467 · `furnListings` 472 · `furnMarket` 476 · `shopOffers` 481 · `depots` 487 · `depotView` 491 · `casinoMachines` 497 · `casinoLottery` 501 · `businessDaily` 509 (sadece `game_*` herkese okunur kalabilir) · `businessRollups` 513 · `streams` 544 · `netSessions` 568 · `bizSpend` 572 · `officeSpend` 577 · `officeDaily` 581 · `gymMemberships` 603 · `factories/machines` 127 · `factories/shares` 147 · `houses` 414 (yeni: `home_{uid}` okuma kuralı, kilit) · `migrations/*` (istemciye kapalı).

### 1.5 firestore.indexes.json
- Bugün etkilenen bileşik indeks yok. `fieldOverrides`: `machines.type`, `machines.lastProducedDateKey`, `machines.ownerTriggeredDateKey`, `shares.status`. İşçi kalkınca `lastProducedDateKey` kaldırılabilir.
- **Eklenecek:** `houses` (`kind == 'home'`, `locked == false`, `itemCount >= 10`, `visitsDay desc`) için 1 bileşik indeks (§Faz 4.5).

### 1.6 İstemci (src/)
**Kalkacak ekranlar:** `BusinessHub`, `MekanlarScreen` (+ `VisitTab.jsx`, Soygun › Ziyaret), `HomeOffice`, `HouseScreen` içindeki HouseBusiness parçaları, `Furniture` (pazar kısmı), `Depo` (oyuncu deposu), `Casino` (oyuncu gazinosu), `Stream` (ev yayını), fabrika işçi/maaş ekranları (`FactoryScreen` içinde), yatırımlardaki hisse senedi paneli (`BankScreen`), `CityBizList` ve "+ … aç" butonları, malzeme pazarı.
**Değişecek:** `City/world/outerWorld.js` (`CLOSED_SHOPS`), `City/cityEngine.js`, `City/cityPlan.js`, `City/cityLayout.js`, `City/world/map.js`, `City/world/layouts.js`, `WeaponShopWorldScreen`, `CarDealershipWorldScreen`, `MotorGallery`, `TuningGarageWorldScreen`, `Gym`, `CasinoWorldScreen`, `LotteryScreen`, `FactoryScreen` (Çalış butonu, elmas makinesi), `Gangs` (sipariş fiyatları, otomatik satış), `GuideScreen` + Rıza Amca görevleri, `AdminPanel`, `ProfileFullScreen` (favori araç kalbi), `src/lib/myShops.js`, `src/lib/forceUpdate.js`, `public/neon-flags.json`.

---

## 2. Kaldırılacaklar / Değişecekler / Yeni eklenecekler (özet)

**Kaldırılacaklar:** oyuncu evi satın alma ve oyuncu işletmeleri (8 tür + gazino + depo), ofis + ev ofisi, mobilya pazarı, dükkân stokları + teklif yönlendirme + `bizRank`, oto tedarik, v195 pasif mekân kodu, malzeme pazarı ve malzeme makineleri, işçi sistemi (maaş, katılma, üretim, ceza, rapor satırı, vergi kalemi), yatırımlarda hisse senedi, Soygun › Ziyaret, ücretli ev ürünleri, Faz 5 katalog kalemleri ve 5 kapı, `CityBizList`, Ofisler binası.

**Değişecekler:** oyunun mekânları (8 tür) sabit fiyatlı ve 50/vergi/hissedar gelir paylaşımlı; casino (1.400, devlet payı yok, kasa aktarımı yok); piyango (100, kesintisiz, vergisiz); depo girilebilir ve 2.000; çete sipariş fiyatları ve tırın otomatik satışı; fabrika (sadece kripto + elmas); elmas fiyat bantları; belediye kalemleri; başlangıç parası; harita (taksi durağı, stadyum, otobüs durağı, çimlik); karargah kapıları; mobilya katalog kategorileri.

**Yeni eklenecekler:** kapanış modu bayrağı, v196 geçiş fonksiyonu (dryRun/apply, iade defteri, sayfalama), 8 mekân hissesi, elmas makinesi, "Çalış" butonu, internet kafe (PS, bilgisayar, yayın bilgisayarı), bot garsonlu cafe/bar + masalı dış alan, 3 katlı kişisel ev (`home_{uid}`), garaj + favori araç, Evler listesi (Müstakil Evler bloğu), yeni ev kapıları, karargah garaj kapısı.

**Not, oyunun mekânları:** Bugün `GAME_VENUE_TYPES = ['silahci','galeri','motogaleri','modifiye','spor']` (`business.js:47`). Cafe, bar ve internet kafenin oyuna ait bir sürümü yok; `game_cafe`, `game_bar`, `game_netkafe` (ve `game_casino`, `game_depo`) yeni tanım olarak eklenecek.

---

## 3. Gece ve saatlik işler: tek tek

| İş | Yer | Ne oluyor | v196 |
|---|---|---|---|
| `businessRollover` (saat başı :05) | index.js:438 | `business.rollover` (tür başına ev listesi okur), `sendShortageSms` (stok hatırlatma), `venue.cleanup`, `homeOffice.cleanup`, `office.cleanup`, `gym.expireMemberships`, `cleanupMoneyLog` | Sadece mekân geliri dağıtımı (8 `game_*` belgesi) + `gym.expireMemberships` + `cleanupMoneyLog` kalır. Diğerleri kalkar → **tür başına ev listesi okuması biter** |
| v195 pasif mekân taraması | `business.rollover` içinde + `bizIdle/*` | Kalkar |
| `borsaHourly` (:01) | index.js:431 | 00:01 dağıtım + 20 gün kuralı | 8 mekân hissesi eklenir (aynı belge, `A` yöntemi) |
| `dailyReset` › `-0.5 mining` | index.js:3208 | Tetiklenen kripto makineleri | Elmas makineleri de |
| `dailyReset` › `-0.4 sahip-yerine-üretim` | index.js:3295 | İşçili 4 tür | **Kalkar** |
| `dailyReset` › `-0.35 fabrika günlük gelir` | index.js:3390 | Maaş, elektrik, rapor | Maaş satırı kalkar; elmas elektrik %30 eklenir |
| `dailyReset` › `-0.32 hisse temettüsü` | index.js:3719 | Fabrika hisse sözleşmeleri | Soru 3 |
| `releaseLeftFactoryWorkers`, `runYasakliMachineRetireV38` | dailyReset başı | Her gece çalışıyor | **Kalkar** (boşuna okuma) |
| `dailyReset` › `gameCasinoVault` | index.js:4225 | Oyun gazinosu kasası → belediye | **Kalkar** |
| `dailyReset` › piyango | index.js:4428 | Vergi kesiliyor | Vergi kalkar |
| `gym` %10 bonus (19:00 kapanışı) | gym.js | `businessRollups` | **Kalkar** |
| Fabrika maaşları | produceAtFactory + gece | Kalkar |
| Oto tedarik | autoSupply.js (`business.js` import) | Kalkar |
| Depo teklifleri | `shopOffers/depo` | Kalkar |
| Ev kira / ipotek | **Kodda yok** (ev tek seferlik 500.000) | — |
| `settleMaterialListingBatches` (saatlik) | index.js:8537 | Kalkar |
| `expireOldFactoryShareListings` (günlük) | index.js:8679 | Soru 3'e bağlı |
| `expireInteriorPresence` (5 dk) | index.js:6826 | Kalır; ev odası anahtarı değişir |
| `fleetMigrateV177`, `v124Migrate`, `champV2Migrate`, `shopV130Migrate` | — | Bayraklı (1 okuma). `shopV130Migrate` dükkân stoklarına dokunuyorsa kalkar, kontrol edilecek |
| `gang/clock.js` gece | tır varışı | Otomatik satış + sohbet mesajı eklenir |

---

## 4. Geçişte dokunulacak veri (tahmin)

Üretim veritabanına erişimim yok; gerçek sayıları **dryRun raporu** verecek. Aşağıdaki formüller dryRun'ın okuyacağı belgeleri gösteriyor (O = oyuncu sayısı, E = oyuncu evi/işletme/ofis sayısı, F = fabrika sayısı).

| Koleksiyon / alan | Okuma | Yazma (apply) |
|---|---|---|
| `users` (hisse senedi, sayaçlar, `houseCount`) | O (sayfalı, `select` ile sadece gereken alanlar) | ödeme alan oyuncu başı 1 |
| `users/*/inventory` (malzeme, sadece 3 belge kimliği) | O × 3 doğrudan `get` (ya da `collectionGroup('inventory')` + filtre, daha ucuz) | malzemesi olan başı ≤3 silme |
| `houses` (oyuncu, `ownerUid != '__game__'`, karargah hariç) | E | E silme (+ alt `chat`) |
| `houseInventories` | O'dan az (belgesi olanlar) | sıfırlama |
| `houseFunds`, `shopStocks`, `businessInventories`, `depots`, `depotView`, `casinoMachines`, `casinoLottery` | E'ye bağlı, belge başı 1 | silme |
| `furnListings` | açık ilan sayısı | silme |
| `marketplaceListings` (malzeme) | açık malzeme ilanı | silme |
| `netSessions`, ofis kredileri, `gymMemberships` (bugünün) | açık oturum | silme / kapatma |
| `factories` + `machines` | F + makine sayısı | malzeme makinesi silme, elmas makinesi ekleme (sayı alanı, makine başı belge değil, bkz. §5.4) |
| `gangs/*/hq` mobilyaları | çete sayısı | kaldırılan eşya varsa 1 + defter |
| `migrations/v196/payouts/{uid}` | var mı kontrolü: ödeme başı 1 | ödeme başı 1 |
| SMS | — | ödeme alan oyuncu başı 1 |

**Kabaca toplam:** okuma ≈ 2·O + 3·E + makine sayısı; yazma ≈ 3 × (ödeme alan oyuncu) + silinen belge. Tek seferlik.

---

## 5. Okuma/yazma maliyeti: önce / sonra (tahmin)

**Bugün maliyet nereden geliyor (bu güncellemeyle ilgili kısım):**
1. `businessRollover` her tür için ev listesini okuyor (günde tür başı 1 sorgu × ev sayısı) + `bizIdle` + giriş kaydı okumaları.
2. Oyuncu mekânına her giriş: ev belgesi + `businessDaily` + `shopStocks`/`depotView`/`casinoMachines` gibi yan belgeler.
3. Mekân listeleri (`useBusinessList`, `useOfficeList`): her açılışta tür başı sorgu × ev sayısı.
4. Gece fabrika blokları: her makine okunuyor, işçili makinelerde ek okuma ve yazma; `releaseLeftFactoryWorkers` her gece.
5. `shopOffers` haritası her oyun mağazası alımında okunup yazılıyor.
6. Malzeme ilanı toplu yerleşimi (saatlik).

**v196 sonrası:**
- Mekân satın alma: oyuncu belgesi + `game_{tür}` günlük kaydı (zaten var) → satış başı yeni belge yok.
- Gece mekân dağıtımı: 8 `businessDaily/game_*` okuma + 1 `borsa/piyasa` yazma.
- Ev girişi: `home_{uid}` doğrudan `get` (sorgu yok), ilk girişte 1 yazma.
- Evler listesi: tek sorgu, `limit(30)` → en fazla 30 okuma; kalabalık bilgisi RTDB'den.
- Garaj: araç listesi zaten yüklüyse 0 ek okuma.
- Çalış butonu: `dailyActions` belgesi zaten okunuyor → +1 yazma/gün/oyuncu.

Ölçüm `tests/cost` altındaki `fakeFirestore` + `fs-meter` ile önce/sonra yapılacak, teslimde sayıyla yazılacak.

### 5.3 Elmas bantları ve rejim: çelişki kontrolü
Elmasta eşik 20.000, taban 10.000. Önerilen bantlar 5.000 (altında %75 yükseliş) ve 40.000 (üstünde %75 düşüş). Kriptodaki düzenle aynı oranda (kripto eşik 200.000 / taban 100.000 / bantlar 50.000 / 400.000). Bant ile taban ve eşik üst üste binmiyor, **çelişki yok**. Kriptodaki gibi bant yalnızca yön olasılığını, rejim ise artış/düşüş aralığını belirleyecek.

### 5.4 Elmas makinesi kaydı
Mining makineleri `factories/{uid}/machines` altında tek tek belge. Geçişte yüzlerce elmas makinesi verilebilir. Önerim: elmas makinelerini de aynı şekilde belge belge tutmak yerine (geçişte oyuncu başı yüzlerce yazma olur) fabrika belgesinde **sayı** olarak tutmak (`diamondMachines: n`, `diamondTriggeredDateKey`). Ama "bütün özellikleri mining ile aynı" dediğin için bu bir yapısal fark: soru 8.

---

## 6. Fazlar arası bağımlılık
- Faz 1 (kapanış modu + geçiş iskeleti) her şeyden önce.
- Faz 2 ve Faz 5 (katalog) geçişin iade hesabından önce bitmeli (iade bugünkü fiyatla; katalog değişmeden önce fiyatlar dondurulmalı → geçiş başında `houseCatalogData` fiyat tablosu rapora yazılır).
- Faz 4 için prototip şart.
- Faz 6 (apply) senin onayından sonra, Faz 7 temizliği apply'dan sonra deploy edilir (aksi halde iade edilecek veri okunamaz). Bu yüzden v196 **iki deploy adımı** olur: (A) yeni sistem + kapanış modu + geçiş, (B) apply sonrası temizlik. Tek paket içinde ikisi ayrı `.bat` adımı olarak verilecek.

---

## 7. Sana sorular (cevap gelmeden ilgili kısım yazılmayacak)

1. **Depo 2.000 / Park güvenli satış 2.500.** Bugün güvenli satışta oyuncu 2.500 + çetesine 500 haraç alıyor, günde 10 adet. Depodan 2.000'e alıp güvenli satan oyuncu günde 5.000 risksiz kazanır (çetesi +5.000). Seçenekler: (a) depo fiyatı 2.500 ya da üstü, (b) güvenli satış 2.000'in altına (ör. 1.500, çete tırının otomatik satış fiyatıyla aynı), (c) depodan alınan mal güvenli satışta satılamaz (mal kaynağı takibi gerekir, ek alan).
2. **Tırın otomatik satışından etkilenen çete sistemleri:**
   - Çete deposu kapasitesi (100.000 / +100): mal depoda durmayacaksa kapasite anlamsız. Kapasite alımı kalksın mı, alınmış kapasiteler kasaya iade edilsin mi?
   - Üyelere yasaklı madde dağıtımı ve haraç: depoda mal kalmayacağı için dağıtım biter. Depodaki mevcut mallar ne olsun (bir kez otomatik satılsın / dağıtılabilsin)?
   - Çete 2. el ilanları: açık ilanlar kalsın mı, iptal edilip mal otomatik satılsın mı?
   - Tır soygunu / istihbarat: soyulan tırdaki mal soygunculara mı gider, yoksa soygun "satış parasının bir kısmı" mı olur?
3. **Fabrika hisse sözleşmeleri.** Yeni ilan zaten kapalı (`SHARE_SALES_CLOSED`), kalanlar en fazla 20 günlük. Önerin olan orantılı iadeyi kim öder: fabrika sahibi mi (altını yetmezse borç), oyun mu (para basılır)?
4. **Oyuncu gazinolarında bugün satılmış piyango biletleri:** o günün çekilişi mi yapılsın, biletler mi iade edilsin?
5. **3 katlı ev prototipi gelmedi.** Kaynak dosyalarla birlikte gönderebilir misin? Faz 4 ve haritadaki "ev" mekânı buna bağlı.
6. **Vergi üst sınırı.** Bugün işletme kalemleri %1–20 aralığında. Mekân vergisinin üst sınırını %50'ye mi çıkarıyorum (o zaman %50'de hissedara 0 kalır)?
7. **Araç/silah tamiri ve geliştirmesi** bugün her malzemede istemciden `repairItem`/`upgradeWeapon` ile oyuncu envanterinden düşüyor. Yeni sistemde fiyat "malzeme başına". Yani 3 malzemelik tamir = 30 altın, doğru mu? Yoksa işlem başına sabit mi?
8. **Elmas makinesi kaydı** (§5.4): sayaç olarak mı tutayım (geçişte oyuncu başı 1 yazma), mining gibi belge belge mi (yüzlerce yazma)?
9. **Makine dönüşümü:** Farklı türlerin değerleri (tamir + silah + araba) tek havuzda toplanıp elmas makinesi kademeli alınacak, değil mi? (Tür başına ayrı başlatmak kademe yüzünden mümkün değil.)
