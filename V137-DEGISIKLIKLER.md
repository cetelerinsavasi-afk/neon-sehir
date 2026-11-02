# v137 — Maliyet azaltma + polis tır limiti + yurtdışı saat notu

## Fatura nereden geliyordu (3 Eki – 1 Kas 2026, toplam ₺1.251)
| Kalem | Tutar | Kaynak |
|---|---|---|
| Cloud Functions CPU | ₺601 (bir önceki aya göre %666 artış) | `mekanSayac*` tetikleyicileri (~70 bin sn/hafta), `playBillingSweep` (~18,7 bin sn/hafta) |
| Firestore okuma | ₺449 (16,7 milyon okuma) | Çoğu istemci dinleyicileri; sunucu tarafında en büyükleri mining makinesi okumaları |
| Cloud Scheduler | ₺96 | ~25 zamanlanmış iş (iş başına aylık ~₺4) |
| Diğer | ~₺105 | Firestore yazma, veri çıkışı, Secret Manager |

## Yapılanlar
### Maliyet
- **"Kaç kişi var" sayacı (`presenceSummary.nudge`)**: Tetikleyici sayım zamanını fonksiyonun içinde 15 sn'ye kadar uyuyarak bekliyordu. Bu bekleme saniye saniye faturalanıyordu. Artık beklemiyor:
  - Son sayımın üzerinden 15 sn geçtiyse hemen sayıyor.
  - Geçmediyse olayı "kirli" işaretleyip dönüyor; bu olay sonraki giriş/çıkışta ya da 5 dakikalık süpürmede (`expireInteriorPresence` → `flushIfDirty`) sayılıyor.
  - Sayılar en kötü durumda 15 sn yerine ~5 dk gecikebilir. Mekândaki canlı oyuncu görünümü bundan etkilenmez.
- **`playBillingSweep`**: 30 dakika yerine 2 saatte bir çalışıyor.
- **`v124Migrate`, `champV2Migrate`, `shopV130Migrate`**: Saatlik yerine günlük çalışıyor. Geçişler bitti; `dailyReset` de her gece çalıştırıyor.
- **Mining makinesi alma (`buyFactoryMachine`)**: Fiyat hesabı için tüm makineler okunmuyor, sayılıyor. 336 makinesi olan bir oyuncu için alım başına 336 okuma yerine 1 okuma.
- **Makineleri çalıştırma (`stampUntriggeredMining`)**:
  - Hepsi bugün zaten tetiklendiyse makineler okunmuyor, iki sayım yapılıyor. Sayım bir hata verirse eski yola dönüyor.
  - `runFactoryMachines` makineleri artık iki kez okumuyor.
  - 450'den fazla makine güncellemesi parçalara bölünüyor.

### Polis
- Polis başına **günde 1 tır ihbarı** ve **günde 1 tır içeriği açma** (İstanbul günü, 00:00'da yenilenir). Sunucu `memberships/{uid}.intelTruckReportDay / intelTruckLeakDay` alanlarıyla denetliyor.
- Arayüzde hak kullanılınca buton yerine "🔒 Bugünkü … hakkın kullanıldı" görünüyor. Hatırlatıcılar da buna uyuyor.

### Yurtdışındaki oyuncu (fabrika)
- Sunucu tarafında üretim kaybı bulunmadı: gece üretimi doğru yazılıyor ve son 7 günde `runFactoryMachines` hiç hata vermemiş.
- Fabrika ekranındaki tüm "00:00" metinleri, telefonun saat dilimi Türkiye'den farklıysa "(Türkiye saati · senin saatinle 22:00, 5 sa 12 dk sonra)" diye açıklanıyor. Türkiye'deki oyuncuların ekranı değişmiyor.

## Yükleme
`deploy-v137.bat` dosyasını çift tıkla. Kurallar değişmedi; önce fonksiyonlar, sonra git push yapılıyor. 23:00–01:00 arası çalıştırma. "Silinsin mi?" diye sorarsa **N**.
