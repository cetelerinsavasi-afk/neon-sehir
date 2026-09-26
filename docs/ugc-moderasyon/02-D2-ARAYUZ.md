# UGC Moderasyonu — Faz D2: Arayüz

> D1 altyapısının (`01-D1-ALTYAPI.md`) oyuncuya açılan yüzü. Backend'e dokunmaz.
>
> **Güncel durum (v53):** Aşağıdaki "⋯ menüsü" sütunu D2'nin ilk hâlidir. v53'te her mesajdaki ⋯ kaldırıldı; bildirme/engelleme artık **Oyuncu Kartı**'nın köşesindeki ⋯ ve mesaja **uzun basınca** açılan menüdedir ("Şikâyet et" → "Bildir"). Güncel tablo: `04-OYUNCU-KARTI.md`. Filtre sütunu hâlâ geçerlidir.

## Ortak parçalar
| Dosya | Görev |
|---|---|
| `src/contexts/BlocksContext.jsx` | `userBlocks/{uid}` için **tek dinleyici**; `useBlocks()` → `isBlocked(uid)`, `list` |
| `src/lib/ugcVisibility.js` | `isHiddenForMe(item, yazarUid, isBlocked)` — `hidden` veya engellenen yazar |
| `src/components/ReportBlockSheet/` | Ortak alt sayfa: şikâyet (8 sebep + isteğe bağlı not) / engelle / engeli kaldır; `MoreButton` (⋯) |
| `src/components/NearbyPlayers/` | Dünya ekranlarında 👥 "Yakındakiler": oyuncu listesi + balon/oyuncu şikâyeti + engelleme |
| `src/components/BlockedPlayersList/` | Profil → "Engellenen oyuncular" + "Engeli kaldır" |

## Yüzeyler
| Yüzey | Filtre | ⋯ menüsü |
|---|---|---|
| ChatsApp | gizlenen + engellenen mesajlar yok | Mesaj · Oyuncu · Engelle |
| Üst bildirim şeridi | engellenen/gizlenen mesajda şerit çıkmaz | – |
| Sixtagram akışı | gizlenen + engellenen gönderiler yok | Gönderi · Oyuncu · Engelle |
| Sixtagram yorumlar/yanıtlar | gizlenen + engellenen yok | Yorum · Oyuncu · Engelle |
| Sixtagram yazar paneli | – | "Şikâyet et / Engelle" |
| Sixtagram bildirimleri | engellenenden gelen eski bildirimler yok | – |
| Çete sohbeti (3 kanal) | engellenen → soluk "Engellediğin oyuncudan mesaj · göster"; gizlenen → "incelemeye alındı" | Mesaj · Oyuncu · Engelle |
| İstihbarat sohbeti | gizlenen → "incelemeye alındı" (engelleme **yok**: anonimlik) | yalnızca Mesaj şikâyeti |
| "Bi fikrin mi var?" | gizlenen + engellenen yok | öneri açılınca "Şikâyet et / Engelle" |
| Dünya balonları (8 ekran) | engellenenin balon metni boş (`use*Presence` kancalarında) | 👥 → Balon · Oyuncu · Engelle |

Android'de şikâyetler `platform: 'android'` ile gönderilir.

**Kapanışta giderilen D2 sınırları (v54):**
- Sixtagram okunmamış rozeti artık engellenen oyuncudan gelen eski bildirimleri saymıyor (`useSixtagramNotifications`).
- Engellenen oyuncunun dünyadaki balonu, yerelde biriken balon geçmişiyle birlikte **anında** kayboluyor (eskiden 13 sn'ye kadar kalabiliyordu). Değişiklik 8 dünya ekranı ve `use*Presence` kancalarında: `blockedByMe`.
