# Kurulum, Test ve Yayın Rehberi

## 1. Tek seferlik kurulum
1. **Admin UID** — Firebase Console → Authentication → kendi hesabının UID'si:
   - `functions/index.js` → `ADMIN_UIDS`
   - `src/config/admin.js` → `ADMIN_UIDS`
   (İkisi aynı olmalı. İstemcideki liste sadece görünürlük içindir; yetki sunucuda kontrol edilir.)
2. **Test şifresi** (Secret Manager):
   ```bash
   firebase functions:secrets:set GANG_TEST_PASSWORD
   ```
   Şifre koda ya da repoya yazılmaz. Yanlış şifre 5 kez girilirse giriş 15 dakika kilitlenir.
3. **Deploy** (mevcut akış aynı):
   ```bash
   npm --prefix functions test        # 83 otomatik test
   firebase deploy --only firestore:rules,functions:gangAction,functions:gangAdmin,functions:gangClock
   firebase deploy --only functions:executeHeistPlan,functions:attemptHeist,functions:sellContrabandAtPark   # İstihbarat kancaları (polis ödülü + şüphe cezası)
   npm run build && (frontend deploy'unuz)
   ```
   Sadece çete fonksiyonlarını ve kancayı deploy etmek diğer fonksiyonlara dokunmaz. Tam `firebase deploy` de güvenlidir.
4. **Composite index gerekmez**: tüm sorgular tek alanlı ya da sadece eşitlik filtreli olacak şekilde tasarlandı.

## 2. Security rules testi (önerilir, emülatör gerekir)
```bash
cd tests/firestore-rules && npm i && npm test
```
Bu ortamda emülatör indirilemediği için rules bir kez sizin makinenizde çalıştırılmalı: istemci yazamıyor mu, Çömez tır görüyor mu, İstihbarat dışı roster okunabiliyor mu, test dünyası kilitli mi…

## 3. Admin test modu — kullanım
1. Alt çubukta **Çeteler** (ilk buton) → "🚧 Tadilatta" yazısına **5 kez** dokun → şifre.
2. Üstteki sarı **TEST** çubuğu:
   - **⚡ Hızlı kurulum**: 8 hazır persona (Baba adayları, rütbe adayları, polis ajan, rakip).
   - Persona seçici: artık o personanın gözünden oynarsın (✏️ ile altın/güç/saygınlık/polis ayarla, ✉️ bildirimleri gör).
   - Saat: **+1s, +6s, 12:00, 18:00, ⏭ 00:00, +30g** — sanal saat SADECE test dünyasında ilerler; her atlamada kaçırılan 00:00 işlemleri sırayla çalışır.
   - **🧹 Test verisini sil**: tüm test çeteleri/savaşları/tırları/oyları/İstihbarat verisi ve sanal saat sıfırlanır.
   - **🚪 Çık**: test oturumunu kapatır (oyuncuların gördüğü "Tadilatta" ekranına dönersin).
3. Önerilen test turu: kur → katıl → saygı → ⏭00:00 (rütbeler) → Çetem: altın dağıt / kendime / çeteye gönder → Savaş: dağıtımdan al → Pzt–Cum bahis → ⏭00:00 → zar → Pazar'a atla → ticaret savaşı → ⏭00:00 (yol) → Ticaret: depo al, tır al, "Sipariş ver +" → ⏭00:00 (yolda; aynı tıra yeni sipariş) → rakip: sabotaj / Kıdemli: talep / İstihbarat: ihbar-sızdır-operasyon (rüşvet) → 12:00 (duyuru) → savun / haraç-rüşvet öde → ⏭00:00 (sonuç, depo) → depodan 2. ele koy → Sağ Kol devir/ayaklan → ⏭00:00 → oy → ⏭00:00 → +30g aktiflik.
4. Test dünyası verisi v30 şemasından kaldıysa (tır/depo alanları değişti) **🧹 Test verisini sil** ile temizleyin. Canlı dünya henüz açılmadığı için taşınacak canlı veri yoktur.

### Kodu deploy etmeden görsel inceleme
```bash
npm run preview:gangs     # http://127.0.0.1:5199 — şifre: test
```
Gerçek backend kodu ve bellek içi veritabanı tarayıcıda çalışır; Firebase'e hiç bağlanmaz.

