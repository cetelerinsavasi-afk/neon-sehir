# v224 — Basket şutu, smaç, sahalara iki giriş, maçta helikopter inemez

## 1. Basket
- **Şut baktığın yöne**: eskiden top her zaman en yakın potaya gidiyor, girip girmemesi şansa kalıyordu.
  Artık kameranın baktığı yöne atılır (avatar da o yöne döner):
  - pota tam karşındaysa **girer** (uzaktan küçük bir şaşırma payı; 3 sayı çizgisi aynı),
  - biraz kaçıksa **çemberden döner**,
  - pota karşında değilse top baktığın yöne gider: **Iska!**
- **Smaç**: potanın dibinde (1,7 m) ve yüzün potaya dönükken şut düğmesi smaç bastırır (yüksek sıçrayış, top çemberden aşağı) — 🏀 SMAÇ! +2.
- **Zıplama düzeltildi**: şutta ve blokta "zıpla" emote'u kullanılıyordu (3,2 sn sürüyor, 3–4 kez zıplatıyordu).
  Artık tek sıçrayış: kollar havada, dizler bükülür.
- **Pota**: çember panyonun içine giriyordu (pano çemberin önünde görünüyordu) → çember panyodan 10 cm önde, arada taşıyıcı.
  Şut hedefi de çemberin yeni yerine göre (`world/aktivite.js › HOOP_X`).

## 2. Sahalar
- **Basket sahasına ve halı sahaya iki taraftan giriş** (karşı çitte de kapı boşluğu).

## 3. Helikopter
- **Maç varken sahaya inilmez**:
  - Stadyumda canlı maç varken stadyumun üstünde yerden 26 m'nin altına inilmez,
  - Park sahalarında (halı saha / basket) yürüyen bir oyuncu varken sahanın üstünde 9 m'nin altına inilmez.
  Alçaktan sahaya girilemez; pilotsuz kendi inen helikopter sahanın dışına kayar. Uyarı: "🚁 Stadyumda maç var — sahaya inilmez" / "🚁 Sahada oyun var — inilmez".

## Yayın
`v224-yayinla.bat` v223'ü de içerir (dosyalar klasöründeki her şey kopyalanır): testler, derleme, **fonksiyonlar** (v223: fotoğrafta kaykay), commit, push, Cloudflare.
