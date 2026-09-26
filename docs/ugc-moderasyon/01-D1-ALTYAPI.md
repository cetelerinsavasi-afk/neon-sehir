# UGC Moderasyonu — Faz D1: Altyapı (Backend, Rules, Callable'lar)

> Kararlar: `00-FAZ0-ANALIZ.md` §7 (onaylandı). Bu faz **yalnızca sunucu tarafıdır**; oyuncunun gördüğü bir değişiklik yoktur (arayüz Faz D2'de).

## 1. Dosyalar

| Dosya | Değişiklik |
|---|---|
| `functions/moderation.js` | **Yeni** — şikâyet, engelleme, susturma mantığının tamamı |
| `functions/index.js` | Modülün bağlanması + 3 yeni callable export'u + 12 callable'da susturma kontrolü + Sixtagram yorum/beğeni/bildiriminde engelleme kontrolü |
| `functions/gang/system.js`, `functions/gang/firebase.js` | Metin üreten 9 çete eyleminde susturma kontrolü (tek nokta, yalnızca canlı dünya) |
| `firestore.rules` | `reports`, `userBlocks`, `mutes` kuralları + dünya balonlarında susturma koşulu (`bubbleAllowed`) |
| `functions/scripts/moderation.test.mjs` | **Yeni** — çevrimdışı test (12 senaryo) |
| `tests/firestore-rules/moderation.rules.test.mjs` | **Yeni** — kural testi (emülatör gerekir) |

## 2. Yeni callable'lar (D2 arayüzü bunları çağıracak)

### `reportContent({ targetType, targetPath, reason, note?, platform? })` → `{ ok, autoHidden }`
| targetType | targetPath kalıbı | Otomatik gizlenebilir |
|---|---|---|
| `globalChat` | `globalChat/{id}` | ✓ |
| `sixtagramPost` | `sixtagramPosts/{id}` | ✓ |
| `sixtagramComment` | `sixtagramPosts/{id}/comments/{id}` | ✓ |
| `gangChat` | `gangWorlds/{w}/gangs/{g}/chat_(genel\|yonetim)/{id}` (yalnızca o çetenin üyesi) | ✓ |
| `gangGlobalChat` | `gangWorlds/{w}/globalChat/{id}` | ✓ |
| `intelChat` | `gangWorlds/{w}/intelChat_(genel\|yonetim)/{id}` — kimlik sunucuda çözülür, **kimseye gösterilmez** | ✓ |
| `feedback` | `feedback/{id}` | ✓ |
| `bubble` | `parkPresence/{uid}` · `interiorPresence/{uid}` (o anki balon metni kopyalanır) | – |
| `user` | `users/{uid}` (oyuncuyu/adını şikâyet) | – |
| `gang` | `gangWorlds/{w}/gangs/{g}` (çete adı/notu) | – |
| `factory` | `factories/{uid}` (fabrika adı) | – |
| `vehicleName` | `vehicles/{id}` | – |
| `heistNote` | `heistPlans/{id}` | – |
| `beggarNote` | `beggars/{tarih}/entries/{uid}` | – |
| `nasihat` | `imamState/current` | – |

`reason`: `hakaret` · `taciz` · `cinsel` · `nefret` · `spam_dolandiricilik` · `gercek_para` · `kisisel_bilgi` · `diger`
Hatalar (Türkçe mesajla): kendini şikâyet, aynı içeriği ikinci kez, günde 20'den fazla, içerik yok, geçersiz tür/yol.

**Otomatik gizleme:** Hesabı ≥3 günlük **3 farklı** oyuncu şikâyet ederse içerik `hidden: true, hiddenBy: 'auto_reports'` olur (silinmez). D2'de istemci `hidden` içerikleri göstermeyecek.

### `blockUser({ targetUid })` / `unblockUser({ targetUid })` → `{ ok }`
Tek yönlü; idempotent; en fazla 200. Liste: `userBlocks/{uid}.blocked.{hedefUid} = { at, name }` — istemci **kendi** dokümanını tek dinleyiciyle okur (D2: `useBlocks` hook).

## 3. Sunucuda uygulanan kurallar
- **Susturma** (`mutes/{uid}.untilMs` gelecekteyse) şu yazmaları reddeder: ChatsApp, Sixtagram gönderi/yorum, fikir, oyun içi ad, fabrika adı, araç adı (silmek serbest), nasihat, dilenci notu (yalnızca not varsa), soygun notu, sponsorluk notu, kasa talebi notu (yalnızca not varsa); çete: sohbet (3 kanal), çete kurma/profil, ittifak notu, İstihbarat'a katılma/kod adı/not; **dünya balonları rules ile**.
- **Engelleme:** Gönderi sahibi seni engellediyse yorum yapamaz/beğenemezsin (beğeniyi geri almak serbest); engellediğin oyuncudan Sixtagram bildirimi gelmez.
- Susturma kaydı yoksa her kontrol **1 okuma**; balonda yalnızca metin değiştiğinde.

## 4. Deploy
1. **`functions/index.js` başındaki `ADMIN_UIDS`** ve **`src/config/admin.js`** içine kendi uid'ni yaz (ileride yönetici işlemleri için; D1'in çalışması için zorunlu değil).
2. `firebase deploy --only functions` (3 yeni fonksiyon: `reportContent`, `blockUser`, `unblockUser`).
3. `firebase deploy --only firestore:rules`.
4. Deploy sonrası kısa kontrol: Park'ta bir balon yaz (çalışmalı); ChatsApp'e mesaj gönder (çalışmalı).
5. Kural testi (isteğe bağlı, önerilir): `cd tests/firestore-rules && npm i && npm test`.

Susturma kaydı olmayan oyuncular için davranış **hiç değişmez**; D2'ye kadar kimse şikâyet/engelleme arayüzü görmez.
