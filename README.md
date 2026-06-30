# Neon Şehir

Şehir haritası tabanlı ticaret + suç + araba oyunu. Master prompttaki
"GELİŞTİRME FAZLARI" sırasına göre inşa ediliyor.

## Şu ana kadar tamamlanan: Faz 0 + Faz 1

- ✅ Vite + React iskeleti kuruldu.
- ✅ `interaktif-harita.html`'deki harita mantığı `<CityMap />` React
  bileşenine taşındı (16 bölge, aynı koordinatlar, aynı görsel asset).
- ✅ Üst HUD bar (şüphe / saygınlık / altın) — şimdilik mock veriyle.
- ✅ Alt sağ köşede telefon ikonu → tam ekran telefon arayüzüne geçiyor
  (uygulamalar Faz 6'da dolacak).
- ✅ 16 bölgenin tıklanması bottom-sheet modal açıyor ("yakında" placeholder).
- ✅ Neon/cyberpunk renk paleti (`--neon-pink`, `--neon-cyan`, `--neon-yellow`)
  CSS değişkenleri olarak `src/styles/theme.css` içinde tanımlı.

## Çalıştırma

```bash
npm install
npm run dev      # geliştirme sunucusu
npm run build    # production build (dist/ klasörüne)
```

## Klasör yapısı

```
src/
  components/
    CityMap/      → harita + bölge tıklama mantığı
    Hud/          → üst bar (şüphe/saygınlık/altın)
    Phone/        → telefon butonu + tam ekran telefon ekranı
    RegionModal/  → bölge tıklamasında açılan bottom-sheet
  data/
    regions.js    → 16 bölgenin koordinat + meta verisi
  styles/
    theme.css     → neon renk paleti, global stiller
```

## Henüz YAPILMAYAN ve neden

Bu sandbox ortamında **gerçek bir Firebase projesi, Cloudflare Pages hesabı
veya GitHub reposu oluşturup bunlara bağlanma imkânı yok** — bunlar sizin
kendi kimlik bilgilerinizi (API anahtarları, hesap erişimi) gerektiriyor.
Bu yüzden Faz 0'daki "Firebase projesi bağlama" ve "Cloudflare Pages
bağlama" adımları atlandı; geri kalan her şey (kod, klasör yapısı, harita
taşıma, HUD, telefon, modal) tamamlandı ve çalışır durumda.

### Faz 2'ye geçmeden önce sizin yapmanız gerekenler:
1. Bu projeyi bir GitHub reposuna push edin.
2. Bir Firebase projesi oluşturun (Auth + Firestore + Cloud Functions
   açık), `.env` dosyasına config'i ekleyin.
3. Cloudflare Pages'i bu repoya bağlayın (push-to-deploy).

Bunlar tamamlandıktan sonra "Faz 2 — Ekonominin Temeli" ile devam
edebiliriz (Firestore veri modeli, Cloud Functions iskeleti, günlük
sıfırlama job'ı, meslek sistemi, fabrika işçiliği).