## 4. Oyunculara açma (yayın)
TEST çubuğu → **🟢 Canlıya aç** → "Sıfırdan aç":
- `gangWorlds/live_<tarih>_<rastgele>` adında **yepyeni, boş** bir dünya oluşur; test verisi taşınmaz → sistem herkes için sıfırdan başlar.
- Oyuncu hesapları, altın, araç, silah, fabrika, futbol vb. hiçbir veri etkilenmez.
- Test verisi ayrıca "🧹 Test verisini sil" ile tamamen temizlenebilir.
- **🔴 Canlıyı kapat**: oyuncular tekrar "Tadilatta" görür, veriler silinmez; "Tekrar aç" aynı dünyayı açar. "Yepyeni dünya ile aç" eski canlı veriyi devre dışı bırakıp sıfırdan başlatır.

## 5. Yayın öncesi kontrol listesi (Bölüm 93)
| Madde | Durum | Nasıl doğrulandı |
|---|---|---|
| Mevcut oyuncu verileri korunuyor | ✅ | Çete kodu sadece `gangWorlds/**` yazar; canlıda `users` sadece altın/borç (kurma ücreti, bağış, teslim alma, Baba aktarımı, 2. elden alım) ve depodan ürün teslimi için, mevcut şemayla (yeni silah/araç 20/20) |
| Mevcut 2. el pazarı | ✅ | `marketplaceListings` ve `createListing/buyListing/…` fonksiyonlarına dokunulmadı; çete ilanları ayrı (`gangWorlds/{dünya}/market`), ekranda ayrı bölüm |
| Mevcut ekonomi korunuyor | ✅ | Fiyatlar mevcut tablolardan; borç kuralı (`splitIncomeForDebt`) uygulanıyor; test (canlı dağıtım borç kesintisi) |
| Mevcut sistemler çalışıyor | ✅ | `dailyReset` ve diğer fonksiyonlara dokunulmadı (test ile doğrulanır); polis kancası try/catch |
| Test verileri izole | ✅ | Ayrı `test` dünyası + sahte personalar; rules sadece admin oturumu |
| Test verileri temizlenebilir | ✅ | `resetTestWorld` (test) |
| Çete & İstihbarat sıfır başlangıç | ✅ | Canlıya açarken yeni dünya kimliği (test) |
| Security rules | ⚠️ | Yazıldı + test dosyası hazır → **emülatörde bir kez çalıştırın** |
| Cloud Functions | ✅ | `index.js` yüklenerek fonksiyon tanımları doğrulandı |
| Scheduler / 00:00 | ✅ | Tek `gangClock` (5 dk), kilit + varlık durum makineleri; eşzamanlı/tekrarlı çalışma testleri |
| Duplicate işlemler | ✅ | requestId, deterministik ID'ler, durum makineleri; testler |
| Race condition | ✅ | Eşzamanlı katılma/claim/iade/zar/saygı/ihbar/sızdırma/rüşvet/ayrılma testleri |
| Para / prestij / yetki / tır / oylama exploitleri | ✅ | `exploits.test.js` + ilgili test dosyaları |
| Admin test erişimi güvenli | ✅ | UID + Secret şifre + kilit + oturum süresi + rules |
| Normal oyuncu açılmadan kullanamıyor | ✅ | Backend `liveOpen` kontrolü + "Tadilatta" |
| Mobil UI / hata ekranları | ✅ | Önizlemede 390×844 Playwright turu |

## 6. Geri alma
- Oyunculara kapatmak: **🔴 Canlıyı kapat** (anında).
- Kodu geri almak: `functions/index.js` sonundaki 3 export + 4 kanca (polis ödülü, 3 şüphe cezası; hepsi `gangFunctions.system` çağrısı) kaldırılır; `App.jsx`/`BottomBar.jsx`'te Çeteler butonu (ve istenirse eski Profil butonu) geri alınır; `MarketplaceScreen.jsx`'teki `<GangMarketSection>` satırı silinir. Mevcut veriler etkilenmez.

## 7. İzleme
Önemli işlemler JSON log olarak yazılır (`gang: 'ledger' | 'membership' | 'war_roll' | 'tick_done' | …`). Cloud Logging'de `jsonPayload.gang` ile filtreleyin. Tüm altın hareketleri ayrıca `gangWorlds/{dünya}/ledger` koleksiyonunda (önceki bakiye, neden, kaynak, hedef, zaman, ilgili kimlik).
