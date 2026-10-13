# Neon Şehir v91 — değişiklik özeti

1. **1 oyuncu = 1 menajerlik.** Menajerlik ataması artık transaction içinde oyuncu başına kilitleniyor (`futbolManagerClaims/{uid}`). Böylece çift dokunma, iki sekme ya da eşzamanlı onay yüzünden iki takıma birden menajer olunamıyor. 19:00 devralması da başka bir takımda menajer olan oyuncuyu atlıyor.
   - **Tek seferlik temizlik** (`runFutbolMultiManagerCleanupV1`): birden fazla takımda menajer olan oyuncu tüm takımlardan çıkarılır. Sezon yasağı konmaz; oyuncuya SMS gider ve istediği 1 takıma hemen başvurabilir.
   - Temizlik deploy'dan sonra en geç 1 saat içinde saatlik bakımda kendiliğinden çalışır.
2. **İstihbarat kasası = üye × 100.000.** Kuralı v88'den beri var. v91'de iade yolları da (iptal edilen bahis operasyonu ücreti, süresi dolan dağıtım) sınıra tabi oldu.
   - **Tek seferlik 1.000.000'a indirme ayrı bir bayrakla tekrar eklendi** (`intelKasaResetV91`). Çete saati 5 dakikada bir çalıştığı için deploy'dan sonra birkaç dakika içinde uygulanır.
   - Kasa zaten 1.000.000'un altındaysa dokunulmaz.
3. **Şampiyona hatırlatması** artık sadece gerçekten yarışabilecek araçları sayıyor. 2. elde satılmış, ilandaki, bankaya el konmuş ya da ömrü bitmiş araçlar sayılmıyor.
4. **Mağaza listeleri:** Oyunun dükkânı, oyuncu dükkânları yüklenmeden tek başına görünmüyor; hepsi aynı anda geliyor. Bu düzeltme İşletmeler listesinde ve Ziyaret sekmesinde geçerli.
5. **Oyunun Silahçısı ve Modifiye Garajı:** Üstte oyuncu işletmelerindeki gibi hızlı butonlar var: "🔫 Satılık silahlar" ve "🛠️ Tamir / Geliştirme".
6. **iPhone harita hatası:** iOS'un bırakışını hiç bildirmediği "hayalet parmak" artık temizleniyor. Bu hayalet parmak, tek parmak sürüklemeyi iki parmak yakınlaştırmaya çeviriyordu. 3D ev/işletme ekranında da aynı koruma var.
7. **Google Play Zümrüt Mağazası:** Android uygulamasında zümrüt artık Google Play Faturalandırma ile satılıyor. Sunucu her satın almayı Google'dan doğruluyor.
   - Yapılacaklar: `docs/play-store/03-PLAY-FATURALANDIRMA-ZUMRUT.md`

## v91.1
- **İade koruması:** `playBillingSweep` 30 dakikada bir Google'ın iade listesini tarar.
  - İade edilen zümrütü geri alır; bakiye eksiye düşebilir.
  - İade edilmiş satın alma tekrar yüklenemez.
  - 3 iadede hesabın zümrüt satın alması kısıtlanır.
  - Kayıtlar `playRefunds` koleksiyonunda tutulur.
- **Teslim güvencesi:**
  - İstemci doğrulamayı 3 kez dener.
  - Uygulama açılışında ve öne gelişinde yarım kalanları sessizce tamamlar.
  - Tüketilemeyenler tarama ile tekrar denenir.
- **`deploy-parcali.ps1`:** Kota hatasında fonksiyonları 5'erli gruplarla yükler.

Testler: `npm --prefix functions test` → 321/321 geçti. `npm run build` → başarılı.
