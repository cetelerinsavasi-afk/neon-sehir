# v152 — değişiklikler

v149, v150 ve v151'i de içerir.

## Şehir / meslekler
- **Araçlarım (şehir garajı)**: galerideki gibi Araba / Ticari / Motor sekmeleri; açılınca aracın olan ilk sekme seçili gelir.
- **İşe başla** butonu sadece "İşe başla" yazar (hak/ortalama kazanç bilgisi yok). Hak bitmişse "Bugünkü hakkın doldu".
- İş paneli artık **İn** butonunun altında; arabadan inilebiliyor.
- **Yolda çizili rota**: hedefe giden yol, yolların üstünde akan ok şeridiyle gösterilir (araç ilerledikçe / şüpheli kaçtıkça yenilenir).
- **Tır**: dorsesiz gezer; limanda yük alınınca dorse gelir, depoda teslim edilince gider. Diğer oyuncular da dorseyi görür.
- **Duraklar**: 10 durak şehrin çevresine yayıldı (Kuzey Kapısı, Kuzey Lojistik, Doğu Lojistik, Hastane, Stadyum Arkası, Doğu Sahil, Plaza, Liman, Batı Sahil, Batı Kapısı). Durak yolun kenarında, cebi şeritte; yolun ortasında durak yok.
- **Depolar** limanın karşı tarafına (kuzey ve kuzeydoğu) taşındı.
- **Direksiyon**: otobüs ve tır daha kolay dönüyor; motorlar artık hıza göre daha ağır/kararlı dönüyor.
- Uzun/yüksek araçlarda (tır, otobüs) takip kamerası tavanın üstünden ve daha geriden bakar.
- **Benzinlik** oyunun kendi benzinlik mobilyalarıyla (kanopi, pompa, fiyat tabelası, hava pompası, oto yıkama) kuruldu.
- **Görünmez duvar**: limanda rıhtım kenarındaki kaldırımın bitişinde arabayı durduran görünmez duvar kaldırıldı. Şehrin geri kalanı tarandı, başka görünmez engel bulunmadı.

## Fotoğraf / Sixtagram
- Taksiyle (ve diğer ticari araç/motorlarla) çekilen şehir fotoğrafında araç görünüyor; modifiyesi ve işteki hâli (taksi lambası, dorse) de fotoğrafa giriyor.
- **Sixtagram çökmesi**: telefonda şehir fotoğrafları otomatik çizilmiyor ("dokun" butonu), çizim daha küçük boyutta ve tek ortak 3D çizici kullanılıyor; araç küçük resimleri ayrı çizici açmıyor. Telefonun belleğinin dolup oyunun kapanması büyük ölçüde engellenir.

## SMS
- Araç (ve silah) satın alınca gelen eski "kredi teklifi" SMS'i kaldırıldı.

## Yüklenen fonksiyonlar
shopAction, buyVehicle, buyWeapon, cityAction, createSixtagramPost. RTDB ve Firestore kuralları değişmedi (RTDB yine de yüklenir).
