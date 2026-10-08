# v77 — Faz 5 sonrası istekler

- **Canlı maç sahası:** maç izlerken top gerçek zamanlı akıyor; 6'şar oyuncu topu takip ediyor. Atakta top rakip yarıya iniyor, ceza sahası kızarıyor ("⚡ Takım atakta"), şut çıkıyor: **GOOOL!** (ağlar sallanır, saha parlar, golü atan ve asist) · **KURTARIŞ** · **DİREK** (direk sararır) · **AUT** · **BLOK**. Görsel tamamen zaman çizelgesinden üretilir; sonucu değiştirmez, herkes aynı anı görür. Bitmiş maçlarda **▶ Maç özetini izle** (~15 sn hızlı tekrar, skor ve anlatım da tekrar dakikasına göre). Anlatımda isabetsiz şutlar çeşitlendi (direkten döndü / auta çıktı / defansa çarptı).
- **Takımdaki futbolcuya teklif:** takımlar başka takımdaki futbolcuya da teklif gönderebilir. Futbolcu kabul ederse transfer olur: eski sözleşme biter, birikmiş maaş borcu eski takımın borcu olarak kalır; form/sakatlık/güç taşınır. Maç saatinde (18:00–19:00) transfer kabul edilemez. Takımdayken ilana çıkılamaz. Transfer › Futbolcular listesinde başka takımdakiler "👕 takım" ile görünür.
- **Botların salon seçimi:** bonuslu salonu hesaba katan "etkin fiyat" — ama kasası o salona yetmeyen bot takım en ucuz salona gider.
- **Tüm Çeteler sohbeti** yeni mesajda alt çubuktaki "Çeteler" noktasını da yakar.
- Testler: 253.

Yayınlama: `firebase deploy --only functions:futbolProAction,functions:resolveFutbolMatchdayReveal` + web.

---

# v77 — Faz 5: Gerçek futbolcular, transfer, maaş, maç istatistikleri

**Futbolcu olmak**
- Spor salonunda 200 güce ulaşan oyuncu **maaşlı futbolcu** sayılır. Takımı yoksa ilana koymasa da Takımım › Transfer › 🧑 Futbolcular listesinde görünür.
- Yeni sekme **Futbol › 🏃 Futbolcu**: güç, mevki, 200'e ilerleme; takımsızken 📢 ilan (maaşını kendin koy) ve 📨 gelen teklifler (24 saat, ✓ basılı tut / ✕).

**Takım tarafı (Takımım › Transfer)**
- 🧑 Futbolcular: ilandakiler istediği maaşla **✍️ İmzala** (basılı tut); diğerlerine **📨 Teklif** (maaş seç, 24 saat geçerli, geri çekilebilir).
- 👤 Sözleşmeliler: maaş, borç, zam isteği (✓/✕), 💸 doğrudan zam, ✂️ fesih. Eski futbolculara kalan borç uyarısı.
- Teklif/imza/zam/fesihi takımı yöneten yapar (menajer varsa menajer, yoksa aktif başkan). Menajer kendi takımında oynayabilir.

**Sözleşme ve maaş**
- Süre sınırı yok; bir taraf feshedene kadar sürer. 18:00–19:00 maç saatinde fesih yok. Fesihten sonra aynı takıma bir sonraki 19:00'dan sonra dönülebilir.
- Maaş her gün **19:00**'da: menajerli takımda kasadan, başkan yönetiyorsa başkanın altınından (transfer desteğinden ödenmez). Yetmezse kalan **borç** birikir ve sonraki 19:00'da maaşla birlikte istenir (menajer maaşı gibi). Devlete borcu olan futbolcunun maaşının yarısı borca gider. Kesinti yok.
- Fesihte kalan borç **takımın borcu** olur; kasaya/başkana para gelince (saatlik + 19:00) otomatik ödenir.
- Takım sahipsiz kalıp bota düşerse sözleşme 19:00'da son maaşla biter.
- Zam: futbolcu ister, yönetici kabul/ret eder; yönetici kendiliğinden de artırabilir (düşüremez).
- Maaş bandı: günlük 1.000 – 50.000.

