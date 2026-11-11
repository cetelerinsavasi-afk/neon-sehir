# v154 · Faz 1 — Yolcu kamerası + otobüs kapasitesi

## Ne değişti
- **Otobüse 28 kişi binebiliyor** (eskiden şoför + 3). Sebep `database.rules.json`'daki koltuk sınırıydı (`rk` 1–3 → 1–29).
  Koltuk kapma kuralı zaten 29'a kadar izin veriyordu; sadece konum kaydı reddediliyordu.
- **İç kamerada aşağı bakınca asfalt görünmüyor:** kokpite halı taban, orta tünel, torpido altı ve
  kapıların alt kısmı eklendi (sürücü + yolcu). Arka kapı panelleri de eklendi.
- **Yolcu iç kamerası koltuğa göre ayrı:**
  - Arabada ön yolcu: sağ koltuktan, sürücünün ayrıntılı kokpitiyle (gösterge yolcuya da çalışır).
  - Arabada arka yolcu: iki ön koltuğun arasından, kokpitle.
  - Otobüs / minibüs / okul servisi: ön kapının yanında ayakta, ön camdan yola bakar.
  - Motor: sürücünün kafasının üstünden, biraz geriden.
  - Tır / ambulans / karavan: ön yolcu sürücünün aynası; arkadakiler kendi koltuğundan.
- **Otobüslerin içi modellendi:** koyu zemin, açık tavan, ışık şeritleri, sarı tutunma direkleri
  (eskiden içeriden zemin gövde boyası rengindeydi ve tavan görünmüyordu). Dışarıdan pencereden de daha doğru görünür.

## Dosyalar
- `database.rules.json` — tek satır: `rk` üst sınırı 3 → 29
- `src/components/City/cityEngine.js` — `passengerView()` + iç kamera yolcu dalı
- `src/components/City/cockpit.js` — taban, tünel, torpido altı, kapı alt panelleri, arka kapılar
- `src/components/City/vehicles.js` — otobüs iç kabuğu + `cabin` yükseklikleri
- `preview/city.html`, `preview/city-app.jsx` — SADECE önizleme (şehri sahte araçlarla açar; build'e girmez)

## Firestore / RTDB maliyeti
Yeni okuma/yazma/dinleyici yok. Kural değişikliği sadece daha büyük koltuk numarasına izin veriyor.

## Yayın
1. `firebase deploy --only database` (kural) — **önce bunu**, yoksa 4. yolcunun konumu yine reddedilir.
2. Web build + deploy (her zamanki gibi).
Sunucu fonksiyonları (`functions/`) değişmedi.

## Telefonda kontrol listesi
1. Arabada sürücü: iç kamera → aşağı bak → asfalt yerine koyu taban.
2. Arabada ön yolcu: iç kamera → kokpit görünüyor, yol görünüyor, aşağısı taban.
3. Arabada arka yolcu (4 kişilik araba, 3. kişi): ön koltukların arasından yol.
4. Otobüste 5+ kişi binsin → hepsi binebiliyor, herkes birbirini otobüste görüyor.
5. Otobüs yolcusu iç kamera: ön camdan yol; arkaya dönünce tavan, direkler, koltuklar.
6. Motor yolcusu iç kamera: sürücünün kafası ekranı kaplamıyor.
