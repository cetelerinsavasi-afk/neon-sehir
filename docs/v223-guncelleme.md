# v223 — Kaykay ve helikopter düzeltmeleri, araçlarda kaykay

## 1. Kaykay fotoğrafı
- Kaykaydayken çekilen fotoğrafta **kaykay görünmüyordu** ve **avatarın yönü değişiyordu** (fotoğraf son yürüme yönünü kaydediyordu, kaykaydaki yan duruşu değil).
  Artık çekim anında kaykayın yönü (`sb`), gövdenin yönü (`yw`) ve duruş (`sk`: 1 itiyor, 2 çömelik) kaydedilir; karede kişinin altında kaykay çizilir.
- Kaykaydaki başka oyuncular da fotoğrafta kaykaylarıyla çıkar.
- Fotoğraf karesinde canlı kaykaylar gizlenir (karedekiler çekim anından çizilir).
- Sunucu: `functions/cityPhoto.js` `sk` / `sb` alanlarını imzalı eke geçirir (sadece görüntü).

## 2. Kaykay sürüşü
- **Geri gidiş**: joystick geri (ya da S / ↓): ileri giderken fren, durunca yavaşça geri gider (en çok ~2,6 m/s; yokuşta biraz daha hızlı). Eski "Fakie" (kendiliğinden 180° dönme) kalktı.
- **Düşme riski azaldı**: duvara çarpınca sadece 10,5 m/s üstünde düşülür (eskiden 7,5); 60°'ye kadar yamuk iniş düzeltilir (eskiden 37°); %55'ten fazla dönen flip sayılır (eskiden %85); yüksekten düşme sınırı 16 m/s (eskiden 13).
- **Havada çevirirken düşünce yeniden binince kaykayın yönü bozuluyordu**: flip / dönüş açısı sıfırlanmıyordu (kaykay yan / ters kalıyordu). Artık düşünce, binince ve inince açılar sıfırlanır; kaykay göründüğü yönde yere konur.

## 3. Düğmeler
- **🚪 İn** (kaykaydan in) sol üstte, altın miktarının hemen altında: arabalardaki 🚪 İn düğmesiyle aynı. Havadayken pasif.
- **Joystick**: kaykayda ve helikopterde yön tuşları yerine sol altta joystick (ileri / geri / dönüş; itiş gücü joystiğin ne kadar itildiğine göre).
  Sağdaki ZIPLA / FLIP ve YÜKSEL / ALÇAL aynı. Bilgisayarda klavye aynı.

## 4. Araçlar
- **Profil › Araçların › Motor**: kaykay da görünür (resim, 20 günlük ömür barı, geliştirme yok).
- **Motor ve ticari araçlarda** seviye ve hız / ivme / nitro çubukları yazmaz (geliştirilemezler). Arabalarda aynı.
- **Arabalarım › Motor**: kaykay kartında emoji yerine kaykay resmi (diğer araç kartlarıyla aynı oran); sadece kaykayın varsa Motor sekmesi açılır.

## Yayın
`v223-yayinla.bat`: dosyaları kopyalar, testler, derleme, **fonksiyonlar** (fotoğrafta kaykay), commit, push, Cloudflare.
RTDB ve Firestore kuralları değişmedi.
