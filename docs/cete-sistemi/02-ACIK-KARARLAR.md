# Kurallar ve Kararlar (v33)

v31'de kaynak olarak **oyun tasarımcısının kendi metni** esas alındı; önceki sürümdeki varsayımların çoğu bu metne göre düzeltildi. Sayısal değerlerin hepsi `functions/gang/config.js` içinde tek satırdan değiştirilebilir (istemci gösterimi: `src/components/Gangs/gangConstants.js`).

## Sayılar
| Konu | Değer |
|---|---|
| Çete kurma | 1.000.000 altın (cepten düşer) · 100 saygınlık · 40.000 güç · kurucu 10.000.000 prestij |
| Prestij | 1 savaş gücü = 1 · 1 altın bağış = 5 · Baba saygısı = 1.000.000 (üyelik başına bir kez) |
| Serbest para | 00:00 kasasının %20'si — dağıtım + Baba'nın kendine aktarımı (−5 prestij/altın) + başka çeteye gönderim bu tek hakkı paylaşır |
| Dağıtım | kişi başı tutar × kişi sayısı; rütbeliler sabit 7, diğer gruplar en az 7; 24 saat, alınmayan kasaya döner |
| Ticaret yolu | yasaklı madde → silah → araba (her Pazar); 21 gün; günlük sipariş limiti = kullanılan gücün %5'i; yarı fiyat |
| Sipariş | sadece Pzt–Cum; Baba/Sağ Kol; yoldaki tıra da verilir; tıra günde 1 |
| Tır | 100.000 · 10 araba / 10 silah / 100 yasaklı madde · 21 gün ömür · son gün sipariş yok · satılamaz |
| Depo | 100.000 = +100 kapasite (genişletilebilir, ömürsüz) · yer: araba 10, silah 10, yasaklı 1 |
| Sabotaj ücreti | oyun genelinde 10.000 + 10.000 × (bugünkü sabotaj+operasyon sayısı), 00:00 sıfırlanır |
| Haraç | alt/üst sınır yok, 18:00'e kadar |
| Rüşvet | İstihbarat operasyonu başlatırken belirler (0 = yok); tır sahibi 18:00'e kadar öder |
| Bahis | Baba/Sağ Kol · aynı anda 1 açık teklif (geri çekilir ya da reddedilirse aynı gün yeni teklif gönderilebilir) · Cumartesi ve Pazar teklif yok ("Bugün bahis yapamazsın") · en fazla iki çetenin küçük 00:00 kasasının ¼'ü |
| Oylama | 00:00–12:00 arası başlatılır, ANINDA başlar, o gecenin 00:00'ında biter · devirme ≥%51 · ayaklanma >%66 · çıkarma >%51 · İstihbarat: Başkan >%66, diğerleri ≥%51 |
| Bahse İstihbarat müdahalesi | kabul edilmiş bahis 00:00'da başlamadan önce: ihbar (çetesinde Tetikçi+) +1M · içerik açma (Kıdemli+, toplam bahis görünür) +1M · operasyon (Başkan/Şef) 100.000 · savaş 3 taraflı, en güçlü tüm bahsi alır |
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
- **Saldırı hakkı (pencere):** gün 00–06, 06–12, 12–18, 18–24 pencerelerine ayrılır; oyuncu HER pencerede toplam 1 saldırı yapar — hangi savaş olursa olsun, çete ya da İstihbarat adına (ikisindeyse birini seçer). Pazar ve bahisli savaşlar 4 pencerenin hepsinde açıktır (günde en fazla 4); sabotaj/operasyon sadece 12–18 ve 18–24'te (günde en fazla 2). Farklı pencerelerde farklı savaşlara katılabilir.
- **Oylamalar (v33):** gizli talep/bekleme kalktı; oylama 00:00–12:00 arasında başlatılır, hemen görünür (Tetikçi+ görür, 7 rütbeli oy verir) ve o gece 00:00'da biter. 00:00'da önce oylamalar sonuçlanır, sonra rütbeler hesaplanır. Aynı anda tek liderlik oylaması ve bir üyeye tek çıkarma oylaması (kilit belgesi; eşzamanlı istekler dahil). Aynı gece önce çıkarma, sonra devirme/ayaklanma sonuçlanır. v32'den kalan bekleyen talepler kaybolmaz, ilk 00:00'da başlar. İstihbarat atma oylamaları da aynı kurala geçti.
- **Bahse müdahale (v33):** çeteler İstihbaratın girdiğini savaş başlarken (00:00) sohbetten öğrenir. Bahis başlayamazsa (çete dağıldı) operasyon ücreti İstihbarata iade. En yüksek güçte eşitlikte bahisler çetelere iade edilir. İstihbarat savaş katkısı 1:1 prestij.
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
