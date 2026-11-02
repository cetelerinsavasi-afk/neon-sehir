# v141 — Başarılar, Kafe & Bar şüphe çubuğu, haraç ödülleri, iPhone mekân donması

## 1. iPhone: mekânda donma
- Kesin neden bulunamadı (iPhone'un grafik motoru test ortamında yok). Ağır bir kafe (160 eşya, 8 hayvan, 12 bot) çalıştırıldı; hayvanlar, botlar ve yol bulma yük yaratmıyor, asıl yük 3D çizim.
- Görüntü kalitesi iPhone'da da eskisi gibi cihaza göre kendiliğinden ayarlanıyor: telefon rahatsa yükseliyor, zorlanırsa düşüyor (sabit bir sınır yok).
- Grafik bağlamı kaybolursa sonraki kurulum gölgesiz ("düşük") seviyeden başlıyor. 3 dakika içinde tekrar kaybolursa "en düşük" seviyeden başlıyor. Telefon rahatsa kalite oradan yine kendiliğinden yükseliyor.
- "… giriliyor" ekranına **Vazgeç** düğmesi eklendi; giriş takılırsa oyuncu ekranda kalmaz.

## 2. Başarılar (Telefon › Başarılar) — toplam 30 → 50 zümrüt
- **🤝 Referans kodunla arkadaşını davet et** (en üstte): 10 aşamalı çubuk. Kodla katılan her yeni oyuncu 1 aşama ve 1 zümrüt. 10. davette başarı tamamlanır (toplam 10 zümrüt).
  - Referans sahibi ilk 10 davette **1 zümrüt + 10.000 altın**, sonrasında sadece 10.000 altın alır.
  - Davet sayacı (`users.referralCount`) bu sürümden itibaren sayılır. Eski davetler geriye dönük sayılmaz.
  - Profil yazısı: "…katılan her yeni oyuncu için 1 zümrüt + 10.000 altın kazanırsın!"
- **🏛️ Belediye başkanı ol** (en altta): 10 zümrüt. Sadece seçimle ya da darbeyle başkan olunca verilir; yönetici devri sayılmaz. Devir anında, Başarılar açılınca ve 3 saatlik taramada kontrol edilir. Şu an seçimle ya da darbeyle gelmiş başkan varsa o da alır.

## 3. Şüphe › Kafe & Bar
- Oyuncu kafelerinde ve barlarında yiyecek-içecek aldıkça çubuk dolar (`users.cafeSpend`). Sinema ve mekân sahibinin bedava alımları saymaz.
- 2.000 altında dolar ve daha artmaz. Gece sıfırlanmaz.
- Doluyken **-10 şüphe** düğmesi açılır. **Günde 1 kez** kullanılır. Kullanılan gün çubuk gizlenir ve harcamalar onu doldurmaz; 00:00'a (İstanbul) kadar sayaç görünür. 00:00'dan sonra çubuk sıfırdan dolmaya başlar.
- Sıralama: kullanılmadıysa kullanılabilir olanların en altında, kullanıldıysa kullanılmışların en altında. Basınca şüphe 10 düşer (0'ın altına inmez), çubuk sıfırlanır. Şüphe 0 iken basılamaz (çubuk boşa gitmesin).

## 4. Seyyar satıcı haraçları +1.000
Kokoreççi 4.000 → 5.000 · Simitçi 3.000 → 4.000 · Dönerci 2.000 → 3.000 · Köfteci 1.000 → 2.000

## Yükleme
`deploy-v141.bat` çift tıkla. 3 grupta yüklenenler: shopAction, applyReferralCode, syncAchievements, attemptHeist · createHeistPlan, executeHeistPlan, refreshHeistPlanParticipants, politicsAction, belediyeAction · cronTick, dailyReset, dailyResetRecovery. Hepsi başarılıysa commit + push yapılır. 23:00–01:00 ve 17:45–19:15 arasında çalışmaz (cronTick futbol işleri).
