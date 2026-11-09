# v151 — Neon Şehir

v149 ve v150'nin üstüne. Paket ikisini de içerir: yüklemediysen hepsi birlikte gider.

## 1) Haritaya yeni yapılar
- **2 lojistik deposu**, şehrin dış bölgesinde. İkisi de limandan uzak (≈ 210 m), birbirinden de uzak (≈ 340 m).
  - **Kuzey Lojistik Deposu:** sol üst köşe.
  - **Doğu Lojistik Deposu:** sağ alt, sahile yakın.
  - Önlerinde sarı **TESLİM** alanı var. Limanın rıhtımında da sarı **YÜKLEME** alanı var.
- **Benzinlik** (Banka'nın yanında): kanopi, pompalar, 7/24 market.
- **10 otobüs durağı**, iç halka yolu boyunca saat yönünde:
  1. Karakol
  2. Banka
  3. Spor Salonu
  4. Belediye
  5. Stadyum
  6. Evler
  7. Plaza
  8. Liman
  9. Casino
  10. Camii
  - Duraklar şehir tarafında (sağ şerit). Camlı sundurma, bank ve "DURAK n" levhası var; yolda sarı otobüs çizgisi var.
- **Hastane (acil girişi)** sağ dış bölgede. Ambulansın hastayı teslim edeceği bir yer gerektiği için eklendi.

## 2) Galeri: Araba · Ticari · Motor
- Oyunun galerisinde, oyuncu galerilerinin vitrininde ve galericinin stok/fiyat ekranlarında 3 sekme var.
- Arabalar aynı kaldı. Ticari araçlar:

  | Araç | Fiyat (altın) |
  |---|---|
  | Tır | 500.000 |
  | Otobüs | 200.000 |
  | Taksi | 100.000 |
  | Polis | 400.000 |
  | Ambulans | 300.000 |

- Motorlar (mobilyadaki 4 motor):

  | Motor | Fiyat (altın) |
  |---|---|
  | Scooter | 15.000 |
  | Cross | 35.000 |
  | Chopper | 60.000 |
  | Spor | 95.000 |

- Ticari araçlar ve motorlar:
  - Şehirde sürülür.
  - Ömür 20 gün; **tamir ve geliştirme yok** (atölyede yazar, sunucu da reddeder). 2. el değeri kalan ömre göre.
  - **Modifiye var**, her türün kendi sekmeleri ile:
    - Tır: dorse tipi/rengi, firma adı, çekici boyası, jant, aksesuar (korna, baca, LED bar…), plaka.
    - Otobüs: tip (şehir / minibüs / okul / turistik), boya + şerit, güzergâh tabelası, jant, aksesuar.
    - Taksi: tip (sarı / turkuaz / VIP), cam filmi, jant, gövde, ışık.
    - Polis: tip (polis / sivil / pickup), jant, gövde.
    - Ambulans: tip (panelvan / acil müdahale), jant.
    - Motor: boya, yüzey, neon.
  - Fiyatlar arabalardaki gibi aracın fiyatına göre (ör. tırın dorse tipi %3 = 15.000, plaka %5 = 25.000).
  - 2. elde satılır (ilan / anında satış), ilanda modifiyeli görünür.
  - Yarışa ve şampiyonaya girmez.

## 3) Meslekler — "İşe başla"
Ticari aracını garajdan çağırıp binince üstte **💼 İşe başla** çıkar. Basmadan da gezebilirsin; arkadaşların binebilir ama sadece aracın sahibi kazanır.

Basınca işler art arda gelir: günlük hak dolana ya da **İşi bırak**'a basana kadar. Bırakılan iş hakkı harcamaz.

Hedef yerde ışık sütunu ve mesafe etiketi var. Panelde hedefe dönük ok ve mesafe görünür.

| Meslek | Günlük hak | Ortalama kazanç | Nasıl |
|---|---|---|---|
| 🚛 Tır | 10 sevkiyat | ≈ 5.000 | Limanın YÜKLEME alanında dur (4 sn), şansına hangi depo düşerse oraya götür, TESLİM'de dur (3 sn) |
| 🚌 Otobüs | 2 sefer | ≈ 10.000 | En yakın duraktan başlar, 10 durağı sırayla gez. Her durakta dur: kapılar 3 sn, yolcular iner/biner |
| 🚕 Taksi | 10 yolcu | ≈ 1.000 | El sallayan müşterinin yanında dur, varış noktasına götür |
| 🚓 Polis | 10 görev | ≈ 4.000 | Kaçan şüpheliyi kovala (yanında 3 sn kal) ya da 3 noktalık devriye |
| 🚑 Ambulans | 10 hasta | ≈ 3.000 | Vaka yerine git (sedyeye alma 3 sn), hastanenin ACİL alanına götür (3 sn) |

- **Haklar oyuncu bazlı:** 10 tırın olsa da günde toplam 10 sevkiyat.
- **Kazanç:**
  - Hedef süreye göre hızlıysan artar (en çok ×1,35), yavaşsan düşer (en az ×0,6).
  - Her çarpma (> 18 km/s) %7 düşürür (en çok %50).
  - Borcun varsa önce borca gider.
- **Hile koruması:**
  - İşi ve hedefi sunucu seçer.
  - İş, mesafeye göre mümkün olan en kısa süreden önce bitirilemez.
  - Ödeme sunucuda hesaplanır.
- **Botlar sadece şoföre görünür:** duraktaki yolcular, taksi müşterisi, yerdeki hasta, şüpheli araç.
- Diğer oyuncular aracın **işte** hâlini görür: tepe lambaları yanıp söner, içinde o an taşınan kadar yolcu oturur. Bu, araç kaydında tek bir sayı (`j`).
- Oyuncular taksiye ve otobüse **ücretsiz biner** (otobüste 27 yolcu koltuğu).
- Firestore: iş başına 2 yazma (başla + bitir). Şehirdeki hareket ve botlar Realtime Database'de ya da yalnızca cihazda.

## 4) Diğer
- **Oyunun modifiye garajında** yapılan modifiyenin parası (vergisi kesilerek) **dünün en az kazanan modifiyecisine** gider.
  - Kendi dükkânın atlanır.
  - Hiç oyuncu modifiyecisi yoksa para eskisi gibi oyuna gider.
  - Liste günde bir kez okunur (`gameVenues/modifiye.least`).
- **Araç içi kamera:**
  - Göz hizası yeniden ayarlandı; torpido ekranı kaplamıyor, ufuk ve yol görünüyor.
  - Kapalı arabalarda koyu tavan döşemesi var.
  - Kabin içi ışık eklendi.
  - Başın ataleti var: dönüşlerde yumuşak takip, viraja bakış. Gövdenin yatışı kameraya yansır. Hızla birlikte görüş açısı genişler.
  - Uzun araçlarda (otobüs, dorseli tır) dış kamera aracın arkasında durur.
- **Araç kareleri** eski resimlerdeki gibi kare, ön 3/4 açıdan, araç kareyi dolduracak şekilde.
- **Stadyum:**
  - Tribünde ayaktayken ve koltukta otururken artık ense görünüyor (sahaya dönük). Fotoğrafta da öyle.
  - Tribündeki kamera biraz daha geride, avatar ekranı kaplamıyor.
  - Stadyuma dokununca güney tünelinin içinde doğuluyor; Futbol düğmesi hemen çıkıyor.
- **Şehir sohbeti:** mesajlara dokununca diğer mekânlardaki gibi sohbet geçmişi açılır (son 80 mesaj). Şikâyet, açık sohbette mesajın yanındaki ⚠️ ile yapılır.

## Teknik
- Yeni dosyalar:
  - `functions/vehicleKinds.js`: türler ve meslekler.
  - `functions/cityJobsData.js`: depolar, duraklar, hastane, yol kenarı noktaları; sunucu ve istemci ortak.
  - `functions/jobs.js`: shopAction op'ları `jobStart`, `jobDone`, `jobCancel`.
  - `src/components/City/cityJobs.js`, `jobWorld.js`, `jobBuildings.js`.
- `vehicles.js`: prototipten otobüs, ambulans (panelvan) ve tır (dorse yalpalar) modelleri, motorlar.
- Realtime Database kuralları:
  - `v` 30'a kadar.
  - Araç kaydında `j` alanı.
  - Yolcu koltuğu 1–29.
- Fonksiyon testleri: v150'deki "kendi dükkânında işlem yok" kuralına göre güncellendi. Yeni testler `scripts/v151-jobs.test.mjs` ve shop testine "en az kazanan modifiyeci" eklendi. 572/572 geçiyor.

## Test edilmedi (gerçek cihaz / gerçek sunucu)
- Gerçek telefonda işlerin baştan sona oynanışı (yükleme, durak, kovalamaca). Tarayıcıda iş başlatma, hedefler, araçlar ve kameralar denendi; ödeme mantığı sunucu testinde denendi.
- İki gerçek oyuncuyla: başkasının otobüsüne / taksisine binmek, işteyken yolcu ve tepe lambası görünüşü.
- Stadyumdaki "bozulma"yı tarayıcıda birebir yakalayamadım. Bulduklarım düzeltildi: yüz/ense karışıklığı, avatarın ekranı kaplaması. Telefonda hâlâ olursa ne olduğunu (donma mı, ekranın kararması mı, atma mı) yazarsan bakarım.
