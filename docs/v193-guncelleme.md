# v193 — Gerçekçi çarpma + havada süzülme, sohbet, tır fotoğrafı, sade borsa kuralı

v191 ve v192'yi de İÇERİR (ayrıca yükleme). Ayrıntılar: docs/v191-akicilik.md, docs/v192-guncelleme.md.
Firebase'e yüklenen: `borsaAction`, `cronTick` (borsa) ve `cityAction` (şehir fotoğrafı — dorse açısı).
Realtime Database / Firestore kuralları DEĞİŞMEDİ. Firestore okuma / yazma artmaz.

## 1. Gerçekçi çarpma (tüm araçlar) — `src/components/City/carImpact.js`
"Dublör Parkuru" (v187) prototipinin yöntemi şehrin araba modeline uyarlandı (ağ / kamera / dorse /
meslekler aynı kaldı):
- Çarpınca temas noktası ve yüzeyin yönü bulunur, prototipteki gibi itki uygulanır: önden çarpınca araba
  hızının ~%27'siyle geri seker (otobüs / tır daha az, motor biraz daha), köşeden / yandan çarpınca kendi
  etrafında döner, duvar boyunca sürtünerek kayar.
- Gövde sarsılır: önden çarpınca burun dalar, yandan çarpınca yana yatar, süspansiyon çöküp toparlanır.
- Sert çarpmada kıvılcım (+ toz), duvara sürtünürken kıvılcım; kamera sarsıntısı ve ses çarpmanın
  sertliğine göre.
- 💥 yazısı kalktı; yerine kısa bir ekran kenarı kızarması (sertliğe göre).
- Meslekteki "çarptın" cezası artık duvara doğru çarpma hızına göre: duvara hafifçe sürtmek ceza değil.

## 2. Havada süzülme
- Burun gidiş yönüne döner: rampadan çıkarken yukarı, inerken aşağı (eskiden hep aynı açıyla düşüyordu).
- Rampa burnu döndürerek çıkardıysa araba havada dönmeye devam eder (yatış da).
- Havada kontrol (prototipteki gibi): gaz burnu indirir, fren kaldırır, direksiyon yatırır. Sadece havada
  bırakıp yeniden basınca sayılır (rampaya gazla giren burnunu yere gömmesin).
- İniş: süspansiyon çöker, sallanıp durur. Açılı inince gövde seker ve hız biraz düşer; sert inişte
  altından kıvılcım.
- Diğer oyuncular gövde açısını görmez (ağa yeni veri eklenmedi → RTDB maliyeti artmaz); sadece konum.

## 3. Sohbet büyütülünce en altta açılır
Sol alttaki sohbete dokunup büyütünce (ve yeni mesaj gelince) en yeni mesajlar görünür.

## 4. Tır fotoğrafı
Fotoğrafta dorse hep düz çiziliyordu (tır tek parça kamyon gibi görünüyordu). Artık dorsenin açısı da
fotoğrafa girer (`th`, sadece görüntü). Sunucu: `functions/cityPhoto.js` (cityAction yeniden yüklenir).

## 5. Borsa — sade kural (v192'deki günlük bant YAYINA ÇIKMADAN kaldırıldı)
- **Satış her zaman serbest.**
- **Alım sınırı** (kişi başı, mekân başı): toplam satılmış hisse 100'e kadar 10 hisse; sonra satılmış
  hissenin 10'da 1'i. Kendi alımın da toplamı artırır (200 satılmışken boştan ~22 alınır). Günlük sınır yok.
- Başkaları satınca sınırın üstünde kalırsan yeni alım yapamazsın, satabilirsin.
- "Senin hissen": `12,5 / 22,2` (elindeki / sınırın). Sınır dolunca düğmede sadece "Alım sınırı".
- Uzun notlar kalktı; hata yazıları kısa ("Alım sınırı", "Yetersiz altın", "Fiyat değişti", "Çok hızlı").
- Düğmeye bastıkça telefonun üstündeki altın hemen azalır / artar (sunucu cevabı beklenmez).
- "‹ Borsa / ‹ mekân" geri şeridi aşağı kaydırınca da üstte kalır.
- Sunucu: `functions/borsa.js` (capOf, buyRoom). Test: `functions/scripts/borsa.test.mjs`.

## Kontrol listesi (yayından sonra)
- [ ] Duvara önden çarp: araba geri sekiyor, burun dalıp toparlanıyor, kıvılcım, ekran kenarı kızarıyor.
- [ ] Duvara açılı çarp: araba dönüyor; duvara sürterek geç: kayıyor, kıvılcım.
- [ ] Otobüs / tır daha az sekiyor; motor / at / bisiklet normal.
- [ ] Rampadan / tepeden uç: burun yörüngeyi izliyor, inişte süspansiyon çöküp toparlanıyor.
- [ ] Havada gaz bırak-bas → burun iniyor; fren → kalkıyor; direksiyon → yatıyor.
- [ ] Sohbete dokun: en yeni mesajlar görünüyor.
- [ ] Tırla dönerken fotoğraf çek: dorse açılı.
- [ ] Borsa: 10 hisse al → "Alım sınırı"; "Senin hissen 10 / 10"; satış serbest.
- [ ] Düğmeye art arda bas: üstteki altın hemen düşüyor.
- [ ] Borsa detayında aşağı kaydır: "‹ mekân" şeridi üstte kalıyor.

Geri dönüş: `_v193\geri-al-v193.bat`.
