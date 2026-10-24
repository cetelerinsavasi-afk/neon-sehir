# Neon Şehir v127 — Belediye Sistemi · DEVAM PROMPTU

> Bu dosyayı ve yanındaki zip'i yeni Claude oturumuna ver. Zip, projenin bu iş için düzenlenmiş halidir (node_modules / android / eski zip hariç). Kendi `Downloads/neon-sehir` klasörünün ÜSTÜNE açılabilir. `node_modules` için `npm install` ve `cd functions && npm install` çalıştır.

---

## Yeni Claude'a verilecek prompt (kopyala-yapıştır)

Neon Şehir (React + Vite istemci, Firebase Cloud Functions v2 + Firestore) oyunumda **v127 Belediye sistemi** üzerinde çalışıyoruz. Önceki oturum **sunucu tarafını büyük ölçüde bitirdi**, **istemci (arayüz) tarafına henüz başlanmadı**. Ekteki zip'te proje var. İsteklerin tamamı `_belediye_is/istekler.txt` dosyasında, arayüz prototipi `_belediye_is/Bakanlik_Paneli_Prototipi.html` dosyasında. Bu dosyadaki "Yapılanlar" ve "Yapılacaklar" bölümlerini oku, sonra istemci tarafını kodlamaya devam et.

Kurallar:
- Oyun canlı ve aktif oyuncuları var: açık ya da mantık hatası olmasın, kodları iyi kontrol et.
- **Git'e commit/push YAPMA** (push oyunu canlıya alıyor). Deploy'u ben yaparım.
- Firebase okuma/yazma sayısını düşük tut (ücretli plana geçmesin).
- Arayüz: oyuncu tasarımdan anlasın, uzun açıklama metinleri koyma, ekranlar sade olsun.
- Anlamadığın / aklına yatmayan bir şey varsa bana sor.
- Bitirince `cd functions && npm test` tamamen geçmeli, `npm run build` hatasız olmalı; deploy için `deploy-v127.ps1` hazırla.

---

## Kullanıcının kararları (soru-cevaptan)
1. **Soygun borçları (ve diğer maaş-dışı borçlar):** gece otomatik ödenmez. Sadece **başkan ve başkan yardımcıları** elle öder; **parça parça** ödenebilir; yardımcılarda bu yetki **her zaman** var. Maaş borçları **gün gün ayrı listelenir, her biri tek seferde (tamamı)** ödenir; diğer borçlar **tek kalemde** listelenir.
2. **Polisin soygun durdurma payı (%25):** zaten gelen cezadan verildiği için kasa denetimi yok. **Polis Teşkilatı operasyon ücreti:** kasada para yoksa operasyon başlatılamaz, "belediyenin kasası boş olduğu için başlatılamadı" mesajı görünür.
3. **Güncellemede kasa eksideyse:** 0'a çekilir, eksi kısım (faizsiz) borç yazılır. (Şu an ekside değil.)
4. **Bakanlık analizleri:** gerçek veriden, ama her açılışta okumak yerine **gece 00:00'da 1 kere hesaplanıp** yazılan belge oyunculara sunulsun; tablolar küçük olsun (ör. **en çok vergi ödeyen 4 şirket + diğerleri**).
5. Ek istekler (önceki oturumda geldi):
   - Çetelerin üye başına günlük yasaklı madde sipariş hakkı **2 katı**: üye × 2.500 altın (5 üye → 12.500 altın = 10 adet). ✅ yapıldı (sunucu). İstemci sabiti kaldı (aşağıda).
   - Çete siparişi haftanın 6 günü: kod zaten Pzt–Cmt açık, sadece Pazar kapalı → değişiklik gerekmedi (kullanıcıya böyle söylenecek).
   - Piyango gişesindeki "Piyango kazancından %10 vergi…" yazısı kaldırıldı ✅ (`src/components/LotteryScreen/LotteryScreen.jsx`).

---

## YAPILANLAR (sunucu — `functions/`)

