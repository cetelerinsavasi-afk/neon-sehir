# v165: Maliyet, 1. adım

## Ne değişti

| # | Değişiklik | Oyuncuya etkisi | Sunucu |
|---|---|---|---|
| B | Ortak saat (Date.now düzeltmesi) artık Realtime Database bağlantısının el sıkışmasından (`.info/serverTimeOffset`) geliyor. RTDB 8 sn içinde bağlanamazsa eski yol (`serverTime` fonksiyonu) aynen çalışıyor. | Açılışta fonksiyon çağrısı ve soğuk başlatma (≈2,5 sn) yok. Saat aynı. | `serverTime` yerinde (eski istemciler + yedek) |
| C1 | Futbol › Ligler, `ensureFutbolBotTreasuryFix`'i artık çağırmıyor. İki düzeltme de bitmiş durumda: `migrations/futbolBotTreasurySet100kV1` ve `futbolBotPlayerBoostV1` var. | Ekran daha hızlı, davranış aynı | Fonksiyon yerinde |
| C2 | Fabrika ekranı `ensureFactoryMigrationsV38`'i cihaz başına günde 1 kez çağırıyor. İstanbul saatiyle 00:00–00:20 arası eskisi gibi her açılışta. Geçişler bitmiş durumda (`yasakliMaddeMachinesRetiredV38`, `tamirMachinesDoubledV94`). Kalan iş, 00:00 yedeği (`releaseLeftFactoryWorkers`); gün içinde tekrar çalıştırmak sonucu değiştirmiyor. | Aynı | Fonksiyon yerinde |
| Ölçüm | Oturumların ~%10'unda Firestore okumaları dinleyici/sorgu bazında sayılıyor ve ~10 dk'da bir `clientReadStats` fonksiyonuna gidiyor. Fonksiyon yalnızca log yazıyor; veritabanına dokunmuyor, uid loglanmıyor. | Yok: veri, sıra ve dinleyici ayarları aynı; ek Firestore/RTDB okuması yok | YENİ: `clientReadStats` (128 MiB, en fazla 3 kopya) |

`firestore.rules`, `database.rules.json`, indeksler, `android-webview/` ve diğer tüm fonksiyonlar **değişmedi**.

## Ölçümü kapatma

- **Tek adım:** `olcum-kapat.bat`. `public/neon-flags.json` dosyasını `{"readStats": false}` yapar ve gönderir.
- **Kendiliğinden:** 21 Kasım 2026 00:00'dan (İstanbul) sonra hiçbir oturum ölçmez.
- **Tek cihazda:** tarayıcı konsolunda `localStorage.setItem('neon.noReadStats','1')`.
- **Varsayılan kapalı:** `neon-flags.json` okunamazsa ya da `true` değilse ölçüm kapalıdır.

## Geri alma

- **Tamamı:** `geri-al-v165.bat`. v165 commit'ini `git revert` ile geri alır ve gönderir.
- **Yalnızca saat, tek cihazda:** `localStorage.setItem('neon.clockViaFn','1')` ile o cihaz eski yola döner.

## Deploy'dan sonra neye bakmalı

### Hemen (deploy bittikten 5–10 dk sonra)

1. **Oyunu aç (Ctrl+F5):** Şehir, saatler ve geri sayımlar normal olmalı.
2. **Geliştirici araçları › Network:** `serverTime` isteği **görünmemeli**; RTDB bağlantısı (`firebaseio.com`) görünmeli.
3. **Logs Explorer:** Ölçümü kendi cihazında denemek için önce konsola `localStorage.setItem('neon.readStats','1')` yaz, sonra sayfayı yenile ve uygulamayı arka plana al. Logs Explorer'da şu sorguyu çalıştır:
   ```
   resource.type="cloud_run_revision"
   resource.labels.service_name="clientreadstats"
   jsonPayload.ns_read_stats=1
   ```
   `b` alanında `"doc:users/*": [...]` gibi satırlar görünmeli. Denemeden sonra konsola `localStorage.removeItem('neon.readStats')` yaz.
4. **Aynı serviste hata satırı olmamalı** (severity ≥ ERROR).

### 1–2 saat sonra (oyuncular sayfayı yeniledikçe)

Cloud Run'da `servertime`, `ensurefutbolbottreasuryfix` ve `ensurefactorymigrationsv38` servislerinin **istek sayısı** düşmeli. Metrics Explorer'da PromQL:

```
sum by (service_name)(rate(run_googleapis_com:request_count{service_name=~"servertime|ensurefutbolbottreasuryfix|ensurefactorymigrationsv38|clientreadstats"}[1h]))*3600
```

| Servis | Önce | Sonra (beklenen) |
|---|---|---|
| `servertime` | ~85 / saat | ~0–5 / saat (yalnızca RTDB'ye bağlanamayan cihazlar ve güncellenmemiş istemciler) |
| `ensurefutbolbottreasuryfix` | ~17 / saat | 0 |
| `ensurefactorymigrationsv38` | ~10 / saat | Fabrikaya giren cihaz sayısı kadar, günde 1 |
| `clientreadstats` | — | ~5–30 / saat |

### 24 saat sonra (Billing › Reports, gün gün)

- **Cloud Run functions CPU:** günde yaklaşık **700–850 CPU-sn daha az** (bugünkü ~5.500 CPU-sn/gün'ün ~%13–15'i). Aylık **≈ ₺20–25** tasarruf. Ölçüm fonksiyonu bunun içinden günde ~50–150 CPU-sn yer; ölçüm bitince o da kalkar.
- **Firestore okuma:** belirgin değişmez. Ölçüm ek okuma yapmaz; fabrika/futbol çağrılarının bayrak okumaları küçük.
- **Realtime Database:** yeni bir ücret kalemi beklenmez. Bağlantı sayısı biraz artabilir (ücretsiz sınır 200 bin eşzamanlı); indirme birkaç yüz bayt / oturum.
- **Cloud Logging:** ölçüm logları ücretsiz kotanın (50 GiB) çok altında, toplam birkaç MB.

## Ölçüm bitince

21 Kasım'dan sonra (ya da `olcum-kapat.bat`'tan sonra) Claude'a "ölçüm bitti" de. Loglardaki `b` alanları toplanır: her dinleyicinin/sorgunun haftalık okuması, örnekleme oranıyla (`rate`) ölçeklenir. Firestore'un toplam okumasıyla karşılaştırılır; aradaki fark sunucu tarafındaki okumalardır.

- `kesin`: sunucudan gelen değişen belgeler (ilk yük dahil).
- `olası`: önbellekten açılan dinleyicinin belgeleri ve 30 dk'dan uzun kopukluktan sonra açık dinleyiciler. Firestore bunları yalnızca son bağlantının üzerinden 30 dk'dan fazla geçtiyse yeniden faturalar.
