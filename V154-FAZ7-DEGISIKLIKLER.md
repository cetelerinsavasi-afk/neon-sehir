# v154 · Faz 7 — Fotoğraf düzeltmeleri, maç seçici, çete yazısı

Firestore okuma/yazma sayısı DEĞİŞMEDİ. Kurallar (rules) değişmedi.

## Madde 5 — Araba fotoğrafı
- **Ters dönük araba:** arabanın yönü (yaw) sürüş boyunca sınırsız büyüyordu; sunucu ±50'yi aşan yönü 0
  sayınca fotoğrafta araba başka yöne bakıyordu. Artık yön her karede (-π, π] aralığına sarılıyor
  (`cityEngine.js`), fotoğraf da sarılmış yönü gönderiyor; sunucu da eski istemcilerden gelen büyük
  değeri 0 yerine doğru yöne sarıyor (`functions/cityPhoto.js`).
  Yan fayda: çok uzun sürüşte yön RTDB kuralını (±1000) aşıp arabanın diğer oyunculara yayını kesiliyordu — o da bitti.
- **Giderken çekince arabadan düşme:** sunucu, kareyi RTDB'deki son kayıtla karşılaştırırken sabit 25 m pay
  tanıyordu; hızlı giden arabada kayıt geride kalınca araba (ve içindekiler) fotoğraftan atılıyor,
  oyuncu yolda ayakta çıkıyordu. Artık kayıttaki hıza göre en çok +45 m pay var; araçtaki şoför ve
  yolcular da aynı payı alıyor. Duran arabada pay yok (sahte konum yine reddedilir).

## Madde 11 — Maç fotoğrafında futbolcular
- Deklanşör anındaki 12 futbolcu + hakem + top fotoğrafa ekleniyor (`fb`). Sunucu bu veriyi temizler
  (en çok 12 oyuncu, kameradan 160 m içinde, renkler #rrggbb) ve imzalı kareye koyar.
- Sixtagram'daki fotoğraf motoru futbolcuları aynı forma renkleriyle çizer; canlı ekrandaki maç,
  fotoğraf karesi çizilirken gizlenir (fotoğraftaki an çizilir).

## Madde 12 — Maç seçicide takım adları
- Stadyumdaki üst seçici: ilk kelime tam, diğerleri baş harf → **Anadolu Y. vs Boğa S.**

## Madde 13 — Çete
- Zümrüt satırındaki "· karargah mobilyası için" yazısı kaldırıldı.

## Test
- `vite build` ✓ · functions testleri 578/578 ✓ (3 yeni fotoğraf testi) · tests/city ✓
- Önizleme: sürerken fotoğraf (araba + şoför yerinde, sürüş devam ediyor), maç sırasında fotoğraf
  (futbolcular hikâye önizlemesinde görünüyor).
- Not: `functions/cityPhoto.js` değişti → **functions deploy gerekir** (cityAction).
