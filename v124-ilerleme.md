# v124 BÜYÜK GÜNCELLEME — İLERLEME DOSYASI (geçici)

> Bu dosya güncelleme bitince (Faz 8) silinecek. Güncellemeyi başka bir Claude
> devralırsa ÖNCE bu dosyayı ve kullanıcının orijinal notunu okusun.
> Proje: React + Vite istemci (`src/`), Firebase Cloud Functions (`functions/`,
> ana dosya `functions/index.js` ~22.700 satır), çete/polis sistemi `functions/gang/`.
> Testler: `cd functions && npm test` (406 test, hepsi geçmeli). İstemci derleme:
> `npx vite build` (Windows'ta node_modules yerel; Linux'ta temiz `npm ci` gerekebilir).

## Genel kurallar (kullanıcının isteği)
- Oyun CANLI ve aktif oynanıyor: hata yapma, her göç (migration) tek seferlik ve
  idempotent olsun (iki kez çalışsa da iki kez ödeme/iade yapmasın).
- Firebase okuma/yazma maliyetini artırma: toplu tarama yerine tembel (lazy) göç,
  dinleyici sayısını artırma, mümkünse hesap istemcide.
- Oyuncuların kullanabileceği açık bırakma (tüm para hareketleri sunucuda, transaction içinde).
- Gereksiz/tek seferlik dosya bırakma. Bu dosya da en sonda silinir.
- "Amazor fiyatları" = `functions/itemRules.js` içindeki `AMAZOR_PRICES`
  (tamirMalzemesi 10, silahUpgrade 100, arabaGelistirme 500, yasakliMadde 2500).
  Amazor uygulaması kalksa da bu sabit KALIR; 2. el / atölye / mağaza fiyat
  bantları buna bağlı.

## v123 (önceki güncelleme) — henüz deploy edilmedi
`deploy-v123.ps1` ile yüklenecek. v124 Faz 0'daki düzeltme (madde 1) aynı
fonksiyonlarda olduğu için o betikle birlikte gider.

