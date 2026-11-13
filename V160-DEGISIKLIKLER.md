# v160

## Kostümler (yeni)
- **Profil › 🎭 Kostümler** (Aksesuarlar'dan önce): prototipteki 100 hazır tip zümrütle satın alınır
- Fiyatlar: en ucuzu **10**, en pahalısı **200** zümrüt — Yaygın 10–15, Nadir 25–35, Epik 50–80, Efsanevi 120–200 (en ilgi çekici / kaliteli olanlar en pahalı: Siber Baba 200, Kozmik Muhafız ve Zeus 190, Demir Titan / Baba / Neon Samuray 175…)
- Kartta dene (yürü / dur / otur / silah), renk yuvalarını değiştir, **ten rengini** değiştir; satın alınca seçilen renklerle kuşanılır. Renkler sonra ücretsiz değişir ("🎨 Renkleri kaydet"), "Çıkar" ile kendi avatarına dönülür
- Kuşanılan kostüm aksesuar ve evcil hayvanla birlikte şehirde, mekânlarda, sohbette — her yerde görünür (kafayı kaplayan tiplerde şapka / gözlük gizlenir)
- Avatar oluşturucuda kostüm giyiliyken kendi avatarın gösterilir (düzenlediğin o)

## Prototip düzeltmeleri
- **Ten rengi** değiştirilebilir (tenin bütün gölgeleri birlikte değişir)
- **Renk değişmeyen elbiseler:** Kor / Dalga / Şafak Perisi elbiseleri, Gizli Ajan takımı, Şerif yeleği, Büyük Sihirbaz / Kont Vlad pelerini, Rock Yıldızı, Ölüm Meleği, Siber Ninja, Neon Samuray, Kızıl Samuray hakaması, Mor Cadı, Süper Teyze, Kelebek Kraliçesi, Kozmik Muhafız, Ringin Kraliçesi, Teneke Robot, Demir Titan, Mıknatıs, Valkür, Zeus togası, Çılgın Profesör önlüğü… artık değişiyor. Koyu kıyafetler (siyah takım, pantolon) saçla birlikte değişmiyor; gri / siyah tonlu yuvalarda renk yeşile kaymıyor
- **Kaş = saç:** kaşlar (ve sakal) hep saç renginde; saç rengi değişince kaş da değişir
- **Kadın karakterlerin kaşları ince**

## Şehir
- **Başka çetenin karargahına girilir:** her karargahın kapısında "🚪 İçeri gir" herkese açık (misafir: düzenleme / kasa / çete paneli yok; çıkarılan oyuncu yine giremez)
- **Mekâna girince kapıda görünme:** karargah, ev, ofis, işletme şehrin üstünde açıkken oyuncu artık kapının önünde görünmez; çıkınca hemen yeniden görünür
- **Yol tarifi yollar üzerinden:** iğneye düz çizgi yerine yol ağındaki en kısa rota (mini harita + büyük harita); ok rotanın ilerisini gösterir, mesafe yol boyunca

## Yükleme
- Site (git push → Cloudflare) + 2 fonksiyon: `cosmeticsAction` (kostümler), `houseAction` (karargaha misafir girişi)
- Firestore / veritabanı kuralları ve Android uygulaması değişmedi

# v160.1
- v160 sitesi yayına çıkmamıştı: GitHub'a gitti ama Cloudflare o commit için derleme başlatmadı (Kostümler ve yol tarifi bu yüzden görünmüyordu). Yükleme betiği artık push'tan sonra Cloudflare derlemesini bekleyip sonucunu söylüyor
- Profil düğmeleri: **Günlük Rapor · Kostümler · Aksesuarlar · Mobilyalar** (4 düğme)
- **Aksesuarlar bilgisayarda düzgün açılmıyordu:** Kaydet çubuğu sağa sıkışıyor, liste kayıyordu. Bilgisayar düzeni yeniden yapıldı (solda sahne, sağda liste, altında Kaydet); telefon düzeni aynı
- Kostümler ekranı bilgisayarda ortada telefon genişliğinde açılır
