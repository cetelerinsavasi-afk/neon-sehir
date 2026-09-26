# v53 — Oyuncu Kartı ve "gizli, olumlu" bildirim akışı

> Onaylandı: şikâyet/engelle düğmeleri göze sokulmaz; önce olumlu bilgi ve işlemler gelir. Google Play UGC politikası uygulama içi bildirme ve engelleme ister, bunların öne çıkarılmasını şart koşmaz.

## Oyuncu nasıl kullanır?
| Nerede | Dokun | Uzun bas (masaüstünde sağ tık) |
|---|---|---|
| ChatsApp | Avatar / ad → **Oyuncu Kartı** | Mesaj → Kopyala · Profili gör · *Bildir* |
| Çete sohbeti (Genel, Yönetim, Tüm Çeteler) | Avatar / ad → Oyuncu Kartı | Mesaj → Kopyala · Profili gör · *Bildir* |
| İstihbarat sohbeti (anonim) | – (kart yok) | Mesaj → Kopyala · *Bildir* |
| Sixtagram gönderisi | Avatar / ad → Oyuncu Kartı · **⋯** → Profili gör · Yorumlar · *Bildir* | – |
| Sixtagram yorumu / yanıtı | Avatar / ad → Oyuncu Kartı | Yorum → Kopyala · Profili gör · *Bildir* |
| Fikirler | Öneriyi aç → "👤 … profilini gör" | – |
| Mekanlar (👥 Yakındakiler) | Oyuncu satırı → Oyuncu Kartı | – |

- **Oyuncu Kartı:** avatar, ad, çete (logo + ad + rütbe), fabrika, sahibi olduğu takım, menajeri olduğu takım, Sixtagram toplam beğeni.
  - Oyuncu yalnızca İstihbarattaysa çete satırı görünmez. İstihbarat üyeliği, kod adı, polislik, altın, borç, şüphe ve meslek **hiçbir zaman** dönülmez.
  - Bildirme ve engelleme kartın köşesindeki küçük, soluk **⋯** içindedir: "Bu mesajı/gönderiyi/yorumu bildir", "Oyuncuyu bildir", "Engelle".
- Menülerde "Bildir" en altta, ayrık ve soluk durur. Oyuncuya görünen tüm metinlerde "şikâyet" yerine **"Bildir"** kullanılır. Sunucu hata mesajları da buna uyarlandı.

## Teknik
- `functions/playerCard.js` → yeni callable `getPlayerCard({ uid })`. Yazma yapmaz, yaklaşık 7 okuma yapar. İstemcide aynı kişi için 60 sn önbellek tutulur.
- `src/components/PlayerCard/*`, `src/components/ActionMenu/*` (`ActionMenu`, `useLongPress`, `copyText`).
- `ReportBlockSheet` sayfa gövdesine taşındı (her katmanın üstünde açılır). "Engelle" satırı soluk.
- `Sixtagram/AuthorPanel` kaldırıldı; yerini Oyuncu Kartı aldı.
- Testler: `functions/scripts/player-card.test.mjs` (4 senaryo; functions `npm test`'e dahil).

## Deploy
`firebase deploy --only functions` (yeni: `getPlayerCard`) + frontend. Rules değişmedi.
