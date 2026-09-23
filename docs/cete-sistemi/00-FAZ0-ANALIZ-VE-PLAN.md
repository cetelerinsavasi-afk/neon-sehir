# Çete & İstihbarat Sistemi — Faz 0: Analiz ve Uygulama Planı

## 1. Mevcut mimari (tespitler)

| Alan | Mevcut durum | Çete sistemi için sonuç |
|---|---|---|
| Frontend | React 19 + Vite 8, router yok; `App.jsx` state bayraklarıyla tam ekranlar açıyor; telefon arayüzü `PhoneScreen.jsx` içinde `APPS` listesi | Yeni bölüm **telefon uygulaması** ("Çeteler") olarak eklenir → `App.jsx`'e dokunulmaz |
| Auth | Google popup, `AuthContext` → `initializePlayer` callable | Aynen kullanılır |
| Oyuncu modeli | `users/{uid}`: `gold`, `reputation` (0–100), `suspicion`, `debtToState`, `profession`('polis'), `displayName`; güç = **en güçlü geçerli silah** (`getMaxWeaponPower`) | Canlı dünyada cüzdan/güç/saygınlık buradan okunur; **hiçbir alana şema değişikliği yapılmaz** |
| Backend | Tek dosya `functions/index.js` (~19.7k satır), Functions v2, `europe-west1`, tüm yazmalar Admin SDK | Çete kodu **ayrı klasörde** (`functions/gang/`), index.js'e yalnızca 1 export satırı + polis ödül kancası |
| Scheduler | `dailyReset` (00:00 İstanbul) dev monolit, **gün bazlı idempotent değil** (sadece migration blokları bayraklı); ayrıca 5 dk / saatlik temizlik job'ları | Çete işlemleri `dailyReset`'e **eklenmez** (yarıda kesilirse tekrar etmez/duplicate riski). Ayrı, merkezi ve idempotent `gangClock` |
| Transaction | Kritik para işlemleri `db.runTransaction` ile; gün bazlı haklar `dailyActions/{uid}_{dateKey}` | Aynı desen + deterministik ID'ler + istek ID'si (requestId) |
| Security rules | Varsayılan kapalı; istemci yazması yok; `users/{uid}` sadece sahibine açık | Yeni kurallar `gangWorlds/**` altında; canlı dünyada üyelik/rütbe `get()` ile kontrol, test dünyası sadece admin oturumu |
| Admin | `ADMIN_UIDS` (functions + `src/config/admin.js`) — şu an **placeholder** | Test girişi = ADMIN_UIDS **ve** Secret Manager şifresi (`GANG_TEST_PASSWORD`) |
| Chat | `globalChat` + `sendChatMessage` callable, istemci `onSnapshot(limit 100)` | Aynı desen, kanal başına ayrı alt koleksiyon (composite index gerekmez) |
| Bildirim | `users/{uid}/messages` (SMS kutusu) + `TopNotificationBanner` | Canlıda önemli olaylar buraya `type:'gang'` ile; test dünyasında ayrı `inbox` |
| Polis ödülü | `executeHeistPlan` içinde sızan polise `perPoliceEarning` | İstihbarat prestiji için **tek kanca** (best-effort, idempotent) |
| Ekonomi fiyatları | `AMAZOR_PRICES` (malzeme), `WEAPON_CATALOG`/`VEHICLE_CATALOG`; anında satış = mağaza fiyatının yarısı | Ticaret yolu alış fiyatı ve İstihbarat ödülü sunucuda bu tablolardan hesaplanır |
| Test altyapısı | Yok (sadece build + oxlint) | Bellek içi Firestore sahte (transaction/çakışma simülasyonlu) + otomatik senaryo testleri |

## 2. Kesinlikle dokunulmayacaklar
`dailyReset`, futbol, fabrika, soygun mantığı, pazar yeri, banka, yatırım, mevcut koleksiyonlar ve kuralları, `users` şeması. Tek istisna: `executeHeistPlan` sonunda polis ödülü sonrası **try/catch içinde** İstihbarat prestij kancası (mevcut akışı etkilemez).

## 3. İzolasyon: "Dünya" (namespace) modeli
Tüm çete verisi `gangWorlds/{worldId}/…` altında:
- `gangWorlds/test` → admin test dünyası. Oyuncular **test personaları** (sahte cüzdan/güç/saygınlık). Gerçek `users` verisine **hiç dokunmaz**. Sanal saat (zaman simülasyonu) **sadece** burada.
- `gangWorlds/live_<zaman>` → canlı dünya. Oyunculara açılırken **yeni ve boş** bir worldId üretilir → sistem herkes için sıfırdan başlar. Test dünyası tek komutla silinir (recursiveDelete).
- `gangSystem/config` → `{ liveOpen, liveWorldId }`. `liveOpen=false` iken normal oyuncu "🚧 Tadilatta" görür; backend de canlı dünyada her işlemi reddeder.

