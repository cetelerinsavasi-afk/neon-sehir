# Neon Şehir — UGC Moderasyonu (Şikâyet & Engelleme) · Faz 0 Analiz ve Plan

> **Durum:** Analiz — kod değişikliği yok. Kaynak: v47 kod tabanı (`src/`, `functions/`, `firestore.rules`).
> **Amaç:** Google Play Kullanıcı Tarafından Oluşturulan İçerik (UGC) politikasına uyum; mevcut oyunu bozmadan, Firestore maliyetini şişirmeden.

---

## 1. Google Play ne istiyor?

Play UGC politikasının maddeleri ve bizdeki durum:

| Şart (politika metninden) | Bizde durum |
|---|---|
| Kullanıcılar UGC oluşturmadan önce kullanım koşullarını kabul etmeli | ✅ Faz 4: giriş kutusunda "Giriş yaparak Koşulları kabul etmiş olursun" |
| Uygunsuz içerik tanımlanmalı ve koşullarda yasaklanmalı | ✅ `/kosullar` md. 6 |
| Uygunsuz UGC'yi **ve kullanıcıları** şikâyet etme ve **engelleme** için uygulama içi sistem; gerektiğinde işlem yapılması | ❌ **Yok** |
| 1:1 etkileşime izin veren özelliklerde kullanıcı engelleme zorunlu | ❌ Yok (bkz. 2.3 — sınırlı 1:1 yüzeyler var) |
| Herkese açık UGC barındıran (sosyal) uygulamalar kullanıcıyı ve içeriği şikâyet etme + kullanıcı engelleme sunmalı | ❌ Yok — ChatsApp ve Sixtagram herkese açık |
| Barındırılan UGC türüne uygun, makul moderasyon | ❌ Yönetici yetkisi bile tanımlı değil (`ADMIN_UIDS = ['REPLACE_WITH_YOUR_FIREBASE_AUTH_UID']`) |

Sonuç: **Şikâyet + engelleme + moderasyon süreci**, Play yayını için zorunlu. Aşağıdaki plan bu üçünü asgari ve güvenli şekilde karşılar.

---

## 2. UGC envanteri (koddan)

### 2.1 İyi haber: yalnızca metin
- **Resim/dosya yükleme yok** (Firebase Storage kullanılmıyor).
- Fabrika/futbol/çete **logoları hazır seçeneklerden** (ikon + renk seçici, emoji listesi) oluşuyor — serbest çizim/yükleme yok.
- Sixtagram "ekleri" (araç, yarış, bahis vb.) **oyunun ürettiği** içerikler.
→ Risk büyük ölçüde **metinle** sınırlı; görüntü moderasyonuna gerek yok.

### 2.2 Serbest metin yüzeyleri

| # | Yüzey | Yazan | Sınır | Kim görür | Öncelik |
|---|---|---|---|---|---|
| 1 | **ChatsApp** genel sohbet (`globalChat`) | `sendChatMessage` | 300 | Tüm giriş yapmışlar (son 100) + üst bildirim şeridi | **Yüksek** |
| 2 | **Sixtagram** gönderi metni | `createSixtagramPost` | – | Herkes | **Yüksek** |
| 3 | **Sixtagram** yorum/yanıt | `createSixtagramComment` | – | Herkes | **Yüksek** |
| 4 | **Dünya konuşma balonları** (`parkPresence`/`interiorPresence.chatText`) | **İSTEMCİ doğrudan yazar** (rules: ≤140) | 140 | Aynı mekândakiler | **Yüksek** (sunucu filtresi yok) |
| 5 | Çete sohbeti (genel/yönetim), İstihbarat sohbeti, Çeteler genel sohbeti | `gangAction` (cleanText) | `CHAT_MAX` | Çete / tüm çeteler | Orta |
| 6 | "Bi fikrin mi var?" (`feedback`) | `submitFeedback` | – | Tüm giriş yapmışlar (son 100) | Orta |
| 7 | **Adlar:** oyun içi ad, çete adı/notu, fabrika adı, takım adı, araç adı, istihbarat kod adı | çeşitli | 3–20 vb. | Herkes | Orta |
| 8 | İmam nasihatı (`giveNasihat`) | imam | 280 | Camideki herkes | Düşük |
| 9 | Dilenci notu (`becomeBeggar`) | oyuncu | 140 | Camideki herkes | Düşük |
| 10 | Soygun planı notu, savaş notu | kurucu | 200 | Katılımcılar/çete | Düşük |
| 11 | Sponsorluk notu, kasa çekim talebi notu | fabrika sahibi ↔ takım, başkan → menajer | – | **Tek karşı taraf (1:1)** | Düşük |

