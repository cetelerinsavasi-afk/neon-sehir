# android/ — Neon Şehir Android (TWA) kabuğu

| Dosya | Görev |
|---|---|
| `twa-manifest.json` | Bubblewrap yapılandırması (paket, alan adı, renkler, ikonlar, sürüm, imza) |
| `configure.mjs` | Alan adı, SHA-256 parmak izleri ve sürümü tek komutla yazar (`public/.well-known/assetlinks.json` dahil) |
| `store-assets/` | Play mağaza ikonu (512) ve öne çıkan görsel (1024×500) |

Hızlı başlangıç:
```bash
# alan adı (cetelerinsavasi.com) zaten işli
cd android && keytool -genkeypair -v -keystore android.keystore -alias android -keyalg RSA -keysize 2048 -validity 10000
bubblewrap update --skipVersionUpgrade && bubblewrap build     # → app-release-bundle.aab
```
Ayrıntılı adımlar: `docs/play-store/01-TWA-VE-AAB.md`. Play Console yanıtları: `docs/play-store/02-PLAY-CONSOLE.md`.

Bubblewrap'ın ürettiği proje dosyaları (`app/`, `gradle/`, `build.gradle`…), keystore ve .aab/.apk çıktıları `.gitignore` ile dışarıda tutulur. Proje dosyaları `twa-manifest.json`'dan her zaman yeniden üretilebilir.
