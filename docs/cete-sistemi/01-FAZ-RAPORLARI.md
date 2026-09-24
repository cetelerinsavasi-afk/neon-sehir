# Faz Raporları — Çete & İstihbarat Sistemi

> Her faz sonunda: backend testleri (`npm --prefix functions test`), frontend build (`npm run build`), lint (`oxlint`) çalıştırıldı. Son durum: **68/68 test geçti, build temiz, yeni kodda lint uyarısı yok.**

---

## Faz 0 — Analiz
**Tamamlananlar:** Mimari, veri modeli, scheduler, rules, admin, chat, ekonomi, polis ödülü incelendi. Rapor: `00-FAZ0-ANALIZ-VE-PLAN.md`.
**Kritik karar:** `dailyReset` gün bazlı idempotent olmadığı için çete işleri ona eklenmedi; ayrı merkezi saat (`gangClock`).
**Sonraki:** Altyapı.

## Faz 1–2 — Altyapı, izolasyon, admin test kapısı
**Tamamlananlar**
- `gangWorlds/{worldId}` dünya modeli: `test` (sahte personalar + sanal saat) ve `live_<tarih>_<rastgele>` (canlıya açılırken yepyeni, boş).
- Ekonomi adaptörü: canlıda `users/{uid}` (mevcut `splitIncomeForDebt` borç kuralı dahil), testte `players/{personaId}`.
- Ledger (`ledger/`), istek kimliği ile çift tık koruması (`requests/`), yapılandırılmış loglar.
- Admin: 5 dokunuş → şifre → `gangAdmin.unlock` (ADMIN_UIDS **ve** Secret Manager şifresi, 5 hatada 15 dk kilit, 12 saatlik oturum). Test dünyası rules'ta sadece aktif oturuma açık.
- Test paneli: persona oluştur/düzenle, hızlı kurulum (8 persona), +1s/+6s/12:00/18:00/⏭00:00/+30g, test verisini sil, canlıya aç/kapat.

**Değişen dosyalar:** `functions/index.js` (sadece en alta export + polis kancası), `firestore.rules` (yeni blok), `firebase.json` (test klasörü deploy dışı), `src/components/Phone/PhoneScreen.jsx` (Çeteler uygulaması).
**Yeni:** `functions/gang/{config,time,core,system,firebase,clock,ranks}.js`, `src/components/Gangs/*`.
**Testler:** güvenlik (kapalı canlı, admin oturumu, şifre kilidi), zaman simülasyonu sadece test dünyasında, test sıfırlama canlıya dokunmaz.
**Bulunan/çözülen hata:** Test oturumu 12 saatte düştüğü için uzun zaman atlamalı testler kırılıyordu → test düzeneğinde oturum uzatıldı (üründe davranış aynı).

## Faz 3–5 — Üyelik, rütbe, prestij, kasa, dağıtım, sohbet
**Tamamlananlar:** kur (1M/100 saygınlık/40k güç, 10M prestij), katıl (Çömez, 0 prestij), ayrıl/geçiş (onaylı; prestij kalıcı silinir), Baba ayrılırsa en yüksek prestijli halef (yoksa çete dağılır), atma yetkileri, saygı (üyelik başına 1 kez, +1M), ad/logo/not, bağış (1:1 prestij), 24 saatlik dağıtım havuzu (%20 günlük sınır, grup bazlı eşit pay, İstihbaratta dağıtan kendine pay alamaz), 3 kanallı sohbet (katılmadan önceki mesajlar görünmez).
**Testler:** eşzamanlı iki çeteye katılma, eşzamanlı çift saygı, çift tık bağış, claim/iade yarışı (10 tekrar), ayrılıp dönen oyuncunun eski havuzdan alamaması, kasa bütünlüğü.
**Bulunan/çözülen hata:** Aynı milisaniyede ayrılıp dönen oyuncu eski dağıtımdan pay alabiliyordu (katılma zamanı karşılaştırması) → her üyeliğe benzersiz `stint` kimliği eklendi.

