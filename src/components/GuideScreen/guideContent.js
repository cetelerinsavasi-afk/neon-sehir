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
        { i: '🚔', name: 'Polis', t: 'Rozet ve rüşvet havuzu.', go: { page: 2 } },
        { i: '🕌', name: 'İmam', t: 'Şehrin tek minberi.', go: { page: 3 } },
        { i: '🤲', name: 'Dilenci', t: 'Köşe senin, kader başka.', go: { page: 4 } },
        { i: '🎭', name: 'Serbest işler', t: 'Soygun, kaçakçılık, yarış.', go: { page: 5 } },
        { i: '🧢', name: 'Menajer', t: 'Başkasının takımı, senin kaderin.', go: { cat: 'menajer', page: 0 } },
        { i: '⚽', name: 'Kulüp Başkanı', t: 'Tribünler senin.', go: { cat: 'futbol', page: 0 } },
        { i: '🏭', name: 'Fabrikatör', t: 'Baca senin, kâr senin.', go: { cat: 'fabrika', page: 0 } },
        { i: '🏪', name: 'İşletmeci', t: 'Tabelayı as, kasayı kur.', go: { cat: 'isletmeler', page: 0 } },
        { i: '🏋️', name: 'Futbolcu', t: 'Salonda ter, sahada isim.', go: { cat: 'isletmeler', page: 2 } },
        { i: '🏴', name: 'Çete Üyesi', t: 'Sokakların gerçek sahipleri.', go: { cat: 'ceteler', page: 0 } },
        { i: '🕵️', name: 'Ajan', t: 'Adı yok, yüzü yok.', go: { cat: 'ceteler', page: 7 } },
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
        L('🧼', 'Şüphen sıfır, belinde bir silah olmalı.'),
        L('🌙', 'Başvurun gece yarısı onaylanır.'),
        L('💼', 'Sabit maaşın yok. Şehrin verdiği rüşvetler havuzda birikir, polisler paylaşır.'),
        L('📅', 'Karakola her gün uğra. Üç gün gelmezsen rozetin gider.'),
        L('😈', 'Rozet seni melek yapmaz. Soygun da yapabilirsin. Yakalanırsan bedelin iki katı.'),
        L('🕶️', 'Bir ekipte sivil varsa suçluyu sen yakalarsın. Kimin polis olduğu asla belli olmaz.'),
      ] },
    { type: 'lines', title: 'İmam',
      kicker: 'Şehirde tek bir minber var. Belki de üstünde sen dursun.',
      lines: [
        L('🕌', 'Bütün şehirde tek imam vardır.'),
        L('✨', 'Saygınlığın en az 50, şüphen sıfır olmalı.'),
        L('📿', 'Her gün 5 vakit ibadet et. Bir de nasihat ver.'),
        L('💰', 'Karşılığı günde 10.000 altın.'),
        L('🕳️', 'Bir gün aksatırsan imamlığın biter. 24 saat sonra yeniden başvurabilirsin.'),
        L('🃏', 'İmamlık bir kimliktir, kafes değil. Fabrikada çalışmaya devam edebilirsin. Rozetli biri de imam olabilir.'),
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
          'Tır, depo ve siparişler senden sorulur.' ] },
        { i: '🗡️', name: 'Sağ Kol', sub: 'Babanın gölgesi. Ama gölge de uzar.', lines: [
          'Çömez’i atarsın.',
          'Kasadan altın dağıtır, başka çeteye para yollarsın.',
          'Bahis ve ittifak teklifine karar verirsin.',
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
        L('💤', '30 gün boyunca ne savaşan, ne mesaj yazan, ne ibadet eden çeteden atılır. Baba da dahil.'),
      ] },
    { type: 'lines', title: 'Yollar, Tırlar, Sabotaj',
      kicker: 'Yolu tutan, şehri tutar.',
      lines: [
        L('🛣️', 'Yolu kazanan çete o malı mağazanın yarı fiyatına getirir.'),
        L('🚚', 'Tır 100.000 altın, 21 gün yaşar. Sipariş verilince bir sonraki 3 saatlik dilimde yola çıkar, o gece 00:00\'da depoya varır.'),
        L('📦', 'Siparişi Pazartesi–Cumartesi 00:00–12:00 arası Baba ve Sağ Kol verir.'),
        L('💣', 'Yoldaki tır herkesin hedefi. Yola çıktıktan sonraki 6 saat ihbar, sabotaj ve operasyon zamanı; ardından saldırı başlar ve 24:00’e kadar sürer.'),
        L('💰', 'Tır sahibi 21:00’e kadar haraç öder ve kurtulur. Ödemezse yük saldırganın deposuna gider.'),
        L('🏠', 'Tır her hâlükârda sahibine döner.'),
        L('🏪', 'Depodaki mal anında satılmaz, dağıtılmaz; 2. el pazarında çetenin adıyla satılır.'),
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
    { type: 'lines', title: 'İstihbarat',
      kicker: 'Adı yok. Yüzü yok. Her şeyi biliyor.',
      lines: [
        L('🕵️', 'Şehrin gizli örgütü. Tek bir tane var.'),
        L('🎭', 'İçeri 50 saygınlıkla girersin. Kod adını seçersin, avatarın “?” olur.'),
        L('🪜', 'Muhbirden Başkan’a beş rütbe. Yine prestijle yükselirsin.'),
        L('📡', 'Çetelerin yoldaki tırlarını ihbar edersin, yüklerini sızdırırsın.'),
        L('💣', 'Başkan ve Şef operasyon başlatıp rüşvet ister. Tır sahibi öderse operasyon durur.'),
        L('🐍', 'Hem çetede hem İstihbaratta olabilirsin. Çifte ajan.'),
        L('⚖️', 'Bir İstihbaratçı çetenin Babası olursa iki yol var: çeteyi teslim et ya da gölgeyi bırak.'),
      ],
      tags: ['⭐ 50 saygınlık yeter'] },
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
        L('⚡', 'Spor salonunda 200 güce ulaş: maaşlı futbolcular listesine girersin.'),
        L('📢', 'İlana çık ve maaşını sen koy, takım doğrudan imzalasın. Ya da gelen teklifleri bekle.'),
        L('📨', 'Teklifler 24 saat geçerli. Beğenmediğini reddet.'),
        L('🔁', 'Takımdayken de teklif gelir; kabul edersen transfer olursun. Takımdayken ilana çıkamazsın.'),
        L('💰', 'Maaş her gün 19:00’da yatar. Menajerli takımda kasadan, yoksa başkanın cebinden.'),
        L('📉', 'Ödenmeyen maaş borç olarak birikir. Sözleşme biterse borç takımın borcu olur, para gelince ödenir.'),
        L('💸', 'Zam iste ya da takımın kendiliğinden artırsın. İstediğin an feshet; aynı takıma 19:00’dan sonra dönebilirsin.'),
        L('📊', 'Gol, asist, maç puanı ve maçın yıldızı. Ligler › Oyuncular’da adını en üste taşı.'),
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
        L('🏗️', 'Fabrikan her makineden 1 tane ile kurulur. Bedel: 300.000 altın + 2 kriptonun altın değeri; saatlik değişir.'),
        L('☝️', 'Kişi başı tek fabrika. Satılmaz, devredilmez.'),
        L('🧑‍🏭', 'Bir yerde çalışıyorsan, fabrikanı kurunca o işten otomatik ayrılırsın.'),
        L('🎨', 'Adını ve logonu sen seçersin.'),
        L('🏛️', 'Her gece günlük kazancının %10’u vergi olarak kesilir; altının yetmezse borç yazılır.'),
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
        L('🙋', 'İşçi gelmezse gece yarısı makineyi sen çalıştırırsın. Ama üretimin yalnızca onda biri kadarını.'),
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
        L('🏠', 'Yeni bir ev al ya da elindeki evi seç. Gerekli mobilyaları diz.'),
        L('🛒', 'Eksik mobilyalar tek dokunuşla: Hepsini al.'),
        L('⚙️', 'Ayarlar › İşletmeler’den kepengi aç.'),
        L('🌐', 'İşletmenin kapısı herkese açıktır. Kimseyi geri çeviremezsin.'),
        L('🔒', 'İçeride müşteri ya da süren bir iş varken gerekli mobilyalar yerinden oynamaz.'),
        L('📦', 'Kepengi indirirsen içerideki malzeme ve ürünler sana döner.'),
        L('🏛️', 'Vergi: hizmet ve satış gelirinin %10’u, vitrinden silah/araba satışının %1’i. 100 kazandın, 90 cebine.'),
        L('📩', 'Satış olunca SMS gelir: “işletmende yeni satışlar var”.'),
      ] },
    { type: 'pick', title: 'Yedi Tabela',
      kicker: 'Hangi kapının ardında hangi para?',
      items: [
        { i: '🔫', name: 'Silahçı', lines: [
          'Vitrine 10 silah koy, fiyatı sen belirle. Vitrindeki silah eskimez.',
          'Atölyede tamir ve geliştirme. Malzeme müşteriden ya da senden, işçilik %30’a kadar.' ] },
        { i: '🚗', name: 'Araba Galerisi', lines: [
          'Arabalarını vitrine çıkar. İlan 7 günde düşer, araba galeride kalır.',
          'Vitrindeki araba eskimez.' ] },
        { i: '🔧', name: 'Modifiye Garajı', lines: [
          'Araba tamiri ve seviye geliştirmesi (1→2→3) senin tezgahında.' ] },
        { i: '🏋️', name: 'Spor Salonu', lines: [
          'Günlük üyelik 500 ile 2.000 arası. Müşteri üç alette ter döker, gücü artar.',
          'Takımlar da oyuncularını senin salonuna yollar.' ] },
        { i: '🖥️', name: 'İnternet Kafe', lines: [
          'Dakikayı sen fiyatlarsın. Müşteri öder, oynar; kredisi mekâna bağlı akar.' ] },
        { i: '☕', name: 'Cafe', lines: [
          'Menüyü dolapların belirler. Pasta vitrini koy, pasta da sat.',
          'Burada hiçbir şey bedava değil. Sahibi hariç.' ] },
        { i: '🍸', name: 'Bar', lines: [
          'Dolaplar menüyü büyütür. Sahneye bir piyano koy, mekân çalsın.' ] },
      ] },
    { type: 'lines', title: 'Futbolcu Ol',
      kicker: 'Ter senin. Efsane de senin.',
      lines: [
        L('🎯', 'Mevkini Futbolcu ekranında ya da ilk üyelikte seç. Günde 1 kez değişir, 200 güçte kalıcı olur.'),
        L('🎟️', 'Üyeliği öde. Salonda üç alet seni bekler, her biri kısa bir oyun.'),
        L('⚡', 'Güç 100’den başlar. 200’e kadar günde 1–16, sonra 1–4 artar.'),
        L('⏳', 'Üyelik 19:00’da biter. Son saatte başlarsan bir saatin var.'),
        L('👑', 'Salon sahibi kendi salonunda günde bir kez bedava çalışır.'),
        L('💪', 'Aletler üyeliksiz de kullanılır: serbest çalış, ama güç kazanmazsın.'),
        L('📢', '200 güçte maaşlı futbolcusun. Ayrıntılar Futbol Takımı › Sahaya Çık sayfasında.'),
      ] },
    { type: 'lines', title: '🔥 Bonuslu Salon',
      kicker: 'Kalabalık her zaman haklı değildir.',
      lines: [
        L('📉', 'Dün liderin yarısından az kazanan salon bugün bonusludur.'),
        L('🔥', 'Bonuslu salonda gelişim %10 fazla. Takımların oyuncuları dahil.'),
        L('🆕', 'Yeni salon ilk akşamı bekler. Bir tam gün geçmeden bonus yok.'),
      ] },
    { type: 'lines', title: 'Defter ve Sıra',
      kicker: 'Her gün kapanış, her gün yeni sıralama.',
      lines: [
        L('📊', 'Rapor: bugün ve dün ne kazandın, kaç müşteri geldi, en çok ne sattın.'),
        L('🏆', 'Listede yerin dünkü kazancına göre. Oyunun dükkânları da yarışta.'),
        L('🌙', 'Gün gece yarısı kapanır. Spor salonu futbol gibi 19:00’da.'),
        L('⚖️', 'Devlete borcun varsa kazancının yarısı borca gider.'),
        L('🤫', 'Kazancını sadece sen görürsün. Herkes yalnızca sıranı bilir.'),
      ] },
  ] },
];
