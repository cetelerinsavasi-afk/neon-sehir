# v225 — Admin araçları: Jetpack + Uçan Kaykay

Şimdilik **sadece adminde** (`src/config/admin.js › ADMIN_UIDS`). Şehirde **Arabalarım › Motor** sekmesinde,
kaykayın yanında iki yeni kart: **🎒 Jetpack** ve **🛸 Uçan Kaykay** (🔒 Admin). Dokununca hemen takılır / binilir;
aynı karta tekrar dokunmak ya da sol üstteki **🚪 İn** çıkarır (havadayken İn kapalı, önce in).

## 1. Jetpack
- Sırtta iki tüplü jetpack, alevler itişe göre büyür, tam gazda duman.
- **Telefon öncelikli, helikopter altyapısı**: sol altta joystick (yukarı/aşağı = ileri/geri, sağ/sol = dön), sağda
  helikopterin **⤒ YÜKSEL / ⤓ ALÇAL** düğmeleri; kamera arkadan takip eder (elle çevrilince 1,8 sn bekler). Bilgisayarda
  aynı düğmeler fareyle, istenirse klavyeyle de kullanılır. **Ekranda hiçbir yerde klavye tuşu adı yazmaz.**
- Yerde yürür (4 m/s), havada 12 m/s.
- Bir şeye basmazsan yavaşça süzülerek alçalır. Tavan: yerden 150 m.
- **Yakıt**: %100 → havada ~35 sn tam itiş (süzülürken iki katı). Yerdeyken ~6 sn'de dolar. Bitince düşülür;
  hızlı düşüşte 💥 sert iniş. Üstte küçük gösterge: yakıt % + irtifa.
- Çatılara, sahneye, spor salonu 2. katına iner; çatıdan çıkınca yürümeye devam edilir. Suya inilirse su üstünde durur.
- Yerden 10 m'nin altında binalar / engeller geçilmez (çatısı bilinen binalarda çatı yüksekliği).

## 2. Uçan Kaykay
- Yerden 45 cm yukarıda süzülür (hafif sallanır), altında mavi ışık halkası. **Suyun üstünden de geçer.**
- Kaykay altyapısı: joystick ile ileri / geri / dön, sağda **🛸 ZIPLA** ve **⚡ TURBO** düğmeleri (kaykaydaki ZIPLA / FLIP yerinde).
  Hız 13 m/s, TURBO ile 20 m/s.
- **ZIPLA**: yüksek sıçrayış. Düşmek yok — hızlı çarpınca sadece sarsılır, geri seker.

## 3. Çok oyunculu
- Konum kaydında `k: 2` (jetpack) / `k: 3` (uçan kaykay) + `y` gider → diğer oyuncular jetpack'i / uçan kaykayı ve
  havadaki yüksekliği görür. **RTDB kuralı değişti**: `city/p/.../k` artık 0–3 (eskiden 0–1) →
  `npx firebase deploy --only database` gerekli (eski sürümdeki oyuncular k: 2/3'ü görmez, sorun çıkmaz).

## Mağazaya eklerken
- Şu an kontrol sadece istemcide (`isAdminUid` + motordaki `ctx.admin()`); ekonomi / sunucu işlemi yok.
- Mağaza için: `functions/stable.js`'teki kaykay gibi sahiplik (ör. `jetpackUntil`, `hoverUntil`) + satın alma op'u,
  `CityScreen › GarageSheet`'te `admin` yerine sahiplik, `cityExtras.js › gxOn`'daki `ctx.admin()` yerine sahiplik kontrolü.
- Kart görselleri hazır: `src/components/VehicleCard/GadgetImg.jsx` (`kind="jet" | "hover"`).

## Dosyalar
`src/components/City/cityExtras.js` (araçlar, fizik, modeller, ağ), `cityEngine.js` (`admin` seçeneği, `gadget()` API),
`CityScreen.jsx` (Motor sekmesindeki kartlar), `src/components/VehicleCard/GadgetImg.jsx` (yeni), `database.rules.json`.
