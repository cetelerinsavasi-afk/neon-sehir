# Kurallar ve Kararlar (v39)

v31'de kaynak olarak **oyun tasarımcısının kendi metni** esas alındı; önceki sürümdeki varsayımların çoğu bu metne göre düzeltildi. Sayısal değerlerin hepsi `functions/gang/config.js` içinde tek satırdan değiştirilebilir (istemci gösterimi: `src/components/Gangs/gangConstants.js`).

## Sayılar
| Konu | Değer |
|---|---|
| Çete kurma | 1.000.000 altın (cepten düşer) · 100 saygınlık · 40.000 güç · kurucu 10.000.000 prestij |
| Prestij | 1 savaş gücü = 1 · 1 altın bağış = 5 · Baba saygısı = 1.000.000 (üyelik başına bir kez) |
| Serbest para | 00:00 kasasının %20'si — dağıtım + Baba'nın kendine aktarımı (−5 prestij/altın) + başka çeteye gönderim bu tek hakkı paylaşır |
| Dağıtım | kişi başı tutar × kişi sayısı; rütbeliler sabit 7, diğer gruplar en az 7; 24 saat, alınmayan kasaya döner |
| Ticaret yolu | yasaklı madde → silah → araba (her Pazar); 21 gün; günlük sipariş limiti = kullanılan gücün %1'i (v39; eskiden %5); yarı fiyat |
| Sipariş | sadece Pzt–Cum; Baba/Sağ Kol; yoldaki tıra da verilir; tıra günde 1 |
| Tır | 100.000 · 10 araba / 10 silah / 100 yasaklı madde · 21 gün ömür · son gün sipariş yok · satılamaz |
| Depo | 100.000 = +100 kapasite (genişletilebilir, ömürsüz) · yer: araba 10, silah 10, yasaklı 1 |
| Sabotaj ücreti | oyun genelinde 10.000 + 10.000 × (bugünkü sabotaj+operasyon sayısı), 00:00 sıfırlanır |
| Haraç | alt/üst sınır yok, 18:00'e kadar |
| Rüşvet | İstihbarat operasyonu başlatırken belirler (0 = yok); tır sahibi 18:00'e kadar öder |
| Bahis | Baba/Sağ Kol · aynı anda 1 açık teklif (geri çekilir ya da reddedilirse aynı gün yeni teklif gönderilebilir) · Cumartesi ve Pazar teklif yok ("Bugün bahis yapamazsın") · en fazla iki çetenin küçük 00:00 kasasının ¼'ü |
| Oylama | 00:00–12:00 arası başlatılır, ANINDA başlar, o gecenin 00:00'ında biter · devirme ≥%51 · ayaklanma >%66 · çıkarma >%51 · İstihbarat: Başkan >%66, diğerleri ≥%51 |
| Bahis zamanı (v35) | iki taraf onaylayınca bir sonraki saldırı diliminde (00·06·12·18) başlar, 24 saat = 4 dilim sürer (ör. 14:00'te kabul → 18:00'de başlar, ertesi gün 18:00'de biter) |
| Bahse İstihbarat müdahalesi | kabul edildikten sonra ilk saldırı diliminin SONUNA kadar (ör. 18:00'de başlayan bahis için 24:00): ihbar (çetesinde Tetikçi+) +1M · içerik açma (Kıdemli+, toplam bahis görünür) +1M · operasyon (Başkan/Şef) 100.000 · savaş 3 taraflı, en güçlü tüm bahsi alır |
| Aktiflik | 30 gün hiçbir savaşa katılmayan çıkarılır (Baba dahil; halef en yüksek prestij, kimse yoksa çete kapanır) |
| İstihbarat prestiji | ihbar 1M · sızdırma 1M · çete teslimi 10M · savaş 1:1 · polis yakalama ödülü 1:1 |
| İstihbarat kasası | pazar zaferi = gücün 1/10'u · operasyon ödülü · rüşvet · teslim edilen çetenin kasası · şüpheyle yakalanma cezaları |

## Kullanıcının netleştirdiği kararlar
1. Başarısız **ayaklanmada** başlatan çeteden atılır; başarısız **devirmede** de aday atılır.
2. Bahis teklifi Cumartesi ve Pazar gönderilemez (Cuma teklifinin savaşı Cumartesi).
3. Depodan 2. ele: ürün satılana kadar depoda yer kaplar; alıcıya yeni ürün verilir, para çete kasasına girer.

4. (v32) Arayüz: kurallar yazıyla değil tasarımla anlatılır — açıklama paragrafları ve (i) ikonları kaldırıldı; sınıra takılınca ilgili çubuk kırmızı yanar, sadece gerekli uyarılar (kalıcı prestij kaybı, başarısız devirme/ayaklanmada atılma) kısa satır olarak kalır.
5. (v32) Admin paneli ve test şifresi yok; çeteler oyunculara açık (bkz. 03).

## Uygulama yorumları
- **Ayrılma ve oylamalar (v34):** başlatan ya da hedef ayrılsa/atılsa da oylama sürer ve 00:00'da sonuçlanır.
  - Çıkarma: hedef ayrıldıysa sonuç bir şey değiştirmez (zaten çıktı). Başlatan ayrıldıysa sonuç yine uygulanır.
  - Devirme/ayaklanma, başlatan ayrıldıysa: geçerse Baba devrilir (devirmede çeteden çıkar, ayaklanmada üye kalır) ve başa en yüksek prestijli üye geçer; geçmezse hiçbir şey değişmez.
  - Mafya Babası oylama sürerken çeteden çıkarsa liderlik oylaması sonuçsuz kapanır (halef zaten başa geçti; başlatan atılmaz).
  - Çıkılan (ayrılma ya da atılma) çeteye o gün 00:00'a kadar tekrar girilemez. 00:00'dan sonra geri giren yeni üyelik sayılır; eski oylamanın sonucu onu etkilemez.
- **Saldırı hakkı (pencere):** gün 00–06, 06–12, 12–18, 18–24 pencerelerine ayrılır; oyuncu HER pencerede toplam 1 saldırı yapar — hangi savaş olursa olsun, çete ya da İstihbarat adına (ikisindeyse birini seçer). Pazar ve bahisli savaşlar 4 pencerenin hepsinde açıktır (günde en fazla 4); sabotaj/operasyon sadece 12–18 ve 18–24'te (günde en fazla 2). Farklı pencerelerde farklı savaşlara katılabilir.
- **Oylamalar (v33):** gizli talep/bekleme kalktı; oylama 00:00–12:00 arasında başlatılır, hemen görünür (Tetikçi+ görür, 7 rütbeli oy verir) ve o gece 00:00'da biter. 00:00'da önce oylamalar sonuçlanır, sonra rütbeler hesaplanır. Aynı anda tek liderlik oylaması ve bir üyeye tek çıkarma oylaması (kilit belgesi; eşzamanlı istekler dahil). Aynı gece önce çıkarma, sonra devirme/ayaklanma sonuçlanır. v32'den kalan bekleyen talepler kaybolmaz, ilk 00:00'da başlar. İstihbarat atma oylamaları da aynı kurala geçti.
- **Bahse müdahale (v35):** operasyon savaş başlamadan önce başlatıldıysa çeteler İstihbaratın girdiğini savaş başlarken, ilk dilimde başlatıldıysa hemen sohbetten öğrenir. Bahis başlayamazsa (çete dağıldı) operasyon ücreti İstihbarata iade. En yüksek güçte eşitlikte bahisler çetelere iade edilir. İstihbarat savaş katkısı 1:1 prestij.
- **Bahis ihbarı (v36):** iki çete de eşit — teklif eden ve kabul eden çetenin İstihbarattaki üyeleri bahsi "📡 Çetemin bahisleri" listesinde görür (Tetikçi+ ihbar eder, altı kilitli görür). Bahis başına tek ihbar: bir taraf ihbar edince bahis "🎲 İhbarlı bahisler"e geçer. Her işlem (ihbar, içerik açma, operasyon, haraç, rüşvet) önce ne kazanıp ne kaybedileceğini gösteren onay penceresi açar; son dakikaya kadar geri sayım gösterilir (bahis: ilk dilim sonu, haraç/rüşvet: 18:00).
- **Sipariş MAX:** en fazla adet = min(tır kapasitesi, kalan günlük limit ÷ fiyat, depo boş yeri ÷ ürün yeri, kasa ÷ fiyat).
- **Sabotaj sayacı** oyun genelidir; İstihbarat operasyonları da aynı sayacı artırır.
- **Sabotaj akışı:** tır 00:00'da yola çıkar → sabotaj/operasyon 00:00–12:00 arası başlatılır (tır sahibine hemen bildirim gitmez) → 12:00'de saldırı ve savunma AYNI ANDA, iki taraf da 0 güçle başlar ve tır sahibine duyurulur → 12–18 ve 18–24 pencerelerinde her üye birer kez zar atar → haraç/rüşvet 12:00–18:00 arası ödenir → 00:00'da sonuç. 12:00'den önce kimse zar atamaz.
- **Depo kontrolü** sabotajda tırın gerçek yüküyle yapılır (sunucu da doğrular); sabotaj başlarken o kadar yer ayrılır.
- **Dağıtımdan alma:** dağıtım açıldıktan sonra katılan (ya da ayrılıp dönen) üye o dağıtımdan alamaz; ilk gelen alır.
- **İstihbarat atma oylaması** 00:00'da başlar, 24 saat sürer; oy hakkı o anki Başkan, Şef ve Uzmanlarındır. Atılanın yeri aynı 00:00'daki rütbe hesabıyla dolar.
- **Şüpheyle yakalanma cezası** (tek soygun, ekip soygununda şüpheden yakalanma, parkta yasaklı madde) borç yazıldığı anda İstihbarat kasasına eklenir. Polisin yakaladığı ekip soygunu, kredi ve maaş cezaları dahil değildir. Kanca best-effort'tur; hata soygunu etkilemez.
- **İstihbarat Başkanı** en yüksek prestijli üyedir; rütbe için 1.000.000 prestij şartı çetedekiyle aynıdır.
- **Tırlar** tüm çetelerin üyelerine görünür (sahibi görünür, içerik görünmez). İçerik (sipariş/yük) sadece sahibi çetenin Kıdemli+ üyelerine.
- **Kasa** Çeteler listesinde herkese görünür (kart bilgisi).

## v37
- **Bahis tutarı gizli:** tutarı sadece iki çetenin Baba · Sağ Kol · Kıdemli'si görür. Çömez ve Tetikçi "💰 Bahis: gizli 🔒 rütbeliler görür" görür. Tutar herkese açık savaş belgesinde değil, `wars/{id}/secret/stake` belgesinde (Firestore kuralı ile korunur). Tutarlı sohbet mesajları yönetim sohbetine, genel sohbet/kayıtta tutar yok.
- Not: çete kasası Çeteler listesinde herkese açık olduğundan kasa değişimi dolaylı ipucu verebilir (mevcut kural, değiştirilmedi).
- **Sayaçlar:** bahis kartında saat yok; saniye saniye akan "⚔️ Başlamasına 03:59:12" / "⏳ Cevap için 09:59:50".
- **Varsayılan örgüt:** hem çetede hem İstihbarattaysa Çeteler önce çete ile açılır.

## v38
- **Saldırı dilimleri:** 3 saatlik 8 dilim (00·03·…·21). Dilim başına 1 saldırı (tüm savaşlar ve iki örgüt toplamı). Hak belgesi `slots/{uid}_{gün}_w{dilim}`; geçiş günü eski 6 saatlik kayıt aynı 3 saatlik dilimdeyse hak kullanılmış sayılır.
- **Bahis:** 24 saat = 8 dilim; ihbar/sızdırma/operasyon başladıktan sonraki ilk 2 dilim (6 saat) içinde.
- **Pazar savaşı:** 00:00–24:00, 8 dilim (kurallar aynı).
- **Sabotaj / operasyon:** 12:00'den önce başlatılır; savaş 12:00–24:00 = 4 dilim. **Haraç / rüşvet:** son dilim başlayana kadar (21:00).
- **Tır ihbarı ve içerik sızdırma:** tır yola çıktığı gün 00:00–12:00 (sunucuda zorunlu).
- **Savaş prestiji:** hasarın yarısı (500.000 hasar → 250.000 prestij).
- **Aktiflik (30 gün):** savaş, herhangi bir sohbet mesajı (çete, genel çete, İstihbarat, ChatsApp) ya da camide ibadet aktif sayılır. Kural devreye girdiği an herkes için taze başlangıç.
- **Tekrar giriş:** kendi isteğiyle ayrılan 00:00'ı bekler; atılan (Baba, oylama, aktiflik, başarısız devirme/ayaklanma) hemen girebilir, prestij 0.
- **Görünürlük:** diğer üyelerin prestiji (çete ve İstihbarat) 00:00 değeriyle, kendi prestijin anlık. Çete kasası dışarıya ve Çömez'e 00:00 değeriyle; Tetikçi ve üstü anlık. Firestore kurallarıyla: üye / roster belgesi sadece sahibine, liste `public/roster`, anlık kasa (`private/state`) Tetikçi+.
- **Anasayfa hatırlatıcıları:** Savaşa katıl · Çeteden para al · İhbar et · İçeriği aç.

## v39
- **Oylama hedefi:** adına oylama açılan üye (çıkarma hedefi; devirme/ayaklanmada Baba) oylama bitene kadar (00:00) Çömez yetkisindedir (İstihbaratta Muhbir). Asıl rütbesi değişmez; kasayı görmeye devam eder ama para çekemez, dağıtamaz, sipariş/tır/depo/bahis/ittifak/atma yapamaz. Üye belgesinde `underVoteUntilMs`.
- **Tır / depo:** çete günde en fazla 1 tır alır ve depoyu 1 kez genişletir (`truckBuyDateKey`, `depotBuyDateKey`).
- **Ticaret yolu sipariş limiti:** kazanırken kullanılan gücün %1'i (eskiden %5). Elde tutulan yollar da bir kez %1'e çekildi (`routeLimitV39`).
- **Üye sayısı:** Çeteler listesindeki sayı üye listesi her yenilendiğinde gerçek sayıyla eşitlenir; mevcut çeteler bir kez yeniden sayıldı.

## v40
- **Çete teslimi:** İstihbarat duyurusunda teslim edenin kod adı yazılmaz — sadece "X çetesi çökertildi ve İstihbarata teslim edildi". Karar panelinde teslim: üyeler dağılır · tüm altın İstihbarata · +10M prestij; ayrıl: Mafya Babası olarak devam.
- **Yatırımlar (functions/index.js):** elmas/hisse/kripto aynı sistem — `investmentTrades` (alış: harcanan altın, satış: komisyon öncesi brüt, mining: sahip başına KR × gece fiyatı), yön %50/%50, rejim `pickInvestmentRegime` (eşik → ters/görünür, eşik/10 altı → normal, arada 24 saatlik ağırlıklı alış oranı > %75 → ters/gizli). `cryptoTrades` kaldırıldı. Kontrol: `node functions/scripts/check-investments.mjs`.

## v41
- **Baba ayrılınca / atılınca:** yerine hemen kimse geçmez; koltuk 00:00'a kadar boş (`babaId: null`), herkes mevkiinde kalır. 00:00'da rütbeler düzenlenirken en yüksek prestijli üye Mafya Babası olur. Son üye çıkarsa çete dağılır.
- **Ayrılma duyurusu:** kendi isteğiyle ayrılan (başka çeteye geçen / yeni çete kuran dahil) herkes için sohbette "X çeteden ayrıldı".
- **Başkanlık devri:** Baba bir Sağ Kola devir talebi gönderir (`gangs/{g}/public/handover`). Sağ Kol Savaş ekranından 00:00'a kadar kabul/ret; kabul → 00:00'da yeni Baba, ret → Baba devam, cevapsız → iptal. Baba talebi iptal edebilir. Adına oylama olan Baba devredemez.
