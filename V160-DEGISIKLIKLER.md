# v160

## Kostümler (yeni)
- **Profil › 🎭 Kostümler** (Aksesuarlar'dan önce): prototipteki 100 hazır tip zümrütle satın alınır
- Fiyatlar: en ucuzu **10**, en pahalısı **200** zümrüt — Yaygın 10–15, Nadir 25–35, Epik 50–80, Efsanevi 120–200 (en ilgi çekici / kaliteli olanlar en pahalı: Siber Baba 200, Kozmik Muhafız ve Zeus 190, Demir Titan / Baba / Neon Samuray 175…)
- Kartta dene (yürü / dur / otur / silah), renk yuvalarını değiştir, **ten rengini** değiştir; satın alınca seçilen renklerle kuşanılır. Renkler sonra ücretsiz değişir ("🎨 Renkleri kaydet"), "Çıkar" ile kendi avatarına dönülür
- Kuşanılan kostüm aksesuar ve evcil hayvanla birlikte şehirde, mekânlarda, sohbette — her yerde görünür (kafayı kaplayan tiplerde şapka / gözlük gizlenir)
- Avatar oluşturucuda kostüm giyiliyken kendi avatarın gösterilir (düzenlediğin o)

## Prototip düzeltmeleri
- **Ten rengi** değiştirilebilir (tenin bütün gölgeleri birlikte değişir)
- **Renk değişmeyen elbiseler:** Kor / Dalga / Şafak Perisi elbiseleri, Gizli Ajan takımı, Şerif yeleği, Büyük Sihirbaz / Kont Vlad pelerini, Rock Yıldızı, Ölüm Meleği, Siber Ninja, Neon Samuray, Kızıl Samuray hakaması, Mor Cadı, Süper Teyze, Kelebek Kraliçesi, Kozmik Muhafız, Ringin Kraliçesi, Teneke Robot, Demir Titan, Mıknatıs, Valkür, Zeus togası, Çılgın Profesör önlüğü… artık değişiyor. Koyu kıyafetler (siyah takım, pantolon) saçla birlikte değişmiyor; gri / siyah tonlu yuvalarda renk yeşile kaymıyor
- **Kaş = saç:** kaşlar (ve sakal) hep saç renginde; saç rengi değişince kaş da değişir
- **Kadın karakterlerin kaşları ince**

## Şehir
- **Başka çetenin karargahına girilir:** her karargahın kapısında "🚪 İçeri gir" herkese açık (misafir: düzenleme / kasa / çete paneli yok; çıkarılan oyuncu yine giremez)
- **Mekâna girince kapıda görünme:** karargah, ev, ofis, işletme şehrin üstünde açıkken oyuncu artık kapının önünde görünmez; çıkınca hemen yeniden görünür
- **Yol tarifi yollar üzerinden:** iğneye düz çizgi yerine yol ağındaki en kısa rota (mini harita + büyük harita); ok rotanın ilerisini gösterir, mesafe yol boyunca

## Yükleme
- Site (git push → Cloudflare) + 2 fonksiyon: `cosmeticsAction` (kostümler), `houseAction` (karargaha misafir girişi)
- Firestore / veritabanı kuralları ve Android uygulaması değişmedi

# v160.1
- v160 sitesi yayına çıkmamıştı: GitHub'a gitti ama Cloudflare o commit için derleme başlatmadı (Kostümler ve yol tarifi bu yüzden görünmüyordu). Yükleme betiği artık push'tan sonra Cloudflare derlemesini bekleyip sonucunu söylüyor
- Profil düğmeleri: **Günlük Rapor · Kostümler · Aksesuarlar · Mobilyalar** (4 düğme)
- **Aksesuarlar bilgisayarda düzgün açılmıyordu:** Kaydet çubuğu sağa sıkışıyor, liste kayıyordu. Bilgisayar düzeni yeniden yapıldı (solda sahne, sağda liste, altında Kaydet); telefon düzeni aynı
- Kostümler ekranı bilgisayarda ortada telefon genişliğinde açılır

# v160.2

## Sixtagram — çökme
- **Asıl sebep:** ev ve şehir fotoğrafları görsel olarak saklanmıyordu; her telefon akıştaki her fotoğraf için evi / koca şehri ekran dışında 3D olarak yeniden kuruyordu. Çekilen yerin yakınındaki şehir fotoğrafları (çoğu evin önünde çekiliyor) Sixtagram açılır açılmaz otomatik çiziliyordu; hikâye izleyicisi de dokunmadan çiziyordu → telefonun belleği taşıp oyun kapanıyordu
- **Yeni altyapı:** fotoğrafı çeken cihaz paylaşırken son kareyi küçük bir JPEG olarak gönderir (hikâye 360×640, gönderi 432×432, ~30–60 KB). Sunucu doğrular (gerçek JPEG mi, boyutu uygun mu) ve Realtime Database'e (`sixImg/{gönderi}`) yazar; gönderi belgesine sadece `img: 1` eklenir. **Firestore okuma / yazma sayısı değişmedi**; görsel ekrana yaklaşan gönderi için bir kez iner ve telefonda saklanır. Gönderi silinince / süresi dolunca görsel de silinir
- Telefonda Sixtagram artık **hiç 3D sahne kurmaz**. Eski (görselsiz) fotoğraflar telefonda simgeyle görünür (24 saatte zaten silinirler)
- **Tembel yükleme:** akışta sadece ekrana yaklaşan gönderilerin fotoğrafı / mekân karesi / resmi / röportajı kurulur, uzaklaşınca kaldırılır (bellek sabit kalır). Önceden yükleme payı eskiden hiç çalışmıyordu (kaydırma kutusu kök verilmemişti) — düzeltildi; aşağı kaydırdıkça yaklaşılan gönderiler hazır gelir
- Fotoğraflar artık dokunmadan doğrudan görünür

## Diğer
- Kostüme dokununca sayfa en üste (önizlemeye) kayar
- Fiyatlar: **pahalandı** — Volt 90, Kor Perisi 140, Dalga Perisi 130, Orman Perisi 120, Ay Perisi 150, Şafak Perisi 130, Elf Okçu 70, Yeşil Gezgin 60, Zombi 45 · **ucuzladı** — Lale Muhafızı 50, Gizli Ajan 15, Gladyatör 25, Büyük Sihirbaz 25, Baba 60 (nadirlik fiyata göre)
- Büyük haritanın sağ üstündeki ✕ koyu zemin + beyaz (açık renkli haritada kaybolmuyor)
- Motor / bisiklet / at üstünde **iç kameradayken** çekilen fotoğrafta sürücü görünmüyordu → açık araçta fotoğraf arkadan-yukarıdan çekilir, sen görünürsün
- Belediye panelinde ✕ en solda

## Yükleme
- Veritabanı kuralları (`sixImg`) + 3 fonksiyon: `createSixtagramPost`, `cleanupSixtagramPosts`, `cosmeticsAction` + site

# v160.3
## Şehir
- **Hızlı koşu** şehirde varsayılan olarak açık
- **Mekânların içinde** (ev, işletme, karargah, ofis…) şehirdeki gibi **Çeteler / Soygun / Profil** düğmeleri ve **Hatırlatmalar** (görevler) var; "Git" şehirde hedefe götürür
- Mekân içinde **ChatsApp düğmesi kaldırıldı**, hareket (emote) düğmesi **sola** taşındı
- **Seçim / imza / darbe:** anasayfadaki 🗳️ düğmesi yerine hatırlatma: "Seçim başladı — oy kullan" → **Belediyeye git** (sandık belediyede)
- **Belediye:** Belediye düğmesi solda, altında Seçim, altında Darbe (şehir sürümünde garson yok)
- **Fabrika içinde** Fabrika ve Soygun düğmeleri alt alta
- Kapı listesinde **depo alış/satış fiyatları** ve **"Mal yok"** yeniden görünüyor

## Çeteler paneli (5 sekme)
- **Çeteler | Sohbet | Savaş | Ticaret | Çete**
- Her çete satırında **Çeteye katıl** + **Karargaha gir** (Polis Teşkilatı hariç); kendi çeten **Aç** → Savaş
- Polisi "Aç" ile açınca panel kapanana kadar tüm sekmeler teşkilatı gösterir
- **Başka çetenin karargahında** sağ üstte **Çete** düğmesi: o çetenin adı, sloganı, altını, üye sayısı ve 7 kıdemli üyesi. Sadece Çete ve Çeteler açık, diğerleri 🔒
- Kendi karargahında Çete düğmesi → Savaş sekmesi
- Panelin üstündeki boş alana dokununca kapanır

## Diğer
- **Başlangıç görevi 1:** "Mini haritaya dokun ve bir yere ışınlan" (ışınlanınca tamamlanır). 1. görevi bitirmiş olanlar sıfırlanmaz; hâlâ 1. görevde olanlar ve yeni oyuncular bu görevi yapar. Diğer görevler aynı
- **Fabrikalar sekmesi** hızlı açılır (liste cihazda saklanır, makineler parça parça gelir)
- **Makine Al** ekranında elindeki altın yazıyor
- **Kostümler (bilgisayar):** renk seçenekleri artık alt satıra sarıyor (fareyle sağa kaydırma gerekmiyor)
- Sixtagram: paylaşım görseli üretildikten sonra bellek hemen bırakılıyor (düşük bellekli telefonlarda hikâye paylaşırken çökme)

## Yükleme
- Site (git push → Cloudflare) + 2 fonksiyon: `checkOnboardingProgress` (ışınlanma görevi), `produceAtFactory` (eski "fabrikada çalış" görevi artık 1. görevi ilerletmesin)

# v160.4
- **Belediye (şehir):** solda Belediye, altında **🛎️ Garson** (Çaycı Hasan bedava çay getirir, 2 dk elinde), altında **tek düğme**: darbe varsa ⚡ Darbe, yoksa seçim dönemi düğmesi (ikisi aynı anda olmaz)
- **"amk"** artık küfür sayılmıyor (aynı kısaltmanın yazımları "aq", "amq" de)
- **Karargaha yol tarifi:** çete karargahları bölgesi "uzak" sayılıp rota otoyoldan Kervankent'e gidiyordu; artık şehirden çakıllı yolla karargahlara gidiyor
- **Soygun › Ziyaret › 🏴 Karargahlar:** tüm karargahlar listede (herkes girebilir); en kalabalık üstte, eşitlikte dün en çok ziyaret edilen. İçinde biri olan karargahlar **Popüler**'e de girer. Dokununca şehirde o karargaha girilir
- Kapı listesinde fiyatlar (v160.3'te gelmişti): spor salonu üyelik + bonus, silahçı / modifiye tamir-geliştirme, internet kafe, gazino, depo al/sat + "Mal yok"
- v160.3'ün tamamı bu pakette de var (yüklenmediyse onu da yükler)

## Yükleme
- Site + fonksiyonlar: `checkOnboardingProgress`, `produceAtFactory` (v160.3) ve küfür filtresini kullanan yazılı işlemler (sohbet, Sixtagram, çete, belediye, siyaset, ad değiştirme…) — gruplar halinde, aralarda bekleyerek
