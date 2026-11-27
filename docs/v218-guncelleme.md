# v218 — Yeni avatar tipi (çene), kafa tipleri, kostümler 3D, kostüm ekranı belleği, borsada ilk gün tuzağı

## 1. Yeni avatar tipi: Dengeli + çene (varsayılan)
Eski Dengeli'de boyun uzun ve dimdikti, kafanın tam ortasına giriyordu; kafa alttan sivrilen bir yumurtaydı (çene yok).
Yeni tipte görünüm aynı (saç, yüz, gövde, gölge), sadece:
- kafanın alt-önü öne-aşağı çıkar → **çene**; kulak altı geniş kalır,
- çene altı ve ense düzleşir → boyun kafanın **arka-altına** girer,
- boyun biraz geride, hafif öne eğik ve daha kalın; kafa boynun biraz önünde.

`avatar3d.js › let STYLE_ID = 'cene'`. Geri almak: `'dengeli'`. Yeni parça yok (üçgen / çizim çağrısı aynı).

## 2. Kafa tipi artık 3D'de çalışıyor
Düzenleyicide **Yüz › Kafa Tipi** vardı ama 3D kafa hep aynı küreydi. Artık 3D kafanın şeklini belirliyor:
Oval · Yuvarlak · **Köşeli Çene** · **Sivri Çene** · Uzun · **Elmacık** (etiketler şekle göre yenilendi).
Saç ve şapka kafayla birlikte şekil alır. **Yeni veri alanı yok** — mevcut `avatar.faceShape` kullanılır
(sunucu zaten doğruluyor), Firestore okuma/yazma değişmez.

## 3. Kostümler 3D'de düzeltildi (100 kostüm tek tek gözden geçirildi)
| Sorun | Sebep | Düzeltme |
|---|---|---|
| Uzun saç göğse / sırta boyanıyor, kanatların arasına karışıyor | Kostümün arka saç katmanı (hb) gövde dokusuna basılıyordu | 3D'de arka saç ayrı **saç kartı** olur: kafanın ve sırtın arkasında, kanatların önünde |
| Perilerin / uzun saçlıların kafası şişkin | Saç, kafa ölçümüne giriyordu | Saç ölçüme girmez → kafa normal boyda |
| Yandan bakınca kafa "yama" gibi, kask saç gibi | Ön çizim ön yarıya, arka çizim arka yarıya keskin sınırla basılıyordu | Ön ve arka çizim yan yüzde **yumuşak geçişle** karışır (tüm avatarlarda) |
| Kollarda yanlış renk (Siber Ninja pembe, Volt camgöbeği, Kuantum mor…) | Arkadaki parıltı / pelerin katmanı kolların dokusuna karışıyordu | Arka katman gövdeye boyanmaz; sadece sırt kartında |
| Pelerin / kanat sırtta görünmüyor | Sırt kartı gövdenin içindeydi | Kart sırtın **arkasında** |
| Şapka kafaya boyalı, kenarı düz kart, arkadan saç gibi | — | **Gerçek 3D şapka**: Şerif (kovboy şapkası), Büyük Sihirbaz (silindir), Baba (fötr), Çöl Kâşifi (kâşif kaskı), Korsan Kaptan (üç köşeli), Yıldız Büyücüsü ve Mor Cadı (külah), Astronot (cam kask). Renk kostümün çiziminden okunur (boyanan kostümde şapka da o renk) |
| Omuzda siyah leke | Boş kalan doku bölgesi | Kenar doldurma genişletildi |

Saç kartı ve 3D'ye özel çizimler sadece doku kopyalanırken kullanılır, sonra bırakılır (düz avatarlardaki gibi).

## 4. Kostümler ekranı telefonda çökmesi
v217 düzeltmeleri ölçüldü: küçük resim üretiminde sızıntı yok (100 kostümden sonra ekran kartında 1 doku).
Kalan yük: arkada şehir sahnesi açıkken bu ekran 2 ayrı 3D çizici + tam çözünürlüklü arka plan açıyor ve
gezilen kart resimleri bellekte birikiyordu. Düzeltmeler:
- küçük resim çizicisi iş bitince **5 sn sonra kapanır** (WebGL bağlamı bırakılır),
- telefonda önizleme ve küçük resimde kenar yumuşatma kapalı, çözünürlük en çok 1,5 kat,
- kart ekrandan uzaklaşınca resmi boşaltılır, geri gelince önbellekten anında konur,
- büyük önizleme önbelleği telefonda 6 → 3 kostüm,
- arka plan (yıldızlı) tuvali 1 kat çözünürlükte.
Not: gerçek telefonda denenmedi (ortamda yok); masaüstü tarayıcıda ölçüldü.

## 5. Borsada ilk gün tuzağı kalktı
Eskiden iki gece dağıtımı arasında alınan hisse bir sonraki dağıtımı **atlıyordu** (2. gün pay alıyordu).
Artık faizdeki gibi: alındığı gün de pay alır, gün içinde ne zaman alındığı fark etmez
(23:00'te alan, o gece dağıtımında payını alır). Simülasyonla doğrulandı (eski: 0, yeni: payı kadar).
v218 öncesi alınıp hâlâ "bekleyen" hisseler eski kuralla bir gece sonra kendiliğinden normale döner.
**Sunucu değişti** → `npx firebase deploy --only functions:borsaAction`
(Gece dağıtımı aynı dosyadaki kurala bakar; sadece alım kuralı değişti.)

## Dosyalar
| Dosya | Ne |
|---|---|
| `src/components/City/avatar3d.js` | `cene` tipi, kafa tipleri (FACE_3D), saç kartı, yumuşak geçiş, sırt kartı yeri, kostüm şapkaları (LOOK_3D) |
| `src/lib/avatarShapes.js` | `for3d` çizim seçeneği, `buildAvatarHairCardMarkup` |
| `src/lib/avatar3dView.js` | 3D'ye özel çizim + saç kartı, telefon bellek ayarları, küçük resim çizicisini kapatma |
| `src/components/City/cityEngine.js` | Şehirde kostüm / avatar 3D çizimi (for3d + saç kartı) |
| `src/components/Avatar3D/Avatar3D.jsx` | Uzaklaşan kartın resmini boşaltma |
| `src/components/CostumeShop/CostumeShop.jsx` | Arka plan çözünürlüğü |
| `src/components/AvatarBuilder/AvatarBuilder.jsx` | Kafa tipi etiketleri |
| `functions/borsa.js` | İlk gün tuzağı kalktı |
| `preview/avatar-test.*`, `preview/avatar-looks.*` | Test ve kostüm inceleme sayfaları (production'a girmez) |
