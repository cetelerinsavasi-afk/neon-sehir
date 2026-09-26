# Hesap Silme Talebi — İşleme Rehberi

> **Durum (Faz 5b-2):** Araç varsayılan olarak **deneme modunda** çalışır (hiçbir şey değiştirmez). Gerçek silme yalnızca `--apply` ile, `[y/N]` onayından sonra yapılır.
>
> **Söz verdiğimiz süre:** Talep tarihinden itibaren **en geç 30 gün** (Gizlilik Politikası md. 6–7, `/hesap-silme` sayfası).

---

## 0. Bir kerelik kurulum

1. **Node.js** yüklü olmalı (oyunu derlediğin sürüm yeterli).
2. Proje kökünde Functions bağımlılıklarını kur (yeni paket eklenmez, mevcut `firebase-admin` kullanılır):
   ```powershell
   npm --prefix functions ci
   ```
3. **Servis hesabı anahtarı** oluştur: Firebase Console → ⚙️ Proje ayarları → **Hizmet hesapları** → **Yeni özel anahtar oluştur**. İnen JSON dosyasını **proje klasörünün DIŞINDA** sakla, örneğin:
   `C:\Users\<kullanıcı>\guvenli\neon-sehir-admin.json`

   > ⚠️ Bu dosya veritabanına **tam yetki** verir. Asla projeye kopyalama, git'e ekleme, kimseyle paylaşma. İşin bitince silmek en güvenlisi.
   >
   > 💡 **Önerilen: iki ayrı anahtar.**
   > - **Okuma anahtarı** (günlük deneme raporları için): Google Cloud Console → IAM'de ayrı bir servis hesabı, yalnızca **Cloud Datastore Viewer** + **Firebase Authentication Viewer** rolleri. Bu anahtarla betik zaten hiçbir şey yazamaz.
   > - **Tam yetkili anahtar** (yalnızca `--apply` için): Firebase'in varsayılan Admin SDK anahtarı. Silme günleri dışında bilgisayarında durmasın.

---

## 1. Talep gelince (e-posta kutusu → "Hesap Silme" etiketi)

Talebi bir tabloya kaydet (30 gün takibi için):

| Talep tarihi | Gönderen e-posta | uid (e-postada varsa) | Oyun içi ad | Durum | Tamamlanma |
|---|---|---|---|---|---|

- Oyun içinden gelen taleplerde e-postada **"Oyun kimliğim (uid): …"** satırı hazır olur.
- Web sayfasından gelenlerde genelde sadece **oyun içi ad** olur → uid'yi e-postadan bulacağız (2. adım).

## 2. Kimliği doğrula ve deneme raporu al

Proje kökünde (PowerShell):

```powershell
# uid biliniyorsa — talep e-postasını da ver ki eşleşme kontrol edilsin
node functions/scripts/delete-user.mjs --uid <UID> --email <GÖNDEREN_E-POSTA> --key C:\Users\<kullanıcı>\guvenli\neon-sehir-admin.json

# uid bilinmiyorsa — hesabı gönderen e-postadan bulur
node functions/scripts/delete-user.mjs --email <GÖNDEREN_E-POSTA> --key C:\Users\<kullanıcı>\guvenli\neon-sehir-admin.json

# Raporu dosyaya da kaydetmek için:  --json rapor-<UID>.json
# Tüm doküman yollarını görmek için: --verbose
```

**Kimlik kuralı:** Raporun başındaki satır şunu göstermeli:
```
 Talep e-postası  : oyuncu@gmail.com  →  EŞLEŞİYOR ✓
```
- **EŞLEŞMİYOR ✗** ya da **"Bu e-postayla kayıtlı bir hesap bulunamadı"** → işlem YAPMA. Oyuncuya "Kimlik doğrulanamadı" şablonuyla yanıt ver (aşağıda).
- `--email` vermeden yalnızca `--uid` ile çalıştırırsan eşleşme kontrolü yapılmaz; **talep işlemek için her zaman `--email` ver.**

## 3. Raporu oku