### Yeni dosyalar
- **`belediyeRates.js`** (saf, istemci de kullanacak): tüm vergi/maaş kalemleri `RATE_GROUPS` (bakanlık, varsayılan, adım, bağımlı min/max — prototipteki artış/azalış kuralları; değerler oyunun mevcut kodundan). `resolveRates(ratesDoc, dayKey, pending)`, `validateNext`, `boundsOf`, `rateChanges`, `isGoodChange`, `ministryOfCat` (defter kalemi → bakanlık), yardımcılar `bizRateFrac(rates, bizType)`, `resaleRateFrac(rates, 'weapon'|'vehicle'|diğer)`, `factoryRateFrac`, `machineRateFrac`, `policeSalary`, `seatSalary`, `rateFrac(rates,id)`, `fmtRate`.
  - Kalem id'leri: yönetim `bsk, byrd, bakan` · sanayi `f1..f4, mkKripto, mkTamir, mkAraba, mkSilah, fisci` · ticaret `isSilahci, isModifiye, isKumar, isSpor, isKafe, isBar, isInternet, isOfis, isSinema, isStudyo, isMescit, piyango, ikAraba, ikSilah, ikMalzeme` · güvenlik `polGenel, polAmir, polBaskom, polKomiser, polMemur, soygunPay` · kültür `sosyal, futbolcu, menajer, imam`.
