# v146 — Karargahlar, Polis Teşkilatı mekânı, hatırlatmalar, ev satışı, transfer vergisi, Mobilyalar

## 1. Yeni mesaj hatırlatmaları
- Belediye / Çete / Polis Teşkilatı sohbetinde okunmamış mesaj varsa ana ekranın hatırlatma panelinde satır çıkar ("Çetende yeni mesajlar var" vb.).
- O sohbet açılıp görülünce hatırlatma kaybolur. Çete/teşkilat için var olan okunmamış sayaçları kullanılıyor; belediye için sadece koltuğu olanlarda kanal başına 1 hafif dinleyici.

## 2. Özel mesaj bildirimi
- Yeni DM gelince üstten 📩 bildirim iner (o konuşma zaten açıksa inmez). Dokununca konuşma açılır.

## 3. Karargahlar
- **Çeteler ekranı** artık sadece liste (alttaki 5 sekme kaldırıldı). "Aç" → karargah mekânına girilir.
- **Çete karargahı** (`hq_{çete}`): ilk girişte boş kurulur ("{Çete} Karargahı"), çete tasarlar.
  - Sağ üst **🏴 Çete** → Sohbet · Savaş · Ticaret · Çetem (her açılışta Savaş).
  - Başka çetenin karargahına **girilemez**. Davetli çete girebilir ama **🏴 Çete butonu çıkmaz** — başka çetenin iç dünyası hiçbir şekilde görünmez (davetliye sadece "📨 Davetlisin" yazar).
  - **Yetki**: Mafya babası ＋ panelinden üyelere verir. Yetki üye belgesinde durur → üye ayrılınca/atılınca kendiliğinden düşer.
  - Mobilyayı baba + yetkililer **çete kasasından** (altın + zümrüt) alır, ayrı mobilya kasası yok. Her harcama çete sohbetine yazılır. Çete envanteri oyuncu envanterinden ayrı.
  - **Ayarlar ⚙️** (baba + yetkili): Fiyatlar · Davet · Rapor. Ücretli ürünler isteğe bağlı; gelir **vergisiz**, çete kasasına girer.
  - **Davet**: herhangi bir çete seçilir. Davet edilen çete Savaş sekmesinde "Devam eden savaşlar"ın üstünde **Davetler**i görür ve girer. Davet kaldırılınca kimse otomatik atılmaz; yetkililer elle atar. Davet yoksa buton gizli; savaş yoksa "Devam eden savaşlar" gizli.
  - Çete kapanınca karargah mobilyalarıyla, çete envanteri ve pazar ilanlarıyla birlikte silinir.
- **Zümrüt**: çete kasası zümrüt tutar. Çetem › 💎 Zümrüt bağışı (1 zümrüt = 50.000 prestij). Zümrüt dağıtılamaz / çekilemez, sadece karargah mobilyasına harcanır.
- **Polis Teşkilatı** mekânı (`game_teskilat`): hazır tasarım (toplantı masası, aranan panosu, masalar, silah dolabı, sorgu odası, semaver…). Çaycı Necmi var, komiser botu yok.
  - Sağ üst **🚓 Polis Teşkilatı** → Sohbet · Savaş · Operasyon · Teşkilat (Savaş ilk).
  - Polisler **kod adı + varsayılan tip** ile görünür (kendi ekranlarında da). Kimlik sızmasın diye: konum kaydı takma kimlikle (`pa_…`), canlı konum/sayaç kaydı tutulmaz, profil açılmaz, hediye / fotoğraf / davet kapalı.
  - Belediye başkanı, yardımcıları ve teşkilat bakanı gerçek adı + makamıyla görünür.

## 4. Ziyaret paneli
- Seyyar satıcı mekânları listede. Yeni filtre **Karargahlar**: yetkin olmayanlar 🔒 (girilmez).

## 5. Neon şehir duvar paneli
- "NEON ŞEHİR" yazısı kaldırıldı (yerine yıldızlar).

## 6. Ev satışı
- Ev ayarlarında **Sat** (sadece ev/depo; işletme, ofis, karargah hariç). Onay penceresi çıkar.
- 500.000 iade + evin kasasındaki altın/zümrüt sahibine. Satın alınmış mobilyalar envantere, deneme eşyaları düşer. Ev, sohbeti ve depo kapanır. Canlı yayın sürerken satılamaz.

## 7. Futbolcu transfer vergisi
- Kültür ve Spor Bakanlığı: %5 başlar, %1–%10, ±1. **Alıcı** fiyat + vergi öder, satan ilan fiyatını alır.
- Maaşlı (gerçek oyuncu) futbolcularda yok. Fiyat/oran değiştiyse satın alma "vergi değişti" diye durur (yanlış ödeme olmaz).

## 8. Profil: Aksesuarlar · Günlük rapor · Mobilyalar
- Üç kare buton yan yana. **Mobilyalar**: envanterdeki mobilyalar + fiyatları, pazara koyma, ilanlarım, **evi olmadan pazardan satın alma** (envantere gelir).

## ⚠️ Mantık uyarıları
- **Zümrüt çıkarma yolu (kabul ettin):** yetkili, çete zümrüdüyle mobilya alıp çete adına pazara koyabiliyor; satış geliri yine çete kasasına girer ama bir yetkili kendi hesabıyla (ya da arkadaşıyla) ucuza alıp parayı/eşyayı çeteden dışarı taşıyabilir. Babanın yetkiyi dikkatli vermesi gerekir; her alım/ilan çete sohbetine yazılıyor.
- Çete dağılınca kasadaki **zümrüt kaybolur** (altın mevcut kurala göre devlete gider).
- Davet kaldırılınca içerideki misafir **atılmaz**; çıkıp tekrar giremez.
- Polis teşkilatında aynı oda sohbeti herkese açık; polis yazarken kod adıyla görünür.

## Firestore maliyeti
- Karargah = normal 3D ev (aynı okuma/yazma). Teşkilatta polis için RTDB/sayaç yazması yok.
- Yeni dinleyici: sadece Savaş sekmesindeki "Davetler" (tek sorgu). Karargahlar filtresi açılınca 1 sorgu.

## Yükleme sırası (deploy-v146.bat yapar)
1. Fonksiyonlar (v145 + v146): `houseAction, shopAction, buyFromVendor, giftHeldItem` · `gangAction, gangClock` · `belediyeAction, getStateReport, buyFutbolPlayer` · `cronTick, dailyReset, dailyResetRecovery`
2. `firestore:rules` (teşkilat takma kimlik izinleri — **şart**, yoksa polisler teşkilatta yürüyemez)
3. git commit + push (arayüz)

## Test
- Sunucu testleri 564 / 564 (yeni: karargah, teşkilat takma kimlik, ev satışı, çete ilanı + pazardan alım + dağılma, zümrüt bağışı, transfer vergisi). `vite build` hatasız. Önizlemede karargah, ayarlar, teşkilat ve paneller ekran görüntüsüyle kontrol edildi.
