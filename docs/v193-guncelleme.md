# v193 — Gerçekçi çarpma + havada süzülme, sohbet, tır fotoğrafı, borsa 1 milyon sınırı

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

## 5. Borsa: günlük bant = 10 hisse YA DA 1.000.000 altınlık hisse (hangisi azsa)
Günün ilk işlemindeki fiyatla bir kez hesaplanır, gün boyu sabit kalır (fiyat oynadıkça hak değişmez).
Örnek: hisse 250.000 altınsa o gün ±~4 hisse. Bugünkü fiyatlarda (≤ 100.000) fark yok: 10 hisse.

## Kontrol listesi (yayından sonra)
- [ ] Duvara önden çarp: araba geri sekiyor, burun dalıp toparlanıyor, kıvılcım, ekran kenarı kızarıyor.
- [ ] Duvara açılı çarp: araba dönüyor; duvara sürterek geç: kayıyor, kıvılcım.
- [ ] Otobüs / tır daha az sekiyor; motor / at / bisiklet normal.
- [ ] Rampadan / tepeden uç: burun yörüngeyi izliyor, inişte süspansiyon çöküp toparlanıyor.
- [ ] Havada gaz bırak-bas → burun iniyor; fren → kalkıyor; direksiyon → yatıyor.
- [ ] Sohbete dokun: en yeni mesajlar görünüyor.
- [ ] Tırla dönerken fotoğraf çek: dorse açılı.
- [ ] Borsa detayında "günde 10 hisse ya da 1.000.000 altınlık hisse" notu.

Geri dönüş: `_v193\geri-al-v193.bat`.
