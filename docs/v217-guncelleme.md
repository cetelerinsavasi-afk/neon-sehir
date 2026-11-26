# v217 — Çete parasına not, ChatsApp en alttan açılır, Kostümler çökmesi, sekme sırası

## 1. Çeteler arası para gönderirken not
Çetem › Kasa › 📤 Başka çeteye gönder: çete seçilince **📝 Not (isteğe bağlı)** alanı çıkar (en fazla 160 karakter).
Para ve not **iki çetenin de genel sohbetine** düşer:
- Gönderen: `📤 Ali (Mafya Babası) Beta çetesine 1.000 altın gönderdi. 📝 Not: “Savaş desteği”`
- Alan: `📥 Alfa çetesi kasamıza 1.000 altın gönderdi. 📝 Not: “Savaş desteği”`

Notsuz gönderim eskisi gibi. Belediyeye bağışta not alanı çıkmaz.
**Sunucu değişti** → `gangAction` fonksiyonu yayınlanmalı (site önce yayınlanırsa not sadece yok sayılır, hata vermez):
`npx firebase deploy --only functions:gangAction`

## 2. ChatsApp sohbeti en alttan açılır
Sebep: sohbet açılınca mesajlar parça parça geliyor (önce cihaz önbelleğindeki son mesajlar, sonra eskiler
üste ekleniyor). Eski kod sadece "son mesaj değişince" kaydırıyordu; son mesaj aynı kalınca liste üstte kalıyordu.
Yeni: liste "alta yapışık" açılır, içerik ya da kutu boyu her değişince en alta iner. Yukarı kaydırıp eski
mesaj okurken zıplamaz; kendi mesajını gönderince en alta iner. Grup ve özel sohbet (DM) ikisi de.

## 3. Kostümler paneli oyundan atıyordu (telefon)
Masaüstünde hata yok; telefonda WebView bellek taşmasından çöküyordu:
- 100 kostüm kartının 2D (SVG) resmi panel açılır açılmaz **hepsi birden** çiziliyordu → artık sadece ekrana gelen kart çizilir.
- 3D küçük resimlerin ve gezilen her kostümün dokuları ekran kartı belleğinde **hiç bırakılmıyordu**
  (kod "çöp toplayıcı siler" sanıyordu; WebGL dokuları öyle silinmez) → küçük resim çıkınca dokusu hemen bırakılır,
  büyük önizleme önbelleği telefonda 6 kostümle sınırlı ve düşen bırakılır.

## 4. Avatarım sekmeleri
Kostümler sekmesi en başa alındı; açılışta yine **Vücut** seçili.

## Dosyalar
| Dosya | Ne |
|---|---|
| `functions/gang/actions/treasury.js` | `transferToGang` → `note` |
| `functions/gang/test/treasury.test.js` | v217 not testi |
| `src/components/Gangs/tabs/CetemTab.jsx` | Not alanı |
| `src/components/ChatsAppScreen/useStickyChat.js` | Yeni: alta yapışık kaydırma |
| `src/components/ChatsAppScreen/DmChat.jsx`, `GroupChat.jsx`, `ChatsAppScreen.css` | Kaydırma |
| `src/lib/avatar3dView.js` | Doku bırakma |
| `src/components/Avatar3D/Avatar3D.jsx`, `src/components/CostumeShop/CostumeShop.jsx` | Kartlar sadece görününce çizilir |
| `src/components/AvatarBuilder/AvatarBuilder.jsx` | Sekme sırası |

## Kontrol listesi
- [ ] Başka çeteye notlu para gönder → iki çetenin genel sohbetinde para + not.
- [ ] ChatsApp › bir DM aç → en son mesaj altta görünüyor. Grup sohbeti de.
- [ ] Yukarı kaydır, eski mesajlar yüklenince ekran zıplamıyor.
- [ ] Telefonda Avatarım › Kostümler aç, 20-30 kostüme dokun, listeyi sonuna kadar kaydır → atmıyor.
- [ ] Avatarım açılınca sekmeler: Kostümler, Vücut (seçili), Yüz…
