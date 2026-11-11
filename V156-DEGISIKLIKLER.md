# v156 — Akıcı soygun videosu + Benzinlik (benzin + market)

## 1) Soygun videosu
- "Soygun yap"a basınca araya giren "Neon Şehir" başlık ekranı / takılma: mekânın içi video
  başlamadan önce **ısıtılıyor** (shader derleme + görünmez bir kare çizim). Kapıdaki
  2–3 sn'lik kararma ölçümde 5,8 sn → ~2 sn'ye indi; yerine kısa bir giriş animasyonu var.
- Kapıda kararma 0,1 sn'lik yumuşak geçişe indi; avatar içeride **kapının önünde değil,
  içeride** başlıyor (kapıda ikinci kez görünmüyor).
- Sonuç ekranı: **Kapat** ve **Tekrar izle** düğmeleri en üst katmanda; dokunuş (pointerup)
  ve tıklama ikisi de çalışır, tek sefer tetiklenir. Tekrar izle başlatılamazsa ekran kapanır.
- Sağ alttaki çirkin "Geç ⏭ / X" düğmesi kaldırıldı (yalnızca haraç videosunda, sağ üstte).

## 2) Benzinlik
- Arabayla pompaların yanına gelince sürüş düğmelerinde **⛽ Benzin al · 100** çıkar.
  Basınca 1,6 sn dolum animasyonu → "⛽ Depo full!". **Sadece RP**, hiçbir şeye etki etmez.
- Benzinlik marketi gerçek market gibi: cam vitrin, kapı, 4 içecek dolabı, 4 raf, bantlı kasa,
  bitki, ışık ve kasiyer **Selin**. Kapıda **🛒 Market** düğmesi → menü:
  Kola 60 · Cips 50 · Çikolata 50 · Bisküvi 40 · Enerji içeceği 80 · Su 20 · Meyve suyu 50.
  Alınan ürün 2 dk elde kalır (yakındakine ısmarlanabilir) — seyyar satıcıyla aynı sistem.
- Gelir devlete: Belediye → Bakanlıklar → **Benzinlik** satırı (Ticaret Bakanlığı).

## Sunucu
- Yeni dosya `functions/gasStation.js`; `cityAction` içine `fuelBuy` / `marketBuy` işlemleri.
- Firestore: alış başına 1 kullanıcı okuma + kullanıcı/devlet defteri yazımı (markette + eldeki ürün)
  — seyyar satıcı alışverişiyle aynı. Yeni dinleyici, yeni koleksiyon, kural/indeks değişikliği YOK.
- Yüklenen fonksiyonlar: `cityAction`, `belediyeAction`, `getStateReport` (rapor etiketi).
- Test: `functions/scripts/v156-gas.test.mjs` (para düşer, yetersiz altında hiçbir şey yazılmaz).
