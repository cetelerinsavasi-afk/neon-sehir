# v153 — değişiklikler

v149–v152'yi de içerir.

## Ekonomi
- **Fabrika (malzeme) ilanları**: fiyatı uygun olan ilan 3 gün sonra oyuna otomatik satılır (eskisi gibi); uygun olmayan ilan artık 7 gün yerine **3 gün** sonra ilandan kalkar, malzeme envantere döner. Açık ilanların süresi ilk gece kontrolünde kendiliğinden 3 güne çekilir. Araç / silah ilanları değişmedi.

## Seyyar satıcılar
- "Alışveriş yap" → **"Bağış yap"**. Mantık aynı (1.000 altın, şüphe −5, saygınlık, günde 1), ama bağış olduğu için **ele yemek gelmez**. Menüden alışveriş eskisi gibi ürünü ele verir.
- Görev "Bir seyyar satıcıya bağış yap" oldu; ilgili tüm yazılar (mekânlar, şüphe sekmesi, soygun paneli, hata mesajları) güncellendi.
- **Haraç animasyonu** (prototipteki gibi): şehirde satıcının yanında "💰 Haraç kes" → haraç penceresi artık şehrin içinde açılır (sistem aynı: güç, ekip kurma, şüphe, yakalanma). Soyguna basınca karakter silah doğrultur ("Kasayı boşalt! 🔫"), satıcı ellerini kaldırıp titrer, kamera ikisini birden görür; başarılıysa paralar uçarak gelir ve "+X altın" yazar, yakalanırsan polis sireni yanıp söner. Animasyonu **sadece sen görürsün**.

## Araç içi kamera
- Sürücü koltuğundan bakınca yeni, ayrıntılı kokpit: yumuşak torpido, canlı hız ve devir ibreli gösterge paneli, direksiyonla birlikte dönen deri direksiyon, orta konsolda neon multimedya ekranı (saat, radyo, pusula), vites kolu, havalandırmalar, kapı panelleri, ambiyans neon şeritleri (aracın neon rengi), A sütunları, tavan döşemesi + tavan lambası, iç dikiz aynası, yan ayna, aracın renginde kaput ve silecekler, arkada koltuklar. Üstü açık arabada tavan yok, çerçeve boya renginde.
- İç kamerada ekrandaki büyük hız göstergesi gizlenir (kokpitin kendi göstergesi var).

## Modifiye / galeri
- Modifiyecideki "Boya, jant, gövde kiti…" ve stüdyodaki "Seçtiğin her şey satın almadan…" yazıları kaldırıldı (taksi notu da).
- Galeride ticari araç ve motorların açıklamaları ("Limandan yükle…", "20 gün…") kaldırıldı; kartlar arabalar gibi sade.

## Sixtagram
- Şehir fotoğrafında stadyumun reklam panoları artık **oyundaki gerçek sponsorları** gösterir (fotoğraf çekilirken sunucu ekler; her cihazda aynı). Eski fotoğraflar varsayılan yazıyla kalır.

## Meslekler
- **Güzergah görünmüyordu** — asıl sebep bulundu: yol şeridi aşağı bakıyordu ve yukarıdan bakınca çizilmiyordu. Artık hedefe giden yol, yolun üstünde geniş, parlak, akan oklu bir şeritle çiziliyor. Şerit aracın tam altından başlıyor.
- Güzergah **mini haritada ve büyük haritada da** çizili (hedef noktasıyla).
- **Otobüs hattı** yeniden: 10 durak şehrin içinden ve dışından geçen tek hat (saat yönü): Kuzey Kapısı → Karakol → Bar → Hastane → Stadyum → Evler → Plaza → Liman → Batı Kapısı → Camii. Duraklar blok ortalarında, gidiş yönünde sağ şeritte, adını aldığı binanın önünde; aralar 80–160 m.

## Yüklenen fonksiyonlar
shopAction, buyFromVendor, attemptHeist, createHeistPlan, joinHeistPlan, createListing, buyListing, cityAction, createSixtagramPost, cronTick. RTDB ve Firestore kuralları değişmedi.
