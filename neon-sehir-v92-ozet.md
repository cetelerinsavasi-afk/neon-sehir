# Neon Şehir v92 — değişiklik özeti

## Faz 1 — Hızlı düzeltmeler
- **Silah dolabından alınan silahlar** elde dolaptaki modelin aynısı (boy/görünüm): tüfek, pompalı, tabanca. Dolap da artık 2 tüfek, 2 pompalı ve rafta 2 tabanca gösteriyor.
- **"NEON ŞEHİR" neonu:** yazı tabelaya sığacak şekilde otomatik küçülüyor.
- **8 yeni manzaralı pencere:** Gün Batımında Yol, Gündüz Şehir, Deniz, Orman, Karlı Dağlar, Kuzey Işıkları, Boğaz, Uzay.
- **Davet butonu:** davet edilen arkadaşın yanında ✓ çıkıyor.
- **iPhone'da soldan sağa kaydırma** artık "oyundan çık" ekranını açmıyor. Android'de geri tuşuyla çıkmak için iki kez basmak gerekiyor.
- **Mekânların 2D görünümü:** her yere kaydırılabiliyor, iki parmakla yakınlaştırılıp çevrilebiliyor. 🎯 butonu kamerayı oyuncuya döndürüyor.

## Faz 2 — Yeni mobilyalar
- ~60 yeni eşya, 11 yeni kategoride: Müzik Stüdyosu, Yayın Seti, Sinema, Havuz & Bahçe, Boks, Mafya, Hapishane, Benzinlik, Helikopter, Çiftlik, Kamp. Ayrıca Market Arabası, Simit Arabası ve "AÇIK" neonu.
- Bilardo, koltuklar, avize gibi zaten var olanlar tekrar eklenmedi. Casino Royale, Mahkeme ve Arcade konseptleri eklenmedi.
- **Sinema perdesi:** 1 dakikalık çizgi film oynatıyor (Kedi ile Fare). Açılıp kapatılabiliyor ve herkes aynı sahneyi görüyor.
- **Market:**
  - Raf 5 ürün taşıyor: çikolata, cips, bisküvi, makarna, kola.
  - Market arabası alınıp itilebiliyor. Araba eldeyken raftan alınanlar arabaya giriyor (en fazla 12 ürün).
  - Araba bırakılınca ya da mekândan çıkılınca içindekilerle birlikte kayboluyor.
- **Yeni zeminler:** otopark, asfalt, yol, çim, kum ve diğerleri. **Yeni duvarlar:** 14 manzara/tema duvarı.
- **Patron Masası:** 8 renk seçeneği var.

## Faz 3 — Tasarla modu
- **👁️ Göz butonu:** sahip, satın alınmamış (deneme) eşyaları gerçek haliyle görüyor. Bu görünümü sadece o kişi görüyor.
- **➕ Yetki ver:** arkadaşlar listesinde "Yetki ver" ve "Yetkiyi kaldır" var.
  - Yetkili kişi, sahibin envanterinden ve mağazadan (deneme olarak) eşya koyup kaldırabiliyor.
  - Satın alma sadece sahipte.
  - Değişiklikler canlı olarak herkese yansıyor.

## Faz 4 — Garson (Cafe / Bar)
- Sol üstteki "Garson ol" butonuna basınca buton "Garson: isim" olarak değişiyor. Bir mekânda tek garson olabiliyor; garson mekândan çıkarsa görevi düşüyor.
- Garson varken menüden verilen siparişler garsona gidiyor. Garsonun "Menü" butonu "Siparişler (n)" oluyor ve her sipariş için 20 saniyelik sayaç işliyor.
- **Zamanında teslim:** 100 altınlık siparişten 10 vergi, 10 garson maaşı, 80 sahibe gidiyor.
- **Geç teslim:** ürün müşteriye kendiliğinden gidiyor, maaş ödenmiyor ve garson görevden alınıyor (hemen yeniden başvurabilir).
- Dükkân sahibi de garson olabiliyor. Aynı kurallar geçerli, tek fark maaş almaması.
- Cafe/Bar günlük raporunda artık **Maaş** gideri ayrı satır olarak görünüyor.

