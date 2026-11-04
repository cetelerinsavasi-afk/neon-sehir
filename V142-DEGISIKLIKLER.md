# v142 — Polis operasyonları, cezalı menajerler, sipariş paneli, kafe & park butonları, depo piyasası

## 1. Polis operasyonları 10.000 altın
- Tırlara polis operasyonu 50.000 → **10.000** altın (ücreti yine devlet öder).
- Polisin **bahisli savaşa operasyonu** da 50.000 → **10.000** altın (devlet öder). Daha önce 50.000'le başlamış operasyon iptal olursa iadesi yine 50.000.
- Çetelerin birbirine **sabotajı 50.000** olarak kaldı.

## 2. Futbol › Takımım › Menajer: Cezalı Menajerler
- Takım menajerliğe açıkken başkan, başvuruların altında **Cezalı Menajerler** listesini görür (bu sezon tekrar başvuramayanlar: istifa / üst üste yenilgi / hareketsizlik).
- Cezalı yoksa liste hiç görünmez.
- İsmin yanındaki **✕** → "Cezayı kaldır" onayı → Evet: oyuncu sezon bitmeden yeniden başvurabilir, ona SMS gider.
- Sadece başkan görür ve kullanır (sunucu da kontrol eder; takımda menajer varken kaldırılamaz).
- Yeni sunucu fonksiyonu: `unbanFutbolManager`. Liste, mevcut `listFutbolManagerApplications` cevabına eklendi (cezalı yoksa ek okuma yok).

## 3. Tır ele geçirme
- **Polis yakalarsa:** mallar imha edilir (depoya girmez), çetenin o tır için ödediği sipariş tutarı devlet kasasına geçer, tır çeteye döner. Çete kasasından ayrıca ceza **kesilmez** (eskiden mallar çeteye gidiyor + kasadan ceza kesiliyordu).
- **Çete yakalarsa:** değişmedi. Mallar ele geçiren çetenin deposuna, tır sahibine döner, para ödülü yok.
- Rehber › Polis Teşkilatı'na bir satır eklendi.

## 4. Çete › Ticaret › Sipariş ver / depo
- Sipariş paneli açılınca **bugün en çok bakiyesi kalan yol** seçili gelir (eşitlikte eski sıra).
- Arabalar ve silahlar galeri / silahçıdaki gibi **alt alta** listelenir (resim solda, bilgi ortada, adet sağda).
- Depodaki ürünler ve "2. ele koy" penceresi de aynı kart görünümünde (resimli).

## 5. Kafe & Bar: sağ üstte "−10 şüphe"
- Şartlar: bugün hak kullanılmadı + şüphe en az 10 + 2.000 altınlık çubuk dolu. Biri bile tutmazsa buton görünmez.
- Basınca şüphe hemen 10 düşer (Şüphe sekmesindeki hakla aynı, günde 1 kez).
- Günlük hak belgesi sadece şartlar sağlanınca dinlenir (ek Firestore okuması yok).

## 6. Park: sağ üstte "🕶️ Şüpheli adam"
- Basınca Şüpheli Adam paneli **hemen** açılır, avatar da yanına yürür.

## 7. Depolarda piyasa (silahçı / galerideki sistemin aynısı)
- Oyunun deposundan (Neon Liman Deposu) yasaklı madde **alınca** aslında oyuncu depolarından alınır. Para o deponun kasasına girer.
- Satan: **içinde mal olan** depoların en ucuzu. Malı olmayan depo en ucuz olsa da sayılmaz.
- Aynı fiyatta birden çok depo varsa **dünkü kazanç sırasında en altta olan** (sırası yoksa en alt sayılır) önce satar. Malı biterse aynı fiyattaki sıradakine geçilir.
- O fiyattaki depoların toplam malından fazlası istenirse "Bu fiyattan şu an en fazla X adet var" yazar. Panelde "Bu fiyattan satılan: X adet" görünür.
- Oyuncunun kendi deposu sayılmaz (kendi malını oyunun deposundan alamaz).
- İçinde mal olan oyuncu deposu yoksa oyunun deposu yine **2.250**'den sınırsız satar.
- Oyunun deposunun "Al" fiyatı (depo listesinde ve deponun içinde) bu piyasa fiyatını gösterir.
- Oyunun deposuna **satmak** değişmedi (1.500, sınırsız). Oyuncu depolarından doğrudan alış-satış değişmedi.
- Depo sahibi › Fiyatlar: **📈 Piyasa fiyatı** düğmesi (malı olan diğer depoların en ucuzu, yoksa 2.250). Basınca satış fiyatı ona ayarlanır.
- Veri: tek belge `shopOffers/depo` (silahçı / galerideki `shopOffers` gibi). Sadece malı olan depolar yazılır. İlk açılışta bir kez kurulur. Deponun içi ve depo listesi açıkken dinlenir.

## Yükleme
`deploy-v142.bat` çift tıkla. 3 grup: `unbanFutbolManager, listFutbolManagerApplications` · `gangAction, cronTick` (çete saati v138'den beri cronTick içinde) · `shopAction, houseAction`. Hepsi başarılıysa commit + push yapılır. 23:00–01:00 ve 17:45–19:15 arasında çalışmaz.

## Test
- Sunucu testleri: 548 / 548 geçti (5 yeni depo piyasası testi). Arayüz derlemesi (vite build) hatasız.
