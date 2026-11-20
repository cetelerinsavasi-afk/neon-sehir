# v168 — Rıza Amca senaryosu

Yayın: `deploy-v168.bat` · Geri alma: `geri-al-v168.bat`
Yerel önizleme: `npm run preview:gangs` → `http://127.0.0.1:5199/amca.html?fresh=1`
(`?step=N` görev sırası · `?old=1` görevleri bitmiş oyuncu · `?dead=1` Amca ölmüş · `?credit=1` aktif kredi;
konsolda `__step()` sunucunun görevi ilerletmesini taklit eder)

## Ne değişti

- **Görev sırası v4** (sunucu + istemci ortak, `functions/onboardingData.js`):
  fabrika → ışınlan → yasaklı madde al → parkta sat → camii → silah → haraç → bağış → şüphe 20 →
  rüşvet → araba → antrenman → şampiyona → kredi → avatar → ChatsApp → silah geliştir →
  **Rıza Amca ile hurdalığa git (yeni, 22)** → çeteye gir.
- **Sıfırlama:** görevleri bitmemiş oyuncu ilk açılışta 1. göreve döner (toplu yazma yok).
  Bitirmiş oyuncu ("Tamam"a basmamış olsa da) bitmiş sayılır.
- **Otomatik geçen görevler:** silah, araba, silah geliştirme, avatar, şüphe ≥ 20, antrenman,
  şampiyona, çete ve yeni olarak **kredi** (aktif kredi varsa).
- **Yeni oyuncu:** karakolun önünde doğar, Rıza Amca arabayla gelir, el sallar. Görevlerde yol gösterir.
- **⏪ 3 yıl önce:** sağ sütunda, Görevler'in üstünde. Herkes için isteğe bağlı, Amca ölünce kaybolur.
  İlk izleyişte "Geç" yok, tekrar izlerken var.
  - Yeni oyuncu izledikten sonra kaldığı yere döner.
  - Eski oyuncu izledikten sonra karakolun önünde Amca'yla karşılaşır, Nevzat arar, hurdalığa gidilir.
- **Hurdalık son sahnesi:** çatışmada Eğil / Ateş et düğmeleri var, kaybetme yok, en geç 45 sn'de biter.
  Düşmanlar ölünce Amca'nın başına çökülür, son sözler gelir, sonra mezarın başında oyun başlar.
- **Mezar:** sadece Amca'nın öldüğü oyuncunun cihazında çizilir. Görevi bitirmeyende hiç yok.

## Sunucu ve maliyet

