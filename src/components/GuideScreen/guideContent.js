// Neon Şehir — Sokak Rehberi içeriği (oyun tasarımcısının hazırladığı metin,
// birebir). Sayfa türleri:
//   lines : { title, kicker, lines:[L(emoji, metin)], tags?:[metin] }
//   grid  : { title, kicker, cards:[{ i, name, t, go:{cat?, page} }] }
//   pick  : { title, kicker, items:[{ i, name, sub?, lines:[metin] }] }
const L = (i, t) => ({ i, t });

export const CATS = [
  /* -------------------------------------------------------------- */
  { id: 'sokaklar', icon: '🌃', name: 'Sokaklar', tag: 'Şehre adım atmadan önce bil', color: '#19e8ff', pages: [
    { type: 'lines', title: 'Hoş geldin, yabancı',
      kicker: 'Neon Şehir kimseye acımaz. Ama herkesi hatırlar.',
      lines: [
        L('🪙', 'Altın: her kapıyı açar, her sırrı satın alır.'),
        L('👁️', 'Şüphe: polisin seni ne kadar yakından izlediği.'),
        L('⭐', 'Saygınlık: sokağın adını ne kadar ciddiye aldığı.'),
        L('🌆', 'Üçü de sana ait. Üçünü de kaybedebilirsin.'),
      ] },
    { type: 'lines', title: 'Şüpheyi Sil',
      kicker: 'Temiz görün. Kirli çalış.',
      lines: [
        L('🕌', 'Camiye git. Her dua şüpheni biraz siler. Günde 5 vakit.'),
        L('🤝', 'Polise bir zarf uzat. 3.000 altına şüphen bir anda çöker. Günde bir kez.'),
        L('🌯', 'Bir simit al, bir kokoreç ye. Esnaf seni sever, saygınlığın artar.'),
        L('🚨', 'Şüphen yükseldikçe her iş daha tehlikeli.'),
      ] },
    { type: 'lines', title: 'Mekânlar Artık 3D',
      kicker: 'Kapıdan gir, etrafına bak.',
      lines: [
        L('🏛️', 'Camii, Banka, Gazino, Karakol, Galeri, Silahçı, Modifiye ve Park artık üç boyutlu.'),
        L('🧍', 'Veznedar, barmen, memur… Birine dokun, yanına gidersin; işini orada görürsün.'),
        L('📊', 'Profil › Günlük Rapor: bugün ve önceki iki gün cebine giren ve çıkan her altın.'),
      ] },
    { type: 'lines', title: 'Yakalanırsan',
      kicker: 'Bu şehirde hapis yok. Borç var.',
      lines: [
        L('⛓️', 'Yakalandın mı, zindana değil deftere yazılırsın: devlete borç.'),
        L('✂️', 'Borç bitene kadar kazandığın her altının yarısı devlete gider.'),
        L('🔄', 'Kapı kapanmaz. Çalış, öde, yeniden başla.'),
      ] },
  ] },

  /* -------------------------------------------------------------- */
  { id: 'meslekler', icon: '💼', name: 'Meslekler', tag: 'Rozet mi, tornavida mı, hançer mi?', color: '#ffd23f', pages: [
    { type: 'grid', title: 'Şehirde Kim Ne İş Yapar?',
      kicker: 'Sabah olunca herkes bir yere gider. Sen nereye?',
      cards: [
        { i: '🏭', name: 'İşçi', t: 'Vardiya, maaş, ekmek.', go: { page: 1 } },
        { i: '🚔', name: 'Polis', t: 'Rozet, kod adı, gölgede bir teşkilat.', go: { page: 2 } },
        { i: '🕌', name: 'İmam', t: 'Şehrin tek minberi.', go: { page: 3 } },
        { i: '🤲', name: 'Dilenci', t: 'Köşe senin, kader başka.', go: { page: 4 } },
        { i: '🎭', name: 'Serbest işler', t: 'Soygun, kaçakçılık, yarış.', go: { page: 5 } },
        { i: '🧢', name: 'Menajer', t: 'Başkasının takımı, senin kaderin.', go: { cat: 'menajer', page: 0 } },
        { i: '⚽', name: 'Kulüp Başkanı', t: 'Tribünler senin.', go: { cat: 'futbol', page: 0 } },
        { i: '🏭', name: 'Fabrikatör', t: 'Baca senin, kâr senin.', go: { cat: 'fabrika', page: 0 } },
        { i: '🏪', name: 'İşletmeci', t: 'Tabelayı as, kasayı kur.', go: { cat: 'isletmeler', page: 0 } },
        { i: '🏋️', name: 'Futbolcu', t: 'Salonda ter, sahada isim.', go: { cat: 'isletmeler', page: 2 } },
        { i: '🏴', name: 'Çete Üyesi', t: 'Sokakların gerçek sahipleri.', go: { cat: 'ceteler', page: 0 } },
        { i: '🐍', name: 'Köstebek', t: 'Çetede bir yüz, teşkilatta bir kod adı.', go: { cat: 'ceteler', page: 7 } },
      ] },
    { type: 'lines', title: 'Fabrika İşçisi',
      kicker: 'Sirenler öter, vardiya başlar.',
      lines: [
        L('🏭', 'Bir fabrikanın kapısından gir, makinenin başına geç.'),
        L('🎮', 'Günde bir vardiya. Kısa bir oyun, sonra maaşın cebinde.'),
        L('💰', 'Maaşı patron belirler: 1.000 ile 5.000 arası. Cömert patronu seç.'),
        L('🚪', 'Beğenmedin mi? İstifa et, başka bir fabrikanın kapısını çal.'),
        L('🚔', 'Rozetliler ve imamlar da fabrikada çalışabilir.'),
      ] },
    { type: 'lines', title: 'Polis',
      kicker: 'Rozet takarsın. Şehir seni başka türlü görür.',
      lines: [
        L('🧼', 'Temiz sicil (%0 şüphe), 50 saygınlık ve belinde bir silah.'),
        L('📝', 'Karakol’dan kod adını yaz, şartları sağlıyorsan rozet anında senin. İlk 24 saat seni kimse atamaz.'),
        L('🕶️', 'Teşkilatta herkes kod adıyla bilinir. Gerçek yüzün gizli kalır.'),
        L('💼', 'Rütbene göre maaş + günün rüşvet payı, her gece 00:00’da cebinde.'),
        L('🚨', 'Bir soygun ekibine sız. Ekipte sivil varsa suçluyu sen yakalarsın, ganimetin dörtte biri senin.'),
        L('😈', 'Rozet seni melek yapmaz. Soygun da yapabilirsin — yakalanırsan bedelin iki katı.'),
      ],
      tags: ['⭐ 50 saygınlık', '🧼 %0 şüphe', '🔫 1 silah'] },
    { type: 'lines', title: 'İmam',
      kicker: 'Şehirde tek bir minber var. Belki de üstünde sen dursun.',
      lines: [
        L('🕌', 'Bütün şehirde tek imam vardır.'),
        L('✨', 'Saygınlığın en az 50, şüphen sıfır olmalı.'),
        L('📿', 'Her gün 5 vakit ibadet et. Bir de nasihat ver.'),
        L('💰', 'Karşılığı her gün belediyenin belirlediği maaş.'),
        L('🕳️', 'Bir gün aksatırsan imamlığın biter. 24 saat sonra yeniden başvurabilirsin.'),
        L('🃏', 'Rozet ile cübbe aynı omuzda durmaz: polisler imam olamaz.'),
      ] },
    { type: 'lines', title: 'Dilenci',
      kicker: 'Her şeyi kaybettin. Geriye bir köşe kaldı.',
      lines: [
        L('🕌', 'Camiinin avlusunda ayrı bir köşe var. Orası senin.'),
        L('✍️', 'Bir not yaz. Kim geçerse okusun.'),
        L('🤲', 'Oyuncular sana bağış bırakır. Günde en fazla 10.000.'),
        L('📉', 'Bedeli ağır: saygınlığın sıfıra iner.'),
        L('👥', 'Zengin fakir herkes oturabilir — bedeli sadece saygınlık.'),
      ] },
    { type: 'pick', title: 'Serbest Çalışanlar',
      kicker: 'Patronu yok. Sigortası da.',
      items: [
        { i: '💥', name: 'Soygun', lines: [
          'Banka, casino, galeri… Yeter ki gücün olsun.',
          'Tek başına gir ya da 4 kişilik ekip kur.',
          'Ekipte gizli polis olabilir. Kime güvendiğine dikkat et.' ] },
        { i: '💊', name: 'Kaçakçı', lines: [
          'Yasaklı madde al, parktaki şüpheli adama sat.',
          'Para hızlı gelir. Şüphe daha hızlı.' ] },
        { i: '📈', name: 'Yatırımcı', lines: [
          'Bankada kripto, hisse, elmas: fiyatlar canlı oynar.',
          'Varlıkların kredi puanını yükseltir; puanın kadar kredi çek.' ] },
        { i: '🏁', name: 'Yarışçı', lines: [
          'Gece pistinde kronometreye karşı sür: gaz, fren, direksiyon ve NOS.',
          'Antrenmanda 10 bot, şampiyonada günün en hızlı süresi, bahiste rakibin hayaleti.',
          'Arabanı geliştir (seviye 1→3): hız, ivme ve nitro belirgin artar.' ] },
      ] },
  ] },

  /* -------------------------------------------------------------- */
  { id: 'ceteler', icon: '🏴', name: 'Çeteler', tag: 'Şehri belediye değil, onlar yönetir', color: '#ff2e8c', pages: [
    { type: 'lines', title: 'Bir Çete, Bir Aile',
      kicker: 'Sokağın gerçek sahipleri seni bekliyor.',
      lines: [
        L('🏴', 'Kendi çeteni kur ya da açık kapıdan bir çeteye gir.'),
        L('🐣', 'Kapıdan girdiğin an adın Çömez. Herkes bir yerden başlar.'),
        L('👑', 'Çeteyi kuran, Mafya Babası olur.'),
        L('🔑', 'Kurmanın bedeli:'),
      ],
      tags: ['🪙 1.000.000 altın', '⭐ 100 saygınlık', '💪 40.000 güç'] },
    { type: 'lines', title: 'Rütbe Merdiveni',
      kicker: 'Koltuk verilmez. Prestijle alınır.',
      lines: [
        L('👑', 'Mafya Babası: tek kişi. Zirve.'),
        L('🗡️', 'Sağ Kol: 2 kişi. Babanın gölgesi.'),
        L('🎖️', 'Kıdemli: 4 kişi. Masaya oturanlar.'),
        L('🔫', 'Tetikçi: sahada savaşanlar.'),
        L('🐣', 'Çömez: yolun başındakiler.'),
        L('✦', 'Prestij kazanmanın yolu: kasaya bağış yap, savaşta zar at, Baba’nın saygısını kazan.'),
        L('🚪', 'Rütbe kapısı 1.000.000 prestijde açılır. Altındakiler hâlâ Çömez.'),
        L('🌙', 'Sıralama her gece yeniden yapılır. Koltuğunu kimse garantilemez.'),
      ] },
    { type: 'pick', title: 'Kim Ne Yapabilir?',
      kicker: 'Bir rütbeye dokun, yetkilerini gör.',
      items: [
        { i: '👑', name: 'Baba', sub: 'Son söz senin.', lines: [
          'Çetenin adını ve logosunu değiştirirsin.',
          'Tetikçi ve Çömez’i tek hamlede atarsın.',
          'Üyelere saygı gösterip prestij verirsin (her üyeye haftada bir).',
          'Kasadan kendi cebine para alırsın. Ama prestijin erir.',
          'Bahis ve ittifaka sen karar verirsin.',
          'Elinde ticaret yolu yoksa başka bir çeteye biat edersin.',
          'Tır, depo ve siparişler senden sorulur.' ] },
        { i: '🗡️', name: 'Sağ Kol', sub: 'Babanın gölgesi. Ama gölge de uzar.', lines: [
          'Çömez’i atarsın.',
          'Kasadan altın dağıtır, başka çeteye para yollarsın.',
          'Bahis, ittifak ve gelen biat teklifine karar verirsin.',
          'Tır ve sipariş işlerini yürütürsün.',
          'Sabotajı sen başlatırsın.',
          'Bir gün tahtı istersen: devirme ya da ayaklanma.' ] },
        { i: '🎖️', name: 'Kıdemli', sub: 'Masada yerin var.', lines: [
          'Oy hakkın var.',
          'Yönetim sohbetini okur, yazarsın.',
          'Tırların içindeki yükü görürsün.',
          'Bahis ve ittifak için sohbete öneri bırakırsın.',
          'Sabotaj başlatılmasını isteyebilirsin.',
          'Tetikçi ve Çömez için çıkarma oylaması açarsın.' ] },
        { i: '🔫', name: 'Tetikçi', sub: 'Ateş hattındasın.', lines: [
          'Savaşta zar atar, güç katarsın.',
          'Oylamaları izlersin ama oy kullanamazsın.',
          'Bahis, ittifak ve sabotaj için öneri bırakırsın.' ] },
        { i: '🐣', name: 'Çömez', sub: 'Herkes bir yerden başlar.', lines: [
          'Savaşa katılır, kasaya bağış yaparsın.',
          'Dağıtım açıldığında payını kapmak için ilk sen koşarsın.',
          'Oylamalar senden saklanır.' ] },
      ] },
    { type: 'lines', title: 'Çete Kasası',
      kicker: 'Para konuşur. Prestij dinler.',
      lines: [
        L('💸', 'Herkes kasaya bağış yapabilir. Her altın, 5 prestij demek.'),
        L('🌙', 'Her gece kasanın beşte biri serbest kalır.'),
        L('🎁', 'Baba ve Sağ Kol bunu üyelere dağıtır. İlk gelen alır, geç kalan bakar.'),
        L('🕳️', 'Baba isterse kendi cebine de çeker. Ama her altın prestijinden yer.'),
        L('🤝', 'Başka bir çeteye destek yollarsan iki çetenin sohbetine de düşer.'),
      ] },
    { type: 'lines', title: 'Savaş',
      kicker: 'Sokaklar zarla konuşur.',
      lines: [
        L('📅', 'Her Pazar şehir bir mal için kavga eder: önce yasaklı madde, sonra silah, sonra araba.'),
        L('🎲', 'Bütün çeteler aynı savaşta. Zarını at. Gücün büyükse vuruşun ağır.'),
        L('⏰', 'Gün 3 saatlik 8 dilime bölünür: 00, 03, 06 … 21. Her dilimde bir zar.'),
        L('✦', 'Vurduğun hasarın yarısı kadar prestij kazanırsın.'),
        L('🏆', 'Kazanan çete o yolu 21 gün elinde tutar.'),
        L('⚔️', 'Bir de meydan okuma var: iki çete altın koyar, kazanan hepsini alır.'),
        L('🤝', 'İttifak kurarsan müttefik senin tırını savunur. Saldırıda yalnızsın.'),
        L('⛓️', 'Elinde yol yoksa Baba başka bir çeteye biat edebilir: Pazar savaşında o çete adına savaşırsın, hasarın onun gücüne eklenir.'),
        L('💤', '30 gün boyunca ne savaşan, ne mesaj yazan, ne ibadet eden çeteden atılır. Baba da dahil.'),
      ] },
    { type: 'lines', title: 'Yollar, Tırlar, Sabotaj',
      kicker: 'Yolu tutan, şehri tutar.',
      lines: [
        L('🛣️', 'Yolu kazanan çete o malı mağazanın yarı fiyatına getirir.'),
        L('💊', 'Yasaklı maddeyi her çete getirebilir: günde 00:00’daki üye sayısı × 1.250 altınlık. Yolu tutan çetenin hakkına eklenir.'),
        L('🚚', 'Tır 100.000 altın, 21 gün yaşar. Sipariş verilince bir sonraki 3 saatlik dilimde yola çıkar, o gece 00:00\'da depoya varır.'),
        L('📦', 'Siparişi Pazartesi–Cumartesi 00:00–12:00 arası Baba ve Sağ Kol verir.'),
        L('💣', 'Yoldaki tır herkesin hedefi. Yola çıktıktan sonraki 6 saat ihbar, sabotaj ve operasyon zamanı; ardından saldırı başlar ve 24:00’e kadar sürer.'),
        L('💰', 'Tır sahibi 21:00’e kadar haraç öder ve kurtulur. Ödemezse yük saldırganın deposuna gider.'),
        L('🏠', 'Tır her hâlükârda sahibine döner.'),
        L('🏪', 'Araba ve silah 2. el pazarında çetenin adıyla satılır; yasaklı madde bir depoya satılır.'),
      ] },
    { type: 'lines', title: 'Devirme ve Ayaklanma',
      kicker: 'Tahtı isteyen bedelini bilir.',
      lines: [
        L('🗡️', 'Prestiji Baba’dan yüksek bir Sağ Kol devirme başlatabilir. Oyların yarısından fazlası yeter.'),
        L('🔥', 'Ayaklanma daha sert: üçte ikiden fazla oy ister.'),
        L('💀', 'Devirme yanarsa aday, ayaklanma yanarsa başlatan çeteden atılır.'),
        L('⏰', 'Oylama sabah 00:00 ile 12:00 arasında açılır, gece yarısı kapanır.'),
        L('🗳️', 'Sadece 7 rütbeli oy verir. Kimin ne dediği kimseye söylenmez.'),
      ] },
    { type: 'lines', title: 'Polis Teşkilatı',
      kicker: 'Adı yok. Yüzü yok. Ama rozeti var.',
      lines: [
        L('🚓', 'Şehrin tek kolluk gücü. Çetelerle aynı listede, onların karşısında.'),
        L('🎭', 'Başvurunla girersin, kod adını seçersin, avatarın “?” olur.'),
        L('🪜', 'Polis Memurundan Emniyet Genel Müdürüne beş rütbe. Prestijle yükselirsin.'),
        L('📡', 'Çetelerin yoldaki tırlarını ihbar edersin, yüklerini sızdırırsın.'),
        L('💣', 'Emniyet Genel Müdürü ve Amirler operasyon başlatıp rüşvet ister. Tır sahibi öderse operasyon durur.'),
        L('🐍', 'Hem çetede hem teşkilatta olabilirsin. Köstebek.'),
        L('⚖️', 'Bir polis çetenin Babası olursa iki yol var: çeteyi teslim et ya da rozeti bırak.'),
      ],
      tags: ['⭐ 50 saygınlık', '🧼 %0 şüphe', '🔫 1 silah'] },
  ] },

  /* -------------------------------------------------------------- */
  { id: 'menajer', icon: '🧢', name: 'Menajerlik', tag: 'Kulüp senin değil. Kaderi senin.', color: '#7cff6b', pages: [
    { type: 'lines', title: 'Ne Yaparsın?',
      kicker: 'Kimse sana takım vermedi. Sen aldın.',
      lines: [
        L('📋', 'Sahibi olmadığın bir takımı yönetirsin: kadro, taktik, transfer, doktor.'),
        L('🎟️', 'Bilet fiyatı ve sponsor kararı da sende.'),
        L('🏦', 'Harcamalar takımın kasasından çıkar, cebinden değil.'),
        L('🏆', 'Takımın kazandığı para da takıma yatar. Sana maaşın yeter.'),
        L('❤️', 'İstersen kendi cebinden kasaya bağış bırakırsın.'),
      ] },
    { type: 'lines', title: 'Göreve Nasıl Girersin',
      kicker: 'Bir takım seni bekliyor.',
      lines: [
        L('⭐', '50 saygınlığın varsa başvur.'),
        L('⚡', 'Menajersiz bir takım seni anında kabul eder.'),
        L('👔', 'Menajerli takımda, mevcut menajerden daha yüksek seviyede olmalısın.'),
        L('☝️', 'Aynı anda tek takım. Yenisini istiyorsan öncekinden istifa et.'),
        L('🚫', 'Takım sahibi menajer olamaz. Menajer de takım satın alamaz.'),
      ] },
    { type: 'lines', title: 'Seviye ve Maaş',
      kicker: 'Kazanan yükselir.',
      lines: [
        L('📈', 'Sıfırdan başlarsın. Galibiyet seni yukarı taşır, mağlubiyet aşağı çeker.'),
        L('🪜', 'Her basamak bir öncekinden daha zor.'),
        L('🧬', 'Seviyen sezon bitince sıfırlanmaz. Sicilin seninle yaşar.'),
        L('💵', 'Maaş her gün 19:00’da yatar. Üst lig ve yüksek seviye, daha kalın zarf demek.'),
        L('🧾', 'Kasada para yoksa maaş borç olarak birikir. Yine de atılmazsın.'),
      ] },
    { type: 'lines', title: 'Kovulmanın Yolları',
      kicker: 'Koltuk sıcaktır.',
      lines: [
        L('💥', 'Üst üste 3 maç kaybet: görevden alınırsın.'),
        L('😴', '3 gün takıma dokunma: görevden alınırsın.'),
        L('🩹', 'Kadro sakat ve emekliyle dağılırsa: görevden alınırsın.'),
        L('👑', 'Daha yüksek seviyeli bir menajer gelir ya da başkan seni kovarsa, o günün maaşını yine alırsın.'),
        L('🚪', 'Kendin istifa edersen o günün maaşı yanar. O sezon o takıma dönemezsin.'),
      ] },
    { type: 'lines', title: 'Başkanla Aranız',
      kicker: 'Takımın bir başkanı varsa, bir de patronun var.',
      lines: [
        L('💰', 'Başkan kasadan her gün beşte birini çekebilir.'),
        L('🙏', 'Daha fazlasını isterse senden izin ister. Sen onaylarsın ya da reddedersin.'),
        L('🔪', 'İstediği an seni işten atabilir.'),
        L('📢', 'Başkan “menajer aranıyor” ilanı açabilir. Başvuruları o okur.'),
      ] },
  ] },

  /* -------------------------------------------------------------- */
  { id: 'futbol', icon: '⚽', name: 'Futbol Takımı', tag: 'Tribünler senin adını haykırır', color: '#b16bff', pages: [
    { type: 'lines', title: 'Başkan Koltuğu',
      kicker: 'Tribünlerin sesi cebine yansır.',
      lines: [
        L('🛒', 'Sahipsiz bir takımı piyasadan al. Ya da başka bir başkanın ilanına atla.'),
        L('🏦', 'Takımı alınca kasası da senindir.'),
        L('☝️', 'Kişi başı tek takım.'),
        L('🚫', 'Menajerken takım alamazsın. Önce istifa.'),
        L('🏷️', 'Sıkılırsan sat: ya hemen, ya da kendi koyduğun fiyata ilan ver.'),
      ] },
    { type: 'lines', title: 'Ligler ve Kupa',
      kicker: 'Her gün bir maç. Her maç bir hikâye.',
      lines: [
        L('📅', 'Ligler günlük oynanır. Puan tablosu ve fikstür hep açık.'),
        L('🎉', 'Sezon bitince kutlama günü gelir. Bazı takımlar üst lige çıkar, bazıları alt lige düşer.'),
        L('🥇', 'Kupa ayrı bir eleme: kim kimle eşleşti, kim tur atladı, hepsi ağaçta.'),
        L('🎰', 'İddaa bayii kapıda. Tek maça da oynarsın, hepsine de. Ama biri yanarsa kupon yanar.'),
      ] },
    { type: 'pick', title: 'Kulüp Odası',
      kicker: 'Bir kulübün kalbi burada atar.',
      items: [
        { i: '🧠', name: 'Kadro', lines: [
          'İlk 11’i ve taktiği sen seçersin.',
          'Mücadele seviyesi Dikkatli’den Çok Agresif’e uzanır. Sert oynarsan oyuncular güçlenir. Ama sakatlık kapıda bekler.' ] },
        { i: '🔄', name: 'Transfer', lines: [
          'Yeni yetenek al, eskiyi elden çıkar.' ] },
        { i: '🏋️', name: 'Antrenman', lines: [
          'Dört mevki için birer kutu: kaleci, defans, orta saha, forvet.',
          'Önce bir spor salonu seç ve öde. Menajerin varsa kasadan, yoksa cebinden.',
          'Kutuya bir oyuncu koy, gelişsin. Antrenmandaki oyuncu sahaya çıkamaz.',
          '🔥 işaretli salonda oyuncular %10 fazla gelişir.' ] },
        { i: '🩺', name: 'Doktor', lines: [
          '10.000 altına bir sakatı daha hızlı iyileştir.',
          'Doktor günde tek hastaya bakar.' ] },
        { i: '🎨', name: 'Forma', lines: [
          'Armanı ve renklerini çiz. Şehir seni formandan tanısın.' ] },
        { i: '🏟️', name: 'Stadyum', lines: [
          'Kapasiteyi büyüt, bilet fiyatını kendin belirle.' ] },
        { i: '🤝', name: 'Sponsor', lines: [
          'Fabrikalar kulübüne teklif verir. En yüksek teklif kazanır.' ] },
        { i: '🧢', name: 'Menajer', lines: [
          'Kasa, menajerlik ilanı ve devir işleri burada.' ] },
      ] },
    { type: 'lines', title: 'Para Nereden Gelir',
      kicker: 'Kasa mı, cep mi? Takımın durumuna bağlı.',
      lines: [
        L('🎟️', 'Bilet, sponsor ve sezon sonu ödülleri: kulübün gelirleri.'),
        L('👛', 'Takımı kendin yönetiyorsan bilet parası doğrudan cebine düşer.'),
        L('🏦', 'Menajerin varsa para takımın kasasına yatar. Sen her gün bir kısmını çekersin.'),
        L('🤖', '5 gün ortadan kaybolursan takımı oto-bot devralır.'),
      ] },
    { type: 'lines', title: 'Sahaya Çık',
      kicker: 'Bot değil, sensin. Formanın içinde gerçek bir isim.',
      lines: [
        L('⚡', 'Salonda 200 güce ulaş. Şehrin kulüpleri adını duymaya başlar.'),
        L('📢', 'İlana çık, maaşını sen koy. Ya da teklifleri bekle, beğenmediğini geri çevir.'),
        L('💰', 'Maaşın her akşam 19:00’da yatar.'),
        L('🔁', 'Daha iyi bir teklif gelirse formayı değiştirirsin. Sıkılırsan sözleşmeyi yırtarsın.'),
        L('⭐', 'Gol at, asist yap, maçın yıldızı ol. Adın listenin en üstüne çıksın.'),
      ] },
    { type: 'lines', title: 'Taraftar',
      kicker: 'Tribün doluysa oyun da senin.',
      lines: [
        L('🏆', 'Kazandıkça taraftar akın eder. Kaybettikçe kaçar.'),
        L('🎟️', 'Bilet pahalıysa halk kızar, ucuzsa sever. Denge 10 altın civarında.'),
        L('🏟️', 'Ama kapasiteyi aşamazsın. Stadyum büyürse gelir de büyür.'),
      ] },
  ] },

  /* -------------------------------------------------------------- */
  { id: 'fabrika', icon: '🏭', name: 'Fabrika', tag: 'Kendi imparatorluğunu kur', color: '#ff7a2e', pages: [
    { type: 'lines', title: 'Fabrikatör',
      kicker: 'Baca senin, duman senin, kâr da senin.',
      lines: [
        L('🏗️', 'Bedeli 300.000 altın ve iki kripto. Her makineden birer tane ile kapını açarsın.'),
        L('☝️', 'Kişi başı tek fabrika. Satılmaz, devredilmez.'),
        L('🧑‍🏭', 'Bir yerde çalışıyorsan, fabrikanı kurunca o işten otomatik ayrılırsın.'),
        L('🎨', 'Adını ve logonu sen seçersin.'),
        L('🏛️', 'Devlet her gece payını alır. Ne kadar büyürsen, payı o kadar büyür.'),
      ] },
    { type: 'pick', title: 'Makineler',
      kicker: 'Fabrika makine kadar konuşur.',
      items: [
        { i: '⛏️', name: 'Mining', lines: [
          'İşçi istemez. Kendi kendine kripto üretir.',
          'Kripto fiyatı çok şişerse makine yavaşlar.' ] },
        { i: '🔧', name: 'Tamir', lines: [
          'Araba ve silahların ömrünü uzatan malzeme.',
          'Hepsinin en bol üreteni.' ] },
        { i: '🔫', name: 'Silah Geliştirme', lines: [
          'Silahları güçlendiren malzeme.' ] },
        { i: '🚗', name: 'Araba Geliştirme', lines: [
          'Arabaları güçlendiren malzeme.' ] },
      ] },
    { type: 'lines', title: 'İşçiler ve Maaş',
      kicker: 'Makineler çalışır. Onları çalıştıran insanlardır.',
      lines: [
        L('💰', 'Maaşı sen koyarsın: 1.000 ile 5.000 arası.'),
        L('🧲', 'Yüksek maaş, kalabalık kuyruk demek.'),
        L('🙋', 'İşçi gelmezse gece yarısı makineyi sen çalıştırırsın. Ama 2/10 verimle.'),
        L('🔨', 'İşçiyi kovabilir ya da başka makineye taşıyabilirsin.'),
        L('⛏️', 'Mining makinesi işçi istemez.'),
      ] },
    { type: 'lines', title: 'Kâr ve Zarar',
      kicker: 'Her gece defter kapanır.',
      lines: [
        L('📒', 'Her gece günün raporu çıkar: gelir, giderler, net kâr.'),
        L('🔌', 'Giderler: işçi maaşları, elektrik, hissedarların payı, sponsorluk.'),
        L('📉', 'Kâr eksiye de düşebilir. Kimse seni kurtarmaz.'),
      ] },
    { type: 'lines', title: 'Hisse Sat',
      kicker: 'Parayı bulmak için ortak bul.',
      lines: [
        L('📜', 'Fabrikanın istediğin kadarını sat. En fazla tamamını.'),
        L('⏳', 'Hisse 10 ya da 20 gün geçerli.'),
        L('💸', 'Hisseyi alan, her gece fabrikanın kârından payını alır.'),
        L('🏷️', 'Fiyatı sen koyarsın. Ama adil değerin yarısının altına ya da tamamının üstüne çıkamazsın.'),
        L('👀', 'Hisseye bakan herkes önce fabrikanın kârına bakar.'),
      ] },
    { type: 'lines', title: 'Kulüplere Sponsor Ol',
      kicker: 'Adın bir ekranda, bir şehrin dilinde.',
      lines: [
        L('⚽', 'Bir futbol kulübüne günlük ücret öde, adın kulübün ekranında dursun.'),
        L('⚔️', 'Rakip fabrika daha yüksek teklif verirse sponsorluğu kapabilir. Sen de yükseltip geri alırsın.'),
        L('🌙', 'Yeni sponsorluk her zaman ertesi gece yarısı başlar.'),
        L('🧾', 'Ücret fabrikanın günlük giderine yazılır.'),
      ] },
  ] },

  /* -------------------------------------------------------------- */
  { id: 'isletmeler', icon: '🏪', name: 'İşletmeler', tag: 'Evin bir tabela kadar uzakta', color: '#3df5c4', pages: [
    { type: 'lines', title: 'Evini Dükkâna Çevir',
      kicker: 'Kapıyı aç, tabelayı as, kasayı kur.',
      lines: [
        L('🏠', 'Bir ev al ya da elindekini seç. Mobilyaları diz.'),
        L('⚙️', 'Ayarlar › İşletmeler’den kepengi kaldır.'),
        L('🌐', 'Kapın artık herkese açık. Kim gelirse müşterin.'),
        L('🏛️', 'Kasaya giren her altından devlet payını alır.'),
        L('📩', 'Satış oldu mu, telefonun titrer.'),
      ] },
    { type: 'pick', title: 'Yedi Tabela',
      kicker: 'Hangi kapının ardında hangi para?',
      items: [
        { i: '🔫', name: 'Silahçı', lines: [
          'Vitrine silahlarını diz, fiyatı sen koy.',
          'Tezgâhta tamir ve geliştirme. Usta sensin.' ] },
        { i: '🚗', name: 'Araba Galerisi', lines: [
          'Arabalarını vitrine çıkar. Sokak bakar, cüzdan karar verir.' ] },
        { i: '🔧', name: 'Modifiye Garajı', lines: [
          'Yorgun motorlar sana gelir. Tamir et, seviye atlat.' ] },
        { i: '🏋️', name: 'Spor Salonu', lines: [
          'Üyeliği sen fiyatlarsın. Şehrin kasları senin salonunda büyür.',
          'Kulüpler de oyuncularını sana yollar.' ] },
        { i: '🖥️', name: 'İnternet Kafe', lines: [
          'Dakikayı sen fiyatlarsın. Ekran ışığı hiç sönmez.' ] },
        { i: '☕', name: 'Cafe', lines: [
          'Menüyü dolapların belirler. Burada hiçbir şey bedava değil. Sahibi hariç.' ] },
        { i: '🍸', name: 'Bar', lines: [
          'Dolaplar menüyü büyütür. Sahneye bir piyano koy, gece başlasın.' ] },
      ] },
    { type: 'lines', title: 'Futbolcu Ol',
      kicker: 'Ter senin. Efsane de senin.',
      lines: [
        L('🎯', 'Mevkini seç. Kaleci mi, golcü mü?'),
        L('🎟️', 'Bir salona üye ol. Aletler seni bekliyor.'),
        L('⚡', 'Her antrenman seni biraz daha güçlendirir.'),
        L('⏳', 'Üyelik akşam 19:00’da biter. Yarın yeniden.'),
        L('📢', '200 güçte kulüpler kapını çalar. Gerisi Futbol Takımı › Sahaya Çık’ta.'),
      ] },
    { type: 'lines', title: '🔥 Bonuslu Salon',
      kicker: 'Kalabalık her zaman haklı değildir.',
      lines: [
        L('🔥', 'Dün az kazanan salon bugün alev alır. İçeride herkes daha hızlı gelişir.'),
        L('👀', 'Listede 🔥 işaretini ara. Akıllı sporcu kalabalığın peşinden gitmez.'),
      ] },
    { type: 'lines', title: 'Garson Ol',
      kicker: 'Tepsi senin, bahşiş senin.',
      lines: [
        L('🧑‍🍳', 'Cafe ya da barda sol üstteki “Garson ol”a dokun. Mekânda tek garson olur.'),
        L('📋', 'Menü yerine “Siparişler” gelir. Her sipariş için 20 saniyen var.'),
        L('💰', 'Zamanında verdiğin her siparişin %10’u maaşın. Geç kalırsan ürün kendiliğinden gider, önlüğü bırakırsın.'),
        L('🏠', 'Dükkân sahibi de garson olabilir; o maaş almaz, kasa zaten onun.'),
      ] },
    { type: 'lines', title: 'Tasarım Yetkisi',
      kicker: 'İyi bir dekoratör altından değerlidir.',
      lines: [
        L('➕', 'Tasarla’da “+” ile arkadaşına yetki ver. Senin envanterinden dizer, mağazadan deneme koyar.'),
        L('🛒', 'Satın almak sadece sende. Deneme eşyalar sana saydam görünür.'),
        L('👁️', 'Göz butonu: deneme eşyaları gerçek haliyle gör, karar ver.'),
        L('🧩', 'Zemin Parçaları ve Duvar Panelleri: evin içi parke, önü çim ya da kum; seçili parçanın ◀ ▲ ▼ ▶ oklarıyla yanına yenisini ekle.'),
      ] },
    { type: 'lines', title: 'Defter ve Sıra',
      kicker: 'Her gece kapanış, her sabah yeni sıra.',
      lines: [
        L('📊', 'Defterin sende: ne kazandın, kim geldi, en çok ne sattın.'),
        L('🏆', 'Listede yerin dünkü kasana göre belirlenir. Oyunun dükkânları da yarışta.'),
        L('🤫', 'Kazancını sadece sen bilirsin. Şehir yalnızca sıranı görür.'),
      ] },
  ] },

  /* -------------------------------------------------------------- */
  { id: 'yayincilik', icon: '🔴', name: 'Yayıncılık', tag: 'Şehir seni izliyor. Bu sefer isteyerek.', color: '#ff2e5a', pages: [
    { type: 'lines', title: 'Yayın Seti Kur',
      kicker: 'Bir koltuk, bir bilgisayar, bir kamera.',
      lines: [
        L('🪑', 'Oyuncu koltuğunu bilgisayarın yanına koy. Setin hazır.'),
        L('🏠', 'Yayını kendi evinde ya da dükkânında açarsın. Başka kapı yok, bir de internet kafe.'),
        L('🔴', 'Koltuğa otur, “Yayın aç”a dokun. Şehir seni izlemeye başlar.'),
      ] },
    { type: 'lines', title: 'İnternet Kafede Yayın',
      kicker: 'Set kiralık. Saat işliyor.',
      lines: [
        L('💳', 'Kafede yayının dakikası var. Fiyatı kafe sahibi koyar.'),
        L('⏱️', 'Altının bittiği an kamera kararır.'),
      ] },
    { type: 'lines', title: 'İzle, Yaz, Bağışla',
      kicker: 'Kalabalık büyüdükçe ses de büyür.',
      lines: [
        L('📺', 'Şehirde biri canlıysa köşede 🔴 CANLI yanar. Dokun, izle.'),
        L('💬', 'Yaz, alkışla, laf at. Sohbet seninle akar.'),
        L('🎁', 'Bir bağış bırak, notun ekranda parlasın.'),
      ] },
    { type: 'lines', title: 'Yayın Bitince',
      kicker: 'Perde iner, hesap çıkar.',
      lines: [
        L('📊', 'Kaç kişi izledi, kaç bağış geldi. Hepsi önünde.'),
        L('💰', 'Bağışlar cebine akar. Devlet payını alır.'),
        L('🚪', 'Koltuktan kalktığın an perde kapanır.'),
      ] },
    { type: 'lines', title: 'Yayında Maç',
      kicker: 'Saat 18:00. Herkes tribüne.',
      lines: [
        L('⚽', '18:00–19:00 arası sol altta “Maç” belirir. Yayının köşeye çekilir, Maçlar açılır.'),
        L('💬', 'Yazdıkların yayın sohbetine gider. Maç sohbetini okursun ama yazamazsın.'),
        L('🏆', 'En çok bağış yapanlar listesi büyür: günlük tavana ulaşan her bağışçı bir sıra açar, en fazla 10.'),
      ] },
    { type: 'lines', title: 'Mahremiyet',
      kicker: 'Kameraya girmek de bir seçim.',
      lines: [
        L('🔴', 'Yayın olan odaya girerken uyarılırsın.'),
        L('🙈', 'Görünmek istemiyorsan söyle, kamera seni atlar.'),
      ] },
  ] },
];
