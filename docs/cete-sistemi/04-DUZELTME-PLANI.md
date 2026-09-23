# Düzeltme Planı (v31) — Kullanıcının kendi tasarım metnine göre

Kaynak: kullanıcının kendi yazdığı tasarım metni. ChatGPT'nin ürettiği talimatla çelişen her noktada **kullanıcının metni esas alındı**. Güvenlik kuralları (canlı veriye dokunmama, test izolasyonu, idempotency, sunucu otoritesi) aynen geçerli.

## Fazlar
| Faz | Kapsam | Test |
|---|---|---|
| F1 | Bağış ×5 prestij · sipariş limiti %5 · ürünler: yasaklı madde → silah → araba · yol 21 gün · İstihbarat ihbar 1M / sızdırma 1M / pazar zaferi 1/10 · Çaylak → **Muhbir** · çıkarma oylaması >%51 · haraç alt/üst sınırı yok · bahis üst sınırı = iki çetenin küçük 00:00 kasasının ¼'ü | birim testleri |
| F2 | Tır 100.000, kapasite 10 araba / 10 silah / 100 yasaklı madde, ömür 21 **gün**, son gün sipariş yok, bitince hurda · Depo 100.000 = 100 kapasite, her alımda +100 (araba/silah 10, yasaklı 1 yer) · Sipariş sadece Pzt–Cum · **Yoldaki tıra yeni sipariş** (ertesi 00:00 çıkar) · kapasite kontrolü gerçek yükle | tır/depo/sipariş testleri |
| F3 | Dağıtım: **kişi başı tutar + en fazla kaç kişi** (rütbeliler sabit 7; diğerleri en az 7), 24 saatte elle alınır, kalan kasaya döner · **Baba kendi hesabına** (prestij −tutar×5) · **başka çeteye para gönderme** (Baba + Sağ Kol) · üçü tek %20 hakkını paylaşır · sohbete duyuru | kasa testleri |
| F4 | Çıkarma oylaması: Baba→Sağ Kol/Kıdemli, **Sağ Kol→Kıdemli/Tetikçi, Kıdemli→Tetikçi/Çömez** · aktiflik **sadece savaş** · **Baba da muaf değil** · İstihbarat atma sistemi (anında + oylama; Başkan için >%66, diğerleri %51) · **kod adı değiştirme** | oylama testleri |
| F5 | Sabotaj ücreti **oyun genelinde** 10k→20k→… · **rüşveti İstihbarat operasyonda belirler, savunan öder** · Kıdemli/Tetikçi **sabotaj talebi** · yoldaki tırları **tüm çeteler** görür (içerik gizli) · saldırılar savunana **12:00'de duyurulur** · en güçlü saldırgan + tüm saldırgan listesi · depo yeri tırın **gerçek yüküyle** | sabotaj testleri |
| F6 | Bahis ve ittifak: **Baba + Sağ Kol** · günde 1 bahis teklifi · Tetikçi/Kıdemli kabul/ret **önerisi** sohbete · ittifaka kısa not | bahis/ittifak testleri |
| F7 | İstihbarat **2 sohbet** (genel + rütbeli) · teslimde **çete kasası İstihbarat kasasına** · soygun/yasaklı satışta şüpheyle yakalanma **cezası anında İstihbarat kasasına** (polis yakaladıysa, kredi/maaş cezalarında değil) | kanca testleri |
| F8 | Çete sohbetleri: genel · yönetim (7 rütbeli) · **tüm çetelerin rütbelileri sohbeti** (herkes okur) · avatar · olay mesajları sohbete | sohbet testleri |
| F9 | Alt bar: **Çeteler – Soygun – Telefon – Futbol** (Profil kalkar, Ev'den açılır) · 5 iç sekme (çeteler/sohbet/savaş/ticaret/çetem; İstihbarat: …/operasyon/istihbarat) · Çeteler listesi (son pazar gücüne göre, İstihbarat dahil) · Savaş paneli (halat çubuğu, oylamalar, dağıtım alma) · Çetem ağacı (futbol kartı) · Operasyon | önizleme + Playwright |
| F10 | Firestore rules, belgeler, uçtan uca tur, zip | tümü |

## Kullanıcının netleştirdiği kararlar
1. **Başarısız ayaklanma:** başlatan çeteden atılır (`AYAKLANMA_FAIL_KICKS_INITIATOR: true`). Devirmede kaybeden aday atılır.
2. **Bahis teklifi:** Cumartesi ve Pazar gönderilemez, Pzt–Cum açık (`BET_OFFER_WEEKDAYS: [1..5]`; Cuma teklifi → Cumartesi savaşı).
3. **Depodan 2. ele:** Baba/Sağ Kol depodaki ürünü adet fiyatıyla (mağaza fiyatının yarısı–tamamı) ilana koyar; ürün **satılana kadar depoda yer kaplar** ve bu sürede satılamaz/dağıtılamaz. Her oyuncu satın alabilir; para çete kasasına girer, alıcıya **yeni (20/20)** ürün verilir. İlanlar `gangWorlds/{dünya}/market` içinde — mevcut `marketplaceListings` ve fonksiyonlarına dokunulmadı; 2. El Pazarı ekranına ayrı "Çete depoları" bölümü eklendi.

## Diğer yorumlar
- **Sabotaj ücret sayacı:** "oyunda birçok kişi" ifadesine göre **oyun geneli** (çete sabotajları + İstihbarat operasyonları aynı sayaç).
- **İstihbarat Başkanı:** en yüksek prestijli üye; rütbe için 1M şartı (çetedekiyle aynı).