### 2.3 1:1 etkileşim var mı?
Doğrudan mesajlaşma (DM) **yok**; SMS kutusu yalnızca sistem mesajları içeriyor. Sınırlı 1:1 yüzeyler: sponsorluk notu ve kasa çekim talebi notu (iş ilişkisi içinde). Bunlar için engelleme yerine **şikâyet** yeterli; taraflar ilişkiyi zaten sonlandırabiliyor. Asıl engelleme ihtiyacı **herkese açık yüzeyler** (1–6) içindir.

### 2.4 Mevcut koruma
- Uzunluk sınırları ve kontrol karakteri temizliği var (çete `cleanText`, ad regex'i).
- **Küfür/argo filtresi, susturma, yasaklama, şikâyet, engelleme — hiçbiri yok.**
- Sixtagram gönderisini yalnızca sahibi silebiliyor; yönetici silme yolu yok.
- Dünya balonları istemciden yazıldığı için sunucu tarafında hiçbir kontrol yok (yalnızca 140 karakter).

---

## 3. Önerilen mimari

### 3.1 Şikâyet (Report)

**Akış:** İçerik/oyuncu üzerinde `⋯` menüsü → "Şikâyet et" → sebep seç (tek dokunuş) + isteğe bağlı kısa not → gönder → "Teşekkürler, inceleyeceğiz."

**Veri:** `reports/{id}` (yalnızca sunucu yazar; istemci okuyamaz)
```
reporterUid, targetUid, targetType ('globalChat' | 'sixtagramPost' | 'sixtagramComment' | 'bubble' |
  'gangChat' | 'feedback' | 'name' | 'gangName' | 'factoryName' | 'teamName' | 'note' …),
targetPath, textSnapshot (şikâyet anındaki metnin KOPYASI — içerik silinse de kanıt kalır),
reason ('hakaret' | 'taciz' | 'cinsel' | 'nefret' | 'spam_dolandiricilik' | 'gercek_para' | 'kisisel_bilgi' | 'diger'),
note (≤200), platform ('web' | 'android'), status ('open' | 'actioned' | 'dismissed'),
createdAt, reviewedAt, action
```
**Sunucu:** `reportContent` callable — hedefin var olduğunu doğrular, metni sunucuda kopyalar (istemcinin gönderdiği metne güvenmez), **kendini şikâyet** ve **aynı hedefi tekrar şikâyet** engellenir, kişi başı **günlük sınır** (örn. 20).
**Balonlar için:** balon metni geçici olduğu için şikâyet anında istemci `presence` dokümanının yolunu gönderir, sunucu **o anki** `chatText`'i kopyalar.

**İsteğe bağlı otomatik gizleme:** Aynı içerik **N farklı** oyuncudan (öneri: 3) şikâyet alırsa sunucu içeriği `hidden: true` işaretler; istemci gizli içeriği göstermez. İnceleme yapılana kadar zararı sınırlar. (Kötüye kullanıma karşı yalnızca hesabı belirli bir süreden eski oyuncuların şikâyeti sayılabilir.)

### 3.2 Engelleme (Block)

**Anlam (öneri — tek yönlü):** A, B'yi engellerse:
- **A artık B'nin içeriğini görmez:** ChatsApp mesajları, Sixtagram gönderi/yorumları, dünya balonları (avatar görünür, balon metni gizli), çete sohbetinde B'nin mesajları ("engellenen oyuncunun mesajı" satırı), fikir panosu, üst bildirim şeridi, Sixtagram bildirimleri.
- **B, A ile doğrudan etkileşemez:** A'nın gönderisine yorum yapamaz/beğenemez (sunucu kontrolü).
- B'ye engellendiği **söylenmez** (standart uygulama).
- Oyun ekonomisi etkilenmez (2. el alım, bahis, yarış, çete üyeliği) — bunlar iletişim değil; kısıtlamak oyunu bozar.

**Veri — maliyet açısından en ucuz yapı:**
```
userBlocks/{uid}   (tek doküman, yalnızca sahibi okur, sunucu yazar)
  blocked: { <hedefUid>: { at, name } }   // üst sınır örn. 200 kişi
```
- İstemci **tek bir dinleyiciyle** kendi dokümanını dinler; filtreleme **bellekte** yapılır → sohbet/feed sorguları **değişmez**, **yeni indeks gerekmez**, ek okuma yok.
- Sunucu yalnızca etkileşim anında (yorum/beğeni) hedefin `userBlocks` dokümanını **1 okuma** ile kontrol eder.
- Neden `users/{uid}` içinde değil: o doküman sık okunuyor/dinleniyor; engelleme listesini ayrı tutmak her oyuncu güncellemesinde listeyi yeniden taşımamızı önler.
- **Callable'lar:** `blockUser`, `unblockUser` (kendini engelleme yok, üst sınır, idempotent).
- **Arayüz:** Profil → "Engellenen oyuncular" listesi (engeli kaldırma). Bu, engellemenin geri alınabilmesi için gerekli.

### 3.3 Moderasyon (işlem yapma)

**Yetki:** `ADMIN_UIDS` gerçek uid ile doldurulmalı (istemci `src/config/admin.js` + sunucu `functions/index.js`).

**Araç — öneri: yerel betik** (`functions/scripts/moderate.mjs`, hesap silme aracıyla aynı güvenlik yaklaşımı):
- `--list` : açık şikâyetler (hedef, sebep, metin kopyası, şikâyet sayısı, oyuncunun geçmiş ihlalleri)
- `--dismiss <id>`, `--remove <id>` (içeriği sil), `--mute <uid> 24s|7g`, `--ban <uid>`, `--rename <uid>` (adı `Oyuncu1234` yap)
- Deploy edilmez; üretimde yeni bir yönetici yüzeyi/saldırı yüzeyi açılmaz.
- (Alternatif: oyun içi yönetici paneli — daha rahat ama daha fazla kod ve risk; ileride düşünülebilir.)

**Yaptırım basamakları (öneri):** Uyarı (SMS) → Susturma 24 saat → Susturma 7 gün → Kalıcı yasak (Auth devre dışı).

**Susturmanın uygulanması:**
- Sunucu yazanlar (ChatsApp, Sixtagram, çete sohbeti, fikir, adlar): ilgili callable'larda `mutes/{uid}` kontrolü (**1 okuma**, yalnızca mesaj gönderirken).
- **Dünya balonları (istemci yazıyor):** rules'a şu koşul: `chatText` **değişiyorsa** `!exists(/mutes/$(uid))`. Firestore kuralları kısa devre değerlendirdiği için bu okuma **yalnızca balon metni değiştiğinde** yapılır; konum güncellemeleri (sık yazılanlar) etkilenmez.

**Yanıt süresi hedefi:** Şikâyetlerin 24–48 saat içinde incelenmesi (politika "makul moderasyon" istiyor; süreyi rehbere yazacağız).

### 3.4 Otomatik filtre (önerilir, ucuz)
- Sunucuda gönderim anında **küçük bir Türkçe küfür/hakaret listesi** ile kontrol (ChatsApp, Sixtagram, çete sohbeti, fikir, adlar, nasihat, dilenci notu). Seçenek: **reddet** ("Mesajın uygunsuz ifade içeriyor") ya da **yıldızla** (`***`). Öneri: sohbette yıldızla, adlarda reddet.
- **Gerçek para ticareti ve yönlendirme kalıpları** (IBAN, "papara", "shopier", telefon numarası, "altın satıyorum" vb.): Koşullar md. 6'daki yasakla uyumlu; şikâyet önceliğini yükseltmek için işaretlenir. **Android'de** bu kalıplar istemci tarafında maskelenebilir (Play yönlendirme riski — Faz 0'daki G maddesi).
- Balonlar istemciden yazıldığı için filtre orada **istemci tarafında** uygulanır (tam güvenli değil, ama susturma rules ile sunucu tarafında korunuyor).

---

## 4. Veri yapısı ve maliyet özeti

| Ekleme | Tür | Okuma/yazma etkisi | İndeks |
|---|---|---|---|
| `reports/{id}` | yeni koleksiyon | yalnızca şikâyet anında 1 yazma (+ hedef için 1–2 okuma) | Gerekmez (tek alan sorguları otomatik) |
| `userBlocks/{uid}` | yeni koleksiyon | oyuncu başına **1 dinleyici**; etkileşimde 1 okuma | Gerekmez |
| `mutes/{uid}` | yeni koleksiyon | yalnızca mesaj gönderirken 1 okuma; balonda yalnızca metin değişince | Gerekmez |
| `hidden` alanı | mevcut dokümanlara alan | istemci bellekte filtreler | Gerekmez |
| Sohbet/feed sorguları | **değişmez** | — | — |

Engellenen içeriğin sunucu sorgusuyla (`not-in`) dışlanması **önerilmez**: Firestore'da `not-in` en fazla 10 değer alır, indeks ister ve sorgu başına maliyeti artırır. Bellekte filtre bu ölçekte (son 100 mesaj / feed limiti) hem ücretsiz hem basit.

---

## 5. Diğer fazlara etkisi
- **Hesap silme aracı (5b):** yeni koleksiyonlar eklenmeli — `userBlocks/{uid}` sil; başkalarının `userBlocks` listelerindeki bu uid'yi kaldır; `reports` (oyuncu şikâyet eden ise) anonimleştir/sil, hakkındaki şikâyetler moderasyon kanıtı olarak saklama süresince tutulabilir; `mutes/{uid}` sil.
- **Gizlilik Politikası:** "Şikâyetler ve moderasyon kayıtları" maddesi eklenmeli (ne tutulur, ne kadar süre — öneri 12 ay).
- **Kullanım Koşulları md. 6:** "Şikâyet et / Engelle" ifadesi oyun içi yola güncellenmeli (şu an e-posta).

---

## 6. Uygulama planı (öneri)

| Faz | İçerik | Dokunduğu yer | Risk |
|---|---|---|---|
| **D1 — Altyapı** | `ADMIN_UIDS`; `reports`, `userBlocks`, `mutes` + rules; callable'lar: `reportContent`, `blockUser`, `unblockUser`; susturma kontrolü (ChatsApp, Sixtagram, fikir, ad; çete sohbeti `gang/` içinde) ; balon rules koşulu | **Backend + rules** (yeni koleksiyonlar — mevcut veriye dokunmaz) | Orta — mevcut callable'lara yalnızca "susturulmuş mu?" kontrolü eklenir |
| **D2 — Arayüz** | Ortak `ReportBlockSheet`; ChatsApp mesajı, Sixtagram gönderi/yorum/yazar paneli, dünya avatarı/balonu, çete sohbeti, fikir panosu menüleri; Profil → Engellenenler; istemci filtreleri (`useBlocks` hook) | Yalnızca frontend | Düşük |
| **D3 — Moderasyon aracı** | `functions/scripts/moderate.mjs` + testler + `docs/MODERASYON_REHBERI.md` | Yerel araç | Düşük |
| **D4 — Filtre** | Küfür/argo listesi + gerçek para kalıpları; Android maskesi | Backend + frontend | Düşük–orta |
| **D5 — Bağlantılı güncellemeler** | Hesap silme aracına yeni koleksiyonlar; gizlilik/koşullar metni | Araç + statik sayfalar | Düşük |

**Play için asgari set:** D1 + D2 + D3 (+ D5 metin güncellemesi). D4 güçlü öneri ama zorunlu değil.

---

## 7. Karar gereken noktalar

1. **Backend onayı:** 3 yeni koleksiyon (`reports`, `userBlocks`, `mutes`) + 3 yeni callable + rules eklemeleri + mevcut mesaj gönderen callable'lara susturma kontrolü. Mevcut veriye/akışa dokunmaz; yine de mimari ekleme olduğu için onayın gerekiyor.
2. **Engelleme anlamı:** Tek yönlü gizleme + Sixtagram'da yorum/beğeni engeli (öneri). Çete sohbetinde de gizleme olsun mu?
3. **Otomatik gizleme:** 3 farklı şikâyette içerik geçici gizlensin mi? (öneri: evet, yalnızca ≥3 günlük hesapların şikâyetleri sayılsın)
4. **Filtre davranışı:** Sohbette yıldızlama, adlarda reddetme (öneri) — yoksa her yerde reddetme mi?
5. **Moderasyon aracı:** Yerel betik (öneri) mi, oyun içi yönetici paneli mi?
6. **Yaptırım basamakları:** Uyarı → 24s → 7g → kalıcı (öneri) uygun mu?
7. **Yönetici uid'si:** `ADMIN_UIDS` için kendi Firebase uid'n (Firebase Console → Authentication'da görünür).
8. **Şikâyet saklama süresi:** 12 ay (öneri) — gizlilik politikasına yazılacak.

Kaynak: [Google Play — Kullanıcı Tarafından Oluşturulan İçerik politikası](https://support.google.com/googleplay/android-developer/answer/9876937)
