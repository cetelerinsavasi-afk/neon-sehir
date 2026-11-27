# v219 — Yeni şehir planı (harita düzeni 5), görünüm dükkânları, şehir dışındaki pist, helikopter, halı saha, kaykay, La Marea

## 1. Şehir planı (prototip `harita_duzeni5.html`)
Sadece yeri değişen mekânlar taşındı; mekânların içi, ekonomi ve oyuncu verisi aynı.
- Yeni yerler: La Marea Restoran (0,1), açık otopark (1,1), oto sanayi (motor galerisi · modifiye · fabrika · tamirci · konteyner),
  aktivite parkı (halı saha, basket sahası, kaykay rampaları), pazar sokağı, berber/butik ve kostümcü/aksesuarcı dükkânları.
- Cadde adları, otobüs durakları (12 durak), Gölyaka köyünün kayması, liman / marina kaydırması prototipteki gibi.
- Dar ara sokaklar (x = −80, 160) araç yol tarifinden çıkarıldı (rota artık sokağın içinden geçmez).
- Dükkân / mekân NPC'si sandalyesinin üstüne ya da hemen önüne konmuşsa artık **oturur** (taksiciler, kasiyer, piyanist…).
  Garson, güvenlik, polis, berber gibi ayakta çalışanlar oturmaz.
- Köylüler gibi tezgâhı olmayan dış dünya NPC'leri evlerinin 2–3 m çevresinde ara sıra dolaşır; oyuncu yanındayken durur.
  Pazarcı, büfeci, kasiyer, pompacı vb. yerinden kıpırdamaz.
- **Deniz**: batıda ~600 m, güneyde ~260 m daha açılabilir. Yürüme ızgarası büyümedi (açılış süresi / bellek aynı);
  ızgaranın dışındaki açık deniz engelsiz sayılıyor.

## 2. Tır, kurye, ambulans
- Tır teslim noktası **Neon Elmas Madeni** (şehir içindeki depo kalktı). Kısa sefer: liman → maden (gerçek yol ~1.160 m);
  Kervankent dönüş seferi de madende biter (~3.740 m). Kazanç tablosu aynı (iş başı ortalama değişmedi).
- Kurye alma / teslim noktaları yeni plana göre. Köfteci otogarın, simitçi araba galerisinin önünde.
- Ambulans geliri **+%30** (ortalama 5.250 → 6.825).

## 3. Yarış pisti şehrin dışında
- Neon Şehir Pisti benzinliğin yanından ayrılan pist yolunun sonunda. Haritadan "Yarış Pisti"ne ışınlanınca pist girişine gelinir.
- Pist alanındayken solda **🏁 Yarış Pisti** düğmesi: yarışlara / şampiyonaya buradan girilir. Rıza Amca'nın yarış görevleri de buraya götürür.
- Pistin ortasındaki **helikopter**: 4 kişilik (pilot + 3 yolcu). Oyunda aynı anda tek pilot uçurur. 10 dk kullanılmazsa evine (pist
  ortası) döner. Ağ: küçük bir RTDB düğümü (`city/heli`) + pilotun konum kaydı — Firestore yok.

## 4. Görünüm dükkânları — dükkânlar sokağı (avatar artık Profil'de değil)
- Profil'deki Avatarım / Kostümler / Aksesuarlar / Mobilyalar düğmeleri kalktı; **📊 Günlük Rapor** tek başına. Engellenen oyuncular listesi katlanır (kapalı başlar).
- Dükkânlar sokağında (z = 60, x ≈ 84–116) karşılıklı 3 + 3 dükkân: güney yakada **💈 Berber · 👕 Butik · 🐾 Petshop**,
  kuzey yakada **💍 Takı & Şapka · 🎭 Kostümcü · ✨ Aksesuarcı**. Petshop ile Aksesuarcı karşı karşıya (doğu uç).
  - Berber: saç, sakal, yüz, ten, vücut · Butik: kıyafet, pantolon, ayakkabı
  - Takı & Şapka (eski adıyla Aksesuarcı): şapka, gözlük, küpe, kolye, eldeki eşya, dövme
  - **Petshop**: profildeki evcil hayvanlar — seçilen hayvan hemen yanında belirir, beğenirsen alırsın / takarsın / bırakırsın
  - **Aksesuarcı**: profildeki özel aksesuarlar (baş, yüz, boyun, sırt, aura) — üstünde denenir, alınır / takılır / çıkarılır
  - Kostümcü: hazır kostümler
