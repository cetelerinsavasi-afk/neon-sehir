# Neon Şehir — Oyun Özeti

**Neon Şehir**, tarayıcıda oynanan, neon/cyberpunk temalı bir şehir hayatı oyunu. Tek kişilik değil — herkes aynı şehirde, aynı anda, gerçek diğer oyuncularla birlikte yaşıyor. Meslek seçip para kazanmak, suç işleyip yakalanma riski almak, arkadaşlarla ticaret yapmak, araba/silah biriktirmek ve sosyalleşmek üzerine kurulu.

Oyun bir telefon arayüzü üzerinden yönetiliyor: şehir haritasında 16 farklı bölge var (banka, cami, karakol, galeri, silahçı, fabrika, kumarhane, park, liman, pist vs.) ve her biri tıklanınca ya bir ekran açılıyor ya da içine girip gezilen küçük bir dünyaya geçiliyor.

## Günlük döngü

Oyuncu bir meslek seçiyor (İşçi, Üretici ya da Polis), günlük işini yapıyor, camide dua ederek şüphesini düşürüyor, isterse soygun/kumar gibi riskli işlere giriyor, banka üzerinden kripto/hisse/elmas alıp satıyor, arabasını/silahını yükseltiyor ve sosyal medyada (Sixtagram) paylaşım yapıyor. Üstte her zaman görünen 3 gösterge var: **Şüphe**, **Saygınlık**, **Altın**.

## Meslekler

- **İşçi** — fabrikada çalışıp günde sabit 100 altın kazanıyor.
- **Üretici** — kendi üretim makinelerini alıp her gün malzeme üretiyor (tamir malzemesi, silah/araba yükseltme malzemesi, kripto/mining). Üretilen malzeme fabrikanın envanterine girer (v124).
- **Polis** — günde 500 altın maaş alıyor ama silah sahibi olmak ve şüphesinin %0 olması şartı var.
- Ayrıca **İmam** (cami görevlisi, saygınlık ve temiz sicil gerektiriyor) ve **Dilenci** (parası biten oyuncuların girebildiği, başkalarından bağış isteyebildiği bir durum) gibi özel roller de var.

## Ekonomi ve ticaret

- **Banka**: altın yatırma/çekme, kripto (KR)/hisse senedi/elmas alım-satımı (canlı fiyat grafikleriyle), araç kredisi, devlete olan borcu (ceza) ödeme.
- **Fabrikalar**: her oyuncu bir kere fabrika kurabiliyor, içine üretim makineleri (mining dahil) alıp işçi çalıştırabiliyor, günlük kâr/zarar raporu görüyor. Fabrika kapatılamaz. v124: yeni hisse alım-satımı kapalı (eski hisselerin ödemesi süresi bitene kadar sürer).
- **Malzeme (v124)**: oyuncunun cebinde malzeme yok (sadece yasaklı madde). Fabrika + silahçı + modifiyecinin ORTAK envanteri var; malzeme **Mağaza**'dan (işletmeler/fabrikalar arası ilan pazarı) alınıp satılır. Fiyat bantlarının tabanı `functions/itemRules.js` → `AMAZOR_PRICES` ("Amazor fiyatları").
- **2. El Pazar Yeri**: oyuncular arasında araç ve silah alım-satımı (v132: vergisiz; "Sıfır" filtresi). Silahçı / galeri vitrine eklerken alış fiyatına eşit / ucuz sıfır ilanları (çete ilanları dahil) otomatik alır.
- **Oyunun Silah Mağazası / Galerisi (v132)**: stoğu olan en ucuz oyuncu dükkânının fiyatıyla satar, para o dükkâna gider (eşitlikte dün en az kazanan); kimsede yoksa oyun satar.
- **Mobilya Pazarı (v132)**: Tasarla › Pazar — kullanılmayan mobilyalar oyuncular arasında satılır (mağaza fiyatının yarısı – 1 birim altı).
- **Altın Mağazası**: gerçek parayla altın paketi satın alma.
- **Liman & Depo (v124)**: Amazor ve Liman kalktı. Yasaklı madde ticareti depolarda: oyunun deposu (alış 1.500 / satış 2.250, sınırsız) ve oyuncuların açtığı DEPO işletmeleri (alış 1.500–1.750, satış 2.000–2.250).