| Bölüm | Anlamı |
|---|---|
| **ENGELLER** | Silmeden önce çözülmeli ya da beklenmeli. Örn. sonucu bekleyen bahis, çekilişi yapılmamış piyango bileti, açık 10 Numara masası/yarış odası, başka oyunculara satılmış fabrika hissesi. |
| **SİLİNECEK** | Tamamen silinecek, yalnızca oyuncuya ait veriler (hesap, envanter, mesajlar, sohbetleri, Sixtagram içerikleri…). |
| **ANONİMLEŞTİRİLECEK** | Kayıt kalacak, ad "Silinmiş Oyuncu" olacak (geçmiş maç/masa/haber/çete kayıtları). |
| **OYUN KURALIYLA ÇÖZÜLECEK** | Mevcut oyun mantığıyla çözülecek: çeteden ayrılma (Baba ise gece yeni Baba atanır), fabrikanın kapatılması ve işçilerin serbest kalması, takımın sistem (bot) takımına dönmesi, polislikten ayrılma, soygun planından çıkma, açık ilanların kaldırılması. |
| **SAKLANACAK — yasal** | Web satın alma kayıtları; silinmez. |
| **Moderasyon (UGC D5)** | Ban, susturma ve engelleme listesi silinir. Aktif ban **ön temizlikte** silinir: saatlik ban taraması silinmiş hesaba dokunmasın. Başkalarının engelleme listelerindeki satırı çıkarılır. Yaptığı bildirimler silinir. Hakkındaki bildirimlerde metin kopyası `[hesap silindi]` olur, açık olanlar kuyruktan düşer. `admin_logs` **silinmez**: hedef/yetkili adı "Silinmiş Oyuncu"/"Silinmiş Yetkili" olur, kaldırılan içeriğin kopyası çıkarılır, uid kalır. Kişi yetkiliyse rolü users belgesiyle düşer; `ADMIN_UIDS` listesindeyse oradan elle çıkar. |
| **BİLGİ** | Borçlar, serbest kalacak işçiler, davet ettiği oyuncular, sınırlamalar. |

Betiğin çıkış kodu: **0** = engel yok, **1** = engel var ya da hata.

## 4. Engelleri çöz

- **Sonuç bekleyen bahis / piyango / masa / yarış:** Genelde 1–2 gün içinde kendiliğinden sonuçlanır. Birkaç gün sonra 2. adımı tekrar çalıştır.
- **Başka oyunculara satılmış fabrika hissesi:** Karar gerekiyor (hisse sahiplerine iade yapılacak mı?). Karar netleşince Faz 5b-2'de uygulanacak.
- 30 günlük süreyi aşmamaya dikkat et; engel uzun sürüyorsa oyuncuya bilgi ver.

## 5. Silmeyi uygula (`--apply`)

Rapor **"SONUÇ: Engel yok."** diyorsa ve kimlik **EŞLEŞİYOR ✓** ise, tam yetkili anahtarla:

```powershell
node functions/scripts/delete-user.mjs --uid <UID> --email <GÖNDEREN_E-POSTA> --key C:\Users\<kullanıcı>\guvenli\neon-sehir-admin-TAM.json --apply
```

Betik şunları yapar:

1. **Planı yeniden hesaplar.** Engel varsa veya e-posta eşleşmiyorsa **hiçbir şey yapmadan** çıkar. (`--email` bu modda zorunludur.)
2. Planı ve **UYGULAMA ADIMLARI** özetini gösterir, `Devam edilsin mi? [y/N]` diye sorar. `y` dışındaki her cevap = vazgeç.
3. Onaydan **hemen sonra planı bir kez daha hesaplar.** Beklerken oyuncunun verisi değiştiyse (ör. o sırada oynadıysa) durur → komutu yeniden çalıştır.
4. Adımları bu sırayla uygular:

| # | Adım | Ne olur |
|---|---|---|
| 0 | Hesabı dondur | Giriş kapatılır, oturumlar sonlandırılır (işlem sürerken oyuncu oynayamaz) |
| 1 | Ön temizlik | Liman siparişi, dilenci kaydı, açık 2. el ilanları, sponsorluk teklifleri, menajerlik başvuruları, bekleyen takım devri; soygun planından çıkış (oyunun kendi fonksiyonu) |
| 2 | Başka fabrikalar | Çalıştığı makine boşaltılır; başka fabrikalardaki hisseleri düşer |
| 3 | Kendi fabrikası | Sponsorluklar biter (takım sahibine SMS), **aktif hisse sahiplerine alış fiyatı iade edilir (SMS)**, işçiler serbest kalır (SMS), fabrika silinir |
| 4 | Futbol | Takımı varsa oyunun `sellFutbolTeam` fonksiyonuyla **sistem (bot) takımına** döner; menajerse `resignFutbolManager` |
| 5 | Çete | Oyunun `leaveGang` işlemi (Baba ise gece yeni Baba atanır) |
| 6 | Roller | İmamsa imamlık boşalır |
| 7 | Anonimleştirme | Geçmiş kayıtlardaki ad → "Silinmiş Oyuncu" (çete kayıtları bu adımda **yeniden taranır**) |
| 8 | İçerik | Sohbetler, Sixtagram (yorum/beğeni sayaçları düzeltilir), araç/silah, bahis geçmişi vb. silinir |
| 9 | users/{uid} | Hesap dokümanı ve tüm alt koleksiyonları silinir |
| 10 | Auth | Giriş kaydı silinir (en son) |

