# v65 — 3D Ev Güncellemesi (admin testi)

## Oyuncular için değişenler
- Alt çubuğa 5. sekme olarak **👤 Profil** eklendi (en sağda). Eskiden haritadaki "Ev"den açılan profil ekranı artık buradan açılıyor.
- Haritadaki **Ev** artık oyunculara **"Ev Tadilatta"** ekranı gösteriyor.
- Görevler: 16 → "Profile gir ve avatarını düzenle", 19 → "Profile gir ve silahını geliştir".

## Admin için: 3D Ev
- **Tasarla modu:** alttaki raftan eşya seç → odaya eklenir. Eşyayı sürükle = taşı, dokun = seç (döndür 45°, renk, kopyala, sil). ↶ geri al. Duvara asılan eşyalar (TV, silah askılığı, tablo, neon, pencere…) en yakın duvara kendiliğinden yapışır; avize/pervane tavana asılır.
- **Duvar & Zemin:** 17 duvar + 13 zemin kaplaması.
- **Gez modu:** 3. şahıs kamera, joystick / WASD, sürükle = etrafa bak. **E** otur/kalk/arabaya bin, **F** TV, lamba, neon, şömine, far vb. aç/kapat.
- **98 eşya**, 14 kategori; çoğunda 5–15 renk seçeneği (koltuklar 12, arabalar ve motorlar 15 renk/kaplama → yüzlerce kombinasyon).
- Her eşyanın fiyatı var: 🪙 altın ya da 💎 elmas (ileride gerçek parayla satılacak para birimi). Üstte "Ev değeri" görünüyor. Test modunda admin her şeyi ücretsiz yerleştiriyor.
- Tasarım ~1,2 saniyede bir otomatik kaydediliyor (`houses/{uid}`).

## Online test
- 👥 Davet paneli (sadece admin): oyuncu adıyla ya da arkadaş listesinden davet et. Davetli oyuncu haritada Ev'e tıklayınca admin'in evine girer (sadece gezer, düzenleyemez), yaptığın değişiklikleri canlı görür.
- Evdekiler birbirini görür: avatarlar oyundaki SVG avatarların birebir aynısı, kameraya dönük "kağıt figür" olarak çiziliyor. Oturma herkese görünür.
- Altta sohbet: mesajlar hem listede hem kafanın üstünde balon olarak görünür (susturma kuralları geçerli).

## Yayınlama
1. `npm install` (yeni bağımlılık: `three`)
2. `firebase deploy --only firestore:rules` (yeni: `houses`, `houseInvites`, `housePresence`)
3. `firebase deploy --only functions` (yeni: `houseAction`; `expireInteriorPresence` artık ev kayıtlarını da süpürüyor)
4. Web build + TWA her zamanki gibi.

## Teknik
- İstemci: `src/components/HouseScreen/` — `houseEngine.js` (three.js motoru), `houseCatalog.js` (eşyalar), `houseTextures.js` (kodla çizilen dokular), `HouseScreen.jsx` (arayüz), `HouseGate.jsx` (admin/davet kontrolü; three.js sadece girebilecek kişiye yüklenir, ~170 KB gzip ayrı paket).
- Sunucu: `functions/houses.js` + `functions/scripts/houses.test.mjs`.
- Önizleme (sadece geliştirme): `npm run preview:gangs` sonra `/house.html` (sadece motor) ve `/house-app.html` (tam ekran, sahte misafirle).
- Satışa geçerken: fiyat listesi sunucuya taşınmalı, `save` sadece sahip olunan eşyalara izin vermeli (houses.js'teki not).
