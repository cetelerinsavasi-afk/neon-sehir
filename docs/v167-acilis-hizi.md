# v167 — Açılış hızı + kasma + belediye koltuğu + köprü + su + fabrika görevi

Kurallar ve indeksler DEĞİŞMEDİ. Sunucuda sadece görev sırası değişti (`functions/onboardingData.js`,
site ile ortak) — onu kullanan 15 fonksiyon yeniden yüklenir (deploy-v167.bat 3. adım). Firestore okuma/yazma artmaz
(açılışta aynı dinleyiciler birkaç saniye sonra açılır; ana sayfa arayüzünün şehrin altında kurulan
ikinci kopyası artık kurulmadığı için açılıştaki okuma biraz azalır). Sadece site güncellenir.

## Değişenler

### 1. Açılış hızı / kasma
- **Şehir kodu ana paketle aynı anda iner.** three.js + şehir motoru (~2 MB) eskiden ancak ana paket
  inip çalıştıktan, React çizdikten sonra isteniyordu. Artık `index.html`'de `modulepreload` ile hemen
  istenir (yavaş 4G benzetiminde şehir parçaları 2,5 sn yerine 0,3 sn'de istenmeye başladı).
- **İlk karede boşa 2D harita kurulmuyor.** Oyun doğrudan şehirle açılır.
- **Ana sayfa arayüzü şehrin altında kurulmuyor.** HUD, alt çubuk, telefon / ChatsApp / Görevler / Canlı /
  Seçim düğmeleri şehir açıkken görünmeden çalışıyordu; şehrin kendi kopyalarıyla birlikte aynı
  dinleyiciler iki kez açılıyordu (Görevler tek başına ~12 dinleyici). Artık şehir ilk kez kapanınca
  kurulur ve sonra eskisi gibi kurulu kalır.
- **Açılış sırası** (`src/lib/bootStage.js`). Bir sonraki aşamaya kareler akıcıyken geçilir; her aşamanın
  bir üst sınırı var.
  - 0: oturum, oyuncu belgesi, şehir, kendi avatarın
  - 1 (şehirden ~0,7–2,5 sn sonra): diğer oyuncular, altın / şüphe, Görevler
  - 2 (+2–5 sn): telefon düğmesi, canlı yayın, seçim, yakındakiler, bildirim şeridi, sosyal + çete +
    okunmamış dinleyicileri, internet kafe halkası
  - 3 (+2,5–7 sn): ekranların önceden indirilmesi, Google Play satın alma geri yükleme
  - Sonradan gelen düğmeler yumuşakça belirir.
- **Avatar doku kuyruğu.** Şehre girince çevredeki oyuncuların avatarları (oyuncu başına 4 büyük SVG)
  aynı karede resme çevriliyordu: 20 oyuncu = 80 resim tek karede. Artık kare başına ~5 ms'lik bütçe;
  oyuncular yarım saniye içinde tek tek belirir. Testte 80 resim 1 kare yerine 9 kareye yayıldı.

### 2. Belediye başkanı koltuğu
- Koltuğa / masanın arkasına dokununca avatar kapıdan çıkıp binanın arkasına yürüyordu: masanın arkası
  yol ızgarasında kapalı olduğu için yol bulucu hedefe kuş uçuşu en yakın hücreyi seçiyordu ve o hücre
  arka duvarın dışıydı. Artık başlangıç ve hedef aynı mekânın içindeyse yol odanın içinde kalır.
- Koltuğun 1,25 m yakınına hiç varılamadığı için "Otur" çıkmıyordu. Masa arkası gibi dar yerlerdeki
  koltukların erişim mesafesi genişletildi. Masanın solundan ya da önünden "🪑 Otur" çıkıyor; oturunca
  başkan koltuğuna geçiliyor.

### 3. Akçay Köprüsü ve arazi
- Köprünün iki yanında, tabliyenin altında ~25 m genişliğinde görünmez bir duvar vardı. Tabliyenin altı
  artık açık; sadece köprü ayakları ve pilonlar engel.
- Atlar, bisikletler, yayalar ve arabalar köprünün altından geçerken tabliyenin üstüne ışınlanıyordu.
  Artık zemin tabliyenin epey altındaysa arazi yüksekliği kullanılıyor.
- Dağlar ve vadi yamaçları artık araçlara engel değil (eşik ~39°'den ~63°'ye çıktı; sadece uçurum gibi
  dik yüzeyler engel). Ağaçlar, duvarlar, otoyol bariyerleri, su ve dünya sınırı eskisi gibi engel.

### 4. Su
- Araba / at / bisiklet göle, nehre, denize girer (eskiden görünmez duvara çarpıyordu). Gövde suyun içinde
  kalır (dipte yürümez) ve çok yavaşlar: sığda en çok hızının ~%30'u, derinde ~7 km/sa. Hızla girince
  birkaç saniyede yavaşlar.

### 5. Köprü duvarı / bariyerler
- Köprü (ve tünel) duvarları artık yayaya, ata, bisiklete de engel — köprünün üstünden yanlardan zemine
  atlanmıyor. Arabadan köprüde inince duvarın dışına konulmuyor.
- Otoyolun diğer bariyerleri at ve bisiklete de engel (cep / sapak / gişe ağızlarından geçilir). Yaya
  normal bariyerin üstünden geçebilir (köprü / tünel duvarı hariç).
- Köprünün altındaki yaya / at / bisiklet ayaklara ve pilonlara çarpar.

### 6. Görevler: "Fabrikada çalış" geri geldi
- 1. görev (mini haritadan ışınlan) ile 2. görev (yasaklı madde al) arasına "🏭 Bir fabrikada çalış ve
  maaşını al" eklendi. Oyuncu istediği fabrikada çalışır; maaşı aldığında (fabrika üretimi tamamlanınca,
  kendi fabrikasında çalışan sahip de) görev geçer. Sunucudaki görev ilerletme çağrısı zaten duruyordu;
  v160.3'te görev listeden çıkarılmıştı.
