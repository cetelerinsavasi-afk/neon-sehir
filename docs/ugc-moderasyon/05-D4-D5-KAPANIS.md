# UGC Moderasyonu — Faz D4 & D5: Bildirimler, Veri Temizliği ve Kapanış (v54)

## 1. D4 — Oyuncu bilgilendirmeleri
Her yaptırım, oyuncunun **SMS kutusuna** (`users/{uid}/messages`, `from: 'Moderasyon'`, `type: 'moderation'`) sebep ve varsa süreyle birlikte yazılır. Yeni SMS geldiğinde üst bildirim şeridi de çıkar.

| İşlem | Oyuncunun gördüğü mesaj (örnek) |
|---|---|
| İçerik kaldırma (gizleme) | 🧹 Topluluk kurallarına aykırı bulunduğu için ChatsApp mesajın kaldırıldı. Sebep: taciz / zorbalık. |
| İçerik sıfırlama (ad/not) | 🧹 … oyun içi adın "Oyuncu" olarak değiştirildi; yeni bir ad seçebilirsin. Sebep: hakaret / küfür. |
| …"Resmi uyarı" işaretliyse | … Sebep: spam. **Bu bir uyarıdır; tekrarlanırsa hesabın kısıtlanabilir.** |
| Uyarı | ⚠️ Moderasyon uyarısı. Sebep: {sebep}. {isteğe bağlı açıklama} Tekrarlanırsa hesabın kısıtlanabilir. |
| Susturma | 🔇 Susturuldun (24 saat). 28.09.2026 14:00 tarihine kadar mesaj, gönderi, yorum, ad ve not yazamazsın. Sebep: … |
| Susturma kaldırma | 🔊 Susturman kaldırıldı, yeniden yazabilirsin. |
| Ban | ⛔ Hesabın 7 gün süreyle (… tarihine kadar) / süresiz olarak kısıtlandı. Sebep: … *(giriş yapamadığı için ban kalkınca görür)* |
| Ban bitişi (elle / süre dolunca) | ✅ Hesabının kısıtlaması sona erdi. (Önceki susturman … tarihine kadar sürüyor.) |

- İçerik kaldırılınca bilgilendirme **her zaman** gider. Sebep olarak moderatörün notu, not yoksa en çok seçilen bildirim sebebi yazılır. "Reddet" kararında ve içerik zaten silinmişse mesaj gitmez.
- Denetim kaydına `details.notified` (ve `warned`, `topReason`) yazılır; Geçmiş sekmesinde "oyuncu bilgilendirildi" olarak görünür.

## 2. D5 — Veri temizliği
### Hesap silme (`functions/scripts/delete-user.mjs`)
| Kayıt | Ne olur |
|---|---|
| `bans/{uid}` | Silinir. **Aktif ban** ön temizlikte (dondurmadan hemen sonra) silinir: saatlik ban taraması silinmiş hesabın Auth kaydına dokunmasın. |
| `mutes/{uid}`, `userBlocks/{uid}` | Silinir. |
| Başkalarının `userBlocks` listesindeki satırı | `blocked.{uid}` alanı çıkarılır (uid + ad). |
| Yaptığı bildirimler (`reports`, `reporterUid`) | Silinir. |
| Hakkındaki bildirimler (`reports`, `targetUid`) | `textSnapshot` → `[hesap silindi]`, `targetDeleted: true`. Açık olanlar `closed_account_deleted` olur ve kuyruktan düşer. 12 aylık saklama süresince kalır. |
| `admin_logs` (denetim izi) | **Silinmez.** Hedefse ad "Silinmiş Oyuncu" olur, `targetDeleted: true` işaretlenir ve `details.before` → `[hesap silindi]`. Yetkiliyse ad "Silinmiş Yetkili" olur, `actorDeleted: true` işaretlenir. uid'ler kalır (kimseyle eşleşmez), sebep ve işlem bilgileri korunur. Panel silinmiş hesabı bağlantısız "(hesap silindi)" olarak gösterir. |
| Yetkili rolü | users belgesiyle düşer; `ADMIN_UIDS` listesindeyse rapor uyarır. |

