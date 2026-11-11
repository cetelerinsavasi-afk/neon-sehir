# v154 · Faz 3 — Yeni soygun / haraç paneli + şehirde "Soygun yap"

## Yeni panel (şehirde ve Mekanlar › Soygun'da AYNI)
- Üstte kompakt kart: büyük emoji, isim, ödül, getireceği şüphe, yakalanma riski (%).
- Güç çubuğu: "Gücün yetiyor" / "Ekip gerekli".
- **Güç yetiyorsa:** tek büyük buton (💰 HARAÇ KES / 💰 SOYGUNU YAP). Ekip listesi **hiç çıkmaz**.
  (Sadece bu hedefte zaten bir ekibin varsa, o ekip kartı altta görünür.)
- **Güç yetmiyorsa:** önce **kendi ekibin** (ilk görüntüde, beklemeden), sonra diğer açık ekipler; ekibin
  yoksa "👥 EKİP KUR".
- Ekip kartı sade: 4 avatar yuvası (güç + şüphe), kurucu taçlı ve ilk sırada, toplam güç çubuğu,
  tek sıra buton (Katıl / BAŞLAT / Ayrıl / 📝 not / 🗑️ sil). Not varsa tek satır.
- Engel varsa tek satır: bugün yapıldı / bağış yapıldı / şüphe 50+ / belediye görevlisi.

## "Kendi ekibim 1 saniye sonra üste çıkıyor" düzeltmesi
- Sebep: "bu ekipte miyim?" her plan için ayrı okumayla soruluyordu, cevap gelince liste yeniden sıralanıyordu.
- Çözüm: ekip üyeleri plan belgesinde de tutuluyor (`memberUids`). Kendi ekibin ilk görüntüde belli.
- **Firestore:** istemcideki plan başına üyelik okumaları kalktı; sunucuda "bu hedefte ekibin var mı"
  kontrolü de üye listesini kullanıyor (plan başına okuma kalktı). Katılmada plan belgesine yazım
  uyarı listesiyle **tek yazımda** birleştirildi. Ayrıl / çıkar zaten plan belgesine yazıyordu, aynı yazıma eklendi.
- Eski açık planlarda (üye listesi olmayan) eski yol çalışır; planlar 24 saatte kapandığı için geçiş kendiliğinden biter.

## Şehirde "Soygun yap"
- Soyulabilir mekânların kapısında "İçeri gir"in yanında **💰 Soygun yap**: Banka, Casino, Galeri,
  Silahçı, Fabrika, İnternet Kafe. Panel şehrin içinde açılır (sayfa değişmez).
- Seyyar satıcılarda "Haraç kes" aynı yeni paneli açar (haraç animasyonu aynen).

## Dosyalar
- `src/components/HeistPanel/HeistPanel.jsx` + `.css` — yeni panel ve ekip kartı
- `src/components/City/CityScreen.jsx` — kapıda "Soygun yap", mekân soygun paneli
- `src/hooks/useMyActiveHeistPlan.js` — üye listesini kullanır (okuma yok)
- `functions/index.js` — `memberUids` (kur / katıl / ayrıl / çıkar), ekip kontrolü
- `functions/gang/test/heist-ledger.test.js` — yeni test
- Önizleme (build'e girmez): `preview/mekan-app.jsx` (sahte ekipler), `preview/mocks/firebase-firestore.js`

## Yayın
1. `firebase deploy --only functions`
2. Web build + deploy

## Telefonda kontrol listesi
1. Gücün yeten bir satıcıda "Haraç kes" → ekip listesi yok, tek büyük buton.
2. Banka'da (güç yetmez) → ekip kur; panel kapanıp açılınca ekibin anında en üstte.
3. Başka bir hesapla ekibe katıl → kart iki hesapta da doğru; ayrıl → listeden düşer.
4. Şehirde Banka / Casino / Galeri / Silahçı / Fabrika / İnternet Kafe kapısında "Soygun yap".