## Faz 5 — Profil › 📊 Günlük Rapor
- Bugün (canlı) ve önceki 2 gün için cebe giren ve çıkan altın kaynak kaynak listeleniyor: işletme, maaş, soygun, mağaza vb.
- Sunucuda tüm altın değişimleri tek noktadan sayılıyor (`goldLedger` tetikleyicisi). Kaynağı bilinmeyen değişimler "Diğer" altında görünüyor.

## Faz 6 — Maç sohbeti ve yayın
- **Stadyum › Maçlar › Maç Sohbeti:** her gün 00:00'da açılıyor ve ertesi 00:00'a kadar sürüyor. Dokununca büyüyor, tekrar dokununca küçülüyor.
- **Bağışçı listesi:** ilk 3 kişi gösteriliyor. Günlük 10.000 tavanına ulaşan her bağışçı listeye bir satır ekliyor (en fazla 10).
- **Bağış bildirimi:** dokununca kapanıyor (yayıncıda da izleyicide de).
- **Yayıncı kendi mesajlarını** sohbette "🎥 Sen" olarak görüyor.
- **⚽ Maç butonu:** 18:00–19:00 arası (şampiyonluk kutlaması günü hariç) sol altta çıkıyor.
  - Basınca yayın köşeye küçülüyor ve Maçlar açılıyor.
  - Yazılanlar yayın sohbetine gidiyor (avatarın üstünde balon çıkmıyor).
  - Maç sohbeti salt okunur.

## Faz 7 — 📋 Hatırlatıcı
- Araba galerisinde araba yoksa: "1 araba galerinin envanterine ekle".
- Silahçıda silah, tamir malzemesi ya da silah geliştirme malzemesi yoksa, her eksik için ayrı hatırlatma çıkıyor.
- Günlük spor salonu antrenmanı (19:00–19:00) yapılmadıysa hatırlatma çıkıyor. Futbol takımındaki oyuncuya çıkmıyor.

## Faz 8 — Mekânlar 3D
- **3D'ye taşınan mekânlar:** Camii, Banka, Gazino, Karakol, Araba Galerisi, Silah Mağazası, Modifiye Garajı ve Park. Spor salonu gibi 3D gezilebiliyorlar.
- **İşlevler aynı kaldı:** ibadet, imam, dilenciler, banka, numara alma, slot, piyango, 10 Numara, bar, rüşvet, komiser, araba alma, silah alma/atölye, usta, büfe, şüpheli adam ve soygun butonları.
- **NPC'ler:** veznedarlar, barmen, biletçi, memur, komiser, galerici, silahçı, usta, şüpheli adam ve büfeci. Hepsi konuşuyor; NPC'ye dokununca oyuncu yanına yürüyor ve ilgili panel açılıyor. İmam ve dilenciler camide gerçek oyuncular olarak görünüyor.
- **Park açık hava:** tavan yok, gökyüzü görünüyor.
- Gazino ve parkta alınan ya da ısmarlanan içecek 3D'de de elde görünüyor.
- Fotoğraf çekme (Sixtagram), sohbet, hareketler, 2D/3D görünüm ev ekranındaki gibi çalışıyor. Fotoğraflarda NPC'ler de çıkıyor.
- **Eski konum kayıtları korunuyor:** ziyaret sayaçları, "kaç kişi var", ısmarlama ve mekân kontrolleri eskisi gibi çalışıyor.
- **Yedek davranış:**
  - Giriş yapmamış oyuncu eski 2D mekânı görüyor.
  - Sunucuya ulaşılamazsa da 2D mekân açılıyor.
- **32 yeni mekân mobilyası.**
  - Satılanlar: Seccade, Cami Avizesi, Rahle, Ayakkabılık, Çini Pano, Yer Minderi, Bağış Kutusu, Vezne Gişesi, Sıramatik, Sıra Ekranı, Kasa Dairesi Kapısı, Sıra Bariyeri, Bekleme Koltuğu, Slot Makinesi, Rulet Masası, Kart Masası, Piyango Gişesi, Polis Bankosu, Türk Bayrağı, Arananlar Panosu, Döner Sergi Platformu, Showroom Tabelası, Atış Hedefi, Araba Lifti, Fıskiyeli Havuz, Kaydırak, Salıncak, Büfe Kulübesi, Park Çöp Kutusu, Güvercinler.
  - Mihrap ve Minber satılmıyor; sadece Camii'de var.
  - Fiyatlar benzer eşyalara göre ayarlandı.
- Oyunun mekânlarında eşyadan ücretsiz ürün alınamıyor (bar ve büfe ücretli).

