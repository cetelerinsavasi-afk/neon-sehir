# v135 — Değişiklikler

Bu paketteki dosyaları proje klasörünün (neon-sehir) üstüne kopyala (aynı yollar). Sadece değişen / yeni dosyalar var.

## Deploy
- **Functions:** `shopAction, houseAction, createSixtagramPost`
  - Yeni fonksiyon adı YOK, Firestore kuralı / index değişikliği YOK (takip ve hikâye verisi mevcut belgelere yazılıyor).
  - Önce functions, sonra frontend (push). Yeni kamera ve stüdyolar yeni `houseAction` / `shopAction` olmadan çalışmaz.

## Yapılanlar
| Madde | Nerede |
|---|---|
| **Haber Stüdyosu** (Stüdyo kategorisi, 10 💎, tek parça: kavisli LED fon + yarım ay masa + ekranlar + mikrofon + tek sunucu koltuğu, kayan haber bandı) | houseCatalogV135.js, houseCatalogData.js |
| Koltuğa oturunca "🎙️ Röportaj yap" → metni yaz → haber kanalı önizlemesi → Sixtagram | HomeOfficeLayer.jsx, MinuteStudios.jsx, houseEngine.js (`seated` eylem) |
| Röportaj artık hep haber stüdyosu: ortada sunucu, altta ince masa şeridi, NEON HABER fonu, kanal adı = ofisin adı | broadcastBackdrops.js, TalkingAvatarScene, InterviewPlayer |
| Mikser gibi: sahip ücretsiz, ücretsizken başkası kullanamaz, ücretliyse 200–800/dk (tuval 100–400/dk), her mobilyanın kendi fiyatı; ücretli olunca ev ofis olur | officeData.js (`MINUTE_KEYS`, `office.minutes`), office.js, venue.js, OfficePanel.jsx |
| **Resim Atölyesi** kategorisi (Camii'den sonra): Tuval (renk seçeneği = üstündeki desen, 8 desen), Boya Masası, Ressam Taburesi, Malzeme Rafı, Boyalı Örtü, Boya Kovaları, Kil Büst, Atölye Lambası (5.000–40.000) | houseCatalogV135.js |
| Tuvale yaklaşınca "🎨 Resim çiz" → çizim paneli → Sixtagram'da paylaş | MinuteStudios.jsx, DrawingPad.jsx |
| Sixtagram'daki "Röportaj Yap" ve "Resim Çiz" kaldırıldı (sunucu da sadece stüdyodan kabul ediyor) | ComposeModal.jsx, index.js, homeOffice.js |
| Resim ve röportajlara şarkı gibi altın desteği (aynı sınırlar) | PostTipBar.jsx, homeOffice.js (`postTip`) |
| **Liman & Depo** kategorisi (Stüdyo'dan sonra): Konteyner (10 renk, 100.000), Konteyner Tırı (50.000, binilir), Liman Vinci (80.000, tavana göre boylanır, arabası hareketli), Forklift (45.000, binilir), Palet Yığını, Halat Babası (oturulur), Liman Projektörü + Gazino'dan taşınan Patron Masası, Kaçak Kasalar, Sallanan Ampul | houseCatalogV135.js, houseCatalog.js |
| Ateş Aurası hareketli (3D evlerde, 2D mekânlarda, aksesuar mağazasında, profil resimlerinde) | cosmeticsArt.js, houseEngine.js, canvasWorldKit.js, AccessoryShop.jsx |
| **Sixtagram yeni tasarım** (Instagram gibi): alt sekmeler Anasayfa · Medya · Paylaş · Takip · Profil | SixtagramScreen.jsx/.css, PostCard.jsx |
| Hikâyeler: mekânda çekilen fotoğraf hikâye olur; Anasayfa/Takip üstünde; önce kendi hikâyen, sonra izlenmeyenler, en sonda izlenenler (her biri takipçisi çoktan aza); izlenmemiş renkli halka; altta küçük fotoğraf + ad; kendi hikâyende görüntülenme sayısı + silme | SixStories.jsx, sixtagramSocial.js (`storyView`) |
| Anasayfa: yazılar ve "Görsel ekle" paylaşımları · Medya: Şarkılar / Röportajlar / Resimler · Takip: sadece takip ettiklerinin hikâye ve gönderileri | SixtagramScreen.jsx |
| Takip sistemi: gönderideki fotoğrafa dokun → profil (takip et/bırak, takipçi, beğeni, son 24 saat) · Profilinde takipçi/takip listeleri, takibi bırak | SixProfile.jsx, sixtagramSocial.js (`sixFollow`) |
| Takip ve destek bildirimleri SMS değil Sixtagram bildirimi | sixtagramSocial.js, homeOffice.js, NotificationsPanel.jsx |
| Fotoğraf dikey (telefon ekranı); üstüne yazı (renk/boy/kutulu, sürükleyerek yer) ve çizim | PhotoStoryEditor.jsx, photoOverlay.js |
| **Çekilen = paylaşılan**: deklanşörde sunucu sahneyi (tasarım + kişiler + kamera) imzalı ek olarak döndürür; önizleme bu ekten çizilir, paylaşımda aynısı kullanılır | houses.js (`photoShot`, `buildPhotoAttachment`), HousePhoto.jsx, HouseScreen.jsx |

## v135.1 ekleri
| Madde | Nerede |
|---|---|
| Hikâye editörü Instagram gibi: 6 yazı tipi (Klasik, Modern, Neon, Daktilo, Güçlü, El yazısı), soldaki çubukla boy, çerçeve (yok / dolu / yarı saydam) + ayrı çerçeve rengi, hizalama, sürüklerken ortaya yapışma (mavi çizgi), iki parmakla büyütme/döndürme, çöpe sürükleyip silme, boş yere dokununca yazı | PhotoStoryEditor.jsx, photoOverlay.js |
| Çizim: kalem / fosforlu / neon / silgi, kalınlık çubuğu, geri al | aynı |
| Fotoğrafta, çekim anında kameranın önünde saydamlaşan eşyalar da saydam (çekilen = paylaşılan) | houseEngine.js, houses.js, HousePhoto.jsx |
| Sixtagram yeni Instagram görünümü: kalp bildirim, simgeli alt sekmeler + profil fotoğrafı, gönderide "• Takip et", hikâyesi olanın halkası, çift dokunuşla beğeni, sayılar ikon yanında | PostCard.jsx/.css, SixtagramScreen, igIcons.jsx |
| Yorumlar paneli ve bildirimler sayfası Instagram gibi (Bugün / Bu hafta / Daha önce, takip et düğmesi, avatarlar) | CommentsPanel, NotificationsPanel |
| Gönderi ve hikâye silme onaylı | ConfirmSheet.jsx |
| Medya'dayken Medya'ya tekrar basınca sıradaki kategori | SixtagramScreen.jsx |
| Mekânlardaki sağ 5 buton özel çizim ikonlar | SideIcons.jsx, HouseScreen.css |

## Firestore tasarrufu
- Sekmeler aynı akış isteğini kullanır (son 150 gönderi, 90 sn önbellek) — yeni dinleyici yok.
- Takip edilenler/takipçiler zaten dinlenen `sixtagramUserLikes/{uid}` belgesinde; başka oyuncunun profil sayaçları bir kez okunur, 2 dk önbellekte.
- Hikâye "izlendi": cihazda tutulur, görüntülenmeler izleyici kapanınca TEK istekle gönderilir; okuma yapılmaz.

Kontrol: oxlint (hata yok), vite build başarılı, functions testleri 511/511 (yeni: scripts/v135.test.mjs).
Önizleme: `npm run preview:gangs` → /v135-house.html (stüdyo, tuval, kamera) · /v135-six.html (Sixtagram).