## Faz 6–11 — Savaş, ticaret yolu, tır, depo, sabotaj, bahis, ittifak
**Tamamlananlar**
- Zar çekirdeği: sunucuda 2 zar, katkı = toplam × anlık güç; 00/06/12/18 pencere kilidi (`slots/{oyuncu}_{gün}_{pencere}`), shard'lı toplamlar.
- Pazar ticaret yolu savaşı (6 ürün rotasyonu), kazanana yol + günlük sipariş limiti (%2), kaybedene prestij; İstihbarat kazanırsa yol kimseye verilmez, kasaya gücün 1/20'si.
- Tır: 4 haneli benzersiz kimlik (ömür boyu rezerve), yükleme (yarı fiyat, limit, tır & depo kapasitesi), 00:00 kalkış, ertesi 00:00 varış, ömür.
- Sabotaj: 00–12 başlatma, 10k→20k→… (günlük sıfırlama), 12–24 saldırı, haraç (≤ 00:00 kasasının ¼'ü, 18:00'e kadar), en güçlü saldırı esas, tır çalınmaz; depo kapasitesi yoksa buton görünmez + sunucu reddeder.
- Bahis: Pzt–Per teklif, 00:00'a kadar cevap yoksa iade, ertesi gün 24 saat savaş, kazanan toplamı alır, beraberlikte iade.
- İttifak: 00:00 başlar/biter, bahis ve sabotajı engeller, savunmada güç birleşir.

**Testler:** zar/güç anlık görüntü, 5 eşzamanlı tık → 1 katılım, günde 4 pencere, bahis kabul/ret/timeout/hafta sonu/çift ödeme, pazar savaşı + rotasyon, İstihbarat zaferi, tır ömrü ve kimlik serbest bırakma, çift varış yok, sabotaj fiyatı ve 12:00 kilidi, haraç sınırı ve 18:00 kilidi, birden fazla saldırgan, müttefik savunması.
**Bulunan/çözülen hata:** Savunma kartı saldıran çeteye de görünüyordu (savaş belgesindeki görünürlük listesi) → kart artık sadece tır sahibi ve aktif müttefiklerine.