## Rehber
- Garson, Tasarım Yetkisi, Yayında Maç ve 3D Mekânlar için yeni sayfalar eklendi.

## Yükleme sırası (önemli)
1. **Önce kurallar:**
   ```
   firebase deploy --only firestore:rules
   ```
   Yeni alanlar (market arabası, garson, rapor, maç sohbeti) kurallardan önce web'e çıkarsa bazı yazmalar reddedilir.
2. **Sonra fonksiyonlar.** Neredeyse hepsi değişti; yeni tetikleyici `goldLedger` da var.
   ```
   firebase deploy --only functions
   ```
   Kota hatası çıkarsa `deploy-parcali.ps1` kullanın; listeye `goldLedger`, `houseAction`, `shopAction`, `streamAction`, `businessRollover`, `expireInteriorPresence`, `buyFromBufe`, `buyFromGazinoBar`, `giftHeldItem` eklenmeli.
3. **En son web/uygulama:**
   ```
   npm run build
   ```
   ve ardından hosting / Android.
- 3D mekân evleri (`houses/game_*`) ilk girişte kendiliğinden kuruluyor. Ek bir işlem gerekmiyor.
- **Maliyet notu:** `goldLedger`, `users` belgesi her güncellendiğinde çalışır. Altın değişmediyse hiçbir şey yazmadan hemen çıkar.

## Kontroller
- `npm --prefix functions test`: 332/332 geçti.
- `npm run build`: başarılı.
- Lint: hata yok.
- Tüm fazlar önizlemede ekran görüntüsüyle denendi.

## v92.1 — düzeltmeler
- **Oyunun Silah Mağazası, Modifiye Garajı ve Araba Galerisi:** oyuncu dükkânlarındaki gibi üstte (sağda) hızlı butonlar var.
  - Silah Mağazası: "🔫 Satılık silahlar" ve "🛠️ Tamir / Geliştirme".
  - Modifiye Garajı: "🛠️ Tamir / Geliştirme".
  - Araba Galerisi: "🚗 Satılık arabalar".
- **Karakol:** sol üstte, camiideki gibi 3 buton var: 👮 Polislik Başvurusu, 📘 Polis Kitapçığı, 🤝 Rüşvet Ver.
  - Komiser masasında açılan panel boş geliyordu; artık polislik başvurusu açılıyor.
- **Karakol komiser odası:** duvarlardaki boşluklar kapatıldı.
- **Araba galerisi:** iç içe giren iki araba ayrıldı. Arabalar farklı renklerde.
- **Parça zemin ve duvar paneli:** v92'de eklenen zeminler ve duvarlar artık tüm odaya döşenmiyor; parça parça satılıyor.
  - Zeminler (çim, kum, tarla, asfalt, otopark, yol, kaldırım, çakıl, kar, havuz karosu, spor zemini, metal ızgara, dans pisti, su) **1 m²'lik parça** olarak satılıyor.
  - Duvarlar (gökyüzü, gün batımı, gece, deniz, neon şehir, yol, tarla, orman, dağlar, çöl, uzay, grafiti, beton blok, koğuş, sabıka, akustik, yeşil perde) **1 m genişliğinde tam boy panel** olarak satılıyor.
  - Yeni kategoriler: **🧩 Zemin Parçaları** ve **🖼️ Duvar Panelleri**. Eski "🎨 Duvar & Zemin" sekmesinde artık sadece eski tam yüzeyler var.
  - Parçalar 1 m'lik ızgaraya kendiliğinden oturuyor. Yan yana konan parçalar tek parça gibi kesintisiz görünüyor (örnek: evin içi parke, önü çim/kum, bahçe tarafındaki duvar orman manzarası).
  - Seçili parçanın ◀ ▲ ▼ ▶ okları yanına yeni bir parça ekliyor (duvar panelinde ◀ ▶).
  - Fiyatlar: zemin parçası 1.500 (otopark, yol, havuz karosu 2.000; su 2.500; dans pisti 3.000). Duvar paneli 3.000, manzaralı panel 4.000.
  - Eşya sınırı 300'den 400'e çıktı.
- **Sade kategoriler:**
  - Kamp → Çiftlik & Kamp
  - Karakol → Karakol & Hapis
  - Yayın Seti → Stüdyo & Yayın
  - Sinema + Gazino → Sinema & Gazino
  - Boks → Spor & Oyun
  - Havuz → Dış Mekan & Havuz
  - Benzinlik → Garaj & Benzinlik
  - Helikopter → Lüks
  - Galeri → Arabalar
