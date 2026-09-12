# Neon Şehir — Oyun Özeti ve "Çete Sistemi" Güncelleme Önerisi

Bu doküman iki bölümden oluşuyor: (1) Neon Şehir adlı oyunun mevcut hâlinin kısa bir özeti, (2) üzerinde çalışılması planlanan büyük "çete" güncellemesinin tam tarifi ve henüz netleşmemiş açık sorular. Amaç, bu fikri farklı yapay zekâ modellerine göstererek dengeleme ve tasarım geri bildirimi almak.

## 1. Oyunun Mevcut Hâli

Neon Şehir, Türkçe dilinde, tarayıcı üzerinden oynanan çok oyunculu bir yaşam simülasyonu / suç oyunu. Frontend React/Vite, backend Firebase Cloud Functions üzerinde çalışıyor; tüm oyun durumu sunucu tarafında (Firestore transaction'larla) değiştiriliyor, istemci sadece gerçek zamanlı okuma yapıyor (client-authoritative hile riski yok).

Oyuncunun üç temel istatistiği var: Altın (para birimi), Şüphe (%0-100, suç işledikçe artar, yakalanma riskini belirler) ve Saygınlık (%0-100, yakın zamanda yalnızca suçtan yakalanınca düşer; seyyar satıcıdan alışveriş veya şüphe sıfırken ibadet gibi eylemlerle yükselir; ekip soygunlarında araya polis sızdığında esnafların oyuncuyu uyarma ihtimalini etkiler).

Ana oynanış döngüleri şunlar: Soygunlar (tek başına veya ekip halinde, mekâna göre değişen ödül/güç şartı/şüphe maliyeti ile — banka, kumarhane, araba galerisi, modifiye garajı, fabrika, seyyar satıcılar); Araç ve Silah sistemi (katalogdan satın alma, seviye atlatma, tamir etme — fiyatlar katalogdan canlı okunuyor, yani fiyat güncellemesi zaten sahip olunan eşyaları da etkiliyor); 2. El Pazarı (oyuncular arası araç/silah/malzeme/makine alım-satımı, "avantajlı ürün" vitrin paneli, ücretli reklam ile öne çıkarma); Fabrika sistemi (oyuncular fabrika kurup makine alabiliyor — madencilik, tamir malzemesi, silah geliştirme malzemesi, araba geliştirme malzemesi, yasaklı madde — işçi çalıştırabiliyor, günlük kâr/zarar raporu tutuluyor, fabrika hissesi başka oyunculara satılabiliyor); Banka/Yatırım (kripto, hisse, elmas gibi yatırım araçları, komisyonlu alım-satım, onay gerektiren satış akışı); ve bir Yarış/Şampiyona modülü. Oyunun güç (power) istatistiği silah ve araç ekipmanından geliyor ve soygun/eşleşme gereksinimlerinde kullanılıyor.

## 2. Önerilen Güncelleme: Çete Sistemi ve Ticaret Yolu Savaşları

### 2.1 Amaç ve Genel Çerçeve

Oyuncular çete kurabilecek, çeteler 6 farklı "ticaret malzemesi" üzerinde tekel benzeri bir "ticaret hakkı" için birbirleriyle savaşacak. Ticaret hakkını elinde tutan çete, o malı yurtdışından gemiyle ithal edip iç pazarda (2. el sitesi) satabilecek. Bu sistem çeteler arası rekabet, ekonomi ve grup aktivitesi katmanı ekliyor.

### 2.2 Altı Ticaret Malzemesi

Silah, araba, yasaklı madde, silah malzemesi, araba malzemesi, tamir malzemesi — oyunda zaten var olan altı ekonomik kategori.

### 2.3 Ticaret Yolu Rotasyonu

Her pazar günü saat 00:00'da, sıradaki bir ticaret malzemesi için 24 saat sürecek bir "çete savaşı" başlıyor (malzemeler sabit bir sırayla dönüyor, 6 haftada bir tam tur tamamlanıyor). Savaşı kazanan çete, o malzemenin ticaret hakkını 6 hafta boyunca elinde tutuyor. 6 hafta dolunca aynı malzeme için yeniden savaş açılıyor. Pratikte bu, her hafta tam olarak bir malzeme için aktif bir savaş olduğu anlamına geliyor (bir malzemenin 6 haftalık süresi dolarken sıradaki malzeme zaten kendi savaşını yaşıyor).

### 2.4 Tekelleşme Sınırı (tartışma sonucu ortaya çıkan fikir)

Başlangıç fikri "en güçlü çete isterse tüm yolları tekeline alabilsin" yönündeydi. Tartışma sırasında şu alternatif ortaya çıktı: bir çete aynı anda en fazla 3 ticaret yoluna sahip olabilir. Zaten 3 yolu olan bir çete 4. bir savaşı kazanırsa, elindeki 4 yoldan birini açık artırmayla diğer çetelere satmak zorunda kalır (hangisini satacağına kendisi karar verir, satış geliri çete kasasına girer). Bu fikrin henüz netleşmemiş noktaları var: çete süresi içinde satış yapmazsa ne olacağı (öneri: belirli bir süre içinde satılmazsa yol otomatik olarak açık pazara / bir sonraki savaş rotasyonuna düşsün), ve satışta taban fiyat olup olmayacağı (öneri: yolun ortalama haftalık cirosuna bağlı bir rezerv fiyat, ittifak çeteye sembolik bedelle devredip fiilen tekeli sürdürme kaçağını önlemek için).

### 2.5 Çete Savaşı Mekaniği

İki tür savaş var: (1) Ticaret yolu savaşları — o hafta hangi malzeme için savaş açıldıysa, TÜM çeteler bu tek savaşa birden katılabiliyor, en yüksek toplam hasarı yapan çete kazanıyor. (2) Bahisli düellolar — iki çete arasında (örneğin 1 milyon altın bahisle) birebir meydan okuma, aynı hasar mekaniğiyle işliyor.

Zar atma pencereleri günde dört kez: 00:00, 06:00, 12:00, 18:00. Bir oyuncu her pencerede en fazla bir kez zar atabiliyor (günde toplam en fazla 4 katılım), her katılımda 2 zar atılıyor. Hasar formülü: (zar1 + zar2) × oyuncunun gücü. Örnek: güç 40.000, zarlar 4 ve 6 (toplam 10) → bu katılımdan 400.000 hasar. Tüm çete üyelerinin tüm katılımlarından gelen hasarlar toplanıyor; en yüksek toplam hasarı yapan taraf kazanıyor. Tasarım felsefesi: hem aktif olan (çok katılan), hem güçlü olan (yüksek ekipman yatırımı yapan), hem de şanslı olan (zar) oyuncular/çeteler savaşı kazanabilsin — üçü birden belirleyici olsun.

Bu formülün açık bıraktığı bir soru: hasarların toplanması üye sayısını da doğrudan güç kadar önemli kılıyor (çok sayıda düşük güçlü üye, az sayıda çok güçlü üyeye sayı avantajıyla üstün gelebilir). Bunun kasıtlı bir tasarım tercihi mi (kalabalık çete kültürünü teşvik) yoksa dengelenmesi gereken bir risk mi olduğu netleşmedi.

### 2.6 Gemi Sistemi ve İthalat

Ticaret hakkına sahip çeteler gemi satın alabiliyor. Geminin kapasitesine göre yurtdışından mal getirebiliyor; sipariş oluşturulduğunda gemi saat 00:00'da yola çıkıyor, bir sonraki 00:00'da mal geliyor (24 saatlik transit). Gelen ürünler çete haznesine düşüyor; çete lideri bunları üyelere dağıtabilir, kendine ayırabilir, ya da kendine almadan doğrudan 2. el pazarında satışa sunabilir (bu durumda satış geliri çete kasasına gidiyor). Tüm ürünler, normal (sıfır/katalog) fiyatının yarısına satın alınabiliyor. Tek seferlik gemi kapasitesi için verilen sabit rakamlar: silah için 1.000.000 değerinde, araba için 1.000.000 değerinde, yasaklı madde için 400 adet, silah malzemesi için 10.000 adet, araba malzemesi için 2.000 adet, tamir malzemesi için 100.000 adet.

Netleşmemiş nokta: gemiyle ithalat sadece o an elde tutulan ticaret hakkına mı bağlı (yani çete sadece kazandığı malzemeyi ithal edebilir), yoksa herhangi bir çete herhangi bir malı mı ithal edebilir (savaş sadece 2. elde satış ayrıcalığı mı veriyor)? Ayrıca "kapasitesine göre" ifadesi, tek bir sabit gemi yerine kademeli/yükseltilebilir gemi (küçük/orta/büyük) fikrine işaret ediyor olabilir, bu da netleşmedi.

### 2.7 Çete Kasası ve Bağış

Üyeler çeteye para bağışlayabiliyor. Çete lideri kasadaki parayı kişisel hesabına çekebiliyor. Bu, kötüye kullanıma (lider çeteyi soyup kaçabilir) açık bir mekanik — bunun kasıtlı bir risk/drama unsuru mu olacağı yoksa şeffaflık/kısıtlama (örn. tüm çekimlerin üyelere görünür loglanması, ya da üst rütbe onayı gerektirmesi) mı getirileceği netleşmedi.

### 2.8 Rütbe Ağacı

Lider en üstte. Rütbe atlatan kriterler: 100.000 altın bağış → +1 rütbe; liderin "saygı"sı/onayı → +1 rütbe; 40.000 güç → +1 rütbe; çetede 10 kez savaşa katılım → +1 rütbe. Bu dört kriterin birbirinden bağımsız tek seferlik bonuslar mı, yoksa her biri belirli bir puan katkısı yapıp kümülatif bir eşiğe ulaşınca rütbe atlatan bir puan sistemi mi olduğu netleşmedi.

### 2.9 Zekat Sistemi

Çeteler zekat (yardım) dağıtabiliyor. Elinde ve bankasında toplam 50.000 altının altında olan oyuncular zekat alabiliyor. Çeteler zekat başlatırken kısa bir not/reklam metni ekleyebiliyor (kendi çetelerinin tanıtımını yapmak için). Örnek senaryolar: bir çete 10 kişiye 10.000 altın, başka bir çete 20 kişiye 5.000, başka biri 30 kişiye 3.000 dağıtmak isteyebilir. En yüksek toplam parayı veren çete öne çıkarılıp sergileniyor; o çetenin zekatı 10 kişiye ulaştığında sıra bir sonraki en yüksek teklifi veren çeteye geçiyor. Böylece sistem sürekli olarak en cömert/en zengin çeteleri öne çıkarmış oluyor — bir tür prestij/reklam mekanizması.

Netleşmemiş nokta: "50.000 altının altında" kriteri sadece elde nakit + banka bakiyesini mi kapsıyor, yoksa araç/silah/fabrika hissesi gibi diğer varlıkları da içeren toplam net serveti mi? Sadece nakit+banka seçilirse, zengin oyuncular parasını diğer varlıklara yatırıp geçici olarak "fakir" görünüp zekat alabilir riski var.

### 2.10 Çete Kurma Şartları

Çete kurmak için 40.000 güç, 1.000.000 altın ve 100 saygınlık gerekiyor. Not: oyunun mevcut sisteminde saygınlık 0-100 arasında sınırlı, yani 100 saygınlık şartı pratikte mutlak maksimum saygınlığı (hiç yakalanmamış / çok disiplinli oynanmış bir hesabı) gerektiriyor — bunun kasıtlı olarak çok yüksek bir elit bar mı olduğu, yoksa gerçekçi olması için düşürülmesi mi gerektiği ayrı bir tartışma konusu.

### 2.11 Çete Prestiji

Prestij şu üç faktöre göre belirleniyor: çete kasasındaki para miktarı, sahip olunan ticaret yolu (kanal) sayısı, ve 50+ saygınlığa sahip üye sayısı. Bu üç faktörün nasıl ağırlıklandırılıp tek bir sayıya dönüştürüleceği (basit toplam mı, ağırlıklı formül mü) henüz belirlenmedi.

## 3. Özetle Açık Sorular

Yukarıdaki bölümlerde geçen, henüz karara bağlanmamış tasarım soruları toplu olarak: tekelleşme sınırının tam uygulama detayları (satılmazsa ne olur, taban fiyat var mı); gemiyle ithalatın ticaret hakkına bağlı olup olmadığı ve gemilerin kademeli/yükseltilebilir olup olmayacağı; çete kasasından kişisel çekimin şeffaflık/kısıtlama seviyesi; zekat uygunluğunun sadece nakit+banka mı yoksa toplam net servet mi olacağı; savaş hasarının toplanması nedeniyle üye sayısının güçle eşit derecede belirleyici olmasının kasıtlı mı olduğu; rütbe ağacının bağımsız bonuslar mı yoksa kümülatif puan sistemi mi olacağı; ve prestij formülünün üç faktörü nasıl ağırlıklandıracağı.
