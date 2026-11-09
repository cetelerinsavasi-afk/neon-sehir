# v149 — Değişiklikler

## 1. Sixtagram'a girince oyunun yenilenmesi (giriş ekranına dönme)
Sebep: akıştaki şehir fotoğrafları için telefonda **tüm şehir ikinci bir 3D sahnede, en yüksek grafik ayarında (gölgeli)** kuruluyor ve 45 sn bellekte tutuluyordu; ev fotoğrafları ayrı bir kuyrukta aynı anda başka bir 3D sahne açabiliyordu. Bellek taşınca tarayıcı / Android uygulaması sayfayı yeniden yüklüyordu.
- Ev + şehir fotoğrafları artık **tek ortak kuyrukta** çizilir (aynı anda tek ekran dışı sahne). — `src/lib/photoCache.js`
- Telefonda fotoğraf motoru **hafif ayarda** (gölgesiz) kurulur, iş bitince 2,5 sn'de kapanır ve grafik bağlamı da bırakılır. — `CityPhoto.jsx`, `HousePhoto.jsx`, `houseEngine.js` (`releaseSharedRenderer`), `cityEngine.js`
- Bir kez çizilen fotoğraf zaten cihazda saklanıyordu (v147.3) → 3D sahne her fotoğraf için bir kez kurulur.

## 2. Hikâyeler kaldığı yerden
- Bir oyuncunun 3 hikâyesinden 2'sine bakıp çıktıysan, tekrar dokununca **3.'den** açılır (çubuklarda ilk ikisi dolu görünür).
- Art arda bakarken geri gidince önceki oyuncunun **ilk** hikâyesine değil, **en son kaldığın** hikâyesine dönülür (kaydırarak geçişte de).
- Kendi hikâyelerin: yeni attığına henüz bakmadıysan oradan açılır. — `SixStories.jsx`

## 3. Yolcuyken arabanın takılması
- Tahmin, kaydın **sunucuya ulaştığı an** yerine **ölçüldüğü an** (`ct`, sunucuya göre düzeltilmiş saat) üzerinden yapılır → ağ gecikmesi oynadıkça oluşan ileri-geri sıçrama yok.
- Dönüş hızı güncellenmeden önce ekrandaki konum alınır (her kayıtta sıçrama buydu).
- Yolcu ekranında araba aynı karede önce yerleşir, sonra koltuk + kamera (bir kare geriden gelmiyor).
- Kayıt gecikirse araba 1,2 sn'ye kadar tahminle akmaya devam eder; küçük farklar daha yumuşak kapanır.
- **Realtime Database kuralı güncellendi** (`database.rules.json` → araba kaydına `ct` alanı). Kural, site yayınlanmadan ÖNCE yüklenmeli (deploy betiği bunu sırayla yapar).

## 4. Misafirler şehri görüyor
- Giriş yapmamış oyuncu da 🚶 ile şehre girer, park / seyyar satıcı / stadyuma dokununca şehirde oraya ışınlanır.
- Misafir: yürür, oturur, kapılardan (misafir) mekânlara girer. Diğer oyuncular / sohbet, araba, fotoğraf, alışveriş giriş ister (giriş kartı açılır).

## 5. Ziyaret sekmesi
Park ve 4 seyyar satıcı listeden kaldırıldı (haritaya gömülüler). Parkın kişi sayısı için yapılan ek sorgu da kalktı.

## 6. Stadyum (prototipten)
- Stadyum haritaya gömülü; haritada stadyuma dokununca futbol paneli açılmaz, **stadyumun ana girişine** ışınlanılır.
- İçeri tünellerden yürünür, tribün basamaklarına çıkılır, koltuklara oturulur (yüz sahaya dönük).
- Stadyumun içindeyken **sağ üstte "⚽ Futbol"** → futbol paneli.
- **Reklam panolarında 1. Lig'in 8 takımının sponsor fabrikaları** yazar.
- **Maç saatinde (18:00–19:00, maç varsa) sahaya girilmez**; üstte ortada **‹ Ev Sahibi vs Deplasman ›** seçici: kupa + 1. Lig + 2. Lig'in canlı maçları. Seçilen maça göre skor ekranları, top, 6+6 oyuncu ve hakem hareket eder; goller doğru dakikada olur.
- Her şey oyuncunun cihazında canlandırılır; herkes farklı maç izleyebilir, oyuncuların sahadaki yeri cihazdan cihaza farklı olabilir (skor/goller aynı).
- Firestore: dinleyici yok. Ligler + takımlar günde en fazla 1 kez (~18 belge), canlı maçlar 18:00–19:00 arası stadyuma girince 1 kez (~10 belge) okunur ve cihazda saklanır. Kaldırılan Maçlar sekmesi (tüm sezon maçlarını canlı dinliyordu) ve yayındaki sezon dinleyicisi sayesinde toplam okuma azalır.
- Futbol > **Maçlar** sekmesi kaldırıldı (sezon kutlaması Puan Tablosu'nun üstünde).
- Futbol > Takımım > **Forma** sekmesi kaldırıldı; takım adının yanındaki **✏️** forma panelini açar.

## 7. Kamera
- Mekânlardaki **"Göz"** görünümü kaldırıldı (3D ↔ 2D).
- Şehirde **araba içi kamera** (🎥): sürücü ve yolcular koltuktan bakar, parmakla serbestçe çevirir. Sürücünün kamerası bir süre dokunulmazsa yola döner; yolcununki istediği yönde kalır. Yolcu dış kamerada da kamerayı çevirebilir (kendiliğinden öne dönmez).

## 8. Yayında maç izleme kaldırıldı
Yayıncının "⚽ Maç" düğmesi, maç görünümü ve izleyicideki ayna kaldırıldı (`StreamMatchView.jsx`, `StreamMatchMirror.jsx` silindi).

## Yükleme
`deploy-v149.bat` → zip'i yerleştirir, derler, WebView testleri, **önce Realtime Database kuralları**, sonra git push (Cloudflare). Sunucu fonksiyonu değişmedi.
