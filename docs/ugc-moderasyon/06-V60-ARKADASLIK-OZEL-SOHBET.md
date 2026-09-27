# v60 — Arkadaşlık + Özel Sohbet (ChatsApp)

Onaylı kararlar: **sunucu üzerinden yazma** · **engelleme arkadaşlığı ve sohbeti siler** · **bildirim = ChatsApp simgesinde sayı** · **oyuncu kartında yedek gösterim**.

## Oyuncu tarafı
- ChatsApp açılınca WhatsApp benzeri liste görünür:
  - Üstte **👥 Arkadaşlar (n)** ve **📨 Arkadaşlık istekleri (n)** düğmeleri.
  - En üstte sabit **📌 Neon Şehir** grubu durur. Bu, eski genel sohbettir; tüm oyuncular buradadır.
  - Altında arkadaş sohbetleri son mesaja göre sıralanır (en yeni üstte), yanlarında okunmamış sayısı görünür.
- Oyuncu kartında (ChatsApp, Sixtagram, çete sohbeti…) şu düğmeler çıkar:
  - ➕ Arkadaş ekle
  - ⏳ İstek gönderildi · Geri al
  - ✅ İsteği kabul et / Reddet
  - 💬 Mesaj
  - 👥 Arkadaşlıktan çıkar
- İki oyuncu birbirine istek gönderirse doğrudan arkadaş olurlar.
- Yalnızca arkadaşlar yazışabilir. Susturulmuş ya da banlı oyuncu özel mesaj gönderemez.
- Mesaja uzun basınca **Kopyala · Bildir** seçenekleri çıkar. Yönetim Paneli'nde "✉️ özel mesaj" olarak görünür ve gizlenebilir.
- Silme kuralları:
  - Kabul edilmeyen istek **48 saatte** silinir.
  - Mesajlar **7 günde** silinir.
  - Arkadaşlıktan çıkarma ya da engelleme sohbeti **iki taraftan da hemen** siler.
- Sınırlar:
  - En fazla 200 arkadaş.
  - Günde 30 arkadaşlık isteği.
  - Mesaj başına 500 karakter.
  - İki mesaj arası en az 0,8 saniye.

## Sunucu
| Dosya | Görev |
|---|---|
| `functions/social.js` | **Yeni.** `socialAction` callable'ı: `sendFriendRequest`, `cancelFriendRequest`, `respondFriendRequest`, `removeFriend`, `sendDm`, `markDmRead`. Ayrıca `onBlocked` ve `cleanup`. |
| `functions/index.js` | Modülü bağlar. `socialAction` ve saatlik `socialCleanup` burada tanımlı. |
| `functions/moderation.js` | Engelleme artık `onBlocked` ile arkadaşlığı ve sohbeti siler. Bildirilebilir türlere `dmMessage` eklendi; yalnızca sohbetin üyesi bildirebilir. |
| `functions/adminPanel.js` | `dmMessage` içerik kaldırmaya eklendi. |
| `functions/scripts/delete-user.mjs` | Hesap silmede arkadaş listesi, istekler, özel sohbetler ve başkalarının listelerindeki satır da temizlenir. |
| `firestore.rules` | Aşağıdaki koleksiyonları ekler. Yazma hepsinde kapalıdır. |

Koleksiyonlar ve okuma izinleri:
- `friendships/{uid}`: yalnızca sahibi okur.
- `friendRequests/{from}_{to}`: istek iki tarafa da okunur.
- `dmChats/{a}__{b}` ve alt koleksiyonu `dmMessages`: yalnızca sohbetin üyeleri okur.

Tüm sorgular tek alanlıdır, yani **yeni indeks gerekmez**.

## Deploy
1. `firebase deploy --only functions`. İki yeni fonksiyon eklenir: `socialAction` ve `socialCleanup`. Zamanlanmış görev olduğu için Cloud Scheduler kullanılır; zaten kullanılıyor.
2. `firebase deploy --only firestore:rules`. **Zorunlu:** yeni koleksiyonların okuma kuralları bu adımla gelir.
3. Web'i build alıp yayınla. `gizlilik.html` ve `hesap-silme.html` sayfaları özel mesajlar için güncellendi.

## Oyuncu kartı "yüklenemedi"
Kart bilgisi sunucudaki `getPlayerCard` fonksiyonundan gelir. Bu fonksiyon deploy edilmemişse ya da herkese açık çağrı izni yoksa kart artık boş kalmaz. Onun yerine herkese açık verilerle (fabrika, takım, Sixtagram beğenisi) yedek olarak doldurulur. Çete bilgisi yedekte gösterilmez ("Çete bilgisi şu an gösterilemiyor"). Asıl çözüm functions deploy'unun başarıyla tamamlanmasıdır.