- Yeni Firestore dinleyicisi **yok**. Amca ve diğer karakterler sadece cihazda (Firestore ve RTDB'ye yazılmaz).
- Yeni yazmalar `checkOnboardingProgress` içinde ve oyuncu başına bir kez:
  - `event: 'finale'` → görev geçer ve `amcaDead: true` olur;
  - `event: 'replay'` → eski oyuncuda sadece `amcaDead: true` olur (görevlere dokunmaz).
- Sinematik sırasında ve Amca'nın arabasındayken oyuncu ağda gizlenir (`setAway`).
  Diğer oyuncular onu o sırada görmez.

## Yayından sonra kontrol listesi

1. Yeni hesap: karakolun önünde doğuyor mu, Amca geliyor ve el sallıyor mu?
2. "Amca'nın arabasına bin" ile fabrikaya gidiliyor mu? Fabrika maaşı görevi geçiriyor mu?
3. Işınlan görevinde Amca kendi gidiyor mu? Liman'a ışınlanınca görev geçiyor mu?
4. ⏪ 3 yıl önce:
   - köprü sahnesi akıyor mu;
   - polis arabaları ve ambulans arkada duruyor mu;
   - sağlıkçı yürüyerek geliyor mu;
   - sahne bitince kaldığın yere dönüyor mu?
5. Aktif kredisi olan oyuncuda kredi görevi kendiliğinden geçiyor mu?
6. Hurdalık:
   - çatışma, son sözler, mezar ve çakmak kartı geliyor mu;
   - sonra "Bi çeteye gir" görevine geçiliyor mu?
7. Görevleri bitmiş eski hesap: 3 yıl önce → Amca → Nevzat araması → hurdalık → mezar. Sonra buton kayboluyor mu?
8. Misafir: senaryo ve buton yok. Üye olunca karakolda doğuyor mu?

## v168.1

- **Yeni oyuncu:** herkes gibi evin önünde doğar. Görev listesi ve hatırlatmalar görünmez, sadece parlayan
  **⏪ 3 yıl önce** düğmesi ("Hikâyen burada başlıyor") görünür. Düğmeye basınca sırayla:
  köprü sahnesi → karakolun önü → Rıza Amca → görevler.
  Sunucu da hikâye başlamadan görev ilerletmez (`storyStarted`, `checkOnboardingProgress › event 'start'`).
  1. görevden ilerideki oyuncu başlamış sayılır.
- **Tek seferlik görev hakkı** (`functions/onboardingData.js › hasFreePass`, `users.obFree`):
  - İbadet görevi geldiğinde bu vakitte zaten ibadet ettiyse bir kez daha ibadet edebilir.
    Cemaate ikinci kez eklenmez.
  - Haraç görevinde, o satıcıda bugün haraç ya da bağış yapılmışsa bir kez daha haraç kesilebilir.
  - Bağış görevinde, o satıcıya bugün bağış yapılmışsa bir kez daha bağış yapılabilir.
    Haraç kesilen satıcıya aynı gün bağış kuralı aynen kalır.
  - Hak sadece o görev aktifken var, oyuncu başına bir kez. Kullanılınca görev geçer.
- **Sahnelerde kamera:** sahnelerde parmakla / fareyle etrafa bakılır.
  - Köprü sahnesinde, karakoldaki karşılaşmada ve çatışmada yürünmez.
  - Hurdalıkta çatışma dışında yürünür.
- **Amca daha hızlı sürer.** Sadece gerçek virajda yavaşlar.
- **Görev şeridi ve Amca'nın sözleri** alttaki düğmelerin (Arabaya bin, Bağış yap…) üstüne çıkar.
  PC'de çakışma yok.
- **Yönetici:** Profil'de "🔄 Görevleri sıfırla (senaryo baştan)" düğmesi var. Sadece kurucu hesapta görünür,
  sunucu da kontrol eder. Bu cihazdaki senaryo kayıtları silinir ve sayfa yenilenir.

## v168.2

- **Durum görevlerinin kontrolü:** görev başlarken bir kez sorulmakla kalmıyor.
  - Şart sonradan sağlanınca (şüphe ≥ 20, avatar, aktif kredi) ya da şehre başka bir ekrandan dönülünce de soruluyor.
  - Sınır: şartlı görevlerde 6 sn'de bir, diğerlerinde 20 sn'de bir.
- **Şüphe görevinde Amca parka götürür.**
- **Amca'nın arabasında takılma düzeltildi:**
  - Hedefin yanında ya da hedefi olmayan görevde arabaya binilirse Amca 1,5 sn sonra kibarca indirir.
  - Kendi arabanla giderken Amca, uzakta beklese de arkandan gelir.
- **Fotoğrafta Rıza Amca** ve arabası görünür. Ad ve görünüş sunucunun listesinden gelir
  (`functions/storyNpcs.js`); sadece çekenin 45 m yakınındaysa girer, Firestore okuması yok.
- **Rüşvet görevinde** de tek seferlik hak var.
- **Sahnelerde** hem yürünür hem etrafa bakılır.
  - Çatışmada kalkıp yürüyen oyuncu siperde sayılmaz.
  - Nevzat'ın telefonu üstte küçük kart; konuşma sürerken yürünür.
- **Hızlı koşma:** sahneler artık koşma düğmesini kapatmıyor (varsayılan yine açık).
- **Çakmak kaldırıldı;** son sahneden sonra doğrudan oyun başlar.
- **Çatışma düğmeleri:** Ateş et sağda, Eğil / Kalk solda.

## v168.3

- **Telefon görüşmesi** yine ekranı kaplıyor.
- **"Geç" ile atlanan sahne düzeltmesi:** oyuncu sahnedeki arabada yolcu olarak kalıyordu ve karakolun
  önünde yürüyemiyordu. Artık sahne nasıl biterse bitsin arabadan iniliyor.
- **Karşılaşmada** Amca, oyuncu yürüdüyse onu bulana kadar yanına geliyor.
- **Eski oyuncu (görevleri bitmiş) akışı:**
  1. Karakolun önü: "Üç yıl… her ay o kapıya geldim". Oyuncunun kaydından 1–2 kişisel söz:
     belediye koltuğu, polislik, çete / babalık, soygun sayısı, altın, fabrika işi, saygınlık, şüphe.
  2. "Rıza Amca ile parkta çay iç" görevi. Parktaki bir bankta yan yana oturuluyor, bankın üstünde iki çay
     bardağı var. Amca 5 söz anlatıyor (Emre, baba, sustuğu üç yıl, gurur).
  3. Son sözün ardından Nevzat arıyor ("Çayınız güzel mi?").
  4. Hurdalık. Yolda Amca'nın sözleri son sözlerine zemin hazırlıyor ("kendine bir yer edin evlat").
