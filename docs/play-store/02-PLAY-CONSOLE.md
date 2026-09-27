# Google Play Console — form yanıtları, Veri Güvenliği ve bağlantılar

> Yanıtlar koddan ve yayındaki `gizlilik.html`'den çıkarıldı. Alan adı: **cetelerinsavasi.com**. ⚖️ işaretli maddeler senin kararın; önerim yanlarında.

## 1. Bağlantılar (Play Console'a girilecek)
| Alan | URL | Uygulama içinde nerede? |
|---|---|---|
| Gizlilik politikası | `https://cetelerinsavasi.com/gizlilik` | Giriş ekranı (onay cümlesi) · Rehber altı · **Profil (Ev) altı** |
| Hesap silme (web) | `https://cetelerinsavasi.com/hesap-silme` | Profil altındaki "Hesap Silme" bağlantısı |
| Hesap silme (uygulama içi) | – | Profil (Ev) › **"Hesabımı Sil"** (uid'li e-posta talebi) |
| Kullanım koşulları | `https://cetelerinsavasi.com/kosullar` | Giriş ekranı · Rehber · Profil |
| Destek e-postası | `cetelerinsavasi@gmail.com` | Tüm yasal sayfalar |

Sayfalar yerelde doğrulandı: hepsi yönlendirmesiz `200 text/html` dönüyor, `/.well-known/assetlinks.json` `200 application/json`. Android içinde `?p=android` eki web'e özel satın alma bölümünü gizliyor (Faz 4).

## 2. Uygulama içeriği beyanları
| Form | Yanıt |
|---|---|
| **Reklamlar** | Hayır, reklam yok. |
| **Reklam kimliği (Advertising ID)** | Kullanmıyor. Bubblewrap'ın ürettiği manifest'te `AD_ID` dahil **hiç izin yok** (doğrulandı). |
| **Uygulama erişimi** ⚖️ | "Bazı işlevler kısıtlı" + talimat: *"Oyun Google hesabıyla giriş ister; herhangi bir Google hesabıyla giriş yapılabilir, davet kodu veya abonelik gerekmez."* İnceleme sorunsuz geçsin istersen bir test Google hesabı da verebilirsin. |
| **Hedef kitle** | **Yalnızca 18 yaş ve üstü** (Kullanım Koşulları md. 2 ile tutarlı). Çocuklara yönelik değil; Aile programı yok. |
| **İçerik derecelendirmesi (IARC)** | Kategori: Oyun. **Benzetilmiş kumar: EVET** (kumarhane, slot, piyango, bahis; sanal para, nakde çevrilemez). **Kullanıcılar etkileşime girer: EVET** (sohbet, Sixtagram). Konum paylaşımı: Hayır. Dijital satın alma: Android'de **Hayır** (satın alma yalnızca web'de). Şiddet/suç temaları (soygun, silah, çete) metin ağırlıklı ve grafiksel değil; soruları buna göre dürüstçe yanıtla. |
| **Kumar** | Gerçek parayla kumar **yok**. Altın nakde çevrilemez ve oyun dışına aktarılamaz; ödül gerçek değer taşımaz. Android'de satın alma ekranı yok. |
| **Haber uygulaması / Sağlık / Finans / Devlet** | Hayır. |
| **Kullanıcı içeriği (UGC)** | Uygulama içi bildirme ve engelleme **var** (oyuncu kartı ⋯ / mesaja uzun basma), moderasyon paneli ve yaptırımlar **var**, kurallar Kullanım Koşulları md. 6'da. |
| **Hesap silme** | Uygulama içinde: Profil › Hesabımı Sil. Web: `/hesap-silme`. Silinen ve saklanan veriler o sayfada anlatılıyor. |

## 3. Veri Güvenliği (Data safety) formu
**Genel sorular**
- Uygulama zorunlu kullanıcı veri türlerinden herhangi birini topluyor veya paylaşıyor mu? **Evet.**
- Tüm veriler aktarım sırasında şifreleniyor mu? **Evet** (HTTPS, Firebase).
- Kullanıcılar verilerinin silinmesini isteyebilir mi? **Evet** (uygulama içi + `/hesap-silme`).
- **Paylaşım:** Tümü için **Hayır**. Hizmet sağlayıcılar (Google Firebase, Cloudflare) Play tanımında "paylaşım" sayılmaz. Oyuncunun kendi yayımladığı sohbet ve gönderi içerikleri de kullanıcının başlattığı aktarım olduğundan paylaşım sayılmaz.