- **Maç sohbetinde "Geçersiz işlem" hatası:** sunucudaki `streamAction` fonksiyonu eski kalmış (yeni sürüm yüklenmemiş). Kod doğru; `streamAction` yüklenince düzelir. Sunucu eskiyse oyuncu artık anlaşılır bir mesaj görüyor.

Testler: 333/333 geçti. Derleme başarılı.

## v92.2
- **Yayında maç izleme yayına yansıyor:** yayıncı ⚽ Maç ekranında hangi lig/sekme/maçı açarsa izleyiciler de aynısını görüyor. Yayıncı "Maç özetini izle"ye basınca özet izleyicilerde de aynı anda başlıyor. Yayıncının kamerası köşede küçük pencerede kalıyor.
- **Maç özeti:** top normal oyunda hızlı akıyor, atak/şut/gol yaklaşınca yavaşlıyor (gollerde en yavaş), sonra yeniden hızlanıyor. Özet ~15 sn yerine maçtaki pozisyon sayısına göre ~20–30 sn sürüyor.
- **Liman:** sipariş verilince butonda "✓ Sipariş verildi (adet)" yazıyor (3,5 sn).
- **Sixtagram › Görsel Ekle › 🎵 Şarkı Yap** (Resim Çiz'in hemen üstünde): Beat Atölyesi.
  - Örnekteki her şey var: 4 bölüm (A–D), 16 kutuluk sıra, bölüm kopyala/temizle, sırayı boşalt, geri al bildirimi, 1–8 / 9–16 adım sekmeleri ve nokta göstergesi, çalarken sayfa takibi, davul (7 satır, setler, ses, sessiz), 3 kanal (her biri ayrı enstrüman, ses, sessiz), ölçekler, dokun/sürükle boyama, dokununca ses, geri al / ileri al, Bölüm/Şarkı modu, Swing, tempo 60–180.
  - Ekler: Darbuka ve Arcade davul setleri; Bağlama, Yaylı, Çan, Pad enstrümanları; Hicaz ve Nihavend ölçekleri; ton seçimi (◀ Do ▶); hazır ritimler (Pop, Hip-hop, Trap, Halay, Dans); şarkı adı.
  - Şarkı akışta oynatıcı kartıyla görünüyor: ▶ çal / ⏹ durdur, çalan adımı gösteren şerit, süre. Ses dosyası yüklenmiyor; şarkının notaları saklanıp her telefonda aynı şekilde çalınıyor (aynı anda tek şarkı çalar).
- Sunucu: `createSixtagramPost` "Şarkı Yap" ekini doğruluyor (`functions/songData.js`).

**Yükleme:** `deploy-kalanlar.ps1` (içine `createSixtagramPost` eklendi). "Maç sohbeti şu an kullanılamıyor" uyarısı `streamAction` yüklenince kalkar. Sonra push.
Testler: 337/337 geçti.

## v92.3
- **Şarkı Yap ekranı dokununca kapanıyordu — düzeldi.** Ekran, gönderi penceresinin "dışına tıklayınca kapan" katmanının içinde açıldığı için her dokunuş pencereyi kapatıyordu. Artık Resim Çiz gibi ayrı katmanda açılıyor ve dokunuşlar pencereye ulaşmıyor.
- **Günlük Rapor › yatırımlar:** elmas / hisse / kripto almak-satmak ve bankaya yatırıp çekmek artık giren / çıkan sayılmıyor. Raporda sadece şunlar var:
  - 💹 Yatırım kâr / zarar: satışta, satılan kısmın alış maliyetine göre (ortalama maliyet) gerçekleşen kâr veya zarar
  - 🧾 Yatırım satış komisyonu (%1)
  - 🏦 Banka faizi: çekilen paranın yatırılan anaparanın üstündeki kısmı
  - Gerçek alış maliyeti yeni `investCost` / `bankPrincipal` alanlarında tutuluyor. Rozetteki kâr/zarar sayacı eskisi gibi çalışıyor. Eski hesaplarda ilk işlemde son işlem değeri esas alınıyor.

**Yükleme:** `firebase deploy --only functions:buyInvestment,functions:sellInvestment,functions:depositToBank,functions:withdrawFromBank,functions:goldLedger`, sonra push.
Testler: 339/339 geçti.

## v93
**Düzeltmeler**
- Yarış pisti antrenmanında rakip botların arabaları 3. seviye (aynı arabayı 3. seviyede iyi süren ya da bir üst arabayı süren oyuncu yenebilir).
- Spor salonu: günlük antrenman bitince hatırlatma artık hemen kalkıyor (bugünün kaydı yokken dinleyici kapanıyordu). Aynı sorun mekân harcama sayacında da düzeltildi.
- 3D mekânda bir oyuncuya dokununca profil açılmıyor, dokunulan yere yürünüyor. Profil 👥 kişiler listesinden açılır.
- 2. El Pazarı: kategoriye girince / geri dönünce sayfa en üstten açılıyor.
- Park ve camide sol üstte 🕵️ şüphe yüzdesi görünüyor (yeşil / sarı / kırmızı).
- PC: mobilya rafı, kategori sekmeleri, duvar/zemin ve renk şeritleri fare tekerleğiyle ve sürükleyerek kayıyor. Sürükleme yanlışlıkla eşya eklemiyor.
- Bir işletmeye (silahçı vb.) tıklayınca üstteki işletme türü seçici kaldırıldı.
- Evler ekranında kendi dükkânların görünmüyor. İki sekme var: 🏠 Evler (varsayılan) · 🏢 Home Ofisler (en kalabalık üstte, sonra dünün en çok ziyaret edilenleri).
- İnternet kafe: normal dakika en fazla 200; yayın seti dakikası 100–400. Eski yüksek fiyatlar otomatik olarak sınıra iniyor.
- Stüdyo & Yayın kategorisinden "Yayıncı Masası" kaldırıldı (elinde olanlar çalışmaya devam ediyor).
- Çeteler › Sohbet: yeni mesaj olan kanaldaki kırmızı nokta büyüyüp küçülüyor.

**On Numara**
- Kurpiyerin ilk 2 kartı da herkese açık.
- Toplu masada sıra yok: herkese aynı anda tek bir 10 sn veriliyor (kart çekmek süreyi uzatmıyor). Süresi dolan otomatik pas geçiyor. Diğer oyuncuların sonradan çektiği kartlar ve sonuçları el bitene kadar gizli ("Düşünüyor…" / "✓ Hazır"). Herkes bitirince kurpiyer oynuyor ve tüm kartlar açılıyor.

**Home Ofisler** (Ev › ⚙️ Ayarlar › İşletmeler'in altında 🏢 Home Ofisler; bir ev aynı anda tek işletme/home ofis olabilir; tüm gelirlerden %10 vergi)
- 🕌 Mescit (4 seccade, cami avizesi, bağış kutusu, ayakkabılık): bağış kutusuna yaklaşınca 🤲 Bağış yap. Bir oyuncu bir mescide günde en fazla 10.000 bağışlıyor; sahip kendi mescidine bağış yapamıyor.
- 🎬 Sinema (sinema perdesi, 2 sinema koltuğu, patlamış mısır makinesi, içecek dolabı): giriş ücretsiz. İçecek ve patlamış mısır büfeden ücretli (sahip 100–1.000 arası belirliyor, varsayılan 200); kişi başı günde 10.000 sınırı. Üstte 🍿 Büfe butonu var.
- 🎚️ Müzik Stüdyosu (2 stüdyo hoparlörü, vokal kabini, mikser konsolu, synth klavye): mikser konsoluna yaklaşınca 🎛️ Müzik yap. Dakika ücreti internet kafe gibi (100–400, varsayılan 200). Konsolda aynı anda tek kişi çalışıyor; herkes onun başında "🎵 Müzik yapıyor" görüyor.

**Müzik**
- Sixtagram'daki "Şarkı Yap" kaldırıldı; şarkı aracı artık sadece stüdyolarda.
- Projeler: yeni proje ya da kayıtlı projeye devam (herhangi bir stüdyoda). Her değişiklik birkaç saniye içinde otomatik kaydediliyor; stüdyodan çıkınca, altın bitince ya da uygulama kapanınca da kaydediliyor. 7 gün hiç değiştirilmeyen proje siliniyor; oyuncu başı en fazla 5 proje. Projeler listesinde her projenin yanında ⬇️ MP3 ve 🗑️ Sil butonu var; silmeden önce onay isteniyor.
- Stüdyodan 📤 Sixtagram'da paylaş. Gönderide 🎧 dinlenme sayısı var: en az 3 sn dinlenince sayılıyor, bir hesap en fazla 5 dinlenme kazandırıyor.
- 💛 Destek ol: 10 / 100 / 1.000. Bir oyuncu bir sanatçıya günde en fazla 1.000 verebiliyor; %10 vergi kesiliyor, sanatçıya SMS gidiyor.
- MP3 indirme (sadece sanatçı): projeden ya da kendi Sixtagram gönderisinden. Dosya adı "PROJEADI - cetelerinsavasi.com.mp3".
- Günlük raporda yeni kaynaklar: Mescit bağışı, Sinema büfesi, Müzik stüdyosu, Şarkı desteği.

**Yükleme:** önce kurallar ve değişen fonksiyonlar (`firebase deploy --only firestore:rules,functions:shopAction,functions:houseAction,functions:createSixtagramPost,functions:businessRollover,functions:raceHubAction,functions:streamAction,functions:dealOnNumaraCards,functions:onNumaraHit,functions:onNumaraStand,functions:onNumaraAutoStand`), sonra push.
Testler: 348/348 geçti.

## v93.2
- Evler › Home Ofisler: uzun açıklama kaldırıldı; sağ üstte "Home Ofis Aç +". Mescit / Sinema / Müzik Stüdyosu alt alta; dokununca gerekli mobilyalar ve fiyatları görünür, 🛒 Eksikleri al ile hemen alınır, 🏠 Ev seç / Ev al ile eve girilir.
- v93'te eklenen uzun açıklamalar kısaltıldı (mescit, stüdyo paylaş/sil, On Numara, home ofis tanıtımları).

## v94
- **Yatırım trendi:** alış oranı %50'yi geçince (%50,1 bile) gizli düşüş trendi zaten başlıyordu; kod içindeki eski "%75" yorumu düzeltildi. (Hesapta en büyük alıcı ve en büyük satıcı sayılmaz.)
- **İstihbarat kasası:** üye sayısına göre sınır artık sadece ceza gelirine uygulanıyor. Çete çökertme, tır operasyonu, savaş vb. kasayı sınırın üstüne çıkarabilir; kasa sınırın üstündeyken cezalardan para gelmez, altındayken sınıra kadar gelir.
- **Ceza payı:** şüpheyle yakalanma cezalarının %50'si yerine %25'i İstihbarata gidiyor.
- **Tır operasyonu:** başarılı operasyonda yük artık imha edilmiyor; malzemeler çetenin deposuna giriyor, çete kasasından tırdaki malın sipariş tutarı İstihbarata ödeniyor (ör. 100 yasaklı madde → 125.000). Kasa yetmezse eksiye düşüyor.
- **İstihbarat üye raporu:** İstihbarat › Ajanlar'da rütbeliler (Başkan, 2 Şef, 4 Uzman) bir üyeye dokununca son 14 günlük raporu görüyor (bugün dahil değil, 00:00'da yenilenir): istihbarata kaç gün önce girdiği, katıldığı savaş sayısı, kullandığı toplam güç, ihbar ettiği tır / bahisli savaş, içeriğini açtığı tır / bahisli savaş, istihbarattan aldığı para. Kayıtlar v94 yüklendikten sonra birikmeye başlar.
- **Bantlı Market Kasası** mobilyası (Dükkân kategorisi, 30.000 altın; yürüyen bant animasyonlu).
- **Fabrika:** tamir malzemesi makinesi 50.000 altın; mevcut fabrikalardaki tamir makinesi sayısı 2'ye katlandı (tek seferlik, SMS ile bildirilir). Tamir / silah / araba makinesinin günlük elektriği 200. Üretim: tamir işçiyle 1–2000, işçisiz 1–400 · silah 1–200 / 1–40 · araba 1–40 / 1–8. Metinler "2/10 verim" oldu.
- Home Ofis Aç penceresinde üç tür de kapalı geliyor.
- Camide İmam ve İmam Kitapçığı butonları sağ üstte.

**Yükleme:** `powershell -ExecutionPolicy Bypass -File .\deploy-v94.ps1` (kurallar + v93 ve v94'te değişen tüm fonksiyonlar, 6 grup), sonra push.
