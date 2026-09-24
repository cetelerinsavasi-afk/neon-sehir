# Kurulum, Test ve Yayın Rehberi

## 1. Deploy (v32 — admin paneli ve şifre yok)
Çeteler oyunculara **açık** gelir. Secret / şifre / ADMIN_UID ayarı gerekmez.
```bash
npm --prefix functions test        # 93 otomatik test
firebase deploy --only firestore:rules,functions
npm run build && (frontend deploy'unuz)
```
- `gangAdmin` fonksiyonu v32'de **kaldırıldı**. Daha önce deploy edildiyse `firebase deploy --only functions` onu silmek için onay ister (evet deyin; CI'da `--force`). Başka hiçbir fonksiyon silinmez.
- Önceden `firebase functions:secrets:set GANG_TEST_PASSWORD` yaptıysanız secret artık kullanılmıyor; isterseniz Secret Manager'dan silebilirsiniz (zorunlu değil).
- **Composite index gerekmez**: tüm sorgular tek alanlı ya da sadece eşitlik filtreli.
- v33 yeni fonksiyon: `submitFeedback` ("Bi fikrin mi var?"). Yeni koleksiyonlar: `feedback` (herkes okur), `feedbackLimits` (kapalı), `gangWorlds/*/betReports` (İstihbarat okur), `*/voteLocks` (kapalı). Rules dosyası güncel — `firestore:rules` ile birlikte deploy edin.
- İsteğe bağlı: 7 günü geçen fikirleri otomatik silmek için Firestore konsolunda `feedback` koleksiyonuna `expiresAt` alanıyla TTL politikası ekleyin (eklenmese de liste 7 günü göstermez).

## 2. Canlı dünya nasıl açılır
- İlk oyuncu Çeteler'e girdiğinde (ya da deploy sonrası ilk 5 dakikalık `gangClock` turunda) sunucu **tek seferlik** olarak `gangWorlds/live_<tarih>_<rastgele>` dünyasını kurar ve `gangSystem/config = { liveOpen: true, liveWorldId, autoOpened: true }` yazar. İşlem transaction içindedir; aynı anda gelen istekler ikinci bir dünya kuramaz.
- Daha önce admin panelinden açılmış/kapatılmış bir canlı dünya varsa **aynı dünya, verisiyle birlikte** açılır (sıfırlanmaz).
- **Bakım modu** (gerekirse): Firestore konsolunda `gangSystem/config.liveOpen = false` → oyuncular "🚧 Tadilatta" görür, veri silinmez. `true` yapınca geri açılır. `autoOpened` alanını silmeyin (silinirse bir sonraki istekte otomatik tekrar açılır).
- Oyuncu hesapları, altın, araç, silah, fabrika, futbol vb. hiçbir veri etkilenmez.

## 3. Security rules testi (önerilir, emülatör gerekir)
```bash
cd tests/firestore-rules && npm i && npm test
```

## 4. Kodu deploy etmeden görsel inceleme
```bash
npm run preview:gangs     # http://127.0.0.1:5199
```
Gerçek backend kodu ve bellek içi veritabanı tarayıcıda çalışır; Firebase'e bağlanmaz.
- `/` → test personalarıyla çete dünyası (TEST çubuğu **sadece önizlemede** vardır, uygulamada yoktur).
- `/#live` → oyuncunun gördüğü gerçek Çeteler ekranı (otomatik açılış).
- `/#phone` → yeni telefon ekranı.

## 5. Yayın öncesi kontrol listesi (Bölüm 93)
| Madde | Durum | Nasıl doğrulandı |
|---|---|---|
| Mevcut oyuncu verileri korunuyor | ✅ | Çete kodu sadece `gangWorlds/**` yazar; canlıda `users` sadece altın/borç (kurma ücreti, bağış, teslim alma, Baba aktarımı, 2. elden alım) ve depodan ürün teslimi için, mevcut şemayla (yeni silah/araç 20/20) |
| Mevcut 2. el pazarı | ✅ | `marketplaceListings` ve `createListing/buyListing/…` fonksiyonlarına dokunulmadı; çete ilanları ayrı (`gangWorlds/{dünya}/market`), ekranda ayrı bölüm |
| Mevcut ekonomi korunuyor | ✅ | Fiyatlar mevcut tablolardan; borç kuralı (`splitIncomeForDebt`) uygulanıyor; test (canlı dağıtım borç kesintisi) |
| Mevcut sistemler çalışıyor | ✅ | `dailyReset` ve diğer fonksiyonlara dokunulmadı (test ile doğrulanır); polis kancası try/catch |
| Çete & İstihbarat sıfır başlangıç | ✅ | İlk açılışta yeni dünya kimliği; mevcut canlı dünya varsa korunur (test) |
| Security rules | ⚠️ | Yazıldı + test dosyası hazır → **emülatörde bir kez çalıştırın** |
| Cloud Functions | ✅ | `index.js` yüklenerek fonksiyon tanımları doğrulandı |
| Scheduler / 00:00 | ✅ | Tek `gangClock` (5 dk), kilit + varlık durum makineleri; eşzamanlı/tekrarlı çalışma testleri |
| Duplicate işlemler | ✅ | requestId, deterministik ID'ler, durum makineleri; testler |
| Race condition | ✅ | Eşzamanlı katılma/claim/iade/zar/saygı/ihbar/sızdırma/rüşvet/ayrılma testleri |
| Para / prestij / yetki / tır / oylama exploitleri | ✅ | `exploits.test.js` + ilgili test dosyaları |
| Admin paneli yok | ✅ | `gangAdmin` export edilmiyor, secret yok (consistency testi) |
| Bakım modu | ✅ | `liveOpen:false` → backend tüm işlemleri reddeder (test) |
| Mobil UI / hata ekranları | ✅ | Önizlemede 390×844 Playwright turu |

## 6. Geri alma
- Oyunculara kapatmak: Firestore'da `gangSystem/config.liveOpen = false` (anında).
- Kodu geri almak: `functions/index.js` sonundaki 2 export + 4 kanca (polis ödülü, 3 şüphe cezası; hepsi `gangFunctions.system` çağrısı) kaldırılır; `App.jsx`/`BottomBar.jsx`'te Çeteler butonu (ve istenirse eski Profil butonu) geri alınır; `MarketplaceScreen.jsx`'teki `<GangMarketSection>` satırı silinir. Mevcut veriler etkilenmez.

## 7. İzleme
Önemli işlemler JSON log olarak yazılır (`gang: 'ledger' | 'membership' | 'war_roll' | 'tick_done' | …`). Cloud Logging'de `jsonPayload.gang` ile filtreleyin. Tüm altın hareketleri ayrıca `gangWorlds/{dünya}/ledger` koleksiyonunda (önceki bakiye, neden, kaynak, hedef, zaman, ilgili kimlik).
