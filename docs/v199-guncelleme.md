# v199 güncellemesi

## Bu sürümde düzeltilenler

### Ev
- **Sonradan konan duvarlara duvar eşyası** (TV, tablo, raf, pencere, neon…): eski evdeki (v77) kural geri geldi. Duvar eşyası bölme duvarının iki yüzüne de takılır, oda duvarından daha yakınsa oraya oturur. Bölme taşınınca / döndürülünce üstündekiler onunla gider. Bölme kaldırılınca üstündekiler de kalkar; satın alınmışsa envantere döner. Sunucu da artık bölme yüzündeki duvar eşyasını kabul ediyor (`functions/homeGeometry.js` → `onDivider`, `checkPlacement(it, def, items)`).
- **Merdiven / 3. kata çıkamama**: kat değiştiren rota merdiven noktaları arasında düz çizgi çekiyordu ve mobilyayı hesaba katmıyordu. Merdiven başına ya da yoluna konan bir eşya avatarı takıyordu. Artık her kat içindeki yol 0,2 m ızgarada mobilyanın etrafından dolaşıyor (A*). Simülasyonda eski rota mobilyalı evde 0→2 ve 2→0'da takıldı, yenisi geçti.
- **Hayvan / bot**: Tasarla'da hem hayvan / bot hem platform görünüyor. Normalde sadece hayvan / bot görünüyor, platform görünmüyor.
- **Evde spor aleti** (boks torbası, koşu bandı, bench, dambıl): eski evdeki "💪 Serbest çalış" geri geldi. Güç kazandırmaz, sunucuya gitmez.
- Modern yemek takımı **oval** (tek ayaklı kaide, yuvarlak kabuk sandalyeler).
- **Büyük desensiz halılar**: 4×3 (20.000) ve 5×4 (30.000), 12 renk.
- Yatak odası (gardırop, şifonyer, komodin) kulp ve çerçeveleri **mat siyah**.

### Yayın
- Yayın açınca ana ekran yine **yayın kamerasından**, yani izleyicinin gördüğü açıdan görünüyor (eski evdeki `setFixedCamera`; şehir motoruna `setStreamCam` eklendi).
- Yayındayken başın üstünde **🔴 CANLI · 👁 n** rozeti var (eski `setLiveBadge`).

### Ekonomi
- **Motokurye**: brüt gelir 2 katı (ortalama 500 → 1.000). Brütün %10'u sipariş parası olarak malın alındığı seyyar satıcıya, yani o satıcının hissedarlarına gider. Belediyenin şoförlük vergisi kesilir, kalan kuryenin. Sipariş 6 satıcıdan rastgele geliyor; bu zaten öyleydi.
- **Motorlar** (scooter, cross, chopper, spor): araba ve silah gibi 10 gün ömür + 10 tamir. Tamir ücreti motor fiyatına oranlı (fiyat / 100 malzeme). Ömrü 10'dan fazla olan motorlar ilk 00:00'da 10'dan saymaya başlar, 10 ve altı aynı kalır. Bunun için ek okuma yapılmıyor: gece ömür düşürme zaten bütün araçları okuyor. Bisiklet / at / deve değişmedi (20 gün, tamirsiz).
- **Çete siparişi**: kaldırılan depo yüzünden sipariş ve sabotaj engelleniyordu ("Depoda yer yok"). Depo sınırı kalktı, "Depo al" düğmesi kaldırıldı. Sabotaj teklifi artık depoyu okumuyor (2 okuma daha az).

### Arayüz
- Fabrikalar listesi sıralama tablosu oldu: ilk 3 madalyalı, gelir sağda, gelir çubuğu var.
- Fabrika günlük raporunda "Net kâr" satırı kalktı; net kâr zaten başlıkta yazıyor.
- "✅ Bugünkü mesai bitti" yazısına basınca kayboluyor.
- Belediye: "Şoförlük" vergisinin yanındaki parantez kalktı. Ticaret Bakanlığı'ndan "Oyunun gazinosu" bölümü kaldırıldı.
- Modifiye garajı: Geliştir'de sadece geliştirilebilen araçlar, Tamir'de sadece tamir edilebilenler listeleniyor. Tır gibi geliştirilemeyen araçta seviye yazmıyor.

## Eski (v195) ↔ yeni karşılaştırma: dönüşümde kaybolanlar

Bulgu: v196'da mekânlar ve evler şehre taşındı. Eski "ev ekranı" (`HouseScreen` + `houseEngine`) yeni şehir motoruna parça parça aktarıldı. Bir özellik aktarılmadıysa sessizce kayboldu: hata vermiyor, sadece yok. Aşağıdaki liste eski ev ekranının bütün eylem ve panellerinin tek tek şehirde karşılığı aranarak çıkarıldı.

| Eski özellik | Durum |
|---|---|
| Koltuğa / yatağa oturma | var |
| Işık / TV / şömine aç-kapat, buzdolabından ürün al | v198'de geldi |
| Piyano / davul, mikser / tuval | v198'de geldi |
| Oyun cihazında oyna, oyuncu koltuğunda yayın | var |
| Spor aletinde serbest çalışma | **v199'da geldi** |
| Bölme duvarına duvar eşyası | **v199'da geldi** |
| Yayında yayın kamerası açısı + CANLI rozeti | **v199'da geldi** |
| Hayvan / bot | v198'de geldi (gezinmiyorlar, yerlerinde duruyorlar) |
| **Müzik kutusu** (evdeki herkes aynı şarkıyı duyar) | yok: şehirde müzik kutusuna dokununca bir şey olmuyor |
| **Yayında "Oyna" menüsü**: oyun salonu + yarış + gazino | sadece oyun salonu var |
| **Yayında oda sohbeti** (yakındakilerin mesajları yayın sohbetine düşer) | yok |
| **"Bu odada yayın var" uyarısı + "Yayında görünme"** | yok (izleyici tarafı `noStream`'i hâlâ dikkate alıyor ama şehirde açacak düğme yok) |
| Ev gizliliği: herkese açık / arkadaşlar / gizli | sadece açık / kilitli |
| Arkadaşlara tasarım yetkisi (editörler) | yok |

Kalan maddeler ayrı birer iş: müzik kutusu ve yayın menüsü hem sunucu hem istemci gerektiriyor. Gizlilik ve editörler v196'da bilerek mi kaldırıldı, belli değil; karar senin.