- Her iki blok da caddeye bakan tek geniş bina oldu; dükkânlar zemin katında yan yana.
- Dükkânın içinde seçilen her şey üstünde denenir, **Satın al** deyince ödenir; çıkınca denenen geri alınır.
- Fiyatlar seçeneğe göre **100–10.000 altın** (`functions/avatarShopData.js`). **Her değişiklik ücretli** — eski görünüme dönmek de.
- Kostümler, özel aksesuarlar ve evcil hayvanlar eskisi gibi **zümrütle** (fiyatlar aynı; birkaçı altınla). Bunlardan birini almak da görünüm görevini geçirir.
- Sunucu: yeni `avatarShopAction` (doğrulama + ücret tek işlemde; para yok olur). Eski ücretsiz `setAvatar` artık sadece hiç avatarı olmayana çalışır (eski sürümle bedava değiştirme kapalı).

## 5. Görevler
Sıra: … → 🏆 Şampiyonaya gir → 👤 Görünümünü değiştir → 💬 ChatsApp → 🏦 Kredi → 🔧 Silah geliştir → …
"Görünümünü değiştir" artık şehirdeki dükkânlardan herhangi bir şey **satın alınca** geçer (eskiden avatarı olan otomatik geçiyordu).

## 6. La Marea (lüks restoran)
Bar fiyatlarının 2–3 katı: Şampanya / Istakoz 1.500 · Şarap 1.000 · Kokteyl / Biftek 900 · Suşi 800 · Makarna 700 · Tiramisu 600 · Su 150.
- Ayakta sipariş yok: bir masaya (ya da bar taburesine) **oturunca** "🍽️ Sipariş ver". Garson ürünü masana getirip önüne koyar;
  avatarın ara sıra alıp yer. Masadan kalkınca yemek kalkar. Masanda bir şey varken yeni sipariş verilmez.
- **🎁 Ismarla**: sadece restoranda oturan ve önünde bir şey olmayan oyunculara; ısmarlanan ürün garsonla onun masasına gider.
- Masadaki yemek ağa tek küçük alanla gider (`fd`); başkalarının masasındaki yemek ve yeme hareketi her cihazda çizilir. Firestore yazımı yok.

## 7. Halı saha, basket, kaykay
- Aktivite parkında halı saha ve basket topları oynanır, top sahadan çıkmaz; yakındaki herkes aynı topu görür (sadece sahanın 90 m
  yakınındayken dinlenen küçük RTDB düğümü `city/ball`).
- **Kaykay**: büfeden dakikası 100 altına kiralanır ya da 5.000 altına bir kez alınır (alan her yerde biner). Bisiklet kirası gibi çalışır.

## 8. Ekonomi
- **Kripto ve elmas** fiyat yönü hesabındaki zaman ağırlıkları: 0–12 sa ×4 · 12–24 sa ×3 · 24–36 sa ×2 · 36–48 sa ×1 (hisse eskisi gibi 24 sa).
  Not: saatlik fiyat işi artık son 48 saatin işlemlerini okur (bu işin okuması ~2 katı; başka okuma artışı yok).
- **Cafe, Bar ve La Marea'da harcanan para yok olur**: hissedarlara da devlete (vergi) de gitmez.
- **Cafe ve Bar hisseleri**: alım kapandı, satış serbest; daha önce birikmiş gelir toplanabilir. Piyasada hiç hisse kalmayınca Neon Borsa'dan kalkar.
- **Seyyar satıcı hisseleri tek hissede birleşti: "Seyyar Satıcılar"** (6 tezgâhın geliri tek hissede).
  Tek seferlik geçiş (`functions/borsa.js › planSeyyarMerge`): herkesin "şimdi hepsini satsam" tutarı yeni hissede **aynen** korunur
  (kimse kaybetmez, kazanç yuvarlama kadar), biriken gelir / maliyet / kâr-zarar aynen taşınır. Plan `borsa/seyyarPlan` belgesine
  yazılır, yarıda kalırsa bir sonraki saat başı kaldığı yerden tamamlanır. Geçiş, yayından sonraki ilk saat başında (ya da biri seyyar
  hissesinde işlem yapmak isteyince) çalışır; bitene kadar seyyar hissesinde işlem ve gece dağıtımı beklemede.

## 9. Eski sürümde kalanlar
Zorunlu güncelleme sürümü 219'a çıktı (`forceUpdate.js › BUILD`, `public/neon-flags.json › minBuild`): misafirler dahil eski sürümle
açık kalan herkes, bir işin ortasında değilken sayfayı kendiliğinden yeniler ve yeni şehri görür.

## Yayın
`v219-yayinla.bat`: gereksiz eski dosyaları siler, zip'i açar, testler, derleme, **tüm fonksiyonlar + RTDB kuralları** yayını, commit, push, Cloudflare.
Tüm fonksiyonlar yayınlanır çünkü görev sırası (`onboardingData.js`) ve ortak veri dosyaları (`v196Shared.js`, `cityJobsData.js`) birçok fonksiyonda kullanılıyor.
Firestore kuralları / indeksleri değişmedi.
