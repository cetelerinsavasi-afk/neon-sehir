# v140 — Şarkı yapma ekranı (Beat Atölyesi / Müzik Stüdyosu)

## Yeni
- **Uzun nota**: Enstrüman bölümünde "▪ Tek nota / ▬ Uzun nota" seçimi. Uzun notada satırda sürükle = o uzunlukta tek, kesintisiz nota; dokun = 1 vuruş (4 adım); notayı tutup sürükle = uzat/kısalt; dokun = sil. Keman, çello, koro, pad gibi enstrümanlar seçilince araç kendiliğinden "Uzun nota"ya geçer.
- **"Hepsi" sekmesi**: 16 adım tek ekranda (uzun notalar için).
- **3 oktav**: Oktav seçimi Tiz / Orta / Pes / Hepsi. Notası olan oktavın düğmesinde nokta çıkar. Nota adlarının yanında oktav numarası var.
- **8 bölüm** (A–H): "+" ile bölüm eklenir. Kopyalama modundayken "+" seçili bölümün kopyasını ekler.
- **5 kanal**: "+ Kanal" ile eklenir; 4. ve 5. kanal "Kanalı kaldır" ile silinir.
- **Sıfırla**: Davul ve Enstrüman başlığında. Sadece SEÇİLİ bölümü siler (ör. C seçiliyken davul sıfırla → yalnız C'deki davullar). Geri alınabilir.
- **15 yeni enstrüman**, gruplu:
  - 💜 Duygusal: Keman, Çello, Elektrik Piyano, Koro, Ney, Müzik Kutusu, Akor Piyano, Yaylı Akor
  - ⚡ Hareketli: Süper Saw, Pluck, 808 Bas, Acid Bas, Elektro Gitar, Nefesli, Akor Stab
  - Akor enstrümanlarında tek kutu = ölçekten üçlü akor.
- **Yankı** ayarı (tüm şarkı). Enstrüman başına yankı payı farklı; sesler artık "kuru/oyuncak" duyulmuyor.
- Yeni ölçekler: **Kürdi**, **Dorian**.
- Eski enstrümanlar aynı; uzun notada sürdürebiliyorlar (bağlama uzun notada tremolo çalar).

## Uyumluluk
- Şarkı verisi v2 oldu (`pats[].l` = uzun nota maskesi, 22 satır). Eski (v1) şarkılar ve projeler otomatik çevrilir, aynı perdelerde çalar (eski 7 satır = orta oktav).
- Sıra 16 kutu olarak kaldı.
- Sunucu doğrulaması (`sanitizeSong`) iki biçimi de kabul eder → önce `shopAction` + `createSixtagramPost` yüklenir, sonra arayüz.