## Suç ve polis dinamiği

- **Soygun sistemi**: banka, kumarhane, galeri, tuning dükkânı, fabrika ya da esnaftan (haraç) tek başına ya da 4 kişilik ekiple soygun yapılabiliyor. Yakalanma ihtimali güncel şüphe yüzdesine bağlı; ekip soygunlarında gizli polis de bulunabiliyor. Yakalanınca hapis yok — kazanılacak para yerine **devlete borç** yazılıyor.
- **Şüphe**: suç işledikçe artıyor, camide dua ederek (günde 5 kez) ya da polise rüşvet vererek (günde 1 kez, 3000 altın) düşürülebiliyor. Yüksek şüphe hem yakalanma riskini artırıyor hem polis/imam olmayı engelliyor.
- **Karakol**: polis olma/istifa başvuruları, rüşvet+yakalama havuzundan maaş/ödül talebi (şüphe %0 olma şartıyla).

## Sosyal ve dini mekânlar

- **Cami**: günde 5 kez ücretsiz dua (her biri -5 şüphe), imamın günlük "nasihat" verme görevi, imama 20.000 altın günlük maaş.
- **Park, Liman, Kumarhane** ve sokak esnafları da haritadan ya da "Ziyaret" sekmesinden gezilebiliyor.

## Araçlar ve silahlar

- **Galeri**: araç satın alma; **Garaj/Tuning**: vites/depo yükseltme ve tamir; araçların bir "ömür" göstergesi ve sınırlı tamir hakkı var (satış değerini etkiliyor).
- **Silahçı**: silah satın alma; yükseltme profil ekranından yapılıyor.

## Mini oyunlar

- **Flappy Kuş** klonu.
- **Futbol** — sadece mini oyun değil, kendi başına küçük bir yönetim modu: ligler, puan durumu, fikstür, iddaa, kendi takımını yönetme (kadro, transfer, altyapı, stadyum, forma/logo tasarımı).
- **Gazino (v124)** — Neon Gazino ve oyuncuların açtığı GAZİNO işletmeleri: 10 Numara (blackjack benzeri), Rulet (0–12), Slot (çevirme 1.600; oyuncu gazinosunda 1.400–1.600), gazino başına Piyango (havuz 0'dan başlar, bilet = 90 havuz + gazinonun kârı, gece çekiliş, %10 vergi). Oyuncu gazinolarında makinelerin kendi kasası var; sahibi altın / yasaklı madde ekler, çekerken %10 vergi öder; sahibi kendi gazinosunda oynayamaz. Yayında "Casinolar" ile oynanan oyun izleyicilere yansır.
- **Yarış Pisti** — şampiyona (tur zamanı), bahisli yarış (başka oyuncuya karşı altın bahsi), ücretsiz antrenman.

## Sosyal özellikler

- **Referans sistemi**: yeni oyuncu bir arkadaşının adını girerse ikisi de bonus altın kazanıyor.
- **ChatsApp** (genel sohbet) ve **SMS** (özel mesajlaşma).
- **Gazete**: günlük olayları (tutuklamalar, futbol sonuçları, piyango kazananları vs.) otomatik özetleyen bülten.
- **Sixtagram**: Instagram tarzı bir sosyal akış — fotoğraflı paylaşım, beğeni, yorum, bildirim, profil.
- **Avatar oluşturucu**: çok sayıda özelleştirilebilir vücut/yüz/kıyafet ve renk seçeneğiyle karakter tasarlama.

## Diğer

Giriş yapmayan misafirler oyunu salt-okunur gezebiliyor (bir işlem yapmaya çalışınca giriş yapması isteniyor). Oyun bir telefon arayüzü üzerinden sunuluyor ve ana ekranına eklenebilen bir PWA (uygulama gibi yüklenebilir web sitesi). Bankadan camiye, karakoldan parka kadar birçok mekânın hem basit modal hali hem de içine girip gezilebilen "dünya" hali var.

---

*Bu özet, oyunun mevcut haliyle geliştirici tarafından hazırlanmıştır — geri bildirim toplamak amacıyla paylaşılmaktadır.*
