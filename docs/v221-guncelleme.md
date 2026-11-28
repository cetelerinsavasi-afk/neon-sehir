# v221 — Belediye salonu, kaykay, basket maçı, seyyar satıcılar, Kervankent, uzak avatarlar

## 1. Belediye
- İç mekân dış cepheye göre küçüktü: salon **26 × 19 m**, tavan **4,6 m** (eskiden 18 × 14 × 3,4). Kapıdan makama orta koridor boş.
  Oda ölçüsü artık mekâna göre (`venues.js › ROOM` belediyede değişir, `finish` geri alır; motor `v.room` okur: `rW / rD / rH`).
- **Zabıta Rıza kaldırıldı.** Yeni: girişte danışma (Sekreter Ayşe), bekleme koltukları, portre, lambalar, 4. avize.
- **Çaycı Hasan siparişi kendisi getirir**: 🛎️ Garson › **Çay** ya da **Türk kahvesi** (bedava). Hasan tepsiyle yanına yürür, ürün eline geçer (2 dk), sonra yerine döner.
- Koltuktan kalkınca sıkışma: kalkılan yer kapalı bir cepse (masa + dolap + duvar arası) daha geniş bir boş yer aranır.
- Tavan eşyaları (avize) yüksek tavanda da tavanda.

## 2. Kaykay
- **"Kaykaya bin" düğmesi her yerde çıkmıyor.** Kaykay **Arabalarım › Motor** sekmesinde; dokununca yanına konur, yanına gidince 🛹 Kaykaya bin.
- İnince ya da düşünce kaykay olduğu yerde **bekler** (motor gibi). Kiralık süre / ömür bitince kalkar.
- **20 gün ömür** (bisiklet gibi): `users.skateUntil`. v219–v220'de alınanlar 18 Aralık 2026'da biter (yazma gerekmez). Ömrü bitince yeniden alınabilir.
- **Kaykay süren oyuncu artık başkalarında da kaykayın üstünde görünür** (konum kaydında `k: 1` + yükseklik; RTDB kuralı eklendi).
- Binince çıkan "nasıl sürülür" yazısı ve helikopterdeki üst bilgi yazısı kaldırıldı.

- **Kaykay sürmek kolaylaştı**: duvara çarpınca sadece çok hızlıyken (11,5 m/s üstü) düşülür; 70°'ye kadar yamuk iniş düzeltilir;
  yarıdan fazla dönen flip tamamlanmış sayılır; yüksekten düşme sınırı daha geniş.
- **🛹 Kaykaydan in** düğmesi sol üstte.
- **Joystick**: kaykayda ve helikopterde yön tuşları yerine sol altta joystick (ileri / geri / dönüş, itiş gücü joystick'e göre).
  Sağdaki ZIPLA / FLIP ve YÜKSEL / ALÇAL düğmeleri aynı. Bilgisayarda klavye aynı.

## 3. Basket
- Top elimdeyken / sahada top yakınımdayken basket düğmeleri kaykaydan önce gelir.
- **🏀 Elinden al**: topu süren oyuncunun yanındayken (%45 şans, 1,2 sn bekleme).
- **🖐️ Zıpla**: biri şut çekince top yükselirken yanındaysan blok yaparsın.
- Sadece topun RTDB kaydı (`city/ball/b`) yazılır; **Firestore'a hiçbir şey gitmez**.

## 4. Seyyar satıcılar
- **Festival alanı** (pist girişi) tezgâhlarında bağış / haraç yok, **🧾 Menü** var. Gelir Seyyar Satıcılar hissesine gider.
- **Seyyar Satıcı Vergisi kalktı** (belediyedeki kalem de): gelirin **yarısı masraf, yarısı vergisiz hissedarlara**.
- **Yol kenarı / köy / Kervankent yolu satıcılarından alışveriş**: karpuz → 🍉 dilim karpuz, közde mısır, bal, peynir, çay, gözleme, köy ekmeği, mercimek çorbası. Ürün ele gelir; gelirin yarısı masraf, yarısı hissedarlara (`buyFromVendor › yol_satici`).

## 5. Kervankent
- **Benzinlik marketine girilir**, alışveriş yapılır (şehirdeki market gibi).
- **Camiye girilir**; işlem yok, sadece **İmam Hüseyin Efendi** (sohbet).

## 6. Görünüm
- **Uzaktaki avatarlar 3D hallerine benziyor**: uzak pozlar (ayakta, yürüme, arkası) 3D modelden bir kez çizilir (kuyrukta, 6 karede bir avatar). Oturma / araç pozları eski çizimle.
- **Hastane yataklarına uzanılır.** Yatarken çekilen fotoğrafta da uzanmış görünür (`lz`).
- **Cafe**: tezgâh arkası raf + saat, okuma köşesi (kanepe, kitaplık), pencere önü masalar, vantilatörler.
- **Bar**: uzun bar (2 tezgâh, 5 tabure), raflar, kanepeli köşe, langırt, garson masaların arasından geçmiyor.
- **NPC yönleri**: mekân NPC'leri ilk karede kameraya dönüp öyle kalıyordu → artık tezgâhına / içeriye dönük.
- **Banka girişindeki bariyerler** kapıya giden koridor gibi (cepheye dik).
- **Mağaza tabelaları**: binanın kat silmesi tabelanın ortasından geçiyordu → dükkân hizasında silme yok, tabela opak pano.
- **İnternet kafe tezgâhı** kapıya dönük (kasiyer kapıya sırtını dönüyordu).
- **Pazar**: ortadaki çiçeklikler ve banklar kalktı, yürüme yolu boş.

## 7. Liman
- **Tırla rıhtımdaki yükleme alanına girilemiyordu**: sahil korkuluğunun görünmez duvarı v219'da marina limanın batısına taşınınca liman ağzının önünden de geçiyordu (`cityPlan.js`). Boşluklar artık sıralı hesaplanıyor.

## 8. Tır işi rotası, maden kapısı
- **Tır işinde yol yanlış gösteriliyordu**: iş rotası şehir dışındaki her hedefi Kervankent'e gidiş sanıyordu. Madenden limana (Neon Şehir) giden
  rota Kervankent'e çıkıp oradan düz çizgiyle dönüyordu (≈6,5 km yerine 1,2 km). İş rotaları artık iğnedeki gibi gerçek en kısa yol (`navRoute`, köy / maden yolları dahil).
- **Elmas Madeni girişindeki kırmızı bariyer** yaklaşınca kalkıyor, uzaklaşınca iniyor.

## Yayın
`v221-yayinla.bat`: testler, derleme, **RTDB kuralları**, **fonksiyonlar** (seyyar geliri, yol kenarı alışveriş, kaykay ömrü, fotoğraf `lz`), commit, push, Cloudflare. Firestore kuralları değişmedi.