**Toplanan veri türleri**
| Play kategorisi › türü | Toplanıyor mu | Zorunlu mu | Amaçlar | Kaynak (kodda) |
|---|---|---|---|---|
| Kişisel bilgiler › **Ad** | Evet | Zorunlu (Google adı ilk oyun içi ad olur) | Uygulama işlevselliği, Hesap yönetimi | `users.displayName` |
| Kişisel bilgiler › **E-posta adresi** | Evet | Zorunlu | Hesap yönetimi (giriş, hesap silme doğrulaması, destek) | Firebase Auth |
| Kişisel bilgiler › **Kullanıcı kimlikleri** | Evet | Zorunlu | Uygulama işlevselliği, Hesap yönetimi, Dolandırıcılık önleme/güvenlik | Firebase uid |
| Mesajlar › **Diğer uygulama içi mesajlar** | Evet | İsteğe bağlı | Uygulama işlevselliği, Dolandırıcılık önleme/güvenlik/uyumluluk (moderasyon) | ChatsApp, çete/İstihbarat sohbetleri, konuşma balonları, oyun içi "SMS" kutusu |
| Uygulama etkinliği › **Uygulama etkileşimleri** | Evet | Zorunlu | Uygulama işlevselliği | Oyun işlemleri, bahisler, üretim, soygun vb. |
| Uygulama etkinliği › **Kullanıcı tarafından oluşturulan diğer içerikler** | Evet | İsteğe bağlı | Uygulama işlevselliği, Güvenlik/uyumluluk | Sixtagram gönderi/yorum, oyun içi ad, fabrika/takım/çete adları, fikirler, bildirimler (şikâyet) |
| Uygulama etkinliği › **Diğer işlemler** | Evet | İsteğe bağlı | Uygulama işlevselliği | Engelleme listesi, beğeniler |
| Finansal bilgiler › **Satın alma geçmişi** ⚖️ | **Hayır** (önerim) | – | – | Android'de satın alma yok; web siparişleri (Shopier) uygulama dışında toplanıyor. İhtiyatlı olmak istersen "Evet · Hesap yönetimi" işaretle; zararı yok. |

**Toplanmayanlar:** Konum (oyun haritası gerçek konum değil), fotoğraf/video (avatar çizimle oluşturuluyor, yükleme yok), ses, dosyalar, takvim, kişiler, sağlık/fitness, web tarama geçmişi, yüklü uygulamalar, arama geçmişi, kilitlenme günlükleri ve tanılama (Crashlytics/analitik yok), cihaz veya reklam kimliği, gerçek SMS ve e-posta içerikleri.

> Gizlilik politikasıyla tutarlılık: `gizlilik.html` md. 2 (a)–(f) ve md. 6 bu tabloyla aynı veri kalemlerini sayıyor.

## 4. Mağaza girişi (taslak)
- **Uygulama adı:** Neon Şehir
- **Kısa açıklama** (≤80): *Çeteni kur, fabrikanı işlet, soygun planla — neon şehirde zirveye oyna.*
- **Tam açıklama** (taslak): Neon Şehir; ticaret, strateji ve sosyal oyunu tek haritada buluşturan çok oyunculu bir şehir oyunudur. Fabrikanı kur, işçi çalıştır, üretimini sat. Çete kur ya da bir çeteye katıl, ticaret yolları için Pazar savaşlarına gir. Soygun planla, yarışlara katıl, futbol takımı yönet, Sixtagram'da paylaş. *Oyundaki kumarhane, bahis ve piyango sanal para ile oynanır; gerçek para veya ödül kazanılmaz. 18 yaş ve üzeri içindir.*
- **Kategori:** Oyun › Simülasyon (ya da Strateji).
- **Görseller:**
  - Uygulama ikonu 512×512: `android/store-assets/play-icon-512.png`
  - Öne çıkan görsel 1024×500: `android/store-assets/feature-graphic-1024x500.png`
  - **Telefon ekran görüntüleri:** en az 2 adet, 9:16 dikey önerilir. Dahili test sürümünden **gerçek** oyun ekranlarıyla çek: harita, çete paneli, fabrika, Sixtagram, yarış.

## 5. Yayın yolu
1. **Dahili test:** .aab'ı yükle, kendin kur, `01-TWA-VE-AAB.md` §5 listesini doğrula.
2. **Kapalı test:** Geliştirici hesabın **kişisel** ve 13 Kasım 2023'ten sonra açıldıysa, üretime çıkmadan önce **en az 12 test kullanıcısı ile 14 gün kesintisiz** kapalı test şartı var. Kuruluş hesaplarında bu şart yok.
3. **Üretim:** Uygulama içeriği formları tamamlanınca "Üretime erişim başvurusu" → inceleme.
4. Her yeni .aab öncesi `node scripts/check-assetlinks.mjs https://cetelerinsavasi.com` çalıştır.
