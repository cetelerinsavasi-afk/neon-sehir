# v200 güncellemesi (v199 + v198 dahil)

## Yayın
- Yayındayken **🎮 Oyna**: Oyun Salonu · Yarış Pisti · Neon Gazino (eski evdeki gibi). Tek gazino olduğu için gazino seçimi yok; doğrudan On Numara / Rulet / Slot. Rulet ve slot izleyicilere gider (RTDB). Gazino listesi okunmadığı için okuma da azaldı.

## Ev: kilit + evden çıkar
- Tasarla'da üst çubukta **🔓 / 🔒**. Kilitliyken ev Evler listesinde görünmez ve kimse giremez.
- Kilitlemek içerideki ziyaretçileri **atmaz**.
- Kendi evindeyken ve ev kilitliyken **👥 N kişi yakında** listesinde, evinde olan her oyuncunun yanında **🚪 Çıkar** düğmesi çıkar. Ev açıkken bu düğme çıkmaz; sunucu da ev açıkken çıkarmayı reddeder. Çıkarılan oyuncu kapının dışına alınır, ev kilitli olduğu için geri giremez.

## Ismarla (eski sistemdeki gibi)
- Elinde bir ürün varken **👥 N kişi yakında** listesinde her oyuncunun yanındaki **🎁 Ismarla** düğmesi aktif olur. Basınca elindeki ürün o oyuncuya geçer; menü açılmaz.
- Ürünün süresi sıfırlanmaz, kalan süresiyle gider.
- Eli dolu olana ısmarlanmaz, düğmede "Eli dolu" yazar.
- Karşıda küçük bir "🎁 X sana … ısmarladı!" yazısı çıkar; üstüne dokununca kapanır, dokunulmazsa 4,5 sn'de kendiliğinden kaybolur.

## Seyyar satıcı geliri
- Bütün satıcı gelirleri (bağış, menü, ısmarlama, kuryenin %10 sipariş parası): **%50 masraf** → **seyyar satıcı vergisi** → kalan kâr o satıcının hissedarlarına. Örnek (vergi %10): 1.000 altın → 500 masraf, 100 vergi, 400 hissedarlara. Hissedar bu 400'ü toplarken hisse vergisini öder (%10 ise 40).
- **Ticaret Bakanlığı › Seyyar Satıcı Vergisi**: %1–%20 arası, birer birer değiştirilir, %10 ile başlar. Bakanlık ekranında ve Defter'de ayrı kalem olarak görünür.
- %10 hisse gelir vergisi değişmedi: hissedar parasını toplarken ödüyor.

## Teknik
- Ismarlama ve çıkarma haberi RTDB'deki kişisel kutudan gider (`cityBox/{uid}`). Kutuyu sadece sahibi okuyabilir, sadece sunucu yazabilir. Firestore okuması yok. Bunun için `database.rules.json`'a `cityBox` kuralı eklendi. `deploy-push.bat` artık RTDB kurallarını da yüklüyor (`firebase deploy --only functions,database`).
