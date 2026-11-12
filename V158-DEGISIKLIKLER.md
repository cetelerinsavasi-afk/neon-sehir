# v158

## Ev / karargah
- "Yıldızlı Gece" ve "Aylı Gece" tavanı: siyah gök + yıldızlar; odada TEK dolunay (tavanın ortasına en yakın parçada). Duvar "Yıldızlı Gece" de siyah + dolunay
- Karargah zeminindeki gök "izi" düzeltildi (tavan parçaları şehirde yere çiziliyordu)
- Karargah haritadan bağımsız: kapı kapalı ve geçilmez; dışarıda kapıda "🚪 İçeri gir", içeride "🏙️ Şehre çık". İçerideyken şehir çizilmez (hata yok, çok hafif)

## Şehir
- Tüm ATM'ler çalışıyor (banka içi / önü, yol üstü marketler); yol üstü marketlerin istasyonları da eklendi
- Camide mekân düğmelerinin altındaki boşluk kalktı
- Hatırlatmalarda "Git ➜": o yere ışınlar (fabrika, cami, pist, park, belediye, spor, galeri, depo, casino, silahçı); çete işleri Çete panelini açar. Anasayfadan basınca şehir o yerde açılır
- HGS gişesindeki görünmez duvar yol genişliğine indirildi
- Uzak tır işi: Kervankent'e yakınsan yük Kervankent Terminali'nden alınır → Neon Şehir Doğu Lojistik Deposu'na götürülür (düğme yazısı yönü gösterir)
- 📱 Telefon düğmesinde okunmamış sayısı: yeni SMS + ChatsApp mesajı / isteği + Sixtagram bildirimi (hatırlatmalardaki pembe rozet gibi)

## Modifiye garajı
- Tır firma adı ve otobüs güzergâh tabelası artık tamamen silinebiliyor: kutu boşalır, yeni yazıyı yazarsın. Kutu boşken araçta eski yazı kalır (boş bırakıp çıkarsan eski yazı geri gelir). Eskiden son harf silinince fabrika yazısı anında geri geliyordu

## Performans (telefon)
- Dinamik çözünürlük: kare hızı düşünce çözünürlük kademeli iner, düzelince geri çıkar
- İç mekândayken görüş kısalır, kapalı binaların içi sadece yakınken çizilir
- Kalite seviyesine göre detay mesafeleri; stadyum koltukları uzaktan sade (65 bin → ~13 bin üçgen)
- Telefonda şehir merkezinde görünen üçgen ~330 bin → ~90 bin

## Yükleme
- `cityAction` fonksiyonu yüklenir (uzak tır işi), sonra site. Veritabanı kuralları ve Android uygulaması değişmedi.
