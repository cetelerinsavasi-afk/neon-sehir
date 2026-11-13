# v159.1 — düzeltmeler

- **Karargah:** şehirdeki (mobilyaların içinden geçilen, haritanın parçası olan) karargah içleri tamamen kaldırıldı. Hangi karargahın kapısında olursan ol "🚪 İçeri gir" → Çeteler › Aç ile aynı gerçek karargah ekranı açılır (o karargahın çetesi; girme izni sunucuda). Şehir arkada bekler
- Karargahın içinde kapıya yaklaşınca **"🌆 Şehre çık"** çıkar → karargahın kapısının önüne dönülür (Çeteler ekranından girildiyse de şehir karargahın önünde açılır)
- İşletme açılabilen dükkânların kapısı yaklaşınca **açılmaz** (kapalı durur, arkası opak)
- **Sunset Beach Club:** bar tabureleri tezgâhtan uzaklaştırıldı ve geçilebilir; genel olarak oturup kalkınca masa/tezgâh arasına sıkışılmaz (kalkarken bol boşluklu yön aranır)
- Şehirde **Çeteler** ve **Profil** artık Soygun paneli gibi alttan açılan pencere (tüm ekranı kaplamaz, dışına dokununca kapanır)

# v159 — oyuncu şikâyetleri

## Şehir
- **Piksel piksel görüntü:** telefonda çizim çözünürlüğü %60'a kadar iniyor ve geri çıkması ~40 sn sürüyordu. Artık telefonda çözünürlük 1 ekran pikselinin altına inmez; "düşük" ve "en düşük" kalite biraz daha net. Zorlanınca önce **görüş mesafesi** kısalır (uzaktaki parçalar daha erken gizlenir), çözünürlük ancak sonra iner; rahatlayınca hızla geri gelir
- **Tek parmakla çevirirken yakınlaşma:** bırakılışı kaçan bir dokunuş "hayalet parmak" olarak kalıyor, sonraki tek parmak hareketleri iki parmak (yakınlaştırma) sayılıyordu. Her yeni hareketin ilk parmağında eski kayıtlar temizlenir
- **"Oyuncu" adı:** şehir, oyuncu bilgisi gelmeden açılınca ad "Oyuncu" olarak donuyordu (kendi etiketimiz + başkalarına giden profil). Gerçek ad gelince etiket ve profil güncellenir; ad yokken "Oyuncu" yayınlanmaz; başkalarında ad eksikse birkaç kez yeniden okunur
- **İç kamerada fotoğraf:** fotoğraf araç dışarıdan görülür gibi çiziliyordu (kokpit yok, iç kısım kesik). Artık ekrandaki gibi: gövde gizli, kokpit görünür
- **Karargah:** kendi çetenin karargahında "🚪 İçeri gir" ve Çeteler › Aç doğrudan gerçek karargahı açar (duvarlar sağlam, eşyalarla etkileşim — eskiden yalnız "Düzenle" ile). Çıkınca karargahın kapısının önündesin
- **Dükkânlara girilmez:** bar, cafe, internet kafe, spor salonu, araba galerisi, silahçı, casino — kapı kapalı ve geçilmez. Kapının önüne gelince düğmeler çıkar (ör. "🚗 Araba galerileri" + "💰 Soygun yap"); listeden istediğin işletmeye girersin. Binaya dokununca kapısının önüne yürünür; "Git ➜" / Ziyaret de kapının önüne getirir
- **Sohbet hep açık:** kapatma düğmesi yok; Çeteler · Soygun · Profil sağ altta dikey sütunda
- **Mesajların yanındaki ⚠️ kalktı:** şikâyet 👥 Yakındakiler › oyuncu › "Son mesajını bildir" ile (mesaj metni şikâyete eklenir — moderasyon yine görür)

## Yarış
- **Şampiyonada "oyun attı":** Android'de ekran kenarından kaydırmak "geri" sayılıyor, yarış ekranını küçültüyor → yarış kapanıp deneme "yarıda kaldı" sayılıyordu. Yarış sürerken geri / kenardan kaydırma yarışı kapatmaz, çıkış onayı açar
- Yarış şehrin üstünde açıkken şehir grafik belleğini bırakır (zayıf telefonlarda bellek taşması), araba motoru sesi susar; yarıştan dönünce şehir yakından uzağa yeniden yüklenir

## Telefon
- Sola kaydırınca haberler (Neon TV) yerine **Neon Şehir Gazetesi** açılır; ana ekrandaki Gazete simgesi kalktı
- **Flappy Kuş** telefondan kalktı → bilgisayar oyunları arasında (internet kafe / oyuncu bilgisayarı › 🕹️ Tek kişilik). Skorlar ve sıralama aynı

## Yükleme
- Sadece site (hosting). Fonksiyonlar, veritabanı kuralları ve Android uygulaması değişmedi.
