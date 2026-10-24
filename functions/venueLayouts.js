// =============================================================================
// venueLayouts.js — v92 Faz 8: Oyunun mekânları 3D (spor salonu gibi)
// =============================================================================
// Camii, Banka, Gazino, Karakol, Araba Galerisi, Silah Mağazası, Modifiye
// Garajı, Park ve (v108) Belediye artık 3D ev motoruyla gezilen birer "oyun evi"
// (houses/game_{anahtar}, ownerUid '__game__', venue alanı dolu).
//   • Yerleşim (eşyalar, duvar, zemin) BURADA tanımlanır; sunucu venueEnsure
//     ile belgeyi kurar ve sürüm (v) değişince günceller.
//   • İstasyonlar: bir eşyanın yanına gidince çıkan mekân butonları (ör.
//     Mihrap → "İbadet Et"). Hangi paneli açacağı istemcide (VenueLayer).
//   • NPC'ler: sabit konumlu karakterler (veznedar, barmen, memur…). Avatarlar
//     DEFAULT_AVATAR üstüne yazılan kısmi avatarlardır.
//   • loc: eski 2D mekânın konum kaydı (interiorPresence.locationId ya da
//     'park' → parkPresence). Sunucu tarafındaki "mekânda mı" kontrolleri,
//     ziyaret sayaçları ve ısmarlama bu kayda bakmaya devam eder; 3D ekran bu
//     kaydı nabızla taze tutar.
// Oda: 18 m × 14 m (x: -9…9, z: -7…7). Giriş/doğuş noktası (5, 3.8) boş kalır.
// r: 45° adım (0 = önü +z, 2 = +x'e bakar, 4 = -z, 6 = -x).
// =============================================================================

export const VENUE_OWNER = '__game__';
const it = (i, k, x, z, r = 0, c = 0) => ({ i, k, x, z, r, c, p: 1 });

const AV = {
  guard: { gender: 'erkek', build: 'iri', skin: '#8d5524', hairStyle: 'short', hairColor: '#0d0a08', clothing: 'suit', clothColor: '#14171c', neckAcc: 'tie', pantsColor: '#0d0d0d' },
  guard2: { gender: 'erkek', build: 'iri', skin: '#f1c27d', hairStyle: 'short', hairColor: '#0d0a08', clothing: 'suit', clothColor: '#141821', neckAcc: 'tie', pantsColor: '#0d0d0d' },
  teller1: { gender: 'erkek', build: 'standart', skin: '#c68863', hairStyle: 'short', hairColor: '#2b2118', clothing: 'suit', clothColor: '#1d3d5c', neckAcc: 'tie', pantsColor: '#22262f' },
  teller2: { gender: 'kadin', build: 'zayif', skin: '#e0ac69', hairStyle: 'bun', hairColor: '#5c3a21', clothing: 'vest', clothColor: '#5c1a24', neckAcc: 'none', pantsColor: '#22262f' },
  teller3: { gender: 'erkek', build: 'iri', skin: '#8d5524', hairStyle: 'slick', hairColor: '#0d0a08', facialHair: 'mustache', clothing: 'suit', clothColor: '#22262f', neckAcc: 'tie', pantsColor: '#0d0d0d' },
  barmen: { gender: 'erkek', build: 'iri', skin: '#c68863', hairStyle: 'slick', hairColor: '#0d0a08', clothing: 'vest', clothColor: '#1a1a1a', neckAcc: 'bow', pantsColor: '#0d0d0d' },
  biletci: { gender: 'kadin', build: 'standart', skin: '#e0ac69', hairStyle: 'ponytail', hairColor: '#7a1f2b', clothing: 'vest', clothColor: '#7a1f2b', neckAcc: 'none', pantsColor: '#22262f' },
  officer: { gender: 'erkek', build: 'iri', skin: '#c68863', hairStyle: 'short', hairColor: '#0d0a08', clothing: 'police', clothColor: '#1a2a4a', hat: 'policecap', hatColor: '#12213d', pantsColor: '#12213d' },
  komiser: { gender: 'erkek', build: 'standart', skin: '#8d5524', hairStyle: 'slick', hairColor: '#0d0a08', facialHair: 'mustache', clothing: 'police', clothColor: '#2b3550', neckAcc: 'tie', pantsColor: '#0d0d0d', hat: 'none' },
  seller: { gender: 'erkek', build: 'iri', skin: '#c68863', hairStyle: 'short', hairColor: '#0d0a08', facialHair: 'mustache', clothing: 'vest', clothColor: '#241d14', neckAcc: 'bow', pantsColor: '#141210' },
  dealer: { gender: 'erkek', build: 'zayif', skin: '#caa07a', hairStyle: 'short', hairColor: '#171310', facialHair: 'goatee', clothing: 'tuxedo', clothColor: '#14151a', neckAcc: 'bow', pantsColor: '#101114' },
  usta: { gender: 'erkek', build: 'iri', skin: '#c68642', hairStyle: 'short', hairColor: '#241813', facialHair: 'mustache', clothing: 'jumpsuit', clothColor: '#3a4048', neckAcc: 'none', pantsColor: '#22262f', hat: 'cap', hatColor: '#c0392b' },
  supheli: { gender: 'erkek', build: 'iri', skin: '#a86b3c', hairStyle: 'short', hairColor: '#0d0a08', clothing: 'trenchcoat', clothColor: '#22262f', pantsColor: '#0d0d0d', shoeColor: '#0d0d0d', faceAcc: 'sunglasses', hat: 'fedora', hatColor: '#0d0d0d' },
  sekreter: { gender: 'kadin', build: 'zayif', skin: '#e0ac69', hairStyle: 'bun', hairColor: '#3b2a1a', clothing: 'suit', clothColor: '#2b3550', neckAcc: 'none', pantsColor: '#22262f' },
  zabita: { gender: 'erkek', build: 'iri', skin: '#c68863', hairStyle: 'short', hairColor: '#0d0a08', facialHair: 'mustache', clothing: 'police', clothColor: '#24445c', hat: 'policecap', hatColor: '#1b3347', pantsColor: '#1b3347' },
  bufeci: { gender: 'erkek', build: 'standart', skin: '#d9a066', hairStyle: 'short', hairColor: '#3b2a1a', facialHair: 'mustache', clothing: 'tanktop', clothColor: '#ffcf33', neckAcc: 'none', pantsColor: '#2b3550', hat: 'cap', hatColor: '#c4161c' },
};export const NPC_AVATARS = AV; // v100 — evlerdeki eşya NPC'leri (büfeci) de kullanır


