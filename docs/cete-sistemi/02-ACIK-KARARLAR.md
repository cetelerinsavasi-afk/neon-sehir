# Kurallar ve Kararlar (v31)

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
| Bahis | Baba/Sağ Kol · çete başına günde 1 teklif · Cumartesi ve Pazar teklif yok · en fazla iki çetenin küçük 00:00 kasasının ¼'ü |
| Oylama | devirme ≥%51 · ayaklanma >%66 · çıkarma >%51 · İstihbarat: Başkan >%66, diğerleri ≥%51 |
| Aktiflik | 30 gün hiçbir savaşa katılmayan çıkarılır (Baba dahil; halef en yüksek prestij, kimse yoksa çete kapanır) |
| İstihbarat prestiji | ihbar 1M · sızdırma 1M · çete teslimi 10M · savaş 1:1 · polis yakalama ödülü 1:1 |
| İstihbarat kasası | pazar zaferi = gücün 1/10'u · operasyon ödülü · rüşvet · teslim edilen çetenin kasası · şüpheyle yakalanma cezaları |

## Kullanıcının netleştirdiği kararlar
1. Başarısız **ayaklanmada** başlatan çeteden atılır; başarısız **devirmede** de aday atılır.
2. Bahis teklifi Cumartesi ve Pazar gönderilemez (Cuma teklifinin savaşı Cumartesi).
3. Depodan 2. ele: ürün satılana kadar depoda yer kaplar; alıcıya yeni ürün verilir, para çete kasasına girer.

## Uygulama yorumları
- **Sabotaj sayacı** oyun genelidir; İstihbarat operasyonları da aynı sayacı artırır.
- **Saldırı duyurusu:** sabotaj/operasyon başlatıldığında tır sahibine hemen bildirim gitmez; 12:00'de sohbete duyurulur, savunma/haraç/rüşvet kartları o andan itibaren görünür. Saldıran çete savunma gücünü baştan görür.
- **Depo kontrolü** sabotajda tırın gerçek yüküyle yapılır (sunucu da doğrular); sabotaj başlarken o kadar yer ayrılır.
- **Dağıtımdan alma:** dağıtım açıldıktan sonra katılan (ya da ayrılıp dönen) üye o dağıtımdan alamaz; ilk gelen alır.
- **İstihbarat atma oylaması** 00:00'da başlar, 24 saat sürer; oy hakkı o anki Başkan, Şef ve Uzmanlarındır. Atılanın yeri aynı 00:00'daki rütbe hesabıyla dolar.
- **Şüpheyle yakalanma cezası** (tek soygun, ekip soygununda şüpheden yakalanma, parkta yasaklı madde) borç yazıldığı anda İstihbarat kasasına eklenir. Polisin yakaladığı ekip soygunu, kredi ve maaş cezaları dahil değildir. Kanca best-effort'tur; hata soygunu etkilemez.
- **İstihbarat Başkanı** en yüksek prestijli üyedir; rütbe için 1.000.000 prestij şartı çetedekiyle aynıdır.
- **Tırlar** tüm çetelerin üyelerine görünür (sahibi görünür, içerik görünmez). İçerik (sipariş/yük) sadece sahibi çetenin Kıdemli+ üyelerine.
- **Kasa** Çeteler listesinde herkese görünür (kart bilgisi).