5. Sonunda planı tekrar hesaplar ve **"✓ SİLME TAMAMLANDI — hesap artık yok."** yazar.
6. Bulunduğun klasöre bir **işlem kaydı** yazar: `silme-kaydi-<UID>-<zaman>.json` (hangi adım ne zaman yapıldı; e-posta içermez).

**Bir adım hata verirse:** Betik o adımda durur, hesap **girişe kapalı** kalır. Hata mesajını oku (ör. bağlantı sorunu), sonra **aynı komutu tekrar çalıştır**: plan güncel duruma göre yeniden hesaplanır, yapılmış adımlar tekrar yapılmaz (hisse iadesi de iki kez yapılmaz). Çözemezsen işlem kaydını bana ilet.

## 6. 24 saat sonra kontrol ("zombi" doküman)

Arka plan işleri (maaş, temettü, gemi teslimatı, SMS) silinmiş hesaba yazarsa `users/{uid}` yeniden oluşabilir. Silmeden **24 saat sonra** 2. adımdaki komutu aynı uid ile tekrar çalıştır. Beklenen sonuç:

```
  ✗ HESAP YOK
```

Başka bir şey görürsen raporu sakla ve bana ilet.

## 7. Oyuncuya yanıt ver ve kaydı kapat

Tabloda **Durum = Tamamlandı**, **Tamamlanma = tarih** yaz. Raporları (`rapor-<UID>.json`) işin bitince sil; kişisel veri içerirler. İşlem kayıtlarını (`silme-kaydi-*.json`) talebin kanıtı olarak güvenli bir yerde saklayabilirsin.

---

## Yanıt şablonları

**Talep alındı**
> Merhaba, Neon Şehir hesabının silinmesi talebini aldık. Hesabın ve verilerin en geç 30 gün içinde silinecek; işlem tamamlandığında sana haber vereceğiz. Fikrini değiştirirsen bu e-postaya yanıt vermen yeterli.

**Kimlik doğrulanamadı**
> Merhaba, güvenliğin için hesap silme taleplerini yalnızca oyuna giriş yaptığın Google hesabının e-posta adresinden gelirse işleme alabiliyoruz. Talebini, oyuna giriş yaptığın adresten tekrar gönderebilir misin? Oyunda Profil → "Hesabımı Sil" seçeneği bunu senin için hazırlar.

**Beklemede (engel var)**
> Merhaba, hesabında henüz sonuçlanmamış bir oyun işlemi (örneğin bahis veya çekiliş) bulunduğu için silme işlemini bu işlem sonuçlanınca yapacağız. Süre yine en geç 30 gün içinde tamamlanacak.

**Tamamlandı**
> Merhaba, Neon Şehir hesabın ve ilişkili verilerin silindi. Geçmiş oyun kayıtlarında adın "Silinmiş Oyuncu" olarak görünür; web satın alma kayıtları yalnızca yasal saklama süresi boyunca tutulur. İyi günler dileriz.

---

## Teknik notlar

- **Dosyalar:** `functions/scripts/delete-user.mjs` (araç), `functions/scripts/delete-user.test.mjs` (çevrimdışı test, silme modu ve moderasyon kayıtları dahil 12 senaryo: `node --test functions/scripts/delete-user.test.mjs`).
- `functions/scripts/**` klasörü `firebase.json`'daki kural gereği **Cloud Functions'a deploy edilmez**; araç yalnızca senin bilgisayarında çalışır.
- **Salt-okunur güvence:** Plan HER ZAMAN (silme modunda da) Firestore ve Auth'un tüm yazma metotları kilitliyken hesaplanır; kilit kendini doğrular, doğrulanamazsa betik çalışmaz. Yazma yalnızca `--apply` + `[y/N]` onayından sonra, uygulama adımlarında yapılır.
- **Oyun fonksiyonlarının yeniden kullanımı:** `--apply` modunda `functions/index.js` yüklenir; takım devri, menajerlik, çete ve soygun işlemleri canlıdaki fonksiyonların `.run()` metoduyla, oyuncunun kimliğiyle **aynı kodla** yapılır.
- **Maliyet:** Rapor başına genellikle birkaç yüz ile birkaç bin arası okuma (raporun sonunda yazar).
- **Firestore yapısına dokunmaz:** Yeni indeks gerektirmez; koleksiyon grubu sorgusu yalnızca zaten indeksi olan `managerApplications` için kullanılır.