// npc: { id, name, x, z, left, lines, station (yakınındaki istasyon eşyası), av }
export const VENUES = {
  camii: {
    houseId: 'game_camii',
    name: 'Neon Camii',
    icon: '🕌',
    loc: 'camii',
    v: 1,
    wall: 'mermer_duvar',
    floor: 'hali_bordo',
    items: [
      it('cm_mih', 'mihrap', 0, -6.65),
      it('cm_min', 'minber', 3.7, -5.0),
      it('cm_av1', 'camiavize', 0, -1.5),
      it('cm_av2', 'chandelier', -5.5, -1.5),
      it('cm_av3', 'chandelier', 5.5, -1.5),
      ...[-4.5, -3, -1.5, 0, 1.5, 3, 4.5].flatMap((x, n) => [it(`cm_s1${n}`, 'seccade', x, -3.6), it(`cm_s2${n}`, 'seccade', x, -1.6), it(`cm_s3${n}`, 'seccade', x, 0.4)]),
      it('cm_ci1', 'cini', -4.5, -7),
      it('cm_ci2', 'cini', 4.5, -7, 0, 0),
      it('cm_ci3', 'cini', -9, -3, 2),
      it('cm_ci4', 'cini', 9, -3, 6),
      it('cm_wn1', 'win_bogaz', -9, 1.5, 2),
      it('cm_wn2', 'win_bogaz', 9, 1.5, 6),
      it('cm_rh1', 'rahle', -7.6, -5.6),
      it('cm_rh2', 'rahle', -6.6, -5.6),
      it('cm_md1', 'minder', -7.6, -4.9),
      it('cm_md2', 'minder', -6.6, -4.9),
      it('cm_ak1', 'ayakkabilik', 7.6, 6.6, 4),
      it('cm_ak2', 'ayakkabilik', 2.4, 6.6, 4),
      it('cm_pl1', 'plantb', -8.3, -6.3),
      it('cm_pl2', 'plantb', 8.3, -6.3),
      it('cm_dr', 'doordeco', 5, 7, 4),
      // dilenci köşesi (çitle çevrili)
      it('cm_f1', 'fence', -7.9, 3.3),
      it('cm_f2', 'fence', -5.9, 3.3),
      it('cm_f3', 'fence', -4.85, 4.35, 2),
      it('cm_dm1', 'minder', -7.8, 5.6),
      it('cm_dm2', 'minder', -6.8, 5.6),
      it('cm_dm3', 'minder', -5.8, 5.6),
      it('cm_bk', 'bagiskutusu', -4.2, 6.1),
      it('cm_clk', 'clock', 0, 7, 4),
    ],
    stations: {
      cm_mih: [{ act: 'imam', label: '🤲 İbadet / İmam' }],
      cm_bk: [{ act: 'beggars', label: '🤲 Dilenciler' }],
    },
    npcs: [],
  },

  banka: {
    houseId: 'game_banka',
    name: 'Parara Bank',
    icon: '🏦',
    loc: 'banka',
    v: 1,
    wall: 'mermer_duvar',
    floor: 'mermer_beyaz',
    items: [
      it('bk_v1', 'vezne', -4, -5.3),
      it('bk_v2', 'vezne', 0, -5.3),
      it('bk_v3', 'vezne', 4, -5.3),
      it('bk_se1', 'siraekran', -7.2, -7),
      it('bk_se2', 'siraekran', 7.2, -7),
      it('bk_st1', 'stanchion', -2, -3.1),
      it('bk_st2', 'stanchion', 2, -3.1),
      it('bk_num', 'numarator', -1.2, 0.2),
      it('bk_w1', 'waitseats', -6.4, 0.8, 4),
      it('bk_w2', 'waitseats', -6.4, 2.6, 4),
      it('bk_w3', 'waitseats', -2.6, 2.6, 4),
      it('bk_vd', 'vaultdoor', 9, -3.2, 6),
      it('bk_atm1', 'atm', 8.4, 1.2, 6),
      it('bk_atm2', 'atm', 8.4, 2.6, 6),
      it('bk_ch', 'chandelier', 0, -1.2),
      it('bk_pl1', 'plantb', -8.3, -6.2),
      it('bk_pl2', 'plantb', 8.3, -6.2),
      it('bk_pl3', 'plantb', -8.3, 6.2),
      it('bk_wc', 'watercooler', 8.3, 5.8, 6),
      it('bk_pt1', 'painting2', -9, -2, 2),
      it('bk_pt2', 'cityframe', -9, 3, 2),
      it('bk_clk', 'clock', 0, -7),
      it('bk_dr', 'doordeco', 5, 7, 4),
      it('bk_rug', 'rugrunner', 5, 2),
    ],
    stations: {
      bk_v1: [{ act: 'bank', label: '🏦 Vezne 1' }],
      bk_v2: [{ act: 'bank', label: '🏦 Vezne 2' }],
      bk_v3: [{ act: 'bank', label: '🏦 Vezne 3' }],
      bk_num: [{ act: 'number', label: '🎫 Numara al' }],
    },
    npcs: [
      { id: 'npc_vezne1', name: 'Ahmet (Veznedar)', x: -4, z: -6.05, av: AV.teller1, station: 'bk_v1', lines: ['Sıradaki lütfen!', 'İmza atar mısınız?', 'Kart mı nakit mi?', 'İyi günler dilerim.'] },
      { id: 'npc_vezne2', name: 'Elif (Veznedar)', x: 0, z: -6.05, av: AV.teller2, station: 'bk_v2', lines: ['Hoş geldiniz!', 'Bakiyenizi kontrol edeyim.', 'Bir dakika lütfen.', 'Başka bir isteğiniz var mı?'] },
      { id: 'npc_vezne3', name: 'Mehmet (Veznedar)', x: 4, z: -6.05, av: AV.teller3, station: 'bk_v3', lines: ['Buyurun efendim.', 'Kredi mi yatırım mı?', 'Kasada yoğunluk var, kusura bakmayın.', 'Faiz oranları güncel.'] },
      { id: 'npc_bguv', name: 'Güvenlik', x: 7.6, z: -1.6, left: true, av: AV.guard, lines: ['Sıraya girer misiniz.', 'Güvenli bankacılık.', 'İyi günler.'] },
    ],
  },

  gazino: {
    houseId: 'game_gazino',
    name: 'Neon Gazino',
    icon: '🎰',
    loc: 'gazino',
    v: 1,
    wall: 'damask',
    floor: 'hali_bordo',
    items: [
      ...[-4.4, -2.2, 0, 2.2, 4.4].map((z, n) => it(`gz_sl${n}`, 'slotm', -8.35, z, 2)),
      it('gz_rul', 'rulet', -2.2, -2.8),
      it('gz_km', 'kartmasa', 3.2, -1.6),
      it('gz_pg', 'piyangogise', 6.3, -5.7),
      it('gz_bar', 'bar', -1.6, -6.2),
      it('gz_bs1', 'stool', -2.6, -5.2),
      it('gz_bs2', 'stool', -1.6, -5.2),
      it('gz_bs3', 'stool', -0.6, -5.2),
      it('gz_ch1', 'chandelier', -2.2, -2.8),
      it('gz_ch2', 'chandelier', 3.2, -1.6),
      it('gz_db', 'discoball', 0, 2.5),
      it('gz_n1', 'neon3', 2.5, -7),
      it('gz_n2', 'neon2', 9, 0, 6),
      it('gz_gr', 'goldrecords', -5.5, -7),
      it('gz_st1', 'stanchion', 3.2, 3.2),
      it('gz_st2', 'stanchion', 7.6, 1.2, 2),
      it('gz_st', 'statue', 8.2, -2.6),
      it('gz_pl1', 'palm', 8.3, 6.2),
      it('gz_pl2', 'palm', -8.3, 6.2),
      it('gz_dr', 'doordeco', 5, 7, 4),
      it('gz_rug', 'rugrunner', 5, 2.2),
    ],
    stations: {
      ...Object.fromEntries([0, 1, 2, 3, 4].map((n) => [`gz_sl${n}`, [{ act: 'slot', label: '🎰 Slot oyna' }]])),
      gz_pg: [{ act: 'piyango', label: '🎟️ Piyango bileti' }],
      gz_km: [{ act: 'onnumara', label: '🃏 10 Numara' }],
      gz_rul: [{ act: 'rulet', label: '🎡 Rulet oyna' }], // v124
      gz_bar: [{ act: 'bar', label: '🍸 Bar' }],
    },
    npcs: [
      { id: 'npc_barmen', name: 'Barmen Coşkun', x: -1.6, z: -6.85, av: AV.barmen, station: 'gz_bar', lines: ['Ne alırdın?', 'Kokteylimiz meşhurdur.', 'Kazandın mı bari?'] },
      { id: 'npc_biletci', name: 'Biletçi Fatma', x: 6.3, z: -6.45, av: AV.biletci, station: 'gz_pg', lines: ['Bugün şansın açık olabilir!', 'Bilet al, kura seni seçsin.', 'Büyük ikramiye bekliyor.'] },
      { id: 'npc_gguv', name: 'Güvenlik', x: -6.6, z: 5.4, av: AV.guard2, lines: ['Her şey kontrol altında.', 'Lütfen düzeni koruyalım.', 'İyi akşamlar.'] },
    ],
  },

  karakol: {
    houseId: 'game_karakol',
    name: 'Neon Karakolu',
    icon: '🚓',
    loc: 'karakol',
    v: 2,
    wall: 'beton_duvar',
    floor: 'karo_mavi',
    items: [
      it('kr_pm', 'polismasa', -2.6, -1.8),
      it('kr_by1', 'bayrak', -5.2, -2.6),
      it('kr_ar', 'aranan', -9, 0.5, 2),
      it('kr_fc1', 'filecab', -8.4, -1.6, 2),
      it('kr_fc2', 'filecab', -8.4, -2.4, 2),
      it('kr_w1', 'waitseats', -2.6, 2.8, 4),
      it('kr_w2', 'waitseats', -6.4, 2.8, 4),
      // komiser ofisi (sağ arka)
      it('kr_wl1', 'wall4', 2.6, -5.1, 2),
      it('kr_wl2', 'wall2', 3.6, -3.2),
      it('kr_wd', 'walldoor', 5.8, -3.2),
      it('kr_wl3', 'wall2', 8.0, -3.2),
      it('kr_od', 'officedesk', 5.8, -5.9, 0),
      it('kr_by2', 'bayrak', 8.2, -6.2),
      it('kr_bk', 'bookshelf', 3.6, -6.6),
      it('kr_ch', 'chester', 7.6, -4.4, 6),
      // nezarethane (sol arka)
      it('kr_b1', 'bars', -8.25, -3.6),
      it('kr_b2', 'bars', -7.25, -3.6),
      it('kr_b3', 'bars', -6.25, -3.6),
      it('kr_b4', 'bars', -5.75, -4.1, 2),
      it('kr_b5', 'bars', -5.75, -5.1, 2),
      it('kr_b6', 'bars', -5.75, -6.1, 2),
      it('kr_bn', 'bunk', -7.5, -6.2),
      it('kr_wanted', 'cityframe', -2.6, -7),
      it('kr_clk', 'clock', -0.4, -7),
      it('kr_wc', 'watercooler', 8.3, 5.8, 6),
      it('kr_pl', 'plantb', 8.3, 0.2),
      it('kr_ex', 'extinguisher', 0.6, -6.7),
      it('kr_dr', 'doordeco', 5, 7, 4),
    ],
    stations: {
      kr_pm: [{ act: 'bribe', label: '👮 Memur — Rüşvet' }],
      kr_od: [{ act: 'application', label: '🎖️ Komiser — Polislik başvurusu' }],
    },
    npcs: [
      { id: 'npc_memur', name: 'Memur Kemal', x: -2.6, z: -2.6, av: AV.officer, station: 'kr_pm', lines: ['Buyurun, nasıl yardımcı olabilirim?', 'Evrak için sırayı bekleyin lütfen.', 'Şüphen çoksa rüşvet işini hallederiz.', 'İyi günler.'] },
      { id: 'npc_komiser', name: 'Komiser Yusuf', x: 5.8, z: -6.75, av: AV.komiser, station: 'kr_od', lines: ['Rapor ne durumda?', 'Başvurunu değerlendiririm.', 'Kitapçığı okumadan imza atma.', 'Nöbet listesini kontrol edin.'] },
    ],
  },

  // v108 — BELEDİYE BAŞKANLIĞI MAKAM ODASI. Şimdilik işlevi yok: gezilir.
  // Admin'e sol üstte "Belediye Raporu" (devlet kasası gelir/gideri) çıkar.
  // Seçimlerle başkan koltuğu dolacak.
  belediye: {
    houseId: 'game_belediye',
    name: 'Neon Şehir Belediyesi',
    icon: '🏛️',
    loc: 'belediye',
    v: 2, // v127: çaycı tezgâhı
    wall: 'ahsap_panel',
    floor: 'parke_ceviz',
    items: [
      // makam (arka orta)
      it('bl_amb', 'belediyeamblem', 0, -7),
      it('bl_by1', 'bayrak', -2.7, -6.4),
      it('bl_by2', 'bayrak', 2.9, -6.4),
      it('bl_bm', 'baskanmasa', 0, -4.9),
      it('bl_rug', 'rugkilim', 0, -2.3),
      it('bl_ch1', 'chester', -2.5, -2.2, 2),
      it('bl_ch2', 'chester', 2.5, -2.2, 6),
      it('bl_tc', 'tcoffee', 0, -2.2),
      it('bl_av1', 'chandelier', 0, -2.4),
      it('bl_av2', 'chandelier', -5.6, 1.2),
      it('bl_av3', 'chandelier', 5.6, 1.6),
      // meclis toplantı köşesi (sol)
      it('bl_tm', 'toplantimasa', -5.6, 1.4),
      it('bl_kr', 'kursu', -5.6, -3.2),
      it('bl_mp', 'meclispano', -9, 1.4, 2),
      it('bl_bk1', 'bookshelf', -8.3, -6.6),
      it('bl_bk2', 'bookshelf', -7.0, -6.6),
      it('bl_fc', 'filecab', -5.8, -6.6),
      it('bl_clk', 'clock', -4.3, -7),
      // şehir maketi (sağ)
      it('bl_mk', 'sehirmaketi', 5.6, -1.6),
      it('bl_map', 'cityframe', 5.6, -7),
      it('bl_wn1', 'win_bogaz', 9, -3.8, 6),
      it('bl_wn2', 'win_bogaz', 9, 1.6, 6),
      it('bl_wn3', 'win_bogaz', -9, -3.8, 2),
      // özel kalem (giriş)
      it('bl_od', 'officedesk', -2.8, 5.0),
      it('bl_fc2', 'filecab', -4.6, 6.6, 4),
      it('bl_wc', 'watercooler', 8.3, 5.8, 6),
      it('bl_cay', 'caysemaver', -6.4, 6.3, 4), // v127
      it('bl_pl1', 'plantb', 3.6, 6.4),
      it('bl_pl2', 'plantb', 8.3, -6.3),
      it('bl_pl3', 'plantb', -8.3, 6.3),
      it('bl_pl4', 'plantb', -8.3, -1.4),
      it('bl_dr', 'doordeco', 5, 7, 4),
    ],
    stations: {},
    npcs: [
      { id: 'npc_zabita', name: 'Zabıta Rıza', x: 6.7, z: 5.6, av: AV.zabita, lines: ['Makamda sessiz olalım lütfen.', 'Maket camına dokunmayın!', 'Belediye hizmetinizde.', 'İyi günler.'] },
    ],
  },

  araba_galerisi: {
    houseId: 'game_galeri',
    name: 'Neon Araba Galerisi',
    icon: '🚗',
    loc: 'araba_galerisi',
    v: 2,
    wall: 'boya_antrasit',
    floor: 'mermer_beyaz',
    items: [
      it('gl_p1', 'carplatform', -4.6, -3.6),
      it('gl_c1', 'car_super', -4.6, -3.6, 1, 1),
      it('gl_p2', 'carplatform', 3.0, -3.6),
      it('gl_c2', 'car_sport', 3.0, -3.6, 7, 2),
      it('gl_c3', 'car_suv', -7.6, 3.6, 0, 3),
      it('gl_c4', 'car_classic', -4.4, 3.8, 0, 4),
      it('gl_sr', 'showroom', -0.8, -7),
      it('gl_od', 'officedesk', 7.2, -1.2, 6),
      it('gl_cm1', 'chairm', 5.9, -1.6, 2),
      it('gl_cm2', 'chairm', 5.9, -0.7, 2),
      it('gl_kc', 'kcoffee', 8.4, -5.8, 6),
      it('gl_wc', 'watercooler', 8.4, -4.6, 6),
      it('gl_pl1', 'plantb', -8.3, -6.3),
      it('gl_pl2', 'plantb', 8.3, 6.3),
      it('gl_pl3', 'plantb', -1.6, 6.3),
      it('gl_st1', 'stanchion', -4.6, -0.9),
      it('gl_st2', 'stanchion', 3.0, -0.9),
      it('gl_w1', 'window', -9, -1, 2),
      it('gl_w2', 'window', -9, 3, 2),
      it('gl_dr', 'doordeco', 5, 7, 4),
    ],
    stations: {
      gl_od: [{ act: 'gallery', label: '🚗 Araba satın al' }],
    },
    npcs: [
      { id: 'npc_galerici', name: 'Galerici Yusuf', x: 8.0, z: -1.2, left: true, av: AV.dealer, station: 'gl_od', lines: ['Hoş geldiniz, size özel fiyat listemiz burada.', 'Bu model sınırlı sayıda üretildi.', 'Kredi ve takas seçeneklerimiz mevcut.', 'Vitrindeki o arabaya bayılmayan yok.', 'Test sürüşü ayarlayabilirim, ilgilenir misiniz?'] },
    ],
  },

  silah_magazasi: {
    houseId: 'game_silahci',
    name: 'Neon Silah Mağazası',
    icon: '🔫',
    loc: 'silah_magazasi',
    v: 1,
    wall: 'tugla',
    floor: 'beton',
    items: [
      it('sh_gc1', 'glasscounter', -2.0, -3.8),
      it('sh_gc2', 'glasscounter', 0.0, -3.8),
      it('sh_gr1', 'gunrack', -4.5, -7),
      it('sh_gr2', 'gunrackg', -1, -7),
      it('sh_gr3', 'gunrack', 2.5, -7),
      it('sh_cb1', 'guncab', -8.4, -4.5, 2),
      it('sh_cb2', 'guncab', -8.4, -2.5, 2),
      it('sh_am1', 'ammo', -8.2, 0.2, 2),
      it('sh_am2', 'crates', -7.6, 1.8, 1),
      it('sh_gt', 'guntable', -4.0, 1.0),
      it('sh_sf', 'safe', -6.6, -6.5),
      // poligon (sağ)
      it('sh_dv1', 'wall4', 4.6, -4.9, 2),
      it('sh_hd1', 'hedef', 8.2, -6.0, 6),
      it('sh_hd2', 'hedef', 8.2, -4.4, 6),
      it('sh_hd3', 'hedef', 8.2, -2.8, 6),
      it('sh_dv2', 'wall2', 6.6, -5.2),
      it('sh_dv3', 'wall2', 6.6, -3.6),
      it('sh_bl', 'bulb', 7.0, -4.4),
      it('sh_n1', 'neon2', 9, 1.2, 6),
      it('sh_ex', 'extinguisher', 8.5, 5.9, 6),
      it('sh_dr', 'doordeco', 5, 7, 4),
    ],
    stations: {
      sh_gc1: [{ act: 'weapon', label: '🔫 Silahçı tezgahı' }],
      sh_gc2: [{ act: 'weapon', label: '🔫 Silahçı tezgahı' }],
      sh_gt: [{ act: 'workshop', label: '🛠️ Tamir / Geliştirme' }],
    },
    npcs: [
      { id: 'npc_silahci', name: 'Silahçı Kemal', x: -1.0, z: -4.7, av: AV.seller, station: 'sh_gc1', lines: ['Hoş geldiniz, ne arıyorsunuz?', 'Bu modelin talebi çok fazla.', 'Ruhsat işlemlerine yardımcı olurum.', 'Kaliteli, güvenilir, dayanıklı.', 'Vitrindekilere göz atabilirsiniz.'] },
    ],
  },

  modifiye_garaji: {
    houseId: 'game_modifiye',
    name: 'Neon Modifiye Garajı',
    icon: '🔧',
    loc: 'modifiye_garaji',
    v: 2,
    wall: 'beton_blok',
    floor: 'epoksi_siyah',
    items: [
      it('md_lf', 'carlift', -4.0, -4.6),
      it('md_c1', 'car_muscle', -4.0, -4.6, 0, 4),
      it('md_c2', 'car_pickup', 3.4, -4.2, 0),
      it('md_gd', 'garagedoor', 3.4, -7),
      it('md_tw1', 'toolwall', -8, -7),
      it('md_tw2', 'toolwall', 9, -2.5, 6),
      it('md_wb', 'workbench', -6.8, 0.8, 2),
      it('md_tc', 'toolchest', -8.3, 2.6, 2),
      it('md_ti1', 'tires', -8.2, -1.6),
      it('md_ti2', 'tires', 8.2, 2.2),
      it('md_br1', 'barrel', 8.3, 3.4),
      it('md_br2', 'barrel', 7.6, 3.6),
      it('md_ap', 'airpump', 8.2, -0.6, 6),
      it('md_cn1', 'cone', 0.0, -1.6),
      it('md_cn2', 'cone', 1.2, -1.6),
      it('md_mt', 'moto_cross', -1.2, 2.6, 2),
      it('md_n1', 'neon_acik', -2.2, -7),
      it('md_gf', 'graffiti', -9, 4.6, 2),
      it('md_dr', 'doordeco', 5, 7, 4),
    ],
    stations: {
      md_wb: [{ act: 'garage', label: '🔧 Usta — Modifiye' }],
    },
    npcs: [
      { id: 'npc_usta', name: 'Usta', x: -5.6, z: 1.6, av: AV.usta, station: 'md_wb', lines: ['Egzoz sesini biraz daha kabartalım mı?', 'Süspansiyonu sertleştirdim, hemen fark edeceksin.', 'Turbo montajı bitmek üzere.', 'Renk değişimi için boya kabinine geçebiliriz.', 'Bir bakalım hele şu motora.'] },
    ],
  },

  park: {
    houseId: 'game_park',
    name: 'Neon Park',
    icon: '🌳',
    loc: 'park',
    outdoor: true,
    v: 1,
    wall: 'orman',
    floor: 'cim',
    items: [
      it('pk_fs', 'fiskiye', 0, -1.2),
      it('pk_b1', 'parkbench', -3.2, -1.2, 2),
      it('pk_b2', 'parkbench', 3.2, -1.2, 6),
      it('pk_b3', 'parkbench', 0, -4.4),
      it('pk_b4', 'parkbench', -1.6, 2.2, 4),
      it('pk_tr1', 'tree', -8, -6),
      it('pk_tr2', 'tree', -4.6, -6.2),
      it('pk_tr3', 'tree', 3.6, -6.3),
      it('pk_tr4', 'tree', 8.2, 0.8),
      it('pk_tr5', 'tree', -8.3, 1.2),
      it('pk_tr6', 'tree', 1.6, 6.2),
      it('pk_lm1', 'streetlamp', -3.2, -3.4),
      it('pk_lm2', 'streetlamp', 3.2, -3.4),
      it('pk_lm3', 'streetlamp', -3.2, 1.6),
      it('pk_lm4', 'streetlamp', 3.4, 1.8),
      it('pk_bf', 'bufe', 6.6, -5.7),
      it('pk_bt1', 'cafetable', 6.4, -2.6),
      it('pk_um', 'umbrella', 6.4, -2.6),
      it('pk_cp1', 'copkutusu', -6.9, -4.6),
      it('pk_cp2', 'copkutusu', 4.8, -2.6),
      it('pk_kd', 'kaydirak', -6.4, 4.6, 2),
      it('pk_sw', 'salincak', -3.0, 5.4),
      it('pk_gv', 'guvercin', 1.8, 2.6),
      it('pk_pt1', 'planter', -1.4, -4.6),
      it('pk_pt2', 'planter', 1.4, -4.6),
      it('pk_pt3', 'planter', 8.2, 5.2, 6),
      it('pk_fn1', 'fence', -8.0, 3.0),
      it('pk_fn2', 'fence', -6.0, 3.0),
    ],
    stations: {
      pk_bf: [{ act: 'bufe', label: '🌭 Büfe' }],
      pk_cp1: [{ act: 'npc', label: '🕶️ Şüpheli adam' }],
    },
    npcs: [
      { id: 'npc_supheli', name: 'Şüpheli Adam', x: -7.7, z: -4.2, av: AV.supheli, station: 'pk_cp1', lines: ['Psst… bakar mısın?', 'Malın varsa alırım.', 'Polise görünmeden…'] },
      // v110: büfeci kulübenin İÇİNDE (evlerdeki büfeyle aynı yer: kulübe merkezinin 0,22 m gerisi)
      { id: 'npc_bufeci', name: 'Büfeci Hasan', x: 6.6, z: -5.92, av: AV.bufeci, station: 'pk_bf', lines: ['Sıcak sosisli, tost var!', 'Çay taze demlendi.', 'Buyur abi, ne vereyim?'] },
    ],
  },
};