## FAZLAR
| Faz | İçerik | Durum |
|---|---|---|
| 0 | Plan + v123 eksiği: şüphe 50+ ekip kurabilir/katılabilir, sadece soygun başlatılamaz, başlatmada adı söylenir + deploy/push talimatı | ✅ |
| 1 | Küçük işler: (a) isim değişikliği çete + arkadaş listesine yansısın (b) silah tamirinde en güçlü silah varsayılan seçili (c) 2. el silah/araba kategorisinde "Sıfır" filtresi (ömür + tamir hakkı tam) (d) günlük 3 ücretsiz slot + hatırlatması kalksın (e) işletme listesi kartlarında fiyat bilgisi (silahçı/modifiyeci: tamir xx · geliştirme xx = malzeme+işçilik adet başı; spor: üyelik; internet kafe: yayın xx · oyun xx; depo: yasaklı madde xx → Faz 3'te) | ⏳ |
| 2 | Yeni oyuncu görevleri: 2. görev "Liman & Depo'ya git, 1 yasaklı madde al", 3. görev "Parktaki şüpheli adama 5000 altına 1 yasaklı madde sat" (riskli satış), kaldırılan: eski 8 (slot), 15 (2. el alışveriş), 18 (silah geliştirme malzemesi al). Güvenli geçiş: yeni adım = eski adım − (eski adımdan KÜÇÜK kaldırılan adım sayısı); kaldırılan adımdaysa sonraki göreve geçer; tembel göç (`onboardingV`) | ⏳ |
| 3 | Amazor + Liman kaldırılır (AMAZOR_PRICES kalır); bekleyen liman siparişlerine tek seferlik iade + SMS; Liman & Depo → depolar listesi; oyunun deposu (tasarım bende); yeni işletme DEPO (patron masası `bosstable`, kaçak kasalar `crates`, makam masası `officedesk`, çelik/altın kasa `safe`/`safeg`); yasaklı madde al/sat ekranı (Al / Sat sekmeleri); fiyat bandı: deponun alış 1500–1750, satış 2000–2250, ±50; oyunun deposu alış 1500 satış 2250 sınırsız; depo envanteri altın + yasaklı madde (ekle/çek vergisiz); satış için depoda yeterli altın; çete yasaklı madde ekranına "Depoya sat"; 2. eldeki yasaklı madde ilanları iptal → envantere | ⏳ |
| 4 | Malzeme sistemi: oyuncuda malzeme kalmaz (sadece yasaklı madde); fabrika envanteri; fabrika + işletme envanteri ORTAK; göç: 2. el malzeme ilanları iptal → envanter, oyuncu malzemeleri → fabrika/işletme envanterine (uygun olan), uygun yeri olmayan malzeme AMAZOR fiyatının %75'i ödenip silinir + SMS (silahçı: silah+tamir, modifiyeci: araba+tamir, fabrika: hepsi); "Mağaza" (B2B ilan, avantajlı + tüm ürünler, ilan ver, anında yarı fiyat + onay, 7 gün parti kuralı, %50 altıysa oyun alır, üstündeyse iade, anında satılan biraz pay eklenip satışa çıkar); görünürlük türe göre; 2. el'den Malzeme + Makine kategorileri kalkar (makine ilanları iade); malzeme satış vergisi kalkar (silah/araba %1 kalır); fabrikada Hisse butonu → Envanter (hisse ödemeleri sürer, 20 gün sonra altyapı silinir); silahçı/modifiyeci envanterine "Mağaza" butonu; tamir/geliştirme paneli sadeleşir ("gerekli: tamir malzemesi" kalkar, sadece silah + ödeyeceğin) | ⏳ |
| 5 | Oyunun gazinosu: telefon Casino uygulaması kalkar; rulet masası etkileşimi → rulet oyunu (örnek `Rulet.html` birebir mantık, telefona uyarlanmış: 0–12, sayı/yeşil ×12, kırmızı/siyah ×2, fiş 10/100/1000); yeni slot: çevirme 1600, 3 makara × {boş, yasaklı madde, altın}; 2 aynı: boş 0 / yasaklı 1 / altın 1.000; 3 aynı: boş 0 / yasaklı 3 / altın 10.000; gazino başına piyango: havuz 0'dan başlar, bilet 100 = 10 gazinoya + 90 havuza; gece: kazanana havuz − %10 piyango vergisi; gazinonun 10'larının %10'u devlete, kalanı (oyunun gazinosu) çöpe | ⏳ |
| 6 | Oyuncu gazinoları: işletme türü GAZİNO (piyango gişesi `piyangogise`, kart masası `kartmasa`, rulet masası `rulet`, slot makinesi `slotm`); Gazino'ya tıklayınca gazinolar listesi; makine envanterleri (slot: altın + yasaklı madde, rulet: altın, 10 numara: altın; piyangoya ekleme yok); slot için en az 3 yasaklı + 10.000 altın, yoksa "casinoda yeterli altın olmadığı için slot çalışmıyor"; rulet/10 numara: olası kazancı karşılamayan bahis açılamaz / kart dağıtılamaz; oyuncu kaybettikçe makine dolar; slot ücreti 1400–1600 ±50; piyango bilet kârı 1–10 (bilet hep 100; kâr gece sahibine, %10'u devlete, SMS); makine başı günlük rapor (kazanç / verilen, kâr-zarar yok); çekimde onay + %10 vergi; hatırlatmalar ("yasaklı madde ekle", "altın ekle") | ⏳ |
| 7 | Yayın: "10 Numara" yerine "Casinolar" → gazino seç → telefondaki gazino paneli benzeri (On Numara, Rulet, Slot; piyango yok) → oynanan yayına yansır | ⏳ |
| 8 | Son kontrol: tüm testler, derleme, firestore.rules / indexes, Firebase maliyet gözden geçirmesi, `deploy-v124.ps1`, eski `deploy-v123.ps1` + bu dosya silinir | ⏳ |

## Verilen kararlar (kullanıcı itiraz ederse değiştir)
- Slot olasılıkları: her makara bağımsız, 3 sembol eşit (1/3). Oyunun gazinosunda
  beklenen ödeme ≈ 593 altın + 0,33 yasaklı madde (≈ 1.100–1.350 altın değerinde) < 1.600 → kasa kazançlı.
- Görev numaraları: kod içindeki `advanceOnboardingStep(uid, N)` çağrıları yeni numaralara göre güncellenir.

## Faz notları (her faz bitince buraya eklenir)
### Faz 0 ✅
- `functions/index.js` createHeistPlan / joinHeistPlan: şüphe kilidi KALDIRILDI.
- executeHeistPlan: şüphesi 50+ olanların adı mesajda (`CRIME_LOCK_TEAM_TEXT` içinde `{names}`).
- `functions/policeRules.js`, `src/components/HeistPanel/HeistPanel.jsx` (Ekip Kur butonu artık kilitli değil),
  `functions/gang/test/heist-ledger.test.js` güncellendi. 406/406 test geçiyor.
