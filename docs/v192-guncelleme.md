# v192 — Borsa günlük bant, direksiyon, tır görevinde kasma, RTDB maliyeti, misafir ekranı

v191'i (kalabalıkta kasma, harita açıkken atma, takılma kaydı) de İÇERİR — v191'i ayrıca yüklemene gerek yok.
Firebase'e yüklenen: `borsaAction` + `cronTick` fonksiyonları (borsa). Realtime Database / Firestore
kuralları DEĞİŞMEDİ. Oyuncu verisi bozulmaz (borsa belgesine iki yeni alan eklenir: dk, d0).

## 1. Neon Borsa — sınırsız hisse, günlük ±10
- Kişi başı 20 hisse sınırı kalktı.
- Her mekânda günün ilk işlemindeki (= 00:00'daki) hisse sayısı esastır; gün içinde hissen esas ±10
  arasında serbestçe alınıp satılır. Örnek: 00:00'da Köfteci 10 → gün içinde 0–20 arası istediğin
  kadar al-sat. Bugün 20'ye çıkar → yarın 10–30.
- "Senin hissen" artık `10 / 20` değil `10` (küsuratlıysa `10,5`).
- Detayda "Bugünkü hakkın: X al · Y sat" notu. Hak bitince düğme "Bugünkü alım/satış hakkı doldu ·
  00:00'da yenilenir".
- Hepsini sat (mekânda / tüm mekânlar) bugünkü satış hakkı kadar satar ("Satabildiğin kadar sat").
- 20 gün kuralı ve hesap silmedeki satışlar banda tabi değil (aynen).
- Sunucu: `functions/borsa.js` (dayRoom, withDay, borsaDayKey). Test: `functions/scripts/borsa.test.mjs`.
- `public/neon-flags.json` minBuild 192 → eski sürümdeki oyuncu boştayken sayfa yenilenir (eski ekran
  hâlâ "/20" gösterirdi).

## 2. Direksiyon
v185'te hızlanınca direksiyon fazla ağırlaşmıştı. 108 km/sa'te tam dönüş ~62 → ~78 °/sn, direksiyonun
tam kırılma süresi ~1,0 → ~0,75 sn. (v184'te 160 °/sn idi — o kadar hassas değil.) Yavaşken aynı.

## 3. Tır görevinde kasma / pikselleşme / atma
Görev sürerken iş koşturucusu her 100 ms'de yeni bir durum gönderiyordu → koca şehir ekranı saniyede
10 kez baştan çiziliyordu. Telefon zorlandıkça oyun çözünürlüğü / kaliteyi düşürüyordu (pikselleşme).
Artık sadece ekranda görünen bir şey değişince (yazı, çubuk, pusula 6°, mesafe 5 m) ve en sık ~4 kez/sn.
Test: `tests/city/job-ui-rate.test.mjs` (eski kod: 3 sn'de 30 güncelleme).
Tırı art arda çağırmakta sızıntı yok (ölçüldü: doku / geometri sayısı sabit).

## 4. RTDB indirme maliyeti (100 kişiye hazırlık)
- Kalabalıkta yazım aralığı uzar: çevrende ≤15 kişi → aynı; 16–30 → ×1,5; 31–60 → ×2; 60+ → ×3
  (arabada en çok ×2). Alıcı ara değer gecikmesini kayıt aralığına göre uzatır (akıcı kalır).
- Arabadayken kişi kaydı 3 sn'de bir (konumu araba kaydı taşır; eskiden ikisi de saniyede ~4,5 kez).
- Araba kaydı hücre içinde sadece değişen alanlarla güncellenir: modifiye JSON'u (≤700 bayt) artık her
  konumda gitmez.
- Sahte RTDB ölçümü (herkes 30×30 m'de, %30'u modifiyeli arabada): 10 kişi 0,33 → 0,16 GB/sa ·
  30 kişi 2,9 → 1,1 GB/sa · 100 kişi 28,9 → 9,4 GB/sa. Gerçekte oyuncular dağınık olduğu için çok daha az.
  Test: `tests/city/city-net-load.test.mjs`.

## 5. Misafir ekranı
- İlk girişte (cihaz başına bir kez) karşılama kartı: oyunu 4 satırda anlatır, "Google ile giriş yap" /
  "Önce şehri gezeyim". Gezmeyi seçene haritadan ışınlanma ipucu.
- Üst çubukta her an "Giriş yap" düğmesi; misafirin etiketi "Oyuncu" değil "Misafir".
- Giriş kartının altında "Giriş yapınca" ne açılacağı listesi.
- Misafir diğer oyuncuları SADECE İZLEYEBİLİR hale getirildi (hiçbir şey yazmaz, sohbet dinlemez) —
  ama bunun çalışması için RTDB kuralında city/p, city/c, city/u'nun girişsiz okunması gerekir.
  Bu sürümde kural DEĞİŞTİRİLMEDİ: misafir şimdilik eskisi gibi boş şehir görür (hata çıkmaz).
  Kural değişikliği istenirse ayrıca yapılır.

## Kontrol listesi (yayından sonra)
- [ ] Borsa: bir mekânda 10 hisse al → "Bugünkü alım hakkı doldu"; sat → tekrar alabiliyorsun.
- [ ] "Senin hissen" sadece sayı (x/20 yok).
- [ ] Hisselerim › Hepsini sat: bugünkü hak kadar satıyor.
- [ ] 120+ km/sa'te sağa sola dönüş rahat ama savrulmuyor.
- [ ] Tır görevini art arda 4-5 kez yap: kasma / pikselleşme yok (gerekirse neon.hitch ile kayıt).
- [ ] Arabayla gezerken diğer ekranda araba akıcı ve modifiyesi duruyor.
- [ ] Çıkış yapıp misafir gir: karşılama kartı bir kez çıkıyor, üstte "Giriş yap" düğmesi, etiket "Misafir".

Geri dönüş: `_v192\geri-al-v192.bat` (borsa sunucusu da eskiye dönsün istenirse Claude'a sor: yeni
alanlar eski kodda zararsızdır, yok sayılır).
