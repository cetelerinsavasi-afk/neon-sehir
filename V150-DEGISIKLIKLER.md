# v150 — Neon Şehir

v149'un üstüne. Paket v149'u da içerir: v149'u yüklemediysen bu paket ikisini birlikte yükler.

## 1) Şehirde oyuncuya dokununca profil açılmıyor
- Haritada bir oyuncuya dokunmak artık profilini açmıyor.
- Sağ taraftaki butonlara **👥 Yakındakiler** eklendi (diğer mekânlardaki gibi). Yakındaki oyuncuları mesafeye göre sıralar; listeden profile gidilir.
- Misafirlere ve araba sürerken gösterilmez.

## 2) Dükkân sahibi kendi dükkânında işlem yapamaz
- Silahçı, modifiyeci ve galerici kendi dükkânında alışveriş, tamir, geliştirme ya da modifiye yapamaz. Rakibe veya oyunun dükkânına gitmesi gerekir.
- Sunucu da reddeder (`own-shop`): `workshop`, `stockBuy` ve `modify` işlemlerinde. Oyunun mağazasından alırken (`gameStoreBuy`) oyuncunun kendi dükkânı aday listesinden çıkarılır.

## 3) Arabalar: 3D görünüm + modifiye
- Araba fotoğrafları kalktı. Her yerde (garaj, galeri, pazar, yarış, şampiyona, Sixtagram eki, çete ticareti, dükkân vitrini) arabanın **gerçek 3D modelinin karesi** görünür, modifiyesiyle birlikte.
  - Kareler cihazda bir kez çizilip saklanır; telefonda iş bitince 3D motor bellekten atılır.
- 10 araç tipi Neon Garaj prototipindeki modellerle değişti.
- Kapalı arabaların içi görünür: koltuklar, torpido, direksiyon. Şoför ve yolcular koltuklarında oturur.
- **Modifiyeci = Tamir + Geliştir + 🎨 Modifiye.** Modifiye stüdyosunda araba dönen bir platformda durur. Sekmeler:
  - **Boya:** renk, yüzey, kaplama, yan numara.
  - **Jant:** model, kol sayısı, renk, lastik, kaliper, büyüklük, derinlik.
  - **Gövde:** süspansiyon, egzoz, parçalar.
  - **Tavan:** tavan, cam filmi, döşeme.
  - **Işık:** sis farı, neon ve rengi.
  - **Plaka.**
- Her seçim **satın almadan önce** arabanın üstünde görünür. Altta kalem kalem fatura var, "Geri al" ve "Orijinal" butonlarıyla.
- **Tasarım saklanmaz.** Ödenen, arabanın şu anki halinden farklı olan her şeydir. Sarıdan beyaza dönüp tekrar sarı yapmak yine ücretlidir; fabrika rengine dönmek de öyle. Parça sökmek de bir değişikliktir.
- **Fiyatlar arabanın fiyatına göre** (100.000'lik arabada boya 1.000, plaka 5.000):

  | Değişiklik | Arabanın fiyatına oranı |
  |---|---|
  | Boya | %1 |
  | Plaka | %5 |
  | Yüzey: parlak / metalik / mat / sedef / krom | %0,5 / %1 / %1,3 / %4 / %8 |
  | Spoiler | %2,3 |
  | Neon | %2,7 |
  | Süspansiyon | %1,7 |

  Her kalem en az 50 altın.
- **Para modifiyeciye gider, vergisi kesilerek** (diğer dükkân gelirleri gibi; borcu varsa önce borca). Oyunun garajında yapılırsa oyuna gider.
- Modifiye **sadece görünüm**; hız değişmez.
- Modifiyeli araba şehirde (başkaları da görür), profilde, garajda ve satış ilanında görünür. Satılan araba modifiyesiyle gider.

## Teknik
- Yeni dosyalar:
  - `functions/vehicleMods.js`: kurallar ve fiyat; istemci ile sunucu aynı dosyayı kullanır.
  - `src/lib/carThumb.js`
  - `src/components/VehicleCard/CarImg.jsx`
  - `src/components/Workshop/ModifiyeStudio.jsx`
- Veri: `vehicles/{id}.mods` alanı; sadece fabrikadan farklı olanlar yazılır, küçük bir kayıttır.
- Realtime Database: araba kaydında `m` alanı (modifiye, en çok 700 karakter). **Kural siteden önce yüklenmeli**; script bu sırayla yükler.
- Fonksiyonlar: `shopAction` (yeni `modify`, `own-shop` engelleri), `createListing` (ilanda `vehicleMods`), `createSixtagramPost` (ekte `mods`).
- Firestore kullanımı artmadı. Modifiye tek işlem, kareler cihazda saklanıyor.

## Test edilmedi (gerçek cihaz / gerçek sunucu)
- `modify` işleminin canlı sunucuda para ve vergi akışı. Fiyat hesabı yerelde denendi.
- İki gerçek oyuncuyla şehirde modifiyeli araba ve yolculuk.
- Telefonda çok sayıda araba karesinin çizilme hızı.