### Saklama süresi (Gizlilik Politikası md. 6)
- `adminBanSweep` (saatlik) artık **sonuçlanmış bildirimleri sonuçlanmalarından 12 ay sonra** siler (`purgeOldReports`, her seferinde en fazla 400 belge). Açık bildirimlere dokunmaz.
- Denetim kayıtları kalıcıdır; hesap silinince kimliksizleşir.

### Metinler
- `gizlilik.html`: yeni **2(e) Güvenlik ve moderasyon verileri**; oyuncu kartında görünen bilgiler; md. 6'da bildirim (12 ay), engelleme/susturma ve denetim kaydı saklama süreleri. Tarih: 27.09.2026.
- `kosullar.html` md. 6: oyun içinden **Bildir/Engelle** anlatımı, bildirenin kimliğinin gizliliği, otomatik gizleme, **yaptırım basamakları ve SMS bildirimi**, itiraz adresi. Tarih: 27.09.2026.
- `hesap-silme.html`: silinen / kimliksizleştirilen moderasyon kayıtları.
- `docs/HESAP_SILME_REHBERI.md`: rapordaki yeni "Moderasyon" satırı.

## 3. Kapanış temizliği
- `ADMIN_UIDS` iki dosyada da dolu (`mAhrtYHc43SoQ7ptqfTYPLAh8tf2`).
- D2'den kalan iki sınır giderildi: Sixtagram rozeti ve balonun anında kaybolması (bkz. `02-D2-ARAYUZ.md`).
- Lint: UGC modülünden kalan tek uyarı (`useBlocks`, sağlayıcı + hook aynı dosyada) gerekçesiyle susturuldu. Kalan 35 uyarının hepsi bu işten önce de vardı ve başka modüllere ait.
- Testlerde uyarı yok.

## 4. Testler
| Test | Sonuç |
|---|---|
| `functions` `npm test` (çete + panel + oyuncu kartı + yatırım) | 139/139 |
| `scripts/moderation.test.mjs` + `scripts/delete-user.test.mjs` | 12 + 12 |
| Tarayıcı: panel bilgilendirme akışı, uyarı formu, geçmiş (silinmiş hesap), Sixtagram rozeti | 9/9 |
| Firestore kural testleri (`tests/firestore-rules`) | Emülatör gerekir; bu ortamda çalıştırılamadı |

## 5. Deploy
1. `firebase deploy --only functions` (adminAction, adminBanSweep, reportContent metinleri güncellendi).
2. `firebase deploy --only hosting` / Cloudflare: frontend + `public/*.html`.
3. Rules değişmedi, yeni index yok, yeni paket yok.

## 6. Modülün tamamı — hızlı bakış
| Parça | Dosya / koleksiyon |
|---|---|
| Bildirme, engelleme, susturma kontrolü | `functions/moderation.js` · `reports`, `userBlocks`, `mutes` |
| Yönetim Paneli (roller, kuyruk, yaptırım, geçmiş, saklama) | `functions/adminPanel.js` · `bans`, `admin_logs` · `src/components/AdminPanel/*` |
| Oyuncu Kartı | `functions/playerCard.js` · `src/components/PlayerCard/*` |
| Menü ve uzun basma | `src/components/ActionMenu/*` |
| Ortak bildirim sayfası | `src/components/ReportBlockSheet/*` |
| Görünürlük (gizlenen/engellenen) | `src/contexts/BlocksContext.jsx`, `src/lib/ugcVisibility.js` |
| Hesap silme | `functions/scripts/delete-user.mjs` |

**Açık kalan (isteğe bağlı) iş:** Faz 0 planındaki otomatik **küfür / gerçek-para filtresi** (sohbette yıldızlama, uygunsuz adların reddi) uygulanmadı. Play için zorunlu değil; istenirse ayrı bir faz olarak yapılabilir.
