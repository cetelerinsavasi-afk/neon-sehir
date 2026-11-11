# v154 · Faz 8-10 — Makineler, polis zaferi, motokurye

Firestore okuma/yazma sayısı artmadı (tek istisna aşağıda: makine alırken 1 sayım okuması).
Kurallar (rules) değişmedi.

## Faz 8 — Madde 15: malzeme makineleri (`functions/factoryMachineRules.js`, sunucu + istemci ortak)
- Günlük üretim 1,5 katı: tamir **1-3.000**, silah geliştirme **1-300**, araba geliştirme **1-60**.
- İşçisiz (sahip çalıştırınca, 00:00'da) verim 1/5 → **1/3**: tamir 1-1.000, silah 1-100, araba 1-20.
- Fiyat: her makine kendi türüyle yarışır — aynı türden elindeki her makine için **+1.000 altın**
  (vergi bu fiyattan hesaplanır). 10 tamir makinesi varken 11. = 60.000 + vergi; 1 araba geliştirme
  varken 2. = 51.000 + vergi. Mining kendi (kripto) kademesinde.
- Fabrika "Makine Al" penceresi fiyatı oyuncunun o türden makine sayısına göre gösterir; art arda
  alınca fiyat pencerede de artar. Fabrika değeri ödenen fiyatların toplamı.
- Maliyet: malzeme makinesi alırken o türün makineleri **sayılır** (1 sayım okuması; mining'de zaten vardı).
- Not: 2. el makine ilanlarının üst sınırı taban fiyatta (50.000) kaldı.

## Faz 9 — Madde 14: Cumartesi ticaret yolu savaşını Polis kazanırsa
- Devlet kasasına savaşta kullanılan **tüm gücün 1/10'u** kadar altın (10.000.000 güç → 1.000.000 altın;
  eskiden %5). Teşkilat günlüğünde "teşkilat sayesinde devlet kasasına +…" yazar.
- O ticaret yolu **3 hafta boşta** (kimse sipariş veremez); Çete › Ticaret'te
  "🚓 Polis kapattı · gg.aa'e kadar boşta" yazar.

## Faz 10 — Madde 8: Motokurye
- Şehre **herhangi bir motor** (Scooter, Cross, Chopper, Spor) çağırıp binince üstte **🛵 İşe başla**.
- Sipariş 6 seyyar satıcıdan rastgele birinden gelir (Kokoreççi, Balık Ekmekçi, Köfteci, Simitçi,
  Midyeci, Dondurmacı) → tezgâha git, dur (2 sn "hazırlanıyor") → motorun arkasına kırmızı kurye çantası
  takılır (diğer oyuncular da görür) → rastgele bir mekânın önüne götür (ev, banka, stadyum, karakol,
  hastane, taksi durağı… 21 yer, en az 70 m).
- Ücret: ortalama **500 altın**; mesafe uzadıkça artar (×0,6 – ×1,6), geciktikçe ve her çarpmada azalır
  (diğer mesleklerle aynı hız/hasar formülü). Günde **10 sipariş** (oyuncu başına, kaç motoru olursa olsun).
- Satıcı yerleri artık tek kaynakta (`functions/cityJobsData.js` VENDOR_SPOTS); şehir planı da bunu kullanır.
- Yarım kalan teslimat da oyun kapanınca kaldığı yerden sürer (Faz 5'teki kayıt).

## Test
- functions 584/584 ✓ (yeni: v154-machines, v154-kurye, polis zaferi) · tests/city ✓ · vite build ✓
- Önizleme: Scooter → İşe başla → Kokoreççi → çanta takıldı → Karakol'a teslim → +440 altın, sıradaki iş geldi.
