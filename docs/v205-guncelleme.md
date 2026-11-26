# v205 — Futbol: stadyuma kadar hafif, maç saati dışında okuma yok

Sadece site güncellenir. Sunucu fonksiyonları, kurallar, indeksler ve oyuncu verisi değişmedi.

## Neden
Ölçümde lig fikstürü okumalarının %99'u, ekran 30 dk'dan uzun aradan sonra açıldığında tüm sezonun
maçlarının baştan faturalanmasıydı. Fikstür, kupa maçları ve istatistik tabloları ise SADECE maç
saatinde değişiyor (18:00 başlar, 19:00 açıklanır). Ayrıca ana sayfa hatırlatmaları için oyun açılır
açılmaz 3 futbol dinleyicisi kuruluyordu; oyuncuların çoğunun takımı yok.

## Değişenler
| Yer | Eskiden | Şimdi |
|---|---|---|
| Lig fikstürü, kupa maçları, istatistik tabloları | Her açılışta canlı dinleyici | 17:55–19:30 arası canlı (skorlar anında). Diğer saatlerde bir kez okunur, Firestore'un cihazdaki önbelleğinden açılır (bir sonraki maç saatine kadar, en fazla 3 saat) → 0 okuma, anında açılış |
| 📋 "Kadronu düzenle" | 2 canlı sorgu (sahip + menajer) | "Takımım var mı" günde 1 kez okunur, cihazda saklanır; takımı olana sadece takım belgesi (1 belge) dinlenir |
| 📋 "Spor salonunda antrenman" | footballers belgesi canlı | Aynı günlük bilgi (futbolcu olarak takımda mıyım) |
| Futbol ekranı kapanınca | — | Günlük bilgi tazelenir (takım alındı / menajer olundu / takıma girildi hemen yansır) |

Takım sahibi / menajer ekranları (Takımım, Kadro, Transfer, Puan durumu) eskisi gibi canlı.

## Kontrol listesi
- [ ] Stadyum › ⚽ Futbol › Ligler: fikstür ve kupa açılıyor; kapatıp açınca anında geliyor.
- [ ] 18:00–19:00 arası: canlı skorlar akıyor.
- [ ] İstatistik tabloları (Gol Kralı vb.) açılıyor.
- [ ] Takım sahibi hesapta maç oynanan gün 📋 "Kadronu düzenle" çıkıyor, kadro kaydedince kayboluyor.
- [ ] Takımsız hesapta 📋 "Spor salonunda günlük antrenmanını yap" çıkıyor.
