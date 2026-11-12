# Neon Şehir v157 — Gezilebilir şehir yenilendi (prototip → oyun)

## Şehir ve dünya
- Prototipteki dünya oyuna taşındı: O-77 otoyolu (tünel, köprü, gişeler — **ücret ve hız cezası yok**), Kervankent kasabası, yol üstü köyler/cepler, kuzeydeki Neon Kent Ormanı, sahil (batı artık deniz), uzak ufuk, hayvanlar, köylüler.
- Yeni minimap + büyük harita (Şehir / Bölge / Kervankent / Ben sekmeleri, kaydır-yakınlaştır, dokununca oraya git).
- Limana yakın **kuzey deposu kaldırıldı**; şehir içi tır teslimi doğu deposuna, uzak teslim Kervankent Lojistik Terminali'ne.
- Şehirlerarası otogar (Neon Şehir + Kervankent).
- Dünya adım adım kurulur (yükleme çubuğu) — telefonda ana iş parçacığı donmaz; ağaç/arazi parçalı, uzaktakiler kırpılır, NPC dokuları gerektiğinde üretilir.

## Mekânlar (haritanın içinde)
- Ana haritada bir mekâna dokununca şehirde **o binanın içinde** doğulur. "İçeri gir" düğmeleri kalktı; içerisi kapıdan görünür, yürüyerek girilir.
- İşletme türü mekânlarda üstte tek düğme: Barlar · Cafeler · İnternet kafeler · Modifiye garajları · Araba galerileri (+ Soygun yap) · Silahçılar · Spor salonları · Gazinolar… → açılır panelde oyuncuların işletmeleri; seçilen yere gidilir (göstermelik iç mekân, satış yok).
- Camii, banka, karakol, belediye: içeride doğrudan oyunun işlemleri (istasyonlar).
- Ev → "Evler" düğmesi (evler/ofisler). Hastane, otogar: gezilir. Benzinlik marketi: içeride market + ATM.
- **Taksi durağı artık girilir**: bekleme salonu, durakçı ve taksiciler; önde sıra bekleyen taksiler (tepe lambaları çift yüzlü).
- Modifiye garajının içine girince "🔧 Modifiye garajları" düğmesi çıkar.
- Bar önü: şemsiye yok → fıçı masalar + bar tabureleri. Cafe önü: şemsiyesiz kafe masaları.
- Yarış pisti: pit lounge pistin dış kerbinin 1 m gerisine çekildi; lastik bariyerler virajın dışına alındı (piste taşmıyor).

## Meslekler
- Tır ve otobüs "İşe başla" → **Yakın / Uzak**.
  - Tır: yakın (doğu deposu) günde 5, uzak (Kervankent) günde 2, uzak ≈ 3 kat kazanç.
  - Otobüs: günde 1 şehir içi + 1 şehirlerarası; şehirlerarası 1,5 kat.
- Şehrin batısı deniz olduğu için eski batı dış halkasındaki taksi/polis/ambulans noktaları kaldırıldı (artık hepsi sürülebilir yolda). Tüm şehir içi ve otoyol rotaları engelsiz test edildi.

## Arayüz
- Sol sütun: araba · hızlı koş · hareketler · yatay mod. Sağ sütun: ChatsApp · telefon · kamera · yakındaki oyuncular.
- Yatay mod: Android uygulamada ekran gerçekten yataya döner (v1.2.1); tarayıcıda tam ekran + yön kilidi, olmazsa yazılımla döndürme.
- Araç sürerken sohbet düğmesi (araçtan inmeden yazılır).

## Soygun
- Kapıdan girişteki uzun karartma ve "karartmadan sonra kapının önünde görünme" düzeltildi; üstteki sayaç kalktı.
- Silahçı soygunu "Orta boy iş"e taşındı.
- Listede: bugün soyduysan "Bugün soydun", satıcıya bağış yaptıysan "Bugün bağış yaptın".
- Mekanlar > Ziyaret: sadece özel girişli yerler (oyuncu/çete mekânları, oyunun işletmeleri). Camii, banka, karakol, belediye şehirde doğrudan girildiği için listeden çıktı.

## Diğer
- Yayalar sık ormana giremez (yürüyüş yolları, açıklıklar, çayırlar, otoyol banketi ve köy yolları açık). Hayvanlar ormanda dolaşır.
- Şehir fotoğrafı ve soygun videosu da dünyayı adım adım kurar (donma yok).
- RTDB konum sınırları ve şehir fotoğrafı sınırları genişletildi (otoyol/Kervankent).
- Firestore okuma/yazma artmadı: yeni günlük etiketler mevcut `dailyActions` dinleyicisini kullanır; dünya, trafik, hayvanlar, harita tamamen cihazda.

## Yükleme (deploy-v157.bat)
Sıra önemli: **önce RTDB kuralı, sonra fonksiyonlar, en son site.**
1. `neon-sehir-v157.zip`'i proje klasörüne (ya da İndirilenler'e) koy, `deploy-v157.bat`'a çift tıkla
   (yoğun saatte: `deploy-v157-simdi.bat`). Betik: güvenlik kontrolü → zip → derleme + testler →
   `firebase deploy --only database` → fonksiyonlar (`cityAction`, `createSixtagramPost`, `shopAction`) → commit + push.
2. Android: `android-webview` içinde `aab-olustur.bat` ile v1.2.1 (versionCode 16) AAB'yi oluşturup Play'e yükle.
   Eski uygulama sürümlerinde yatay mod yazılımla döndürmeye düşer (çökmez).

Not: Yükleme anında sürmekte olan taksi/polis/ambulans işi (nokta listesi değişti) yeniden başlatılır; başka etkisi yok.
Firestore kuralları / indeksler değişmedi.