## Faz 12–14 — Oylama ve İstihbarat
**Tamamlananlar**
- Devirme (prestij Baba'yı geçmeli, ≥%51), ayaklanma (>%66), rütbeli çıkarma; 00:00'a kadar gizli + iptal; 00:00'da yeniden doğrulama (geçersizse sessiz iptal); oy hakkı 00:00 snapshot'ı; toplamlar canlı, oylar gizli; başarısız aday atılır.
- İstihbarat: 50+ saygınlık (polislik şartı yok), benzersiz kod adı, UID içermeyen roster, kod adlı sohbet, rütbeler (Başkan/Şef/Uzman/Ajan/Çaylak), ihbar (Tetikçi+, sefer başına 1 kez), sızdırma (Kıdemli+, 1 kez), operasyon (Başkan/Şef, 12:00'ye kadar, ücret = sabotaj ücreti), yük imha + anlık satış değeri ödülü, rüşvet (emanet, kabul/ret, 18:00), polis yakalama ödülü → prestij (idempotent kanca), İstihbaratçı Baba karar paneli (dağıt / Baba kal; 00:00'da otomatik "Baba kal").

**Testler:** oylama türleri ve eşikleri, snapshot, hedef ayrılınca iptal, rütbesi düşen hedef, aynı gün iki liderlik talebi, kod adı çakışması, çift ihbar/sızdırma, yetki sınırları, operasyon ödülü, rüşvet ile geri çekme yarışı, çete çökertme ve üye mesajları, polis kancası idempotency.

## Faz 15 — Merkezi saat
`runClock`: kaçırılmış günleri sırayla işler (en fazla 40), tick kilidi (lease), her varlık için durum-makinesi geçişi. Sıra: seferler → bahis sonuçları → pazar savaşı → İstihbarat-Baba kararları → bahis zaman aşımı → ittifaklar → (çete başına) oylama sonucu → aktiflik → rütbe → yeni oylamalar → kasa anlık görüntüsü → İstihbarat rütbe/kasa → bahis başlangıcı → pazar savaşı açılışı → tır kalkışı. Ayrıca: süresi dolan dağıtımların iadesi, dağılmış çete temizliği, saatlik gösterge uzlaştırması.
**Testler:** 3 gün atlama + 3 eşzamanlı saat çalışması → her gün bir kez; aynı günü zorla yeniden çalıştırma → çift ödeme yok; 29/30 gün aktiflik.

## Faz 16 — Güvenlik & race-condition
Firestore emülatörü bu ortamda indirilemediği için gerçek Firestore transaction semantiğini taklit eden bellek içi veritabanı yazıldı (okunan belge ve sorgu sürümleri commit'te doğrulanır, çakışmada yeniden dener, "yazmadan sonra okuma" hatası verir). Eşzamanlı işlemler gerçekten iç içe koşturuldu. Ek olarak `tests/firestore-rules/` altında emülatörde çalıştırılacak rules testleri hazırlandı (bkz. kurulum rehberi).

## Faz 17 — UI/UX
Mobil öncelikli neon arayüz; sekme sayaçları, boş kategorileri gizleme, (i) bilgi balonları, ciddi işlemlerde sonucu açıkça yazan onay pencereleri, 3B zar animasyonu (sunucu sonucuna oturur), yükleniyor/kilit/başarı/hata akışı, Türkçe kısa hata mesajları. Tarayıcı içi önizleme (`npm run preview:gangs`) ile Playwright üzerinden 390×844 ekranda uçtan uca akışlar tıklanarak görsel kontrol yapıldı.
**Bulunan/çözülen:** uzun çete adı kesiliyordu (2 satıra izin), test çubuğu ile sekmeler üst üste biniyordu, persona değişince görünüm sıfırlanmıyordu, savunma/sabotaj kartlarında anlamsız sıralama satırı vardı — hepsi düzeltildi.

## Faz 18 — Yayın öncesi
Kontrol listesi: `03-KURULUM-TEST-YAYIN.md`.

---

# v31 — Tasarımcının kendi metnine göre düzeltmeler

> Plan: `04-DUZELTME-PLANI.md`. Son durum: **83/83 backend testi geçti (tekrarlı çalıştırmada kararlı), build temiz, yeni kodda lint uyarısı yok, önizlemede 390×844 uçtan uca tur yapıldı.**

| Faz | Yapılan | Test |
|---|---|---|
| F1 | Bağış ×5 prestij, sipariş %5, 3 ürün rotasyonu, yol 21 gün (`untilDateKey` + süre dolumu), İstihbarat 1M/1M/1-10, Çaylak → Muhbir, çıkarma >%51, haraç sınırsız | wars, membership |
| F2 | Tır 100k/21 gün/birim kapasite; depo 100k=+100; sipariş Pzt–Cum; yoldaki tıra sipariş (`orders/`); gerçek yükle depo yeri | trade (13 test) |
| F3 | Dağıtım: kişi başı + kişi sayısı; Baba kendine (−5 prestij/altın); çeteler arası gönderim; tek %20 hakkı | treasury (9 test) |
| F4 | Çıkarma oylaması yetkileri; aktiflik sadece savaş, Baba dahil; İstihbarat atma (anında + oylama); kod adı değiştirme | votes, clock, intel |
| F5 | Oyun geneli sabotaj sayacı; 12:00 duyurusu; rüşveti İstihbarat belirler; sabotaj talebi; saldırgan listesi; haraç ödenince sıradaki | trade, intel |
| F6 | Bahis/ittifak Baba+Sağ Kol; günde 1 teklif; küçük kasa ¼; öneriler sohbete; ittifak notu | wars |
| F7 | İstihbarat 2 sohbet; teslimde kasa İstihbarata; şüphe cezası kancası (`index.js`'te 3 yer, best-effort) | intel, consistency |
| F8 | Tüm çetelerin rütbeli sohbeti; avatar; olaylar çete sohbetine sistem mesajı | membership |
| F9 | Alt bar Çeteler–Soygun–Telefon–Futbol (Profil kalktı, Ev'den açılır); tam ekran Çeteler; 5 iç sekme; Çeteler listesi; Savaş paneli (halat çubuğu, saldırganlar, teklifler, oylamalar, dağıtım); Ticaret (sipariş akışı, depo, 2. el); Çetem ağacı; Operasyon; İstihbarat | Playwright turu |
| Ek | Depodan 2. ele satış (`market/`), 2. El Pazarı'nda "Çete depoları" bölümü | market (4 test) |

**Bulunan/çözülen:** iptal edilen siparişten sonra aynı gün yeni sipariş engelleniyordu (iptal durumu kontrolü eklendi); persona değişince iç sekme varsayılana dönmüyordu (üyelik gelince varsayılan seçim); savaş kartında KATIL butonu alta düşüyordu (CSS).


## v32 — sade arayüz, son kontrol, oyuna açılış
**Çete arayüzü:** açıklama paragrafları ve tüm (i) ikonları kaldırıldı; İstihbarat katılımında "⭐ 50 saygınlık gerekir" çipi; ayrılma onayında sadece "Prestijin kalıcı silinir."; rütbe ağacında Tetikçiler / Çömezler ve Ajanlar / Muhbirler ayrı başlıklı satırlarda; bahis teklifi: çete listesi → çeteye dokun → MAX görünür → teklif → liste kapanır, sadece hedef çete "⏳ Cevap bekleniyor" + İptal; iptal/ret sonrası liste geri gelir (sunucu da günlük hakkı iade eder); hafta sonu "Bugün bahis yapamazsın". Sipariş MAX = min(tır, limit, depo, kasa); tekrar MAX ya da sınırda + → sınırlayan çubuk kırmızı ⛔ ile titrer.
**Derin inceleme (ayaklanma/devirme/oylama/rütbe/sabotaj):** gizli çıkarma taleplerinin ifşası kapatıldı (çete + İstihbarat); aynı gece çözülen oylamalara belirli sıra (önce çıkarma); Baba olmuş hedefe karşı çıkarma oylaması düşer; sabotaj depo rezervasyonu, haraç iadesi, çoklu saldırgan, dağılan çete yolları gözden geçirildi (değişiklik gerekmedi). +5 test.
**Oyun geneli:** seyyar satıcı 1000 altın (sunucu + Şüphe paneli + buton); borçluyken park satışı mesajı "X altına sattın. Y altın borçlarına gitti."; yeni görevler 16–20 (avatar, ChatsApp, silah geliştirme malzemesi, silah geliştirme, çeteye gir; otomatik geçişler: avatar var / 2.-3. seviye silah var / zaten çetede); 2. elden (ve çete depolarından) yasaklı madde / silah / araba / malzeme alımı ilgili görevleri tamamlar; görev 2 adı güncellendi; telefon ekranı gerçek telefon görünümüne geçti (durum çubuğu, saat widget'ı, ikon ızgarası, dock, home çubuğu).
**Açılış:** `gangAdmin` + test şifresi kaldırıldı; canlı dünya ilk istekte transaction ile kurulur/açılır; bakım `liveOpen:false`. Test personaları sadece önizlemede.
**Testler:** 90/90.


## v33 — bildirimler, yeni oylama, bahse müdahale, telefon sayfaları
**Çete:** alt çubuktaki Çeteler butonunda ve çete içi sekmelerde "yapılacak bir şey var" noktası (yeni mesaj — kanal bazında; katılabileceğin savaş + boş pencere; gelen teklif; oy vermediğin oylama; alabileceğin dağıtım; İstihbarat operasyon/ihbar fırsatı). "1 savaş hakkın var" sadece katılınabilecek savaş varken. Bahis kartlarında "Bahisli savaş" etiketi. İstihbarata katılırken "🤫 İyi gizlendiğinden emin ol".
**Oylama:** 00:00–12:00 anında başlar, 00:00'da biter (çete + İstihbarat); 12:00 sonrası butonlar 🔒.
**Bahse İstihbarat müdahalesi:** ihbar / içerik açma / 100.000'lik operasyon; 00:00'da 3 taraflı savaş; en güçlü tüm bahsi alır.
**Telefon:** 3 sayfa yana kaydırılır — solda Neon TV (TV uygulaması kaldırıldı), ortada ana ekran, sağda Altın Mağazası · Neon Şehir (Sokak Rehberi, tasarım birebir) · Bi fikrin mi var? (fikir/hata/soru, 7 gün herkese açık liste, Instagram @cetelerinsavasi).
**Rehber metni:** "Devirme ve Ayaklanma" sayfasındaki eski oylama satırı yeni kurala göre güncellendi.
**Testler:** 93/93.


## v34 — ayrılma senaryolarında oylamalar, tekrar giriş yasağı, REC sayacı
Oylamalar başlatan/hedef ayrılsa da sürer ve kurala göre sonuçlanır (bkz. 02). Çıkılan çeteye aynı gün girilemez (listede 🔒 00:00). Oylama, kişinin oylama başladığındaki üyeliğine (stint) bağlı — çık-gir ile sonuç atlatılamaz. Sixtagram/TV videolarında REC sayacı her döngüde sıfırlanıyor. Testler: 98/98.
