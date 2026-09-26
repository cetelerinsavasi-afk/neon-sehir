# UGC Moderasyonu — Faz D3: Oyun İçi Yönetim Paneli

> Onaylı kararlar: **katmanlı roller** · **ban = Firebase Auth hesabını kapatma** (süreli banlar otomatik kalkar) · **"içeriği kaldır" = kalıcı gizleme** (silme yok; ad/isim türleri varsayılana sıfırlanır).

## 1. Roller ve yetkiler

| İşlem | Moderatör | Yönetici |
|---|:-:|:-:|
| Şikâyet kuyruğu: reddet / içeriği kaldır / geri aç | ✓ | ✓ |
| Oyuncu arama, oyuncu kartı, işlem geçmişi | ✓ | ✓ |
| Uyarı SMS'i | ✓ | ✓ |
| Susturma 1 sa · 24 sa · 7 gün / kaldırma | ✓ | ✓ |
| Susturma 30 gün | – | ✓ |
| Ban 1 gün · 7 gün · 30 gün · kalıcı / kaldırma | – | ✓ |
| Rol verme / alma, Ekip listesi | – | ✓ |

- Rol: `users/{uid}.role` = `'admin'` | `'moderator'`. İstemci bu alanı **yazamaz** (`users` kuralı `write: false`); yalnızca sunucu yazar.
- **Kurucu yönetici:** `functions/index.js` içindeki `ADMIN_UIDS` listesindeki hesap her zaman yöneticidir; paneli ilk açtığında `role: 'admin'` otomatik yazılır. Panelden rolü alınamaz.
- Yaptırım kuralı (sunucuda): kimse kendine işlem yapamaz; yöneticilere işlem yapılamaz; moderatöre yalnızca yönetici işlem yapabilir.

## 2. Dosyalar

