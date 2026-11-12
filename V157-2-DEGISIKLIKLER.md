# Neon Şehir v157.2 — Şehir hafifletme (kasma / donma / oyundan atma)

## Mesafeye göre detay (LOD)
- Küçük eşyalar (koltuk, masa, tabure, saksı, tribün koltukları…): yakında tam model, orta
  mesafede eşyanın kendi renginde tek kutu, uzakta hiç çizilmez. Binalar / yollar hep tam.
  (Telefonda: 55 m'ye kadar tam, 55–110 m kutu; bilgisayarda 85 / 170 m.)
- Mekân içleri telefonda sadece yakındayken ve yavaşken (≈30 km/sa altı) kurulur; 110 m
  uzaklaşınca bırakılır. Aynı anda en fazla 3 mekân içi kurulu. Arabayla hızlı geçerken kurulmaz.
- Canlı eşyalar (kapı, fıskiye…) telefonda 50 m içinde oynar.

## Çizim çağrısı (kasmanın ana sebebi) ↓
- Aynı görünen malzemeler tek malzemede birleşir; dokusuz parçaların rengi/pürüzlülüğü köşelere
  işlenir → farklı renkte binlerce parça tek seferde çizilir. Aynı dokunun farklı ölçekli kopyaları da birleşir.
- Ölçüm (telefon ayarı, doğduğun yer): 280 → ~165 çizim çağrısı.

## Bellek ↓
- Yuvarlak eşyalar telefonda daha az parçalı (silindir 24→14, küre 22→14 dilim; görünüş aynı).
- Telefonda duvar/zemin dokuları yarı, tabela yazıları 0,4 çözünürlükte.
- Toplam: geometri 258 → ~111 MB, JS belleği ~410 → ~265 MB (v157 ile karşılaştırma).
- Ekran kartı belleği gezerken sabit (v157.1).

## İşlemci ↓
- Sabit (birleşik) parçaların matrisleri her karede yeniden hesaplanmıyor.
- Canlı eşyaların konumu bir kez hesaplanıyor (her karede yüzlerce matris zinciri güncelleniyordu).

## Diğer
- Pit lounge'un yoldan görünen arka duvarı açıldı (kapkara görünüyordu).
- 2. el malzeme ilanı satılınca gelen SMS'teki "Vergi (%1): 0" yazısı kalktı
  ("… altına satıldı, hesabına yattı."). Sunucu: shopAction.

## Yükleme
v157-2-aktar-ve-yukle.bat → güvenlik kontrolü, derleme + testler, shopAction fonksiyonu, commit + push.
v156, v157 ve v157.1'in üstüne de çalışır. Android uygulaması ve veritabanı kuralları değişmedi.
