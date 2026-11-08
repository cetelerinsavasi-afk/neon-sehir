# v145 — Seyyar satıcılar 3D, seyyar geliri devlete, çete 20 gün, futbol sözleşme paneli, soygun listesi

## 1. Seyyar satıcı gelirleri devlete (Ticaret Bakanlığı)
- Seyyar satıcıdan yapılan **her alışverişin tamamı** (günlük 1.000'lik alışveriş + menüden alınanlar) devlet kasasına girer.
- Yeni gelir kalemi: `seyyar_satis` — "Seyyar satıcı satışları". Belediye › Bakanlıklar › **Ticaret** altında görünür:
  - Üstte "Seyyar satıcılar" kutusu (toplam, satış adedi),
  - satıcı başına tablo (Kokoreççi / Simitçi / Dönerci / Köfteci: satış · devlete giden).
- Haraç (soygun) ödemeleri değişmedi.

## 2. Seyyar satıcılar artık 3D mekân
- Haritada seyyar satıcıya dokununca o satıcının **açık hava mekânına** girilir (eski küçük panel sadece mekân açılamazsa yedek olarak açılır).
- Her satıcının tasarımı haritadaki yerine göre ayrı:
  - **Kokoreççi** — gazinonun yanı: neon şehir, asfalt yol + kırmızı-beyaz bordür, park etmiş arabalar, koniler, şemsiyeli plastik masalar, gece.
  - **Simitçi** — sahil: deniz, korkuluklar, denize bakan banklar, güvercinler, palmiye, gündüz.
  - **Dönerci** — fabrika ile parkın köşesi: yol + yaya geçidi, sol tarafta ağaçlar/bank, sağda variller/paletler, ayakta yeme masası.
  - **Köfteci** — liman: rıhtım, halat babaları, konteynerler, liman projektörleri, gece.
- Sol üst: **şüphe** (parktaki gibi).
- Sağ üst: **🛒 Seyyar satıcı** → *Alışveriş yap* (1.000 · şüphe −5) / *Haraç kes*. Bugün alışveriş ya da haraç yapıldıysa buton **🧾 Menü** olur.
- Arabaya yaklaşınca: **Alışveriş yap · Haraç kes · Menü**. Bugün yapıldıysa sadece **Menü**.
- Satıcıya dokununca yanına yürür, aynı seçenekler açılır.
- **Alışveriş yap**: satıcının ürünü ele gelir (kokoreç / simit / döner / köfte ekmek — 2 dk, ısmarlanabilir), şüphe −5, saygınlık (eskisi gibi, günde 1).
- **Haraç kes**: mekândan çıkıp Soygun ekranında o satıcının haraç paneli açılır.
- **Menü** (sınırsız, keyfî): satıcının ürünü + ayran / çay / kola / su. Alınan ele gelir.
  - Kokoreççi: kokoreç 250 · ayran 50 · çay 20 · su 20
  - Simitçi: simit 50 · çay 20 · ayran 50 · su 20
  - Dönerci: döner 250 · ayran 50 · kola 60 · su 20
  - Köfteci: köfte ekmek 250 · ayran 50 · çay 20 · su 20
- Her satıcının kendi kıyafetli NPC'si ve kendi lafları var.
- Firestore: mekânlarda eski 2D konum kaydı (interiorPresence + dakikalık nabız + ziyaret sayacı) **tutulmuyor**; canlı oyuncular / kişi sayısı zaten 3D ev kaydından geliyor. Satın almada ek: 1 okuma (3D konum) + 1 yazma (devlet defteri).
- `buyFromVendor` artık satıcı kimliğini listeyle doğruluyor (eskiden her metni kabul ediyordu).

### Yeni mobilyalar (mağazada da satılır)
- Dükkan & Kafe: **Kokoreç Arabası** (dönen kokoreç, kor), **Döner Arabası** (dönen döner, rezistans, çizgili tente), **Simit Tezgâhı** (vitrin + simit direği), **Köfte Arabası** (ızgara, tüten duman) — 45.000–60.000 altın. Evde/işletmede ürünü alınabilir; kafe/bar menüsüne de girer.
- **Plastik Masa** (3.000), **Plastik Tabure** (1.500, oturulur) — 6 renk.
- **Sahil Korkuluğu** (8.000), neon tabelalar: **KOKOREÇ / DÖNER / SİMİT / KÖFTE** (20.000).
- Sadece mekânda: yol şeridi, yaya geçidi, deniz şeridi (üstüne yürünmez).
- Elde yeni çizimler: kokoreç, döner, köfte ekmek.

## 3. Çete: oyuna girmeyen üye 10 → 20 gün
- `LOGIN_INACTIVE_DAYS` 20. SMS / duyuru metinleri sayıyı kendisi yazar.

## 4. Futbol › Takımım › Takımın › Sözleşmeli futbolcular
- Zam / Not / Feshet butonları bilginin altına alındı (isim-maaş artık sıkışmıyor).
- Zam açılınca `− 8.000 +` ve **"💸 Maaşı 8.000/gün yap"** satırın tam genişliğinde.
- Not alanı 3 satırlık geniş yazı kutusu (yazılan görünüyor, 0/140 sayacı).
- Zam ve not aynı anda açılmaz.

## 5. Soygun: kendi ekiplerin anında en üstte
- Ekibinde olduğun planlar cihazda hatırlanıyor → panel açılır açılmaz en üstte (1–2 sn sonra zıplama yok).
- Kurduğun plan belgeden hemen tanınıyor; katıl / ayrıl / kur / sil anında güncelleniyor.
- Firestore: Soygun sekmesi ve hedef paneli artık **tek** dinleyiciyi paylaşıyor; her plan değişikliğinde tüm planların katılımcı belgeleri yeniden okunmuyor (üyelik sonucu hatırlanıyor).

## Yükleme (sonraki güncellemelerle birlikte)
Sunucu fonksiyonları (önce bunlar, sonra git push):
`buyFromVendor` · `houseAction` (yeni mekânlar + mobilyalar) · `shopAction` (kafe menüsünde yeni ürünler) · `giftHeldItem` · `belediyeAction` · `getStateReport` · `cronTick` (çete 20 gün) · `dailyReset, dailyResetRecovery` (gece bakanlık raporu)
- Kurallar (firestore.rules) değişmedi.
- Sunucu önce yüklenmezse: arayüz seyyar satıcıya girerken mekânı kuramaz ve eski paneli açar (oyun bozulmaz).

## Test
- Sunucu testleri: 553 / 553 (5 yeni v145 testi + çete 20 gün testi güncellendi). Arayüz derlemesi (vite build) hatasız.
- Önizleme: `npm run preview:gangs` → `/vendor.html?v=kokorecci|simitci|donerci|kofteci` (`&done=1` → bugün alışveriş yapılmış hâl).
