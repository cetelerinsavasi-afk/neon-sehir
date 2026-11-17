# v166 — Akıcılık + galeri fiyatı + at düzeltmeleri

Sunucu (Firebase fonksiyonları, kurallar, indeksler) DEĞİŞMEDİ. Firestore okuma/yazma artmaz,
oyuncu verisine dokunulmaz. Sadece site (arayüz) güncellenir.

## Değişenler
1. **Atın farı kaldırıldı** — diğer oyuncuların atında (ve fotoğraflarda) yere düşen far ışığı yok.
2. **Oyunun galerisi / silah mağazası kendi dükkânını göstermez** — dükkân sahibi oyunun
   mağazasında artık KENDİ fiyatını değil, diğer dükkânların en ucuzunu (yoksa oyunun fiyatını)
   görür ve satın alabilir. (Sunucu zaten kendi dükkânını atlıyordu; ekran farklı fiyat
   gösterdiği için "fiyat değişti" hatası çıkıyordu.) Ek okuma yok: dükkân listesi zaten açık
   olan hatırlatıcı dinleyicisinden gelir.
3. **Kasma / açılış**
   - Açılıştan 3 sn sonra bütün ekranlar (şehir, ev, mekânlar, futbol…) arka planda
     ÇALIŞTIRILIYORDU → telefonda saniyelerce kasma + kalıcı bellek. Artık sadece indiriliyor
     (çalıştırılmıyor). Liste derlemede `prefetch-list.json` olarak çıkar.
   - Şehirde araba / at sürerken hız göstergesi yüzünden bütün şehir ekranı saniyede ~10 kez
     yeniden çiziliyordu → gösterge artık kendi kendini günceller.
   - Motordaki (kasklı) oyuncuların avatarı ağdan her kayıt geldiğinde yeniden kuruluyordu → düzeldi.
   - Atlarda büyük saydam far düzlemi yok (telefon ekran kartına ek yük).
4. **Soygun videosu** — video başlamadan (yüklenirken / sunucu beklenirken) de "Geç ⏭" var;
   basınca video beklenmeden sonuç gelir. Açılış kartı 1,4 sn → 0,9 sn. Mekânlar › Soygun
   paneli açılınca video dosyası önceden hazırlanır.
5. **2. elde at (ve bisiklet / motor / ticari) satışı** — ekran bu araçların fiyat aralığını
   tamir hakkını da sayarak hesaplıyordu, sunucu sadece kalan ömürden. Ömrü biraz azalan atın
   ekrandaki en düşük fiyatı bile sunucunun en yüksek fiyatını aşıyordu → ilan hiç verilemiyordu.
   Artık aralık sunucunun kendi formülüyle hesaplanır.

## Kontrol listesi (yayından sonra)
- [ ] Atla gez: atın önünde ışık yok (kendi atın + diğer oyuncunun atı).
- [ ] Galeri sahibi hesapla: Oyunun galerisinde fiyat kendi fiyatın değil; Satın Al çalışıyor.
- [ ] Silahçı sahibi hesapla: aynı kontrol.
- [ ] Mekânlar › Soygun: başlat → yüklenirken sağ üstte "Geç ⏭" → sonuç geliyor.
- [ ] Şehirde banka kapısında Soygun → "Soygun başlıyor…" + Geç.
- [ ] 2. El › İlan Ver › Araç: atını seç, gösterilen aralıkta ilan ver → başarılı.
- [ ] Telefonda oyunu aç: ilk 10-20 sn'deki takılma azaldı mı?

Geri dönüş: `geri-al-v166.bat`