## 4. Yeni koleksiyonlar (gangWorlds/{w}/…)
`memberships/{uid}` (özel üyelik indeksi: çete+rütbe+istihbarat — yarış koşullarını tek belgede kilitler) · `gangs/{id}` (+ `members`, `private/state`(kasa), `private/depot`, `distributions`, `votes`(+`ballots`), `pending`, `chat_genel|chat_yonetim|chat_duyuru`, `log`) · `intel/main` (+`private/state`, `distributions`) · `intelRoster/{rosterId}` (kod adı; UID içermez) · `intelCodeNames/{ad}` · `intelReports/{truckId}` · `intelChat_*` · `wars/{id}` (+`shards`, `rolls`) · `slots/{uid}_{gün}_{pencere}` (6 saatlik pencere kilidi) · `routes/{ürün}` · `trucks/{id}` (+`cargo/main`) · `truckCodes/{4hane}` · `alliances/{a_b}` · `ledger` · `requests` (idempotency) · `ticks/{gün}` · `players/{personaId}` (sadece test) · `inbox` (sadece test). Kök: `gangSystem/config`, `gangAdmins/{uid}` (admin test oturumu).

## 5. Yeni Cloud Functions
- `gangAction` (callable, tek giriş noktası, action dispatch) — tüm oyuncu işlemleri
- `gangAdmin` (callable) — şifreli kilit açma, persona, zaman simülasyonu, test temizleme, canlıya açma
- `gangClock` (schedule, 5 dk) — merkezi saat: kaçırılmış günleri sırayla işler, süresi dolan dağıtımları iade eder, savaş göstergelerini uzlaştırır

## 6. 00:00 işleri (tek merkezi tick, sıralı ve idempotent)
1) Dünün tırları: varış / sabotaj / operasyon çözümü → 2) biten bahisli savaşlar → 3) Pazar ticaret savaşı sonucu → 4) biten oylamalar → 5) İstihbarat-Baba karar süresi → 6) cevapsız bahis teklifleri iadesi → 7) ittifak başlat/bitir → 8) kasa 00:00 anlık görüntüsü (%20, ¼ haraç, bahis limiti) → 9) rütbe hesabı (Çete+İstihbarat) → 10) aktiflik → 11) bugünün bahis savaşları, Pazar ise ticaret savaşı, bekleyen oylamaların doğrulanıp başlatılması (oy hakkı snapshot), tırların yola çıkması. Her varlık kendi durum makinesiyle (`status` geçişi transaction içinde) işlenir → tick iki kez çalışsa da ikinci kez etki üretmez. `ticks/{gün}` ilerlemeyi kaydeder.

## 7. Transaction / idempotency / race condition haritası
| Risk | Koruma |
|---|---|
| Aynı anda iki çeteye katılma | `memberships/{uid}` tek belge, transaction içinde okunur |
| Dağıtımdan iki kez alma / claim–iade yarışı | Dağıtım belgesinde alıcı başına `claimed` + `status`; claim ve iade aynı belgeyi transaction'da okur |
| Savaş katkısının iki kez yazılması / aynı pencerede ikinci savaş | `slots/{uid}_{gün}_{pencere}` deterministik ID |
| Aynı tırın iki kez ihbarı/sızdırılması | `intelReports/{truckId}` tek belge, `leaked` bayrağı |
| Sabotaj fiyatı / ikinci sabotaj | Organizasyon durum belgesinde günlük sayaç (transaction) |
| Bahis parası iki kez kilit/iade/ödeme | Bahis savaşı `status` makinesi (offered→accepted→active→resolved/cancelled) |
| 00:00 iki kez çalışması | Varlık bazlı durum geçişleri + `ticks/{gün}` |
| Çift tıklama (bağış, sipariş, dağıtım) | İstemci `requestId` → `requests/{uid}_{requestId}` |
| Çetenin iki işlemde silinmesi | `gangs/{id}.status` transaction içinde kontrol |
| Hot-document çakışması (herkes aynı savaşa zar atar) | Güç toplamları shard belgelerde; savaş kartı göstergesi best-effort + 5 dk'da uzlaştırma; sonuç shard toplamından |

## 8. Fazlar (uygulama sırası)
- **Faz 1–2:** Dünya/namespace altyapısı, ekonomi adaptörü (canlı=users, test=persona), ledger, admin kilidi, Tadilatta ekranı, test paneli (persona + sanal saat)
- **Faz 3–5:** Çete kur/katıl/ayrıl/at, prestij, saygı, rütbe hesabı, kasa/bağış, 24 saatlik dağıtım havuzu, 3 kanallı sohbet, not/ad/logo
- **Faz 6–11:** Pencere+zar savaş çekirdeği, Pazar ticaret yolu savaşı, rota/tır/sipariş/depo, sabotaj+haraç+savunma, bahisli savaş, ittifak
- **Faz 12–14:** Oylamalar (devirme/ayaklanma/çıkarma), İstihbarat (kod adı, roster, sohbet, ihbar, sızdırma, operasyon, rüşvet, kasa, Baba kararı, çete dağıtma)
- **Faz 15:** Merkezi saat (tick) + test zaman simülasyonu
- **Faz 16:** Otomatik senaryo testleri (bellek içi Firestore; eşzamanlılık simülasyonu), rules incelemesi
- **Faz 17–18:** UI polish (zar animasyonu, kartlar, sayaçlar), build/lint, yayın kontrol listesi

Not: Firestore emülatörü bu ortamda indirilemediği (ağ politikası) için transaction/race testleri, gerçek Firestore transaction semantiğini (serileştirilebilirlik + çakışmada yeniden deneme) taklit eden bellek içi bir sahte veritabanıyla yapılır. Security rules'u deploy öncesi emülatörde bir kez çalıştırmanız önerilir (bkz. yayın kontrol listesi).