- Liste 17 → 18 görev (ONBOARDING_V 2 → 3). Şu an 2. ve sonraki görevlerdeki oyuncular yeni görevi YAPMAK
  ZORUNDA KALMAZ ve geri gitmez (aynı görevde kalırlar); 1. görevdekiler ve yeni oyuncular sırası gelince yapar.

## Kontrol listesi (yayından sonra)
- [ ] Telefonda oyunu ilk kez (gizli sekme / önbelleği temizleyerek) aç: şehir daha erken açılıyor mu,
      ilk saniyelerde takılma azaldı mı?
- [ ] Şehir açılınca önce avatar + şehir, ~1 sn sonra altın / şüphe + Görevler, birkaç sn sonra telefon
      düğmesi geliyor mu?
- [ ] Telefon rozeti, ChatsApp rozeti ve SMS bildirim şeridi birkaç saniye sonra doğru sayıyı gösteriyor mu?
- [ ] Yeni hesapla giriş: referans kodu penceresi ve Görevler çıkıyor mu?
- [ ] Şehirden eve / işletmeye girip çık: ana sayfa düğmeleri ve şehir düzgün mü?
- [ ] Belediye: makam koltuğuna dokun → avatar odanın içinde kalıyor, yanına varınca "🪑 Otur" → koltuğa
      oturuyor.
- [ ] Akçay Köprüsü: arabayla vadide köprünün altından geç (görünmez duvar yok, ayaklara çarpıyor).
- [ ] Atla köprünün altından geç: köprünün üstüne çıkmıyor.
- [ ] Arabayla köprünün üstünden geç: normal.
- [ ] Arabayla bir dağa tırman: duvara takılmıyor; ağaçlara ve bariyerlere hâlâ çarpıyor.
- [ ] Arabayla / atla göle ya da nehre gir: çarpmıyor, suyun içinde çok yavaş ilerliyor, dipte değil.
- [ ] Köprünün üstünde yürüyerek ve atla yana git: duvarda duruyor, aşağı düşmüyor.
- [ ] Köprüde duvarın yanında arabadan in: köprünün üstünde iniyorsun.
- [ ] Görevler: yeni hesapla 1. görevi (ışınlan) bitir → 2. görev "Fabrikada çalış"; bir fabrikada çalışıp
      maaşı al → 3. göreve (yasaklı madde) geçiyor.
- [ ] Eski hesapta (görevleri yarıda) görev numarası / görev aynı kalıyor, geri gitmiyor.

Geri dönüş: `geri-al-v167.bat`