export const VENUE_KEYS = Object.keys(VENUES);
export const VENUE_BY_HOUSE = Object.fromEntries(Object.entries(VENUES).map(([k, v]) => [v.houseId, { key: k, ...v }]));
export const isVenueHouseId = (id) => Boolean(VENUE_BY_HOUSE[id]);
// Eski 2D koordinat sistemi (680 × 1180 px) ↔ 3D oda (18 × 14 m). Hâlâ 2D
// ekrandaki (giriş yapmamış) oyuncular ve sunucunun "yakındakiler" hesabı için.
export function venueTo2d(x, z) {
  return { x: Math.round(((x + 9) / 18) * 620 + 30), y: Math.round(((z + 7) / 14) * 1120 + 30) };
}

// v95.3 — Camii'nin "canlı" NPC'leri (imam + bugünkü dilenciler). İstemci
// (Venue3D/venueParts) ve sunucu (fotoğraf eki, functions/houses.js) AYNI
// listeyi üretir → paylaşılan fotoğraf çekilen kareyle aynı olur.
export const CAMII_IMAM_IDLE_LINES = ['Namaza gelin.', 'Cemaatle kılınan namaz daha faziletlidir.'];
export const CAMII_BEGGAR_LINES = ['Allah rızası için…', 'Hayrınıza bir yardım…', 'Allah razı olsun.'];
export function camiiDynamicNpcs({ imam = null, sermon = false, beggars = [] } = {}) {
  const list = [];
  if (imam) {
    list.push({
      id: 'npc_imam',
      name: `İmam ${imam.displayName || ''}`.trim(),
      av: imam.avatar || {},
      x: sermon ? 2.6 : 0,
      z: sermon ? -4.3 : -5.75,
      station: 'cm_mih',
      lines: sermon && imam.lastNasihat ? [String(imam.lastNasihat)] : CAMII_IMAM_IDLE_LINES,
    });
  }
  (beggars || []).slice(0, 3).forEach((b, i) => {
    list.push({
      id: `npc_dil_${b.id}`,
      name: `🤲 ${b.displayName || 'Dilenci'}`,
      av: b.avatar || {},
      x: -7.8 + i,
      z: 5.6,
      seat: `cm_dm${i + 1}:0`,
      station: 'cm_bk',
      // v127: dilenci kendi yazdığı notu söyler (not yoksa / gizlendiyse klasik cümleler)
      lines: String(b.note || '').trim() && !b.hidden ? [String(b.note).trim()] : CAMII_BEGGAR_LINES,
    });
  });
  return list;
}
