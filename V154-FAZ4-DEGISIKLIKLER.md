# v154 · Faz 4 — Soygun videoları

## Ne var
- Gönderdiğin "Soygun Dizisi" prototipi oyunun **kendi şehir motoruna** takıldı (`City/cityHeist.js`).
  Davranış prototiple birebir aynı; sadece prototipin kullandığı şeyler oyundaki gerçek karşılıklarına bağlandı
  (VENUES, şehir kiti, araç modelleri, avatar çizimi, NPC avatarları).
- **Senaryolar:** tek başına · 2 kişi (lider + şoför) · 3 kişi (+ tetikçi) · 4 kişi (+ gözcü);
  başarılı · şüpheden yakalandı · **gizli polis** (polis pusuda bekler, ekipten kimse polis diye gösterilmez,
  sonuç kartında diğerlerinin payı "?").
- Sahneler: Banka, Casino, Galeri, Silahçı, Fabrika, İnternet Kafe. Mekânın içi lotun altında kurulur.
- **Seyyar satıcı haracı:** şehirdeki haraç animasyonu, artık Mekanlar › Soygun panelinden yapılınca da oynar.

## Kim izler
- Sadece soygunu **başlatan**: tek başına soygun yapan, ya da ekibi kurup "BAŞLAT"a basan.
- Diğer ekip üyeleri videoyu izlemez, sonucu bugünkü gibi görür.
- Polis tuzağını kuran polis videoyu izlemez (kendi sonucu eskisi gibi pencerede).

## Nasıl oynar
- Butona basınca sonuç **hemen** sunucuda belli olur; video bu sırada yüklenir ve sonucu sonunda gösterir.
- **Şehirdeyken** (kapıda "Soygun yap"): şehrin kendi motoru oynatır, şehir arayüzü video boyunca gizlenir,
  bitince kapının önüne dönülür.
- **Şehir dışında** (Mekanlar › Soygun): tam ekran oynatıcı şehri arka planda kurar (ağ yok), hedefin önünde
  oynatır, bitince tamamen kapanır.
- "Geç ⏭" her an; sonda "Tekrar izle" / "Kapat". Kapatınca panelde kısa bir sonuç satırı kalır.

## Gerçek ekip + araba
- Videodaki kişiler **gerçek ekip üyeleri**: ekip kartındaki avatarlar ve isimler (kurucu lider).
- **Araba:** soygunu başlatanın şehirde **en son çağırdığı otomobil**, modifiyeli hâliyle (bu cihazda
  hatırlanır). Hiç araba çağırmadıysa varsayılan Sedan. Ticari araç / motor kaçış arabası olmaz.
  Araba sadece şoförü olan ekiplerde gelir (tek başına soygunda yürüyerek gidilir — prototipteki gibi).

## Firestore
**Hiç yeni okuma / yazma / dinleyici yok.** Avatarlar zaten açık olan ekip kartından, araba cihazdan geliyor.
Sunucuya (`functions/`) dokunulmadı.

## Dosyalar
- Yeni: `src/components/City/cityHeist.js` (+ `.css`) — soygun dizisi
- Yeni: `src/components/City/HeistVideo.jsx` — şehir dışı tam ekran oynatıcı (sadece gerekince yüklenir)
- Yeni: `src/components/HeistPanel/heistVideo.js` — sonuç → senaryo, son araba
- `City/cityEngine.js` — dizinin motora bağlanması (her kare, kamera, etiketler, dokunma)
- `City/CityScreen.jsx` — şehirde video + arayüzü gizleme, son arabayı hatırlama
- `HeistPanel/HeistPanel.jsx` (+ `.css`) — "SOYGUNU YAP" / "BAŞLAT" videoyu açar
- Önizleme (build'e girmez): `preview/city-app.jsx`, `preview/mekan-app.jsx`, `preview/mocks/firebase-functions.js`

## Yayın
Sadece web build + deploy (sunucu değişmedi). Önceki fazlar yayınlanmadıysa onların adımları da gerekli.

## Telefonda kontrol listesi
1. Şehirde bir arabayı çağır, sonra Silahçı / Fabrika / Net Kafe kapısında "Soygun yap" → tek başına video.
2. Mekanlar › Soygun'dan aynı soygun → tam ekran video, "Geç" ve "Kapat" çalışıyor.
3. Ekip kur (2–4 kişi), BAŞLAT → videoda gerçek ekip ve senin araban; diğer üyeler video görmüyor.
4. Satıcıya panelden haraç → haraç animasyonu.
5. Telefonda ilk açılış birkaç saniye sürebilir (şehir kuruluyor); takılma / donma olursa söyle.
