# v189 — Neon Borsa: sınırsız hisse + parça alım

## Birimler
- 1 hisse = 1.000.000 birim. İçeride her şey tam sayı birim (oyuncu: `u`, piyasa: `u` = S).
- Ekranda küsuratlı: `10`, `10,5`, `0,03` (gereksiz sıfırlar yok) — `fmtShares`.

## Fiyat (BigInt, eski eğrinin sürekli hali)
S = satılmış toplam hisse, x = alınan / satılan hisse:
- Anlık fiyat: `1000 × (S + 0,5)`
- Alış temel tutarı: `500 × x × (2S + x + 1)` → yukarı yuvarlanır
- Satış temel tutarı: `500 × x × (2S − x + 1)` → aşağı yuvarlanır
- Komisyon %1: alışta eklenir, satışta kesilir (ikisi de yukarı yuvarlanır → sistemin lehine).
- Tam 1 hisse: alış (n+1)×1000, satış n×1000 → v188 ile birebir aynı (test: n = 0..250).

## Alım birimi ve butonlar
- Fiyat < 10.000 → 1 hisse; 10.000–99.999 → 0,1; 100.000–999.999 → 0,01; … (tam sayı döngüsü).
- Küçük buton = 1 birim, büyük buton = 10 birim. Yazıda miktar ve tutar: "0,01 hisse al · 2.020".
- Alış sınıra (20 hisse) kadar alır; 20'de pasif. Satış elinde daha az varsa elindekinin hepsini satar.

## Gece temettü avı engeli
Kural: **iki dağıtım arasında alınan hisse bir sonraki dağıtımı atlar.**
- Piyasa, mekân başına `bt` = bu dönem (son dağıtımdan sonra) alınıp hâlâ elde tutulan birim sayısını
  tutar (`btd` = dönemi). Dağıtımda gelir sadece hak kazanmış birimlere (`u − bt`) bölünür, sonra
  `bt` sıfırlanır. Hak kazanmış birim yoksa gelir belediyeye gider (hissedarsız mekân gibi).
- Oyuncu payında `b` = bu dönem alınan birim, `bd` = dönemi. Satışta önce `b` düşer.
- Gelir sayacı `A` (hak kazanmış birim başına birikmiş gelir × 10^18) sadece dağıtımda artar.
  Piyasa son 40 dağıtımın sonrasındaki `A` değerlerini saklar (`aH`). Dönemi bitmiş `b` birimleri,
  kendi döneminden sonraki ilk dağıtımın `A`'sından itibaren gelir alır.
- Oyuncu 40+ gün hiç işlem yapmazsa o kayıt listeden düşmüş olabilir: o zaman alım anındaki `A`
  kullanılır → en kötü ihtimalle atlaması gereken tek günün payını alır; gelir asla kaybolmaz.
- Örnek: 23:59'da alınan hisse 00:01'deki dağıtımda 0 alır; ertesi gece normal pay alır (testli).

## Gelir hassasiyeti
- `A` ve oyuncunun biriken geliri (`pq`) 10^18 ölçeğinde BigInt (Firestore'da metin). Küsurat birikir,
  toplarken tam altın ödenir, kalan küsurat payda durur.

## Tembel geçiş (toplu yazma yok)
- Oyuncu: eski kayıt (`n` tam hisse, sürüm yok) okunurken `u = n × 1.000.000`, `a` ve `p` yeni ölçeğe
  çevrilir; `c`, `r`, `g` aynen. İlk işlemde (al / sat / topla) o mekân yeni biçimde yazılır.
- Piyasa: ilk yazımda (bir işlem ya da saatlik iş) tüm belge tek seferde `v: 2` olur; `n` / `acc`
  silinir, `inc` / `ps` / `ch` aynen kalır.
- Test: eski 10 hisse = yeni 10 hisse; satış değeri, biriken gelir ve kâr/zarar aynı.

## 20 gün kuralı
- 20 gün **oyuna girmeyen** (`users/{uid}/private/meta.lastSeenAtMs`) oyuncunun hisseleri satılır.
  24 saat önceki uyarı SMS'i kalktı; satıştan sonra bilgi SMS'i gider.
- Maliyet: tarama hâlâ `borsaSon < 20 gün` sorgusuyla (sadece hissedarlar). Her aday için 1 okuma;
  oyuna girmişse `borsaSon` son girişe çekilir (1 yazma) → ~20 gün yeniden aday olmaz.

## Firestore
- Canlı fiyat: sunucu her işlemden sonra RTDB `borsaFiyat/<mekân>` = S yazar; saat başı tam liste.
  Kurallar: okuma giriş yapmış herkese, yazma sadece sunucu.
- Piyasa belgesi ekran açılınca bir kez (10 dk içinde okunduysa hiç) + saat başı okunur; dinlenmez.
- Hızlı basışlar ~0,8 sn'de tek isteğe birleşir; ekran anında (aynı formüllerle) güncellenir.
- Oyuncu başına saniyede en fazla 1 borsa isteği (`borsaSon`, ek okuma yok).
- Tek piyasa belgesi kaldı.
