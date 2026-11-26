# Binekten fırlama prototipi (motor, bisiklet, at, deve)

Sert çarpmada avatar bineğin üstünden fırlar, havada takla atar, yere düşüp kayar, durur ve kalkar.
Yavaş çarpmada hiçbir şey değişmez (şehirdeki gibi sadece sarsıntı + geri sekme).

v216 ile şehre bağlandı (bkz. `docs/v216-guncelleme.md`). Prototip test için duruyor.

## Çalıştırma

```
npm run preview:gangs
```
Tarayıcıda: `http://127.0.0.1:5199/firlama.html`

Klavye: W/S gaz-fren · A/D direksiyon · Space el freni · E bin / in · R başa dön · 1-7 binek ·
T ağır çekim · C kamera. Telefonda ekranda düğmeler çıkar.

Test paneli: binek seçimi, duvara sabit hızla otomatik sürüş (12–100 km/sa), "Yandan sürt 40"
(duvara 15° açıyla — fırlatmamalı), "Bariyer 45" (alçak bariyerin üstünden aşar), "Araba 50"
(park etmiş arabaya), fırlama sınırı sürgüleri, ağır çekim, kendiliğinden kalkma.

## Dosyalar

| Dosya | Ne |
|---|---|
| `src/components/City/riderEject.js` | Saf fonksiyonlar (Three.js yok): fırlama kararı, gövde fiziği, kol / bacak pozu, devrilen motor. |
| `tests/city/rider-eject.test.mjs` | `node --test tests/city/rider-eject.test.mjs` |
| `preview/firlama.html`, `preview/firlama-app.js` | 3D prototip: şehirdeki binek modelleri (`vehicles.js`), 3D avatar (`avatar3d.js`), çarpma (`carImpact.js`). |

## Ne zaman fırlar?

Sertlik = çarpma anında **duvara dik hız** (carImpact.js'in zaten hesapladığı kapanma hızı `vn`).
Böylece duvara sürtünerek geçmek fırlatmaz, aynı hızla dik çarpmak fırlatır.

| Binek | Sınır (dik hız) |
|---|---|
| Bisiklet | 30 km/sa |
| Deve | 33 km/sa |
| At | 38 km/sa |
| Motorlar (4'ü) | 42 km/sa |

(v216: ilk prototip değerlerinin 1,5 katı — orta hızdaki çarpmalar fırlatmasın.)

Değerler `EJECT_MIN` (m/sn) içinde; prototipte sürgülerle denenebilir. Araba / otobüs / tır hiç fırlatmaz.

## Nasıl çalışıyor?

- **Gövde**: 5 parçacıklı katı cisim (kalça, baş, iki omuz, göğüs), konum tabanlı dinamik (120 adım/sn).
  Yer çekimi, sekme, asfaltta sürtünme (μ 0,7), yerde yuvarlanırken enerji kaybı. Takla, duvara çarpıp
  dibine düşme, bariyerin üstünden aşma, arabanın tavanına düşme ayrıca kodlanmadı — fizikten çıkıyor.
- **Fırlatma**: sürücü bineğin çarpma ÖNCESİ hızını korur; üst gövde daha hızlı gittiği için öne takla
  atar, hıza göre yukarı fırlar. At / deve daha yüksekten ve daha çok takla ile (boynun üstünden).
- **Kollar / bacaklar**: havada çırpınır, yerde gevşer (Avatar3D eklemleri: omuz, dirsek, kalça, diz).
- **Binek**: motor / bisiklet sürücüsüz kalınca yana yatar ve kayarak durur; at / deve irkilip birkaç adım
  geri çekilir. Bineğin kendisi de engel: sürücü atın sırtına düşerse yana kayıp yere iner.
- **Kalkma**: durduktan ~1,4 sn sonra çömelerek doğrulur, yaya olur. Bineğe yürüyüp E ile biner
  (devrilen motor kaldırılır).
- 50 km/sa'te düz yerde toplam ≈ 16 m (≈ 12 m uçuş + kayma), 100 km/sa'te ≈ 35 m.

## Şehirde (v216)

`cityEngine.js › stepDrive` çarpmayı (`carImpactAt`) bulunca, sert ise `ejectRider` → `stepFall` çalışır;
sürücüsüz binek `stepLooseCar` ile kayar / geri çekilir. 3D avatar `Fig.update` içinde `me.rag` ile
fizik gövdesine yerleştirilir (`ragPlace`). Ağa yeni veri gitmez.
