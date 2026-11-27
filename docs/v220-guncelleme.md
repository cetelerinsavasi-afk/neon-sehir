# v220 — Park, pazar, La Marea, görünüm dükkânları, spor salonu 2. kat, çökme / kasma düzeltmeleri

## 1. Aktivite parkı
- Futbol topu (yarıçap 0,11 → 0,20 m) ve basket topu (0,12 → 0,19 m) büyüdü. Pota çemberi de büyüdü (0,23 → 0,32 m); vuruş / topu alma mesafeleri buna göre arttı.
- **Telefonda basket topu ve helikopter düğmeleri çalışmıyordu**: düğmeler sahnenin (`.hs-stage`) içinde, telefonda orada
  `touchstart` iptal edildiği için `click` hiç oluşmuyordu. Düğmeler artık pointer olaylarıyla çalışıyor (`cityExtras.js › onTap`).
- Düğmelerdeki klavye harfleri kalktı ("· F", "· G"). Bilgisayarda F / G tuşları çalışmaya devam ediyor. Helikopter bilgi kutusu telefonda taşmıyor, "Space" yerine "YÜKSEL" yazıyor.
- **Halı saha ve basket sahasına sadece kapıdan girilir**: çit engeli 16 cm kalınlığındaydı, 0,5 m'lik yürüme ızgarasının hücre merkezlerine denk gelmediği için içinden geçiliyordu. Engel en az 0,6 m kalın.
- "🚲 BİSİKLET YOLU" tabelası kaldırıldı.

## 2. Pazar
- Pazarcılar tezgâhlarının başında **sabit** ve tezgâha dönük duruyor (dolaşmıyorlar).
- Gezen müşteri sayısı yarıya indi.
- Kasma / atma: şehirde aynı anda çizilen NPC sayısı sınırlı — telefonda en yakın **16** (40 m içinde), bilgisayarda 40 (liste 0,4 sn'de bir yenilenir).
  Uzun süre görünmeyen NPC'nin dokusu ve 3D modeli bırakılıyor (telefonda 20 sn, bilgisayarda 90 sn), tekrar görülünce yeniden çiziliyor.

## 3. La Marea
- Girişteki kırmızı ipli bariyerler yola paralel (eskiden yan duruyordu).
- "🎁 Ismarla" düğmesi kalktı; restoranda üstteki **"N kişi yakında"** düğmesi ısmarlama panelini açıyor.
- Piyanist Elif kaldırıldı.

## 4. Görünüm
- Avatar dik duruyor (boyun öne eğik, kafa öne kaymıştı → kambur görünüyordu).
- **Pardösü** 3D'de gerçek bir etek gibi kalçadan dizin altına iniyor (eskiden palto eteği bacaklara boyanıyor, ceket gibi duruyordu). Otururken etek gizleniyor.
- Dükkân tabelaları kuşağın önünde, koyu zeminli bir pano (eskiden cepheye 2 cm, kuşaktan taşan saydam yazıydı → titreme / kesik görünüm).
- **Kostümcü** artık diğer dükkânlar gibi soldaki küçük panel (tüm ekranı kaplamıyor): kategori sekmeleri, kostüm kartları, dokununca üstünde denenir, satın al / kuşan / çıkar. Ayrı tam ekran 3D önizleme açılmıyor (ek WebGL bağlamı da yok).
- Mini haritada dükkânlar sokağında **MAĞAZALAR** yazıyor.

## 5. Yürüme
- Sol ortadaki hızlı koş düğmesi kalktı; avatar her zaman hızlı yürüyor.

## 6. Yatak, spor salonu 2. kat
- **Yataklara uzanılır** (tek / çift kişilik yatak; evde ve şehirde). "🛏️ Uzan" / "🚶 Kalk". Uzanan başka oyuncular da uzanmış görünür (konum kaydında `lz`).
- Jakuzi kaldırıldı.
- **Havuza girilir** (2. kattaki su; alt kattakiler etkilenmez). Havuz biraz daraldı, sauna artık havuzun içinde değil.
- **Şezlonglara oturulur.**
- **Saunaya kapısından girilir** (cam kapı açık geçit oldu), içerideki alt basamağa oturulur.

## 7. İnternet kafe
- Bilgisayar istasyonu başına tek bilgisayar (eskiden 2 ekran + 2 kasa vardı, koltuk 1'di).
- Cam cepheye asılı kalan dart, grafiti ve menü panosu yan duvarlara; duvardan taşan neonlar, atari makineleri, buzdolabı, saksı içeri alındı.

## 8. Yayın
- Yayın açınca ekran donuyor, yayıncı kendini göremiyordu: yayın kamerası aynı türden **ilk** mekânı alıyordu (şehir dışındaki eş mekân). Artık içinde olunan mekân, yoksa şehirdeki asıl mekân kullanılıyor.

## 9. Çökme / kasma / maliyet
- **RTDB kuralı düzeltmesi**: evin içindeyken konum kaydı (`hm`, `y`) kurallarda yoktu → her yazım reddediliyor, 6 hatadan sonra şehir 20 sn "çevrimdışı" oluyordu. `hm`, `y`, `lz` eklendi.
- Telefonda kullanılmayan avatar dokuları 60 sn yerine 25 sn sonra bırakılıyor.
- Uygulama arka plandayken Firestore ağı 90 sn yerine **45 sn** sonra duraklıyor (boşuna okuma azalır).
- Geçici okuma ölçümü bittiği için (27 Kasım) `firebase/firestore` sarmalayıcısı derlemeden çıkarıldı (biraz daha küçük paket).
- Zorunlu güncelleme sürümü 220 (`forceUpdate.js › BUILD`, `public/neon-flags.json › minBuild`).

## Yayın
`v220-yayinla.bat`: testler, derleme, **RTDB kuralları**, commit, push, Cloudflare. Fonksiyonlar ve Firestore kuralları değişmedi.
