# v216 — Binekten fırlama (motor, bisiklet, at, deve)

Sadece site güncellenir. Sunucu fonksiyonları, Firestore / RTDB kuralları, indeksler ve oyuncu verisi değişmedi.

## Ne değişti
Motor, bisiklet, at ya da deveyle bir yere **sert** çarpınca avatar bineğin üstünden fırlar, havada takla
atar, yere düşüp kayar, durur ve ~1,5 sn sonra kalkar. Sonra bineğine yürüyüp normal şekilde biner
(devrilen motor / bisiklet binince kalkar). Yavaş çarpmada eskisi gibi sadece sarsıntı + geri sekme.

Sertlik = duvara **dik** hız. Duvara sürtünerek geçmek fırlatmaz.

| Binek | Fırlama sınırı (dik hız) |
|---|---|
| Bisiklet | 30 km/sa |
| Deve | 33 km/sa |
| At | 38 km/sa |
| Motorlar | 42 km/sa |

Araba, otobüs, tır, taksi vb. hiç fırlatmaz.

## Maliyet / akıcılık
- **Firestore: 0 ek okuma / yazma.** RTDB'ye de yeni alan yok: fırlarken ağa normal yaya konumu gider
  (diğer oyuncular seni düştüğün yere kayarken görür, uçuşu görmez).
- Hesap sadece fırlama sırasında (~3-5 sn) çalışır: 5 noktalı gövde, saniyede 120 küçük adım. Normal
  sürüşte ek iş yok (sadece çarpma anında bir karşılaştırma).

## Dosyalar
| Dosya | Ne |
|---|---|
| `src/components/City/riderEject.js` | Fizik (saf fonksiyonlar). Eşikler: `EJECT_MIN`. |
| `src/components/City/cityEngine.js` | `ejectRider`, `stepFall`, `stepLooseCar`, `ragPlace` (Fig), çağrılar `frame` / `stepDrive` içinde. |
| `tests/city/rider-eject.test.mjs` | `node --test tests/city/rider-eject.test.mjs` |
| `preview/firlama.html` | Prototip (eşikler oyunla aynı). |
| `v216-yayinla.bat` | Test → derle → commit → push → Cloudflare. Firebase'e dokunmaz. |

## Kontrol listesi
- [ ] Motorla duvara yavaş (≈ 20-30 km/sa) çarp: sadece sarsıntı, binekte kalıyorsun.
- [ ] Motorla duvara hızlı (60+ km/sa) çarp: fırlıyorsun, düşüyorsun, kalkıyorsun; motor yanında yatıyor.
- [ ] Motora yürü, "Bin": motor kalkıyor, sürüş normal.
- [ ] At / deve ile hızlı çarp: fırlıyorsun, at birkaç adım geri çekiliyor.
- [ ] Bisikletle 35+ km/sa'te çarp (yokuş aşağı): fırlıyorsun.
- [ ] Duvara yandan sürtünerek geç: fırlamıyorsun.
- [ ] Fırlarken başka oyuncunun ekranında: avatarın kayarak düştüğü yere gidiyor, takılma yok.
- [ ] Düşük grafik ayarında (kâğıt figür): fırlama çalışıyor, figür ayakta kayıyor (3D poz yok).

## v216.1 — düşünce tekrar tekrar fırlama hatası
Şehirde zemin düz değil (kaldırım, basamak, rampa, köprü). Fizik gövdesi zeminin altında kalan bir noktayı
tek adımda yukarı itiyordu; bu itme hıza dönüşüp gövdeyi tekrar fırlatıyordu (basamakta 9 m/sn'ye kadar).
Düzeltme (`riderEject.js`):
- Zemin altında kalan parçacık yavaşça çıkar (≤ 1,5 m/sn); sadece yukarıdan gelen parçacık zemine oturur.
- 0,4 m'den yüksek zemin farkı (köprü / rampa kenarı, yüksek basamak) duvar sayılır — oraya ışınlanma yok.
- Zemin bulunamazsa (su, boşluk) son bilinen zemin kullanılır.
- Çarpışma düzeltmeleri gövdeye enerji katamaz (hız sınırı).
Test: `rider-eject.test.mjs` › "basamak / kaldırım / köprü altı gövdeyi tekrar fırlatmaz".

## v216.2 — yere düşünce titreme
Avatar yere düşünce kalkmadan önce saniyelerce titriyordu. Sebep: "durdu" sayılmak için tam durgunluk
bekleniyordu; şehir zeminindeki santimlik pürüzler gövdeyi sürekli "havada" saydırıp bunu bozuyordu
(8 sn'lik yedek süre dolana kadar titreme). Ayrıca yere çarpınca kollarda bilerek konmuş bir sarsılma vardı.
- Yerde ve yavaşken hız hızla söner; ≈ 0,3 sn'de "durdu" sayılır ve gövde **donar** (artık hesaplanmaz).
- Zemine 3 cm'den yakın parçacık yerde sayılır; yere ilk değişten en geç 3,5 sn sonra kesin durur.
- Kollardaki darbe sarsılması kaldırıldı; yerdeyken görüntü yumuşatılır.
- Durunca ~0,5 sn sonra kalkar (eskiden 1,4 sn).
Test: "pürüzlü zeminde de kısa sürede durur ve donar".