- **`belediyeKasa.js`**: eksiye düşmeyen kasa. `stateTreasury/live` (≤10 dk'da bir "fold"), `belediye/kasa` {outCum, reserved}. Harcanabilir = live.balance − (outCum − live.outCumAt) − reserved. `spendOrDebt` (yetmezse TAMAMI `belediye/otherDebt.soygun`), `payOther` (parça ödeme, önce faizli), `applyInterest` (%1/gün, sadece soygun kısmı), ilk fold'da eksi bakiye → `eski` borç + kasa 0.
- **`belediye.js`** (`createBelediye`): callable **`belediyeAction`** `{op, ...}`:
  - `panel` (sadece kadro: `cur`, `next`, `nextBy`, `kasa{spendable,reserved,atMs,today}`, `debts{maas[], other{soygun,eski,log}}`, `seat`)
  - `claimMayor` (sadece admin, başkanlık boşsa — kullanıcı "Haluk Levent" admin hesabıyla başkan olacak)
  - `invite {seat, targetUid}` (davet edenin ARKADAŞI olmalı; koltuk başı tek davet; SMS: "Belediye başkanı seni X Bakanlığı görevine davet ediyor. Maaş N altın. Kabul etmek için belediyeye uğra"; `users.belediyeInvite` hatırlatma için), `cancelInvite {seat}`, `respondInvite {accept}` (polis/bekleyen polis başvurusu/imam ise istifa etmeli), 24 saatte düşer
  - `fire {seat, reason}` (24 saat koruma, gerekçe zorunlu, SMS), `resign`, `setPerms {seat:'yrd1'|'yrd2', perms:{sanayi,ticaret,guvenlik,kultur,fire,invite}}` (sadece başkan)
  - `setRate {id, value}` (yetkiye göre; gün içi ±1 adım; yarın 00:00 geçerli; 23:59:30 sonrası kilit)
  - `fireImam {reason}` (Kültür yetkisi; imam ilk 24 saat korunur)
  - `donate {amount}` (≥100), `payDebt {debtId}` (maaş borcu, tamamı), `payOther {amount}`, `chat {channel:'genel'|'koord', text}`
  - Gece işleri: `nightly(day,{step:'roll'|'payrollSnapshot'|'report'})`, `tryRunPayroll` (polis+imam+kadro hepsi ya da hiçbiri; ödenemezse `belediyeDebts/{gün}`; ödendiyse eski maaş borçları en yeni günden, yetmeyende durur; rüşvet payı her durumda yatar), Sixtagram'a `__belediye__` hesabından zam/indirim duyurusu (değişiklik yoksa yok).
  - Yetki yardımcıları export: `SEATS, YRD_PERMS, seatOfUid, canMinistry, canFireSeat, canInviteSeat, canPayDebts, ministryReport`.
- **`scripts/belediye.test.mjs`** (15 test, hepsi geçiyor; `package.json` test listesine eklendi).

### Değişen dosyalar
- `tax.js`: oranlar sabit değil; `loadRates(db)` önbelleği (gün başına), `ratesFor(dayKey)`, imzalar: `bizTax(amount, bizType, rates?)`, `resaleTax(amount, kind, rates?)`, `machineTax(price, type, rates?)`, `withMachineTax(price, type, rates?)`, `factoryTax(amount, rates?)`, `factoryTaxRate(gross, rates?)`, `splitSalaryTax(gross, 'isci'|'futbolcu'|'menajer', rates?)`, `splitLotteryTax(gross, rates?)`, `socialTax`, `casinoTaxRate`, `pctText`. `taxLedgerWrite` artık `bizType` ve `stat` (analiz sayaçları) alır; maaş vergisi kalemleri `vergi_maasIsci/Futbolcu/Menajer`, işletme `vergi_isl_{tür}`.
- `stateTreasury.js`: `stat` sayaçları (aynı parça belgesine), `statWrite`, `foldDocs` export; canlı her gider `belediye/kasa.outCum`'u artırır (`noKasa` hariç); yeni kalemler (`bagis, borc_acik, maas_belediye, borc_maas, borc_diger`…); etiketlerden sabit yüzdeler kaldırıldı.
- `index.js`: `onCall/onRequest/onSchedule` sarmalandı (her çağrıda `loadRates`); belediye örneği dosya sonunda (`belediyeRef.current`), `export const belediyeAction`; fabrika vergisi biten günün oranıyla + `belediyeAnalysis/{gün}.factories` (ilk 4 + diğerleri); makine/işçi/menajer/piyango/2.el vergileri dinamik + stat; soygun ödemeleri işlemden sonra `belediye.spendOrDebt` (tek ve ekip); polis payı oranı `soygunPay`; **imam maaşı adımı kaldırıldı → `belediyePayroll`**; dailyReset'e `belediyeRoll` (başta), `belediyePayroll` (imam kontrolünden sonra), `belediyeReport` (closeStateDays sonrası, `belediyeReportExtra`: işletme sayıları, polis rütbeleri, en çok kazanan 3 içerik üreticisi); `applyForImam` belediye görevlisini engeller; resmî hesaba Sixtagram bildirimi gitmez.
- `gang/actions/roles.js`: canlıda polis maaşı yerine `snapshotPolicePayroll` (bordro belediyede). `intel.js`/`core.js`: belediye görevlisi polis olamaz. `wars.js`/`intel.js`: operasyon ücreti kasa yetmezse başlatılamaz. `treasury.js`: `transferToGang` hedefi `'__belediye__'` → çete kasasından belediyeye bağış. `config.js`: `CONTRABAND_ORDER_PER_MEMBER: 2500`. `firebase.js`: `belediyeRef` geçişi.
- `business.js, gym.js, venue.js, shop.js, office.js, homeOffice.js, stream.js, casino.js, casinoRules.js, futbolPro.js, policeRules.js`: oranlar türe göre/dinamik, SMS metinlerinde güncel yüzde.
- `firestore.rules`: `belediye/{main,rates,public}` herkes okur; `belediyeDays`, `belediyeDonations` herkes; `belediyeStaff/{uid}` kendi; `belediyeChat_genel` kadro; `belediyeChat_koord` kadro + polisin en üst 3 rütbesi (`baskan, sef, uzman`).

### Firestore belgeleri (istemcinin okuyacakları)
- `belediye/main`: `{ seats: {bsk,yrd1,yrd2,san,tic,guv,kul: {uid,name,avatar,sinceMs,guardUntilMs,perms?}|null}, invites: {seat:{uid,name,avatar,byUid,byName,bySeat,atMs,expiresAtMs}}, log:[{atMs,text}] }`
- `belediye/rates`: `{ byDay: {gün: tamSet} }` → istemci `resolveRates(doc, bugün)`.
- `belediye/public`: `{ reportDay, report:{dayKey, ministries:{sanayi|ticaret|guvenlik|kultur|yonetim:{in,out,lines:[{kind,cat,label,amount}]}}, inTotal,outTotal,net, stat, analysis:{factories,bizCounts,police,creators,payers}, donations, kasa, debts}, changesDay, changes:[{id,label,m,group,unit,from,to,by,good}], payroll:{dayKey,paid,total,paidOld} }`
- `belediyeDonations/{bugün}`: `{ top:[{key,name,kind:'player'|'gang',logo?,amount}], total }`
- `imamState/current`: `{ uid, displayName, lastNasihat, lastNasihatAt, becameImamAt }` (zaten herkes okur)
- `users/{uid}.belediyeSeat`, `users/{uid}.belediyeInvite {seat,title,salary,byName,expiresAtMs}`
- Sohbet: `belediyeChat_genel`, `belediyeChat_koord` → `{authorKind:'belediye'|'polis', uid?, name, avatar?, title, text, createdAtMs}`; yazmak `belediyeAction{op:'chat'}`.
- Stat anahtarları (`report.stat`): `mk_{mining|tamirMalzemesi|arabaGelistirme|silahUpgrade}_{n|ciro|vergi}`, `isci_n, isci_brut`, `isl_{tür}_{ciro|n}`, `ie_{araba|silah|malzeme}_{n|ciro}`, `pi_bilet, pi_odul, pi_n`, `sosyal_yayin(_n), sosyal_sarki(_n)`, `fut_brut, men_brut`, `bagis_n`, `borcYazilan`.

---

## YAPILACAKLAR

### A) İstemci — Belediye ekranı (yeni, örn. `src/components/Belediye/`)
1. `src/components/Venue3D/venueParts.jsx` → `BelediyePart`: buton yazısı artık sadece **"Belediye"**, herkese görünsün (sadece admin değil). Tıklayınca çeteler paneline benzer tam ekran (bkz. `Gangs/GangsFullScreen.jsx`, `GangShell.jsx`, `Gangs.css` `gx-` sınıfları) açılsın. Eski admin `StateReport` istenirse sadece admin için küçük "Ayrıntılı defter" olarak kalabilir.
2. Alt sekmeler: **Belediye Raporu · Chat · Bakanlıklar · Borçlar · Başkanlık**. Belediyede olmayan sadece Rapor'u görür (diğerleri kilitli); kadro hepsini görür.
3. **Rapor sekmesi** (sırayla): en üstte belediye başkanının adı/avatarı → (davetliyse) davet kartı: görev + maaş + Kabul/Red (`respondInvite`) → toplu rapor (prototipteki "Toplu Rapor": hero net + bakanlıklara göre gelir/gider/net tablosu, `belediye/public.report`) → bugünün fiyat/vergi değişiklikleri (`changes`; yoksa gösterme ya da kısa "değişiklik yok") → gece maaşları ödenemediyse "Bugün maaşlar ödenemedi" (`payroll.paid === false`) → borç özeti → en altta **Bağış yap** butonu + günün en çok bağış yapan 3'ü (`belediyeDonations/{bugün}`; bağış satırı raporda varsa göster). Admin ve başkan yoksa "Başkanlığı devral" (`claimMayor`).
4. **Bakanlıklar sekmesi**: 4 bakanlık (prototipteki gibi) — her biri: dünün analizi (`report.analysis` + `report.stat` + o bakanlığın `lines`), gelir-gider defteri, **Fiyat ve Vergi Belirleme** (−/+ ile `setRate`; sınırlar `boundsOf(panel.cur, panel.next, id)`; değer `panel.next`; fark rengi `isGoodChange`). Yetkisi olmayan butonlara basamaz ama görür (`canMinistry`). Kültür'de imamlık bölümü: imamın son nasihati + kaç saat önce yazdığı (`imamState/current`) + "İmamı görevden al" (gerekçe sor; 24 saat korumayı göster).
5. **Borçlar sekmesi**: kasa (panel.kasa.spendable), maaş borçları gün gün (her biri "Öde" → `payDebt`, sadece başkan/yardımcı), diğer borçlar tek kalem (soygun + eski açık, faiz bilgisi, parça ödeme girişi → `payOther`).
6. **Başkanlık sekmesi**: prototipteki organizasyon şeması (başkan → 2 yardımcı → 4 bakan), kutuya dokununca sayfa: boşsa arkadaş listesinden davet (`friendships/{uid}` — kendi belgesi, istemci okuyabilir), davet bekliyorsa iptal, doluysa yardımcı yetkileri (başkan; anında) ve görevden al (gerekçe; 24 saat koruma), kendi koltuğunda İstifa. Kadro maaşları (yönetim grubu `bsk/byrd/bakan`) sadece başkan ayarlar. Son hareketler (`main.log`).
7. **Chat sekmesi**: 2 kanal — Belediye (tüm kadro) ve Koordinasyon (kadro + polis rütbelileri). Dinleme: `belediyeChat_{kanal}` orderBy createdAtMs desc limit 60. Polis mesajları kod adı + rütbe ile.
8. Polis Teşkilatı sohbetine (`Gangs/tabs/ChatTab.jsx`, intel) rütbeliler (baskan/sef/uzman) için 3. kanal "🏛️ Belediye" → `belediyeChat_koord` okur, `belediyeAction{op:'chat',channel:'koord'}` ile yazar.
9. Hatırlatma: `src/hooks/useOnboarding.js` reminders'a `player.belediyeInvite?.expiresAtMs > now` ise `{ id:'belediye', emoji:'🏛️', text:'Belediyeye uğra' }`.
10. Çetem › 📤 Çeteye gönder listesine **🏛️ Belediye** seçeneği (`targetGangId: '__belediye__'`) — `Gangs/tabs/CetemTab.jsx` MoneySheet.
11. `src/services/gameActions.js`: `export const belediyeAction = (data) => httpsCallable(functions, 'belediyeAction')(data);`
12. Sixtagram `PostCard.jsx`: `post.official === 'belediye'` ise avatar yerine 🏛️ rozeti, profil paneli açılmasın, metin satır sonlarını korusun (`white-space: pre-line`).

### B) İstemci — dinamik oran gösterimleri (sunucuyla aynı hesap şart!)
- Bir hook: `useBelediyeRates()` → `belediye/rates` tek dinleyici (paylaşımlı), `resolveRates(doc, istanbulBugün)`.
- Güncellenecek yerler: `FactoryScreen.jsx` (`machineTax/withMachineTax(price, type, rates)` — **test `scripts/v125.test.mjs` şu regex'i bekliyor: `withMachineTax(machinePrice(t, cryptoPrice || 0), t, rates)`**; `factoryTaxRate(gross, rates)`; "%5 vergi" yazıları), `Venue/VenueOwnerPanels.jsx`, `Gym/GymOwnerPanels.jsx`, `Shop/ShopOwnerPanels.jsx` + `Shop/PriceField.jsx` (türüne göre oran), `MarketplaceScreen.jsx` (resaleTax(price, kind, rates)), `Casino/PlayerCasino.jsx` (`casinoWithdrawSplit(qty, bizRateFrac(rates,'gazino'))` — sunucu `expectTax` ile karşılaştırıyor!), `ManagerBooklet.jsx` (%10 metni), polis başlığındaki maaş `GangShell.jsx` (`SALARIES` yerine `policeSalary(rates, rank)`), imam ekranlarındaki maaş metinleri.
- `src/components/Gangs/gangConstants.js`: `CONTRABAND_ORDER_PER_MEMBER: 2500`.
- `src/` içinde `%10`, `%1`, `%5`, `BIZ_TAX_RATE`, `RESALE_TAX_RATE`, `SALARIES` aramasını yap, vergi/maaşla ilgili sabitleri dinamik yap.

### C) Bitirme
- `cd functions && npm test` (şu an 467/468 geçiyor; kalan 1 = FactoryScreen istemci regex'i, B maddesiyle düzelir), `npm run build`, `npm run lint`.
- `deploy-v127.ps1`: index.js'teki ortak sarmalayıcı (loadRates) ve vergi değişiklikleri yüzünden **TÜM fonksiyonlar** yüklenmeli (deploy-v124.ps1 gibi 8'erli gruplar; listeyi `functions/index.js` export'larından üret — yeni: `belediyeAction`). Önce `firestore:rules`. **`gangClock`, `gangAction`, `dailyReset`, `dailyResetRecovery`, `belediyeAction` aynı son grupta**; gece 23:00–01:00 arasında çalıştırılmasın. Sonra kullanıcı git push yapar.
- Kullanıcıya özet: başkan olmak için Belediye › "Başkanlığı devral" (admin hesabı Haluk Levent); çete siparişi zaten 6 gün açıktı.

### Açık notlar / dikkat
- Gece bordrosu iki tarafın listesi hazır olunca çalışır: kadro+imam (dailyReset) ve polis (gangClock tick). Canlı çete dünyası yoksa polis kısmı boş sayılır.
- `belediye/main` her yazımda TAM yazılır (`writeMain`) — iç içe haritalarda merge silinen anahtarı bırakmasın diye. Yeni kodda da böyle devam et.
- İstemcide bugünün oranı = `resolveRates(belediye/rates, bugün)`; bekleyen (yarınki) değerler sadece `panel` çağrısıyla gelir.