**Takımdaki gerçek futbolcu**
- Takımın oyuncu listesine girer (yaş sabit 24, değer 0). Satılamaz, ilana konamaz, yaşlanmaz/silinmez, gençleştirilmez; minimum kadro sayımına girmez. Kadro elden alınsa bile silinmez (19:00'da son maaşla ayrılır).
- Gelişim takım kurallarıyla (antrenman 0,1–4 ×🔥, maç 0,1–2); güç futbolcu profiline de yansır. Takımdayken salonda bireysel antrenman yok.

**Maç istatistikleri**
- Her golün sahibi ve (%70) asisti belirlenir — skor değişmez. Forvet golü forvetten, orta saha golü orta sahadan, serbest atak herkesten (güçlüye daha çok şans).
- Maç puanı 6,0'dan başlar (3–10): gol +1, asist +0,6, galibiyet +0,5 / beraberlik +0,1 / mağlubiyet −0,3, gol yemeden: kaleci +1, defans +0,7; kaleci kurtardığı her şut +0,2, yediği her gol −0,4 (defans −0,2). En yüksek puan **maçın yıldızı**.
- Maç anlatımında golü atan ve asist yapan görünür.
- **Ligler › Oyuncular**: ⚽ Gol Kralı · 🎯 Asist · ⭐ Yıldızlar · 📈 Form (en az 5 maç, puan ortalaması) · 🧤 Kale Bekçisi · 🛡️ Duvar. Sadece lig maçları; her sezon sıfırlanır. Gerçek oyuncular 👤 ile.
- Şampiyonluk kutlamasında 👑 Gol Kralı, 🎯 Asist Kralı ve ⭐ Sezonun Yıldızı takımlarıyla.

**Gün sonu kartı (Futbolcu sekmesi)**
- Bugün maç mı (lig/kupa), antrenman mı, yedek mi; skor, kısa cümle ("2 gol attın, 1 asist yaptın. Maçın yıldızı sensin!"), maç puanı halkası, ⚡ güç değişimi, form, sıralamadaki yerin (⚽ #2 · 9 gol, 🎯 #2 · 3 asist, ⭐ #1 · 4 yıldız) ve sezon özeti.
- Rehber › Futbol Takımı › **Sahaya Çık** sayfası eklendi.

**Teknik**
- Yeni: `functions/futbolPro.js` (`futbolProAction` callable: proList, offerSend, offerCancel, offerRespond, sign, raiseRequest, raiseRespond, raiseSet, terminate; 19:00 `paySalaries` + `settleTeamDebts`; saatlik `expireOffers`; maç kaydı `recordLeagueMatch`, `recordTraining`, `seasonAwards`).
- Koleksiyonlar: `futbolPlayers/real_{uid}` (real:true), `futbolOffers/{takım}_{uid}`, `futbolPlayerStats/{sezon}_{oyuncu}`; `footballers` → teamId/teamName/listed/askSalary/lastDay/lastLeft; `futbolTeams.playerDebts`.
- Maç belgelerine `ratings`, `motmId`, gol olaylarına `scorerId/Name`, `assistId/Name`.
- Testler: `functions/scripts/futbolPro.test.mjs` (7) — toplam 252.

Yayınlama:
```
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```
(+ web). Çok sayıda futbol fonksiyonu değiştiği için tüm fonksiyonları yayınlamak en güvenlisi. İndekslerin oluşması birkaç dakika sürebilir; o sırada Oyuncular sekmesi boş görünebilir.

---

# v77 — Ara güncelleme (Faz 4 sonrası istekler)

- **Salon üyeliği süresi:** 24 saat yerine o günün 19:00'una kadar; 18:00–18:59 arası başlatılırsa 1 saat (18:59 → 19:59). Görev ağacında ⏳ saat görünür.
- **Takım antrenmanı salonu kilitler:** bir takım (ya da bot) bir salona antrenman ücreti ödediyse salon o günün 19:00'una kadar kapatılamaz, gerekli aletleri kaldırılamaz.
- **Takım antrenmanında 🔥 bonus:** salon seçicide bonuslu salonlar "🔥 +%10" rozetiyle; bonuslu salonda antrenman yapan oyuncular %10 fazla gelişir (botlar dahil). Botlar artık "etkin fiyata" bakar (bonuslu salonun fiyatı ÷ 1,1) — en ucuz değil, en verimli salona giderler.
- **Bonus eşiği:** oyunun salonu da sayılır.
- **Cafe/Bar limiti gizli:** halka kaldırıldı; 10.000 aşılmak istenince "🔒 Bir mekânda günde en fazla 10.000 altın harcayabilirsin." uyarısı.
- **Rehber:** "🏪 İşletmeler" bölümü (5 sayfa) + Meslekler'de İşletmeci / Futbolcu kartları; Kulüp Odası › Antrenman salon ve 🔥 bilgisiyle güncellendi.
- **Hepsini al:** İşletme aç ekranında envanterde olanlar 📦 ile sayılır, eksikler tek dokunuşla envantere alınır. Evin içinde Ayarlar › İşletmeler'de "🛒 Hepsini al" envanterdekileri yerleştirir, eksikleri sepete koyar ve satın alma onayını açar.
- **Evini çevir:** "Satın al"a basınca işletme olmayan evin varsa önce "Evini spor salonu yapmak ister misin?" önerisi; istersen yine yeni ev alırsın.
- **Çete bildirimleri:** oy verince oylama noktası hemen söner (eskiden sayfa yenilenene kadar kalıyordu). "Tüm Çeteler" sohbetine de yeni mesaj noktası; çete sekmesi noktaları nabız atıyor. Ortak sohbet tek başına alt çubuktaki noktayı yakmaz (çok hareketli).
- Yeni house op'ları: `buyItems`, `bizIntent`. Testler: 245.

Yayınlama: `firebase deploy --only functions:houseAction,functions:shopAction,functions:businessRollover,functions:payFutbolTrainingSlot,functions:resolveFutbolMatchdayReveal` + web.

---

# v77 — İşletmeler, Faz 4: Spor Salonu + takım antrenman ödemesi

**Bireysel antrenman (takımsız gerçek oyuncu)**
- Salona gir → üstte **🏋️ Üyelik** → mevki seç (🧤 🛡️ 🎯 ⚽) → **▶ öde**. Mevki takımda değilken değiştirilebilir; değiştirince 7 gün kilitli.
- Ödeme emanette durur; sağ üstte **3 düğümlü görev ağacı** açılır (salondaki aletlerden rastgele 3'ü). Sıradaki düğüme dokun → karakter en yakın o alete yürür → **⭐** butonu → 10–15 sn'lik mini oyun (koşu bandı: sağ-sol adım · bench: basılı tut · boks torbası: ritimli vuruş · dambıl: yukarı kaydır). Başarısızlık yok; süre sunucuda da doğrulanır.
- 3. görev bitince savaş zarı gibi **güç sayacı**: 200'ün altında +1–16, 200 ve üstünde +1–4. Başlangıç gücü 100, tavan yok. 200'ü geçince ⭐ parlar.
- Günde 1 üyelik (gün 19:00'da döner). Üyelik o günün 19:00'una kadar geçerli; son saatte (18:00–18:59) başlatılırsa başlangıçtan itibaren 1 saat. Süresinde bitmeyen üyelik iade edilir. Bitince ödeme salon sahibine geçer ve ödeme gününün gelirine yazılır.
- Takımdaki oyuncu bireysel antrenman yapamaz. Salon sahibi kendi salonunda günde 1 kez **ücretsiz** antrenman yapar (gelir yazılmaz).
- Örnek: taban artış 8 çıktıysa bonuslu salonda 8,8 (her zaman 1–16 arası rastgele, ×1,1, tek ondalık).

**Salon sahibi**
- Ayarlar › Fiyatlar: günlük üyelik 500–2.000 (varsayılan 1.000). Envanter: aletler (🥊 🏃 🏋️ 💪). Rapor'da 🔥 satırı: dünkü kazanç vs eşik.
- **🔥 +%10 bonus:** dünkü kazancı, en çok kazanan oyuncu salonunun yarısından az olan (ya da hiç kazanmayan) salon bugün bonuslu — üyelerin gelişimi ×1.1. Listede "🔥 +%10" rozeti.
- **Yeni salon:** açıldıktan sonraki ilk 19:00'da geliri ne olursa olsun bonuslu olamaz (o gün tam değil). İkinci 19:00'da o tam günün gelirine bakılır. Rapor'da bu süre 🆕 ⏳ 19:00 olarak görünür.
- Bitmemiş üyelik varken gerekli aletler kaldırılamaz.

**Oyunun dükkânları artık en üstte sabit değil**
- Neon Silah Mağazası, Neon Araba Galerisi, Neon Modifiye Garajı ve Neon Spor Salonu da oyuncu dükkânları gibi **dünkü kazancına göre** sıralanır (eşitlikte oyuncu dükkânı önde). Gelirleri sadece sıralama için kaydedilir: silah/araç satışı, atölye işleri, salon üyeliği ve takım antrenmanı.
- Neon Spor Salonu her zaman açık, gerçek 3D mekân (houses/game_spor). Sabit 2.000, bonus almaz ama bonus eşiğine sayılır (en çok kazanan o ise eşik onun yarısı).

**Futbol takım antrenmanı**
- Antrenman kutusuna oyuncu koymadan önce o mevki için salon seçilip ücret ödenir (🔒 fiyat). Menajerli takımda kasadan, değilse başkanın altınından; transfer desteğinden ödenemez. Ödenmemiş kutuya oyuncu konmaz (`slot-unpaid`). Ücret 19:00'a kadar geçerli.
- Bot takımlar: kasada para varsa en ucuz salona öder (birden fazla en ucuz varsa sırayla dağıtılır); para yoksa antrenman yok.

**Teknik**
- Yeni koleksiyon `gameVenues/{tür}` (oyunun dükkânının sırası; herkes okur). Oyunun gelirleri `businessDaily/game_{tür}_{gün}`.
- Yeni: `functions/gym.js` (shopAction op'ları: gymEnsureGame, gymPrice, gymStart, gymStep, gymStepDone, footballerPosition). Koleksiyonlar: `footballers/{uid}` (güç, mevki), `gymMemberships/{uid}_{gün}`.
- Yeni callable: `payFutbolTrainingSlot`. `addFutbolTraining` ödenmemiş kutuyu reddeder. `businessRollover` saatlik: spor bonusunu yazar + süresi dolan üyelikleri iade eder.
- Testler: `functions/scripts/gym.test.mjs` (5 test) — toplam 243 test geçiyor.

Yayınlama:
```
firebase deploy --only firestore:rules
firebase deploy --only functions:shopAction,functions:houseAction,functions:businessRollover,functions:buyWeapon,functions:buyVehicle,functions:payFutbolTrainingSlot,functions:addFutbolTraining,functions:resolveFutbolMatchdayStart,functions:resolveFutbolMatchdayReveal
```
+ web.

---

# v77 — İşletmeler, Faz 3: Cafe / Bar / İnternet Kafe / Piyano

**Cafe ve Bar**
- **Menü** = mekândaki dolapların verdiği yiyecek/içecekler (Kafe Bar Tezgahı, Pasta Vitrini, İçecek Dolabı, Buzdolabı, Bar Tezgahı, Kafe Masası, Dondurma Dolabı…). Ne kadar farklı mobilya, o kadar geniş menü; Pasta Vitrini pasta + kurabiye verir.
- Fiyat: varsayılan 100, 10–1.000 (Ayarlar › Fiyatlar). Envanter sekmesinde menüyü oluşturan dolaplar görünür.
- Mekâna girince üstte **🍽️ Menü**; dokununca anında alınır, ürün eldeki ürün olur (2 dk, ısmarlanabilir; oyundaki etkisi aynı). Dolaba dokunmak da menüyü açar — işletmede yiyecek/içecek müşteriye ücretsiz değil (sahip bedava alır).
- **Günlük sınır:** bir oyuncu bir mekânda günde en fazla 10.000 altınlık alışveriş yapar (menüde dolan halka; dolunca ürünler gri + 🔒). Başka mekânda ayrı sayılır.
- Altın yetmezse sayaç yanıp söner, ürün sarsılır. Fiyat değiştiyse etiket parlar.

**İnternet Kafe**
- Sahip tüm cihazlar için tek dakika ücreti belirler (50–500, varsayılan 100). Üst buton yok: cihaza dokun → öde → oyna.
- İlk 60 sn ödenir; ödenen süre oyuncu + mekân çiftine bağlı kredidir ve gerçek zamanda akar. Başka cihaza geçmek ya da çıkıp gelmek yeniden ödetmez. Süre bitince oyuncu bir cihazda oyundaysa yeni 60 sn çekilir, değilse çekilmez. Fiyat değişirse ödenmiş kredi eski fiyatla biter. Altın bitince oyun kapanır.
- **Kredi halkası** HUD'da (mekân dışında da) ve mekânın üst çubuğunda; altın bir sonraki dakikaya yetmiyorsa sarı.
- Kapasite: İnternet Kafe İstasyonu ve Konsol & TV 2 kişi, Oyuncu Bilgisayarı ve Atari 1 kişi; cihaz düğmesinde 👤 doluluk + dakika ücreti, doluysa soluk + silüet.
- Kredi sürerken (müşteri çıkmış olsa bile) gerekli mobilyalar kaldırılamaz.

**Piyano** (her evde ve işletmede)
- Piyanoya otur → **🎹 Çal**: 12 tuşlu klavye, tuş sıklığı sınırlı. Aynı anda tek kişi çalar; başkası çalıyorsa "Çal" soluk + 👤. Mekândaki herkes duyar; dinleyenlerde "🎹 ♪ isim" rozeti ve 🔇 sessize alma. Ödül/bahşiş yok.
- Notalar Realtime Database'den gider (Firestore'da her nota ücretli yazma olurdu).

**Teknik**
- Yeni: `functions/venue.js` (shopAction op'ları: menuPrices, menuBuy, netPrice, netStart, netTick, netLeave — ayrı fonksiyon yayını yok). Koleksiyonlar: `netSessions` (cihaz doluluğu/kredi), `bizSpend` (günlük sayaç, saatlik temizlenir).
- `houseAction take`: cafe/bar işletmesinde müşteriye yiyecek-içecek kapalı (`biz-menu`).
- Realtime Database: `piano/{houseId}` kuralları (`database.rules.json`).
- Testler: `functions/scripts/venue.test.mjs` (5 test) — toplam 237 test geçiyor.

Yayınlama:
```
firebase deploy --only firestore:rules,database
firebase deploy --only functions:shopAction,functions:houseAction,functions:businessRollover
```
+ web. (Realtime Database kurulu değilse piyano sadece çalan kişide ses verir.)

---

# v77 — İşletmeler, Faz 2: Silahçı / Modifiye Garajı / Araba Galerisi

**Tamir ve geliştirme artık sadece Atölye'de** (profilden ve soygun ekranından kaldırıldı; profilde ömür ve ⬆ "geliştirilebilir mi" hücreleri görünür). Silahçı: silah tamiri + geliştirme · Modifiye: araç tamiri + vites/depo geliştirme.
- **Oyunun dükkânları her zaman açık:** Silah Mağazası tezgahında 🔫 / 🛠️ sekmesi, Modifiye Garajı'nda Atölye. Fiyat: malzeme %100 + işçilik %30 (Amazor fiyatına göre; tamir malzemesi başına 10 + 3 = 13), sınırsız malzeme.
- **Oyuncu dükkânı:** sahip malzeme başına fiyat belirler — malzeme %70–100, işçilik %10–30 (kaydırıcıda ★ oyunun fiyatı). Dükkâna malzemeyi kendi envanterinden koyar / geri alır.
- **Atölye ekranı (yazısız):** 🔧 / ⬆ sekmeleri, ürün kartı (ömür hücreleri, tamirle dolacak kısım parlar; gelişim basamakları, sıradaki nabız atar — araçta ⚙️ vites / ⛽ depo seçilir), malzeme çubuğu (sol dükkânın, sağ benim; %0/50/100'de yapışır; yetmeyen taraf kilitli ve taralı), kilitli işçilik + toplam + tek onay. İki tarafta da yetmiyorsa çubuk kırmızı taralı ve 🚪★ oyunun dükkânına götürür. Altın yetmezse sayaç yanıp söner, toplam sarsılır. Fiyat onay anında değiştiyse fiyatlar parlar, yeniden onay istenir.
  - İşçilik her adet için zorunlu; müşteri kendi malzemesini kullanırsa o kısım için sadece işçilik öder. **Müşterinin malzemesi harcanır, kimseye geçmez.** Dükkânın malzemesi işletme envanterinden düşer.
  - Oyuncu dükkânında işlem için dükkânda olmak gerekir (sahip olmasa da olur). Sahip kendi dükkânında ücret ödemez.
  - Stok aynı işi bir daha karşılayamayacak kadar azalınca sahibin ⚙️'ünde kırmızı nokta + günde en fazla 1 toplu SMS.
- **Vitrin (silahçı: en fazla 10 silah · galeri: en fazla 10 araç):** Ayarlar › Envanter'den vitrine koy (fiyat bandı 2. el ile aynı fonksiyon). Dükkân ilanı = 2. el ilanı (2. El Pazarı'nda da görünür). Müşteri dükkânda **🔫 / 🚗 Satılık** ile görür ve satın alır; satış dükkânın raporuna "satış" olarak girer.
  - Vitrindeki ürün kilitlidir (kullanılamaz; profilde soluk + 🔒) ve **00:00'da ömrü azalmaz**.
  - İlan 7 günde düşer ya da 2. el uygulamasından kaldırılırsa ürün vitrinde kalır, sahip yeniden ilana koyar (cezasız).
  - **Vitrinden geri çek:** ömür −1, ürün 00:00'a kadar tekrar konamaz (basılı tutarak; son ömür hücresi kırık görünür). **⚡ Anında sat:** 2. el anında satışla aynı ödeme + sistem ilanı.
  - **İşletme kapanırsa** vitrindeki ürünler sahibine döner — geri çekmekle aynı: ömür −1, bugün tekrar konamaz; sonra normal yaşlanır. Kapanış uyarısı bunu gösterir (🔫/🚗 sayısı + kırık hücre), sahip vazgeçebilir. Malzemeler cezasız döner.
  - Polisin elinde en az 1 kullanılabilir silah kalmalı (2. el kuralı vitrinde de geçerli). Ömrü 0 ürün konamaz.
- Onboarding görev 19: "Silahçıda silahını geliştir".

**Teknik**
- Yeni: `functions/itemRules.js` (ömür/tamir/geliştirme/Amazor/Atölye bantları/2. el bandı — index.js ve istemci ortak; değerler değişmedi), `functions/shop.js` (`shopAction`: workshop, stock, prices, vitrinAdd/List/Unlist/Remove/InstantSell). `createListing`/`instantSellListing` fiyat bandını artık `itemListingBand`'den alıyor (aynı formül).
- Kapatılan uçlar: `upgradeVehicle`, `upgradeWeapon`, `repairItem` (eski istemciler işçiliksiz işlem yapamasın).
- `dailyReset` vitrindeki ürünün ömrünü düşürmez; `expireOldMarketplaceListings`/`cancelListing` dükkân ilanında ürünü vitrinde bırakır; `buyListing` vitrin izini temizler ve dükkân raporuna yazar.
- Testler: `functions/scripts/shop.test.mjs` (9 test) — toplam 232 test geçiyor. Önizleme: `/biz-app.html?type=silahci` (müşteri → Ali'nin Yeri → Atölye), `/biz-app.html?type=silahci&mine=1` (sahip).

Yayınlama:
```
firebase deploy --only functions:shopAction,functions:houseAction,functions:businessRollover,functions:upgradeVehicle,functions:upgradeWeapon,functions:repairItem,functions:dailyReset,functions:expireOldMarketplaceListings,functions:cancelListing,functions:buyListing,functions:createListing,functions:instantSellListing
```
+ web. Kural/indeks değişikliği yok.

---

# v77 — İşletmeler, Faz 1: Ev → İşletme dönüşümü

**Haritada:** Spor Salonu, Cafe, Bar, İnternet Kafe, Silah Mağazası, Araba Galerisi, Modifiye Garajı → o türdeki açık dükkânlar (ad, sahibi, içerideki kişi sayısı). Sıra dünkü kazanca göre (en çok kazanan üstte; kazanç gösterilmez, sunucu sadece sırayı yazar). Silah/Galeri/Modifiye listesinin en üstünde oyunun kendi dükkânı (★ 7/24) — eskisi gibi açılır.
- Üstte **"[tür] aç"**: ev fiyatı (500.000) + gerekli mobilyaların en ucuz seçenekle maliyeti + toplam + bakiye. Satın al → ev alınır ve içine girilir. Mobilyalar tamamlanana kadar orası **ev**dir.
- Evdeyken **⚙️ Ayarlar › 🏪 İşletmeler**: 7 tür, her birinin gerekli mobilyaları (yerleşen ✓, eksik soluk, sayı x/y). Hepsi tamamsa **Aç**. Bir ev aynı anda tek işletme. Haritadan "aç" ile alınan evde şartlar tamamlanınca ⚙️ nabız atar.
- İşletme açılınca: ev listesinden çıkar, kendi türünün listesine geçer, **her zaman herkese açık** olur. Ayarlar'da "Evin türü" yerine **Fiyatlar / Envanter / Rapor** (rapor: bugün/dün gelir, müşteri, gelir türleri, en çok satan, kullanılan malzeme — sadece sahibi görür). Fiyatlar ve envanter içeriği Faz 2-4'te dolar.
- **Mobilya taşımak serbest.** Gerekli bir mobilyayı envantere kaldırmak:
  - İçeride müşteri varsa ya da ödenmiş/bitmemiş hizmet varsa (spor/internet, sonraki fazlar) → 🔒 kaldırılamaz (kişi sayısı / bitiş saati görünür).
  - Yoksa uyarı: "[tür] kapanır" + sahibine dönecekler → **basılı tutarak** onay. İşletme kapanır, işletme envanterindeki her şey sahibin envanterine döner. Mobilyayı geri koyunca hemen yeniden açılabilir.
  - İşletmeler panelinden de basılı tutarak kapatılabilir (aynı kilit kuralı).
- Gerekli mobilyalar (`functions/businessCatalogData.js`): "veya" seçeneklerinin hepsi şartı sağlar (ör. Çelik/Altın Kasa, herhangi bir araba mobilyası; motor sayılmaz). Deneme eşyalar sayılmaz.
- Günlük gider/vergi yok; günlük rapor `businessDaily` koleksiyonunda tutulur (ileride vergi için).

**Teknik**
- Ev belgesi: `biz {type, openedAtMs}`, `bizType`, `bizIntent`, `bizRank`, `bizLockUntilMs`. Yeni koleksiyonlar: `businessInventories/{houseId}` (müşteriler okur), `businessDaily/{houseId}_{gün}` (sadece sahibi okur), `businessRollups` (istemciye kapalı).
- `houseAction` yeni op'lar: `bizOpen`, `bizClose`, `bizStatus`; `save`/`checkout` gerekli mobilyayı kaldırınca `biz-required` / `biz-locked` ile reddeder, istemci onay verince `allowBizClose` ile kapatır.
- Yeni zamanlanmış fonksiyon `businessRollover` (saatlik, her tür/gün için bir kez): 00:00 sınırlı türlerin sırası 00:05'te, spor salonunun (19:00 futbol günü) 19:05'te yazılır.
- Testler: `functions/scripts/business.test.mjs` (7 test) — toplam 223 test geçiyor. Önizleme: `npm run preview:gangs` → `/biz-app.html?type=spor` (liste), `/biz-app.html?type=spor&mine=1` (kendi evin, şartlar hazır).

Yayınlama (sırayla):
```
firebase deploy --only firestore:rules
firebase deploy --only functions:houseAction,functions:businessRollover
```
+ web. Kurallar yayınlanmadan web yayınlanırsa Rapor/Envanter sekmeleri boş görünür (başka bir şey bozulmaz).

---

# v76 — Başarı farkı + ATM

1. **Başarı ödül farkı (tek seferlik):** ödüller artırılmadan önce kazanılmış başarıların farkı (yeni − eski) bir kez yüklenir: Banka soy +1, Sixtagram 100 beğeni +1, Cabrio şampiyonu +2, Banka soyguncusu yakala +2, Mafya Babası +2, İstihbarat Başkanı +1, Süper Kupa +1 (İmam, Piyango, 1. Lig şampiyonu zaten aynı). Oyuncuya tek SMS gider.
   - Yayından sonraki ilk saatlik taramada (achievementsSweep) herkes için otomatik yapılır; ayrıca oyuncu Başarılar ekranını açınca da kontrol edilir. İkinci kez verilmez (her başarıya "verilen ödül" kaydı yazılır; toplu tarama bayrakla bir kez çalışır).
2. **ATM:** evdeki ATM'ye yaklaşınca "🏧 Parara Bank" → telefonda Parara uygulaması açılır (yatırım, kredi, ceza işlemleri).

Yayınlama:
```
firebase deploy --only functions:achievementsSweep,functions:syncAchievements
```
+ web.

---

# v75 — Oyun Salonu (evde konsol / bilgisayar / atari)

**Nereden açılır:** Atari Makinesi, Oyuncu Bilgisayarı, İnternet Kafe İstasyonu, Konsol & TV Seti → "🎮 Oyna". Bu eşyalardan birinin 3 m yakınındaki bir koltuğa/sandalyeye oturunca da oturduğun yerden "🎮 Oyna" çıkar.

**4 oyun:**
- ⚽ **Kafa Topu** — 60 sn, koca kafalı futbol (◀ ▶ · zıpla · şut).
- 🥊 **Sokak Dövüşü** — 3 raunt, 2 raunt alan kazanır (yumruk · tekme · rakibin tersine basılı tut = blok).
- 🏎️ **Neon Yarış** — kuşbakışı pist, 4 tur, kamera kendi arabanı izler, mini harita (direksiyon · gaz · fren).
- 🧱 **Tuğla Kırma** — mevcut atari oyunu (tek kişilik).

**Modlar (ilk üç oyun):**
- 🤖 **Bota karşı** — hemen başlar. Botlar dengelendi (bot-bot yüzlerce maçta iki taraf eşit kazanıyor; kendi kalesine gol / sıra avantajı hataları giderildi).
- 🌐 **Online** — "Oda kur" → odan herkesin "Açık odalar" listesinde görünür, biri katılınca maç başlar (beklerken "Bota karşı oyna"ya geçebilirsin). Farklı evlerden/cihazlardan bağlanılır. Rakip çıkarsa kalan kazanır.
- Telefon: ekrandaki büyük butonlar; bilgisayar: klavye (← → ↑ · Boşluk/J · K).

**Online için bir kerelik kurulum (Firebase Realtime Database):** Firestore'da her hareket ücretli okuma/yazma olurdu; Realtime Database bant genişliğiyle ücretlenir ve bu kullanımda ücretsiz kotada kalır, ayrıca daha hızlıdır.
1. Firebase Console → Build → **Realtime Database** → Create Database → konum **Belgium (europe-west1)** → "Locked mode".
2. Açılan sayfadaki adresi kopyala (`https://…-default-rtdb.europe-west1.firebasedatabase.app`) → `.env` dosyasına: `VITE_FIREBASE_DATABASE_URL=<adres>`
3. `firebase deploy --only database` (kurallar: `database.rules.json` — sadece giriş yapmış oyuncular; odayı sadece kuran yönetir, konuk sadece kendi girdisini yazar).
4. Web'i derle/yayınla.
Bu adımlar yapılmadan web yayınlanırsa oyunlar **bota karşı** çalışır, online seçeneği "yakında" yazar — hiçbir şey bozulmaz.
⚠️ `firebase.json`'a database eklendi: veritabanı oluşturulmadan düz `firebase deploy` (hepsi) hata verir; `--only` ile yayınlamaya devam et.

Yayınlama: sadece web (+ hazır olunca `firebase deploy --only database`). Cloud Functions değişmedi.

---

# v74 — Android adres çubuğu + revizeler

1. **Android adres çubuğu:** `public/.well-known/assetlinks.json` içine Play imza anahtarının SHA-256'sı işlendi (0D:A9:…:02:F8). Web yayınlanınca telefonda uygulamayı kapatıp aç; hemen kalkmazsa uygulamanın önbelleğini temizle / yeniden yükle. Uygulamayı yeniden derlemek gerekmez. Kontrol: `node scripts/check-assetlinks.mjs`.
2. **Başarı ödülleri:** 1, 1, 2, 2, 3, 3, 4, 4, 5, 5 zümrüt (toplam 30). Önceden kazanılanlara fark verilmez; ekranda onlar için kazanılan eski ödül sayılır.
3. **Tır sabotajı:**
   - Haraç/rüşvet ödendikten sonra tıra saldıran kimse kalmadıysa savunma savaşı da **hemen biter** (eskiden gece yarısına kadar aktif kalıyordu). Başka saldırgan varsa savunma sürer.
   - Savunan çete ("⚠️ Tırlarımıza saldırı" kartı) ve saldıran çete ("💣 Saldırdığımız tırlar" kartı) da artık müttefikin gördüğü **🏆 Sıralama** ve **🔥 En çok katkı** detaylarını görür (savunma tarafları + saldırganlar tek listede). Saldıran çete diğer saldırganları göremez (gizli kalır).
4. **Cami:** "X. Vakitteki Cemaat (Y)" — hem menü düğmesinde hem panel başlığında kişi sayısıyla.
5. **Miktar butonları (oyunun tamamı):** değer üst sınırdayken de tüm butonlar basılabilir; sayı artmaz ama adım seçilir, böylece [−] ile istenen miktarda azaltılabilir.

Yayınlama (sadece değişenler):
```
firebase deploy --only functions:gangAction,functions:achievementsSweep,functions:syncAchievements,functions:applyForImam,functions:attemptHeist,functions:executeHeistPlan,functions:toggleSixtagramLike,functions:dailyReset,functions:resolveStuckRewardsNow,functions:resolveFutbolMatchdayReveal
```
+ web (assetlinks dosyası web ile gider).

---

# v73 — Maliyet optimizasyonu (Firestore okumaları)

Görünür oyun davranışı aynı; aşağıdakiler arka planda daha az okuma/yazma yapar.

## Mekânlar ve evler (en büyük kalem)
- Park + 7 mekânda yürürken konum 0,3 sn yerine **1 sn'de bir** yazılır (bekleme nabzı 12 → 20 sn). Diğer oyuncular aradaki boşlukta ekranda **yumuşakça kayar**, yürüme animasyonu yerelde üretilir — eskisinden daha akıcı görünür. Her konum yazımı mekândaki herkese bir okuma demekti → ~%65 azalma.
- Evde konum 0,22 sn yerine **~0,65 sn'de bir** yazılır; oturma/hareket (dans vb.) anında gider. Diğerleri yumuşak takip edilir.
- **Ev listesi:** tüm evlerdeki herkesin her adımını canlı dinliyordu (evin İÇİNDEYKEN bile). Artık kişi sayıları 30 sn'de bir, sadece aktif kayıtlar okunarak güncellenir; evin içindeyken liste hiç dinlenmez.
- **Mekânlar > Ziyaret:** 8 mekânın + tüm evlerin canlı konum dinleyicisi kaldırıldı → 30 sn'de bir 3 küçük sorgu.

## Her oyuncuda sürekli açık olanlar
- Genel sohbet rozeti/bildirim şeridi her açılışta **100 mesaj** okuyordu → artık 1 (sohbet ekranı yine 100).
- SMS'ler: alınan TÜM SMS'ler (hiç silinmiyor) her açılışta okunuyordu → son 100.
- Aktif yarış odası kontrolü: oyuncunun girdiği TÜM yarış odaları (bitmişler dahil) okunuyordu → sadece bitmemiş odalar (yeni indeks; indeks hazır değilse eski sorguya düşer, oyun bozulmaz).
- Sixtagram "yeni gönderi" rozeti: en yeni gönderiye gelen her beğeni/yorum çevrimiçi herkese okuma yazdırıyordu → 60 sn'de bir tek okuma.

## Ekranlar
- Fabrika listesi: tüm fabrikalar + her fabrikanın makineleri canlı dinleniyordu (her üretim izleyenlere okuma) → açılışta bir kez + 90 sn'de bir yenileme.
- Sixtagram akışı: Anasayfa'ya her girişte 150 gönderi → 90 sn içinde tekrar girilirse son liste kullanılır (yeni paylaşım/elle yenileme her zaman taze çeker; beğeni sayısı ve silme önbellekte de güncellenir).
- Soygun planı kartı: her izleyici 15 sn'de bir tüm katılımcıların kullanıcı + silah belgelerini yeniden hesaplatıp hepsini yeniden yazıyordu → plan başına en fazla 40 sn'de bir, sadece değişen katılımcı yazılır; istemci 45 sn.

## Sunucu
- Futbol transfer bakımı **her saat tüm futbolcuları** okuyordu → mevki başına en güçlü 30 oyuncu (yeni indeks). Sonuç birebir aynı (test edildi); indeks yoksa eski taramaya düşer.

## Yayınlama (SIRA ÖNEMLİ)
1. `firebase deploy --only firestore:indexes` → Firebase Console > Firestore > Indexes'te iki yeni indeks "Enabled" olana kadar bekle (birkaç dk).
2. Sadece değişen fonksiyonlar: `firebase deploy --only functions:futbolTransferMarketHourlyMaintenance,functions:forceRefreshFutbolTransferMarket,functions:resetFutbolTransferMarket,functions:refreshHeistPlanParticipants`
3. Web.

## Maliyet için ayrıca önemli
- **Projede 210 fonksiyon var.** `firebase deploy --only functions` her seferinde 210'unun hepsini yeniden derler (Cloud Build dakikası + Artifact Registry'de her biri için yeni imaj). Sık tam yayın, Firestore'dan bağımsız ciddi maliyet yaratabilir. Bundan sonra sadece değişen fonksiyonları yayınla (notlarda listeyi vereceğim).
- Eski fonksiyon imajlarını otomatik silmek için: `firebase functions:artifacts:setpolicy` (firebase-tools güncel olmalı).
- Neyin ne kadar tuttuğunu kesin görmek için: Google Cloud Console > Billing > Reports > "Group by: SKU".

---

# v72 — Kare ev fotoğrafı + Sixtagram'da resim çizme + ChatsApp yanıt/tepki

1. **Ev fotoğrafı yine KARE, ama çekildiği açıyla:** dikey çekimde yatay görüş açısı korunur, üstten/alttan kırpılır (yatay çekimde yanlardan). Çekim önizlemesi de aynı kare kırpılmış hâli gösterir, paylaşılanla birebir aynı. İsim/balon kadrajın üstünden taşacaksa aşağı itilir, kesilmez.
2. **Sixtagram → Görsel Ekle → 🎨 Resim Çiz** (listenin en üstünde):
   - Boş kare tuval, 12 renk, 3 fırça kalınlığı.
   - **↩️ Geri al:** son fırça darbesini siler (art arda basılabilir).
   - **Tuval rengi:** 8 zemin rengi; istediğin an değiştirilebilir, çizim korunur.
   - **🗑️ Temizle** (yanlışlıkla silmesin diye iki kez basılır).
   - "Bitti" → gönderide önizleme (✏️ Çizimi düzenle ile geri dönülebilir) → Paylaş. Akışta normal fotoğraf gibi kare görünür.
   - Görsel YÜKLENMEZ: fırça darbeleri saklanır ve her telefonda yeniden çizilir. Sunucu renkleri/kalınlıkları/koordinatları doğrular. Bir tablo en fazla 500 darbe ve 8.000 nokta olabilir; tuvalin altındaki çubuk kalan yeri gösterir.
3. **ChatsApp (Neon Şehir grubu + arkadaş sohbetleri):** mesaja basılı tutunca açılan panelde:
   - En üstte **emoji tepkileri** (👍 ❤️ 😂 😮 😢 🙏 🔥 👏). Mesajın altında sayılarıyla görünür. Kişi başı bir tepki; aynı emojiye tekrar basınca kalkar. Balonun altındaki rozete dokunarak da tepki verilebilir.
   - **↩️ Yanıtla:** mesaj kutusunun üstünde "Yanıtlanıyor · İsim" çubuğu çıkar (✕ ile iptal). Gönderilen mesajın içinde alıntı görünür; alıntıya dokununca asıl mesaja kayar ve vurgulanır.
   - Alıntı sunucuda asıl mesajdan okunur (sahte alıntı yazılamaz). Silinmiş/gizlenmiş mesaja yanıt verilemez. Engellediğin oyuncunun alıntılanan metni gösterilmez.

Testler: 214 test geçiyor (çizim doğrulama, DM yanıt/tepki eklendi).

Yayınlama: `firebase deploy --only functions` (yeni: `reactChatMessage`; güncel: `sendChatMessage`, `socialAction`, `createSixtagramPost`) + web. Kurallarda değişiklik yok.

---

# v71 — Düzeltmeler + mekân hareketleri + çete reklamı

1. **Mobilya SMS'i kaldırıldı:** mobilya/duvar/zemin alışverişinden sonra "Mobilya Mağazası" mesajı gelmez.
2. **2. El – tahmini değer:** "yıpranma X puan → en yüksek fiyatın %Y'i" alt yazısı kaldırıldı; sadece "💡 Tahmini değer: … altın" görünür.
3. **L koltuk alınamıyordu ("Sepet tutarı değişti"):** sunucudaki eşya kodu kontrolü büyük harfe izin vermiyordu, `sofaL` sepetten sessizce düşüyor, iki taraf farklı tutar hesaplıyordu. Düzeltildi (aynı sebeple L koltuk kaydedilmiyordu da).
4. **Camlı silah dolabı:** gövde dolu bir kutuydu, silahlar içinde kalıyordu (denemede yarı saydam olduğu için görünüyordu). Dolap artık içi boş (arka, yan, üst, taban panelleri + cam kapak). Satın aldıktan sonra da silahlar görünüyor.
5. **Ev fotoğrafları:**
   - Paylaşılan kare artık **çekildiği en/boy oranıyla** çiziliyor (eskiden hep kare çiziliyordu, bu yüzden dikey telefonda çekilen fotoğraf çok daha geniş açılı görünüyordu). Sixtagram'daki çerçeve de aynı oranda.
   - **İsim etiketleri ve mesaj balonları** fotoğrafta çıkıyor: hem çekim önizlemesinde hem paylaşılan karede. Balonlar, çekim anında ekranda olan mesajlardır (sunucu ev sohbetinden alır; istemci metin gönderemez).
   - Çekim önizlemesi artık kırpılmıyor (paylaşılanla birebir aynı).
   - Eski paylaşımlar kare olarak görünmeye devam eder.
6. **Hareketler (Dans et, El salla, Alkışla, Zıpla, Kalp at) tüm mekânlarda:** Park, Banka, Karakol, Camii, Gazino, Araba Galerisi, Silah Mağazası, Modifiye Garajı. Sağ sütunda 👥'nin üstünde 😀 düğmesi. Herkes görür; mekâna sonradan giren eski hareketleri oynatmaz.
7. **Çete ilanlarına reklam:** Ticaret → "🏪 2. eldeki ilanlarımız" satırında **📢 Reklam** (Baba / Sağ Kol). 1.000 altın çete kasasından, 24 saat; ilan 2. El Pazarı'nda "📢 Reklam Verilen Ürünler" bölümüne girer. Süre dolmadan tekrar reklam verilemez, ücret iade edilmez (oyuncu ilan reklamıyla aynı kurallar). Kasa yetmezse verilemez; aynı anda birkaç kez basılsa da tek ücret alınır.

Testler: 207 çete/sistem testi + yeni ev testleri (L koltuk, SMS yok, fotoğraf oranı/balonlar) + çete reklam testi geçiyor.

Yayınlama: `firebase deploy --only functions,firestore:rules` (houseAction: L koltuk + SMS + fotoğraf; gangAction: `advertiseDepotListing`; kurallar: mekân hareketleri için `emote`/`emoteTs` alanları) + web.
⚠️ Kurallar yayınlanmadan web yayınlanırsa hareketler sadece kendi ekranında görünür (başkalarına gitmez); başka hiçbir şey etkilenmez.

---

# v70 — Düzeltmeler

1. **Başarılar** telefonun sağ sayfasında, "Bi fikrin mi var?"ın sağında.
2. **2. el – çete ilanları** oyuncu ilanlarıyla aynı kartlarda (satıcı = çete adı). Aynı çete aynı ürünü aynı fiyata koyarsa ilan birleşir (sunucu yeni ilanı mevcut ilana ekler). Fiyatı uygunsa "Avantajlı Ürünler"e girer. Ayrı "Çete ilanları" bölümü kalktı.
3. **Adım butonları:** sayı butonuna basınca değer o kadar ARTAR ve buton seçili olur; tekrar bastıkça artmaya devam eder. [+] seçili kadar artırır, [−] seçili kadar azaltır.
4. **Ev 2D modu:** açı değiştirirken sıçrama/titreme giderildi (görünür alan hesabı 45°'de eksen değiştiriyordu; kamera da iki kez yumuşatılıyordu).
5. **Ev kamerası:** fotoğraf siyah çıkıyordu (WebGL tamponu okunmadan temizleniyordu) — kare artık çekim anında çizilip okunuyor.
6. **"Ev sahibi seni evden çıkardı" yanlış uyarısı:** girişte ilk (önbellek) görüntüde kayıt henüz yok diye çıkarılmış sayılıyordu. Artık sadece ev sahibi gerçekten çıkardıysa (15 dk yasak) uyarı çıkar; kayıt başka sebeple düşerse (ör. uygulama arka planda kaldı) sessizce yeniden girilir.
7. **Evde eldeki ürün** artık diğer mekânlardaki gibi karakterin elinde görünüyor (herkes görür).
8. **Ev fiyatı** 500.000 altın.
9. **Banka kredisi** adımlarına +100.000 ve +1M eklendi.
10. **Makam masası:** koltuk masanın arkasına (ekranın olduğu tarafa) alındı.

Yayınlama: `firebase deploy --only functions` (houseAction fiyat, gangAction ilan birleştirme) + web.

---

# v69 — Faz 4 (Android) + son istekler

## Krediler
- Devlete borcu olan oyuncu da kredi çekebilir. Çekilen kredinin **tamamı** hesaba yatar (yarısı borca kesilmez).
- Aktif kredisi olan yeni kredi çekemez (aynı anda tek kredi).

## Evler
- Ev sayısı sınırı (5) kaldırıldı — istediği kadar ev alınabilir.

## Çeteler: savaş izleme
- Savaş sekmesinin en altında **👁️ Devam eden savaşlar**: bize ait olmayan, şu an süren savaşlar canlı izlenir (20 sn'de bir yenilenir).
- Çetesi olmayan oyuncular da **Savaş** sekmesine girip savaşları izleyebilir (katılamaz; diğer sekmeler kilitli).
- Gizli bilgi gösterilmez: bahis tutarı, tır yükü/ödül değeri, haraç/rüşvet tutarı, sabotaj ücreti. Tır saldırıları ancak saldırı başlayıp tır sahibine duyurulduktan sonra listede görünür.
- Sunucu: yeni salt-okunur çete işlemi `watchWars` (15 sn önbellek).

## Android (TWA)
- **Adres çubuğu sorununun sebebi bulundu:** sitedeki `https://cetelerinsavasi.com/.well-known/assetlinks.json` dosyasında imza parmak izleri hâlâ yer tutucu (`REPLACE_WITH_...`). Android, uygulamanın siteye ait olduğunu doğrulayamayınca adres çubuğunu gösterir. Çözüm (kod hazır, sadece SHA-256 değeri gerekiyor):
  1. Play Console → uygulama → **Test ve yayınla → Uygulama bütünlüğü → Uygulama imzalama** → "Uygulama imzalama anahtarı sertifikası" altındaki **SHA-256** değerini kopyala.
  2. (İsteğe bağlı, dahili test/yerel APK için) yükleme anahtarının SHA-256'sı: `keytool -list -v -keystore android/android.keystore -alias android`
  3. Proje kökünde: `node android/configure.mjs --app-signing-sha=AA:BB:... --upload-sha=CC:DD:...`
  4. Web'i yayınla, sonra `node scripts/check-assetlinks.mjs` ile kontrol et. Uygulamayı kapatıp açınca adres çubuğu kaybolur (APK'yı yeniden derlemek gerekmez; ama yeni ikon için aşağıdaki derleme gerekir).
- **Geri tuşu:** açık telefon uygulaması → telefon → mekân / ekran → ana sayfa sırasıyla kapanır. Ana sayfada geri tuşu "Çıkmak istiyor musun?" sorar; bir kez daha geri tuşu uygulamayı kapatır, "Oyunda kal" soruyu kapatır. Sadece Android uygulamasında ve ana ekrana eklenmiş uygulamada çalışır; web tarayıcısının geri tuşuna dokunulmaz.
- **iPhone 11'de görevler paneli taşması** düzeltildi: panel görünür ekran yüksekliğine (dvh, çentik dahil) sığar, liste kendi içinde kayar, ipucu balonları ekrandan taşmaz.
- **Yeni ikon:** `android/store-assets/play-icon-512.png` ve sitedeki `pwa-icon-*.png` güncel. Android ikonunun değişmesi için: `android/twa-manifest.json`'da `appVersionCode`'u Play'deki son sürümden büyük yap (`node android/configure.mjs --version-code=N --version-name=1.x.y`), sonra `bubblewrap update --skipVersionUpgrade && bubblewrap build` ve yeni .aab'yi yükle.

---

# v68 — Faz 3: Çete siparişleri ve tır takvimi

## Yeni takvim
- **Sipariş:** Pazartesi–**Cumartesi**, **00:00–12:00** arası (Baba / Sağ Kol).
- **Kalkış:** siparişten sonraki ilk 3 saatlik dilim (03:00 · 06:00 · 09:00 · 12:00). Ör. 07:20 siparişi 09:00'da yola çıkar.
- **6 saatlik pencere:** yola çıktıktan sonraki 6 saat ihbar, içerik sızdırma, sabotaj (ve sabotaj talebi) ve İstihbarat operasyonu zamanı.
- **Saldırı:** pencere bitince başlar (ör. 09:00 kalkış → 15:00) ve 24:00'te biter; tır sahibine o anda duyurulur.
- **Haraç / rüşvet:** 21:00'e kadar (değişmedi).
- **Teslim:** aynı gecenin 00:00'ında depoda (eskiden ertesi gece). Bir tır günde tek sefer yapar; yola çıkan sipariş iptal edilemez.
- **Günlük sipariş limiti:** savaşa katılan tüm tarafların toplam gücünün %0,5'i → **%1'i**. Şu an elde tutulan yolların limiti bir kez **2 katına** çıkarılır (otomatik, tek seferlik).
- Bu sürümden önce verilmiş, henüz yola çıkmamış siparişler kalkış günü 00:00'da çıkar (saldırı 06:00'da başlar); zaten yoldaki tırlar eski kuralla (saldırı 12:00) biter.

## Çete deposu
- Depodaki ürünler artık **anında satılamaz ve dağıtılamaz**; sadece 2. el pazarına konur. İlan çetenin adıyla görünür, para çete kasasına girer.
- 2. elde çete ilanlarında "Tahmini değer: … · çete ürünü, değer kaybı yok" yazıyor (ürünler yeni, ilanların süresi dolmuyor).

## Operasyon ekranı
- Her ihbarlı tırda kendi geri sayımı: operasyon için kalan süre; operasyon başladıysa **saldırının başlamasına kalan süre** (ör. "⚔️ saldırı 15:00'de başlar").
- Ticaret ekranında sipariş verirken kalkış / pencere / saldırı / teslim saatleri gösteriliyor; yoldaki her tırın kendi sabotaj geri sayımı var.

## Yayınlama
1. `firebase deploy --only functions` (çete sistemi: `gangAction`, `gangClock`). Kural ve indeks değişikliği yok.
2. Web build + yayın.
3. İlk saat turunda yol limitleri bir kez 2 katına çıkar (`routeLimitV67` bayrağı).

---

# v67 — Faz 2: Ekonomi & uygulamalar

## Oyuncular için
- **Krediler (Banka › Krediler) yenilendi:** Araç ipoteği kalktı. Artık **kredi puanı** var:
  %20 × (araç + silah + malzemelerin anında satış değeri + fabrika değeri (sende kalan hisse oranıyla) + sahibi olduğun futbol takımının değeri).
  Puanın kadar kredi çekebilirsin (en az 1.000). Aynı anda tek kredi, 10 gün vade, %20 faiz, dilim dilim ödeme.
  Vade dolunca ödenmeyen kısım devlete borca yazılır (borç bitene kadar kazancın yarısı kesilir). (v68: devlete borcu olan da kredi çekebilir; çekilen kredinin tamamı hesaba yatar, yarısı borca kesilmez. Aktif kredisi olan yeni kredi çekemez.)
  Ödemesi süren eski araç kredileri aynı ekranda ödenmeye devam eder; biri kapanmadan yeni kredi çekilemez.
  Görev 14 bilgisi: "Kredi puanını yükselterek daha fazla kredi çekebilirsin."
- **🏆 Başarılar** (telefon ana ekranı): 10 başarı, her biri bir kez, ödül zümrüt (1-1-1-1-1-1-2-3-4-5), kazanınca SMS. Tamamlananlar karartılır.
  İmam ol · Piyango kazan · Banka soy · Sixtagram'da toplam 100 beğeni · Üstün Cabrio şampiyonası · Polis olarak banka soyguncularını yakala · Mafya Babası ol · İstihbarat Başkanı ol · Takımınla 1./2. Lig kupası · Takımınla 1. Lig şampiyonluğu.
  Şu an imam / Mafya Babası / İstihbarat Başkanı olanlar başarıyı uygulamayı açınca (ya da saatlik taramada) alır.
- **Adım sistemi her yerde:** − değer + · Adım: 1 / 10 / 100 / 1.000 / 10.000 (seçilen adım kadar artar/azalır, varsayılan 1) · Max · Sıfırla. Çete ekranlarındaki miktar seçici de aynı.
- **Bahisli yarış:** en fazla 100.000 altın (sunucuda da sınır), 10.000 adımı ve Max butonu.
- **SMS:** "✓ Tümünü okundu yap".
- **Profil:** "Hesabımı Sil"in yanına **Çıkış Yap** (onaylı).
- **Bi fikrin mi var?:** ❤️ beğeni. Son 24 saatte yazılanlar en üstte (yeniden eskiye), sonra beğeniye göre. Kendi yazdığını beğenemezsin.
- **Soygun › Şüphe:** altını yetmeyen rüşvet/alışverişte buton yerine "Yetersiz altın".
- **Dilenci:** servet sınırı kalktı, herkes dilenci olabilir (bedeli: saygınlık 0). Bir dilenciye günde **toplam** en fazla 10.000 altın bağışlanabilir (eskiden son bağış sınırı aşabiliyordu); bağış ekranı kalan tutarı gösterir.
- **Polis de imam olabilir** (meslekler bağımsız; imamın 5 vakit + nasihat görevi geçerli).
- **Fabrika › Sponsorluk:** kabul edilen teklifte tutar ve "19:00'a kadar daha yüksek teklif kabul edilirse anlaşma ona geçer" uyarısı.
- **2. El:** Avantajlı ürünler ana sayfadan her kategorinin içine (en üste) taşındı. Araç/silahlarda **Tahmini değer**: tamir 2 puan, geliştirme 10 puan → 0-9: %90 · 10-19: %80 · 20-29: %70 · 30+: %60 (en yüksek fiyatın). İlan verirken de görünür. (Bilgi amaçlı; fiyat aralığı kuralları değişmedi.)
- **Yatırımlar:** ters rejimde (düşüş eğilimi ya da alıcılar çoğunlukta >%50) artış/düşüş eşit: kripto %1-20 / %1-20, hisse %1-10 / %1-10, elmas %1-5 / %1-5. Alış oranı hesabında en büyük alıcı ve en büyük satıcı hariç tutulur.
- **Shopier:** aynı paketten 2 adet alınan siparişte yalnızca biri yükleniyordu → adet (productcount / sepet ayrıntısı) okunuyor; yine eksik kalırsa ödenen tutar paket fiyatlarının tek bir kombinasyonuyla birebir karşılanıyorsa eklenip sipariş elle kontrol için işaretleniyor.
- **Açılış/sekme kasması:** ana paket 1,65 MB → 0,74 MB (gzip 470 → 209 KB). Tam ekran sayfalar ve mekân dünyaları ayrı parçalara bölündü, açılıştan 3 sn sonra arka planda önceden indiriliyor. Açılışta her seferinde çağrılan 6 eski göç fonksiyonu 20 sn sonraya ve cihaz başına günde bire indirildi.

## Yayınlama
1. `firebase deploy --only functions` (yeni: `markAllMessagesRead`, `toggleFeedbackLike`, `getCreditInfo`, `takeCredit`, `repayCredit`, `processCreditDefaults`, `syncAchievements`, `achievementsSweep`; güncellenen: `takeVehicleLoan` (kapalı), `createRaceRoom`, `becomeBeggar`, `donateToBeggar`, `applyForPolice`, `applyForImam`, `hourlyInvestmentUpdate`, `shopierOsbWebhook`, soygun/piyango/şampiyona/kupa/sezon sonu, `toggleSixtagramLike`)
2. Web build + yayın. Kural değişikliği yok.

## Faz 3'e kalanlar (çete siparişleriyle aynı kodlar)
- İstihbarat operasyonunda başlama saatine geri sayım
- Çete eşyalarının anında satılamaması/dağıtılamaması, 2. elde çete adıyla listelenmesi ve değer kaybetmemesi

---

# v66 — Faz 1: Evler herkese açık + Zümrüt

## Oyuncular için
- **Ev Satın Al +** (1.000.000 altın; v69: ev sayısı sınırı yok). Ev boş gelir; ilk girişte doğrudan **Gez** modundasın.
- Ev ekranında **Evlerim** ve **Girebileceğin Evler** listesi (ev adı, sahibinin profil fotoğrafı, içerideki kişi sayısı). Mekanlar › Ziyaret sekmesinde içinde en az 1 kişi olan evler de listelenir.
- Üst çubuk: **3D / 2D** (gezide), **Tasarla / Gez** ve **⚙️ Ayarlar** (ev sahibine). Ayarlar: ev adı + tür (🌐 herkese açık / 👥 arkadaşlar / 🔒 gizli — gizlide içeridekiler atılmaz, davetliler girebilir).
- Gez: joystick yok — **dokunduğun yere yürür**, eşyaya dokununca yanına gider. Etkileşim butonlarında E/F harfleri yok.
- Sağdaki butonlar: 😀 hareketler (dans, selam, alkış, zıpla, kalp — açılır/kapanır), 👥 kişiler (ısmarla, davet et (SMS), ev sahibi için evden çıkar), 💬 sohbet, 📱 telefon, 📷 kamera (Sixtagram'da paylaşılabilir ev fotoğrafı).
- **Tasarla:** altta **Mağaza / Envanter**. Mağazadan seçilen ürün odaya **deneme** olarak (yarı saydam) gelir, odadaki herkes görür. Üstte sepet toplamı (altın + zümrüt) → **İptal** ya da **Alışverişi Tamamla** → onay ekranı. Satın alınmış eşyayı kaldırınca Envanter'e gider, envanterden yerleştirince envanterden düşer. Renk satın aldıktan sonra da değişir.
- 150 eşya, 18 kategori (yeni: Dükkân, Duvar, Halı, Dış Mekân — market rafı, kasa, cam tezgâh, içecek dolabı, dondurma dolabı, manav, kafe tezgâhı, pasta vitrini, kıyafet askılığı, manken, sahne mikrofonu, disko topu, çamaşır/kurutma makinesi, çit, bank, sokak lambası, çim, ofis masası, PC, konsol, piyano, ATM, spor aletleri, langırt, masa tenisi, gitar, halılar, tablolar, duvar saati (gerçek saati gösterir), perde, vazo…). Fiyatlar senin listenle birebir; yeni eşyalar o dengeye göre fiyatlandı. Duvar/zemin: kırık beyaz & meşe parke ücretsiz, tuğla/beyaz tuğla/ahşap panel/siyah mermer 5 zümrüt, diğerleri 100.000 altın (yeni: parlak siyah epoksi + düz renk duvar/zeminler).
- Eşyalardan alma: buzdolabı/içecek dolabı içecek, kahve makinesi kahve, yemek masası meyve/yemek, bar kokteyl/viski, silah dolabı/askılığı silah… Elindeki ürün 2 dk durur, diğer mekânlardaki gibi ısmarlanabilir.
- **Atari** makinesi → Tuğla Kırma (sesli). **Müzik kutusu** → 3 şarkı (Kulüp 77 / Ağır Abi / Son Kadeh), aç/kapat/değiştir; evdeki herkes aynı şarkıyı duyar.
- **Zümrüt Mağazası** (eski Altın Mağazası, sadece web): üstte zümrüt paketleri (29 TL → 50 💎, 99 TL → 200 💎), altta harcama: 49 💎 → 30.000 altın, 199 💎 → 100.000 altın + ekstralar. Yeni uygulama ikonu (PWA + Play ikonu dosyası).
- Oyunun ara sıra donup yeniden başlatma gerektirmesi: 3D sahne artık tek bir ortak WebGL bağlamı kullanıyor (eskiden her giriş yeni bağlam açıyordu); bağlam kaybolursa sahne kendini yeniden kuruyor; telefon/atari açıkken çizim duruyor.

## Güvenlik
- Tüm satın almalar sunucuda, transaction içinde: altın/zümrüt yetmezse işlem reddedilir; istemcinin gönderdiği sepet toplamı sunucunun hesabıyla birebir tutmazsa reddedilir. Envanter farkları sunucuda doğrulanır (sahip olmadığın eşyayı "envanterden" koyamazsın). Deneme eşyalar kullanılamaz (oturma/alma yok).
- Evden atılan 15 dk giremez; davet 24 saat geçerli; gizli eve davetsiz girilemez.

## Yayınlama (sırayla)
1. `npm install`
2. `firebase deploy --only firestore:rules` (yeni kurallar: `houses` (+ `houses/{id}/chat`), `houseInventories`, `houseInvites`, `housePresence`)
3. `firebase deploy --only functions` (yeni: `houseAction`, `buyEmeraldOffer`; güncellenen: Shopier/kod ile paket teslimi zümrüt veriyor, `giftHeldItem`, `createSixtagramPost`, `deleteAccount`, `expireInteriorPresence`)
4. **Shopier panelinde** iki ürünün fiyatını 29 TL ve 99 TL, adlarını "50 Zümrüt" / "200 Zümrüt" yap (ürün ID'leri aynı kaldı).
5. Web build + yayın. Yeni ikonun Play'de görünmesi için TWA'nın yeniden derlenmesi gerekiyor (Faz 4'te URL çubuğu düzeltmesiyle birlikte).

## Teknik
- Ortak fiyat listesi: `functions/houseCatalogData.js` (hem sunucu hem istemci aynı dosyayı kullanır).
- Sunucu: `functions/houses.js` (`houseAction` op'ları: buy, enter, save, quote, checkout, settings, invite, kick, chat, take, music) + `functions/scripts/houses.test.mjs`.
- İstemci: `HouseHub.jsx` (liste + satın alma), `HouseScreen.jsx`, `houseEngine.js`, `houseAudio.js`, `ArcadeGame.jsx`, `HousePhoto.jsx`, `hooks/useHouseList.js`. `HouseGate.jsx` ve `HouseMaintenance.jsx` kaldırıldı.

---

# v65 — 3D Ev Güncellemesi (admin testi)

## Oyuncular için değişenler
- Alt çubuğa 5. sekme olarak **👤 Profil** eklendi (en sağda). Eskiden haritadaki "Ev"den açılan profil ekranı artık buradan açılıyor.
- Haritadaki **Ev** artık oyunculara **"Ev Tadilatta"** ekranı gösteriyor.
- Görevler: 16 → "Profile gir ve avatarını düzenle", 19 → "Profile gir ve silahını geliştir".

## Admin için: 3D Ev
- **Tasarla modu:** alttaki raftan eşya seç → odaya eklenir. Eşyayı sürükle = taşı, dokun = seç (döndür 45°, renk, kopyala, sil). ↶ geri al. Duvara asılan eşyalar (TV, silah askılığı, tablo, neon, pencere…) en yakın duvara kendiliğinden yapışır; avize/pervane tavana asılır.
- **Duvar & Zemin:** 17 duvar + 13 zemin kaplaması.
- **Gez modu:** 3. şahıs kamera, joystick / WASD, sürükle = etrafa bak. **E** otur/kalk/arabaya bin, **F** TV, lamba, neon, şömine, far vb. aç/kapat.
- **98 eşya**, 14 kategori; çoğunda 5–15 renk seçeneği (koltuklar 12, arabalar ve motorlar 15 renk/kaplama → yüzlerce kombinasyon).
- Her eşyanın fiyatı var: 🪙 altın ya da 💎 elmas (ileride gerçek parayla satılacak para birimi). Üstte "Ev değeri" görünüyor. Test modunda admin her şeyi ücretsiz yerleştiriyor.
- Tasarım ~1,2 saniyede bir otomatik kaydediliyor (`houses/{uid}`).

## Online test
- 👥 Davet paneli (sadece admin): oyuncu adıyla ya da arkadaş listesinden davet et. Davetli oyuncu haritada Ev'e tıklayınca admin'in evine girer (sadece gezer, düzenleyemez), yaptığın değişiklikleri canlı görür.
- Evdekiler birbirini görür: avatarlar oyundaki SVG avatarların birebir aynısı, kameraya dönük "kağıt figür" olarak çiziliyor. Oturma herkese görünür.
- Altta sohbet: mesajlar hem listede hem kafanın üstünde balon olarak görünür (susturma kuralları geçerli).

## Yayınlama
1. `npm install` (yeni bağımlılık: `three`)
2. `firebase deploy --only firestore:rules` (yeni: `houses`, `houseInvites`, `housePresence`)
3. `firebase deploy --only functions` (yeni: `houseAction`; `expireInteriorPresence` artık ev kayıtlarını da süpürüyor)
4. Web build + TWA her zamanki gibi.

## Teknik
- İstemci: `src/components/HouseScreen/` — `houseEngine.js` (three.js motoru), `houseCatalog.js` (eşyalar), `houseTextures.js` (kodla çizilen dokular), `HouseScreen.jsx` (arayüz), `HouseGate.jsx` (admin/davet kontrolü; three.js sadece girebilecek kişiye yüklenir, ~170 KB gzip ayrı paket).
- Sunucu: `functions/houses.js` + `functions/scripts/houses.test.mjs`.
- Önizleme (sadece geliştirme): `npm run preview:gangs` sonra `/house.html` (sadece motor) ve `/house-app.html` (tam ekran, sahte misafirle).
- Satışa geçerken: fiyat listesi sunucuya taşınmalı, `save` sadece sahip olunan eşyalara izin vermeli (houses.js'teki not).

## Anlaşılırlık güncellemesi (v77 son)

- **Kısa ve öz yazılar:** İşletme ekranlarındaki uzun açıklamalar kaldırıldı; her yerde sadece gereken kısa yazı var ("Dakika ücreti", "Vitrine silah ekle", "Yeterli malzeme yok" gibi). Σ yerine "Toplam", 👛 yerine "Cebindeki altın".
- **Tamir / geliştirme:** Seçili ürünün ömrü, kalan tamir hakkı, geliştirmeye açık/kapalı olduğu, gereken malzeme, envanterindeki ve dükkândaki malzeme, malzeme ücreti + işçilik + toplam tek ekranda yazıyla.
- **Ev › Ayarlar › İşletmeler:** Gerekli mobilyaların resmi, adı ve fiyatı; iki seçenekli olanlarda iki seçenek de görünür. "Eksikleri al" artık hemen satın almaz: alınacaklar fiyatlarıyla listelenir, onaydan sonra alınır. Haritadaki "… aç" ekranı da aynı.
- **Dolu yerler:** Oturulamayan koltukta / dolu cihazda / çalınan piyanoda "Dolu" yazar. Piyano bağlantı yavaşsa da çalar.
- **Spor salonu mini oyunları:** 3-2-1 başlangıç; koşu bandında sol-sağ ritim ve hız göstergesi, bench'te zamanlama ibresi, boks torbasında yanan hedefler, dambılda sol/sağ kol; seri sayacı ve "Harika!" geri bildirimleri.
- **Mevki:** Artık Futbol › Futbolcu ekranından seçilir. Günde 1 kez değişir; 200 güce ulaşınca kalıcı olur. Takımdayken değişmez.
- **Takım antrenmanı:** Spor salonu seçimi açılır/kapanır bir panelde, seçili salon üstte görünür. Ödeme basılı tutmadan tek dokunuşla yapılır.
- **Transfer:** "Oyuncu Sat" yanında "💰 Maaşlı futbolcular" butonu: oyundaki 200+ güçlü tüm futbolcular (takımlı/takımsız) listelenir, teklif gönderilir ya da ilandakiler imzalanır. Sözleşmeli futbolcular Transfer'den kaldırıldı; Takımım › Takımın'da, sadece sözleşmeli futbolcu varsa görünür.

## Mekânlarda sosyalleşme (v77 ek)

- **Mevki:** Hiç mevki seçmediysen ilk üyelikten önce spor salonu ekranında da seçebilirsin.
- **Eldeki ürünler:** Emoji yerine her yiyecek/içeceğin kendi çizimi var (su şişe, kahve karton bardak, latte uzun bardak, espresso fincan, çay ince belli bardak, ayran köpüklü bardak, viski buzlu bardak…). Aynı çizim isim etiketinde, menüde ve "Elinde" yazısında da görünür.
- **Fotoğraflar:** Sixtagram'da paylaşılan ev fotoğraflarında elindeki içecek/yiyecek de çıkıyor.
- **Duşakabin:** "🚿 Duş al" ile içine girilir, su akar ve buhar çıkar; "🚪 Duştan çık" ile çıkılır. İçeride biri varken "Dolu" yazar.
- **Spor aletleri:** Üyelik olmadan da "💪 Serbest çalış" ile kullanılabilir (mini oyun; güç kazandırmaz).

## Fabrika kurma (yeni sistem)

- Fabrika artık **her makineden 1 tane** ile kurulur: 1 Mining, 1 Tamir Malzemesi, 1 Silah Geliştirme, 1 Araba Geliştirme makinesi.
- **Bedel = 100.000 (kuruluş) + 100.000 (tamir) + 50.000 (silah) + 50.000 (araba) + 2 × kripto fiyatı** → 300.000 altın + 2 kriptonun değeri. Kripto saatlik değiştiği için bedel de saatlik değişir.
- Fabrika Kur ekranı gelenleri tek tek fiyatıyla, toplamı ve cebindeki altını gösterir. Fiyat ödeme anında değişmişse işlem yapılmaz, yeni fiyat yazılır.
- Daha önce kurulmuş fabrikalar olduğu gibi devam eder.

## Satış SMS'i, eşit dükkân listesi, fotoğraflar, yol bulma

- **Satış SMS'i:** İşletmende satış olunca "🔫 X işletmende yeni satışlar var." SMS'i gelir. İşletme başına tek mesajdır: okumadığın sürece yeni SMS gelmez; okuduktan sonraki ilk satışta tekrar gelir.
- **Oyunun dükkânları:** Listede oyuncu dükkânlarıyla aynı görünür (çerçeve, "her zaman açık" ve "Gir ›" kaldırıldı; "Sahibi: Neon Şehir" ve içerideki kişi sayısı yazar — Soygun › Ziyaret sekmesiyle aynı sayı). Sıra yine dünkü kazanca göre.
- **Fotoğraflar:** Vitrin, satılık ürünler, envanter ve atölyedeki silah/araba fotoğrafları kutuya tam sığar ve ortalanır (kırpılmaz).
- **Yürüme:** Dokunduğun yere giderken eşyalara takılıp durmak yerine etrafından dolaşan en kısa yolu bulur. Hedef bir eşyanın içindeyse ona en yakın boş noktaya gider.

## Vergi, ziyaret listesi, göz görüşü, garaj kapısı

- **Vergi (belediye için altyapı):** İşletme gelirlerinden (işçilik, malzeme, menü, internet dakikası, spor üyeliği, takım antrenmanı) cironun %10'u; 2. el ve vitrin satışlarından (silah, araba, malzeme, makine) %1. Oyunun mekânları da vergi öder. Fabrikalardan her gece günlük brüt kazancın %10'u elektrikle birlikte kesilir; altın yetmezse devlete borç (ceza) yazılır. Vergi şimdilik hiçbir yere gitmez; her ödeyen için günlük kayıt tutulur (taxLedger) — belediye gelince oraya aktarılacak.
  - İşletme raporunda Ciro / Vergi / Net kazanç; fabrika raporunda "Vergi (%10)" satırı ve sütunu.
  - Fiyat belirlerken vergi ve eline geçecek tutar yazar (2. el ilanı, anında satış, vitrin, menü, dakika, üyelik).
- **Yönlendirme yok:** Oyuncu dükkânında malzeme yetmeyince "Oyunun dükkânına git" butonu ve önerisi kaldırıldı.
- **Ziyaret sekmesi:** Üstte açılır seçici; varsayılan "Popüler". Bir hesap bir mekâna/eve günde en fazla 1 ziyaret sayılır (günde 100 kez girse de 1; sahibi dahil; gün 00:00'da döner). Popüler listesi: dünün en çok ziyaret edilen 8 mekânı + şu an içinde biri olanlar; önce anlık kişi, eşitlikte dünkü ziyaret; hep 8 mekân. Ayrıca Oyunun mekânları, her işletme türü ve Evler filtreleri.
- **İşletme listesi:** Üstte açılır tür seçici (haritada tıklanan tür seçili gelir). Sıra: önce içerideki kişi, eşitlikte dünkü ciro (oyunun dükkânı dahil).
- **Kamera:** 3D (varsayılan) → 2D → 👁️ Göz (karakterin gözünden) butonla sırayla değişir. 3D'de kamera ile karakter arasına giren duvar ve eşyalar yarı saydam olur.
- **Bölme duvarlarına aksesuar:** TV, raf, saat vb. duvar eşyaları bölme duvarlarının iki yüzüne de takılır (kapılı bölmenin kapı boşluğu hariç). Bölme taşınınca/döndürülünce üstündekiler de gelir; bölme kaldırılınca üstündekiler de kalkar ve kaydedince envantere döner.
- **Garaj Kapısı:** Yapı kategorisinde yeni duvar mobilyası (150.000 altın, renk seçilebilir). "Garaj kapısını aç / kapat" ile panjur yukarı sarılır.

## Akıcılık ve optimizasyon
- Göz modunda ekranı sağa kaydırınca bakış da sağa döner. Yukarı/aşağı kaydırma doğal yönde çalışır.
- Canlı futbol: 1 maç dakikası artık 40 sn. Top 1,6 sn'de bir pas yapıyor, hücum ~6,5 sn, şut 0,7 sn sürüyor ve top akıcı hareket ediyor. Tekrar izlemede eski hız korunuyor.
- Mekânlara anında giriş: ev, işletme, park, banka, gazino, karakol, cami, galeri, silah dükkânı ve modifiye garajı sunucu cevabını beklemeden açılıyor. Sunucu işi arka planda bitiyor.
- Oyuncu verisi tek dinleyiciden geliyor. Eskiden 40'tan fazla ayrı dinleyici vardı. Ana ekran sadece altın, şüphe ve itibar değişince yeniden çiziliyor.
- Bir ekran açıkken arkadaki harita animasyonu duruyor. Duman ve ışık efektleri daha hafif çiziliyor.
- Uygulama kısa süre arka plana alınınca bağlantı artık sıfırlanmıyor. Bağlantı yalnızca 20 sn'den uzun aradan sonra yenileniyor. Mekândan atılma ve fazladan okuma bu yüzden azalıyor.
- Firestore maliyetini artıran yeni bir okuma ya da yazma yok. Tersine, dinleyiciler ve yeniden bağlanmalar azaldığı için okuma sayısı düşüyor.
- Kafa topu (online): odaya sonradan katılan oyuncu artık kendi karakterini kendi cihazında hesaplıyor. Tuşa basınca karakter anında tepki veriyor. Skor ve sonuç her zaman odayı kuranın cihazından geliyor. Ağ gecikmesi ölçülüyor ve tahmin o kadar ileri sarılıyor, düzeltmeler de yumuşatılıyor. Yayın hızı 15'ten 20 Hz'e çıktı.