| Dosya | Değişiklik |
|---|---|
| `functions/adminPanel.js` | **Yeni** — tüm panel mantığı (yetki, kuyruk, yaptırımlar, roller, denetim kaydı) |
| `functions/index.js` | Modülün bağlanması: `adminAction` callable + `adminBanSweep` (saatlik) |
| `firestore.rules` | `isStaff()`; `reports`/`admin_logs` yetkiliye okunur; `bans` yeni; `mutes` yetkiliye de okunur. **Yazma hepsinde kapalı.** |
| `src/components/AdminPanel/*` | **Yeni** — `AdminPanelEntry` (Ev ekranı düğmesi), `AdminPanel` (tam ekran, lazy), `ModerationTab`, `UserManagementTab`, `AuditLogTab`, `StaffTab`, `adminLabels.js`, CSS |
| `src/components/HomeScreen/HomeScreen.jsx` | Yetkililere "🛡️ Yönetim Paneli" düğmesi |
| `src/services/gameActions.js` | `adminAction(action, payload)` |
| `src/contexts/AuthContext.jsx` | Banlı hesap giriş yapmaya çalışınca anlaşılır mesaj |
| `src/components/Gangs/tabs/ChatTab.jsx` | Moderatörün kaldırdığı mesaj: "🛡️ … moderasyon ekibi tarafından kaldırıldı" |
| `functions/scripts/admin-panel.test.mjs` | **Yeni** — 10 senaryo (functions `npm test`'e eklendi) |
| `tests/firestore-rules/admin.rules.test.mjs` | **Yeni** — kural testi (emülatör gerekir) |

## 3. `adminAction({ action, payload })`

| action | payload | Not |
|---|---|---|
| `me` | – | Rolü doğrular (panel her açılışta çağırır) |
| `listReports` | `{ status: 'open'|'actioned'|'dismissed' }` | İçerik başına gruplanır; en çok şikâyet alan üstte |
| `resolveReport` | `{ targetPath, decision: 'remove'|'dismiss', warn?, note? }` | O içeriğin tüm açık şikâyetlerini kapatır |
| `restoreContent` | `{ targetPath, targetType }` | Gizlenen mesaj/gönderi/yorumu geri açar |
| `searchUsers` | `{ q }` | Ad başı, tam oyun içi ad ya da UID |
| `getUser` | `{ uid }` | Durum, şikâyet sayıları, son 20 işlem |
| `warnUser` | `{ uid, text? }` | "⚠️ Uyarı:" SMS'i |
| `muteUser` / `unmuteUser` | `{ uid, duration, reason }` | Sebep zorunlu; oyuncuya SMS gider |
| `banUser` / `unbanUser` | `{ uid, duration, reason }` | Yalnızca yönetici |
| `setRole` | `{ uid, role: 'moderator'|'admin'|'none' }` | Yalnızca yönetici |
| `listStaff` · `listLogs` | – · `{ beforeMs? }` | Geçmiş 50'şer sayfa |

### "İçeriği kaldır" ne yapar?
- **Mesaj, gönderi, yorum, fikir** (ChatsApp, Sixtagram, çete/İstihbarat sohbetleri, fikirler): `hidden: true, hiddenBy: 'moderator'` → oyunculara görünmez, metin denetim için saklanır, **geri açılabilir**.
- **Ad/metin alanları** varsayılana döner (geri alınmaz; eski metin denetim kaydında saklanır):
  - Oyuncu adı → "Oyuncu" (ad rezervasyonu serbest kalır).
  - Çete adı → "Çete XXXX" ve çete notu boşalır.
  - Fabrika adı → varsayılan ad.
  - Araç adı → katalog adı.
  - Soygun ve dilenci notu → boş.
  - Balon → silinir.
  - Nasihat → silinir (bu arada başkası yeni nasihat verdiyse dokunulmaz).
- Oyuncu adı ve çete adı sıfırlanınca, **başka yerlere kopyalanmış eski ad** (ör. eski gönderilerdeki yazar adı, yol sahibi adı) kendiliğinden değişmez. Yeni adlar oyuncunun sonraki işlemlerinde yazılır.

### "Reddet"
Şikâyetler kapanır. Şikâyetlerle **otomatik** gizlenmiş içerik yeniden görünür olur.

## 4. Ban nasıl çalışır?
1. `bans/{uid}` yazılır. Susturma kaydı `level: 'ban'` olur, yani **yazı yasağı anında** başlar.
2. Firebase Auth hesabı **kapatılır** ve oturumları iptal edilir. Açık oturum en geç ~1 saat içinde düşer; oyuncu tekrar girmeye çalışınca "Hesabın … kısıtlandı" mesajını görür.
3. Süreli banları `adminBanSweep` (saatte bir) süre dolunca kaldırır. Auth hesabı yeniden açılır ve bandan önceki susturmanın süresi dolmadıysa o susturma geri gelir.
4. Kalıcı ban yalnızca elle kaldırılır.

## 5. Denetim kaydı — `admin_logs`
Her işlem için şu alanlar yazılır: `action`, `actorUid/Name/Role`, `targetUid/Name/Path/Type`, `reason`, `details` (süre, bitiş, etki, kaldırılan metnin önceki hâli, uyarı gönderildi mi), `atMs`. Süresi dolan banlar `actorUid: 'system'` ile kaydedilir. İstemci bu koleksiyona yazamaz.

## 6. Deploy
1. `functions/index.js` → `ADMIN_UIDS` ve `src/config/admin.js` → `ADMIN_UIDS` içine kendi UID'ni yaz. İkisi aynı olmalı. D1'de zaten istenmişti.
2. `firebase deploy --only functions`. 2 yeni fonksiyon eklenir: `adminAction` ve `adminBanSweep`. Zamanlanmış fonksiyon için Cloud Scheduler zaten kullanılıyor.
3. `firebase deploy --only firestore:rules`
4. Frontend'i build alıp yayınla.
5. Oyunda Ev ekranında "🛡️ Yönetim Paneli" düğmesi görünür. Moderatör eklemek için: Oyuncular → oyuncuyu bul → 🎖️ Rol → Moderatör.
6. İsteğe bağlı kural testi: `cd tests/firestore-rules && npm i && npm test`

Yeni composite index gerekmez; tüm sorgular tek alanlıdır.

## 7. Bilinen sınırlar / sonraki adımlar
- ~~Hesap silme scripti `bans` ve `admin_logs` kayıtlarını ele almıyor~~ — **D5'te (v54) yapıldı**, bkz. `05-D4-D5-KAPANIS.md`.
- Oyuncu bilgilendirmeleri (uyarı, susturma, içerik kaldırma, ban) **D4'te (v54)** netleşti, bkz. `05-D4-D5-KAPANIS.md`. `warnUser` artık `reason` ister.
- Kural testleri bu ortamda emülatörle çalıştırılamadı. Sunucu mantığı çevrimdışı testlerle ve tarayıcıda uçtan uca doğrulandı.
