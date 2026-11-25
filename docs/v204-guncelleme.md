# v204 — Firestore okuma azaltma + spor salonu mini oyun + banyo renkleri

Oyuncu verisine dokunulmaz. Kurallar ve indeksler değişmedi. Sunucuda yalnızca 6 fonksiyon güncellenir.

## Neden
v165/v187 ölçümünde (72 oturum özeti) oyuncu okumalarının en büyük kalemleri:
genel sohbet %22,5 · soygun panosu %14,6 · fabrika makineleri (ana sayfa hatırlatması) %7,5.
Sunucuda `getCreditInfo` banka ekranı her açıldığında ~228 makineyi okuyordu (haftada ~93 bin okuma).

## Değişenler
| Yer | Eskiden | Şimdi |
|---|---|---|
| Soygun panosu (`useOpenHeistPlans`) | O hedefin HİÇ silinmeyen tüm eski planları okunup cihazda süzülüyordu | Sorguda `status == 'open'` (iki eşitlik, bileşik indeks gerekmez) |
| Neon Şehir sohbeti (`useGlobalChat`, `GroupChat`) | 100 mesaj | 10 mesajla açılır; yukarı kaydırınca / "↑ Önceki mesajlar" 20'şer eski mesaj, oturum boyunca cihazda kalır |
| Birebir sohbet (`DmChat`) | 150 mesaj | 20 mesajla açılır; aynı şekilde 30'ar eski mesaj |
| Ana sayfa "⚙️ Makineleri çalıştır" (`useOnboarding`) | Fabrikadaki tüm makineler canlı dinleniyordu | Sadece fabrika belgesi. Sunucu çalıştırınca `factories/{uid}.minTrig = bugün` yazar; yoksa cihaz 2 sayım (~2 okuma) yapar, sonuç gün boyu bellekte |
| Kredi puanı / fabrika değeri (`getCreditInfo`, `takeCredit`, `getFactoryValue`) | Tüm makineler okunuyordu | Tür başına `count()` (~5 okuma), sonuç birebir aynı |
| Kripto makinesi alınca (`buyFactoryMachine`) | — | `minTrig` silinir (hatırlatma geri gelir) |
| Spor salonu mini oyunları | Katman içeriği kadar daralıyordu, oyun çok küçük görünüyordu | Ekran genişliğinde (en fazla 520 px) |
| Banyo: Lavabo & Ayna, Küvet | Musluk, kulp, ayna çerçevesi, küvet ayakları altın sarısı | Mat siyah metal (yatak odasındaki v199 rengi) |

Ayrıca sunucuda kalmış, kullanılmayan 3 eski fonksiyon silinir: `presenceInteriorIn`, `presenceInteriorOut`, `presenceParkIn` (konsoldaki "Unknown trigger" hataları).

## Kontrol listesi
- [ ] ChatsApp › Neon Şehir: son mesajlar görünüyor, en alta iniyor; yukarı kaydırınca eskiler geliyor, ekran zıplamıyor; yeni mesaj gelince alta kayıyor.
- [ ] Arkadaşla sohbet: aynı davranış.
- [ ] Soygun panosu: açık ekipler görünüyor, katılma çalışıyor.
- [ ] Fabrikası olan hesapta ana sayfa 📋: "Makineleri çalıştır" çalıştırmadan önce var, Fabrika › Makineleri Çalıştır'dan sonra kayboluyor; yeni kripto makinesi alınca tekrar çıkıyor.
- [ ] Banka › Kredi: kredi puanı eskisiyle aynı.
- [ ] Spor salonu: üyelik al → aletteki mini oyun ekran genişliğinde.
- [ ] Ev › Banyo: lavabo ve küvetin metal parçaları siyah.

## 24 saat sonra
Firestore › Usage: günlük okuma düşmeli. Query insights'ta `/factories/*/machines` (tümü) satırı kaybolmalı.
