// =============================================================================
// botData.js — v132 BOTLAR: evlere / işletmelere / ofislere konan NPC'ler
// (Lüks › Bot, 5 zümrüt). Saf modül — sunucu (houses.js botSet doğrulaması) ve
// istemci (Bot düzenleyici, 3D figür) AYNI tanımları kullanır.
//
// Bot ayarı (houses/{id}.bots[eşyaKimliği]):
//   { o: kıyafet, g: 'erkek'|'kadin', t: tip (0–3), s: ten, h: saç rengi|null,
//     md: yüz ifadesi, n: ad, l: [3 söz], mv: 'sabit'|'hareket'|'serbest', w: garson }
// Avatar: oyunun avatar şeması (src/lib/avatarShapes.js) + `botOv` (kıyafet
// üstü küçük çizimler: tepsi, önlük, yaka kartı… — beyaz listeden).
// =============================================================================

export const BOT_ITEM_KEY = 'bot';
export const BOT_LINE_MAX = 80;
export const BOT_NAME_MAX = 20;
export const BOT_LINES = 3;
export const BOT_MOVES = [
  { id: 'sabit', label: 'Sabit dur', icon: '🧍' },
  { id: 'hareket', label: 'Hareket et', icon: '🚶' },
  { id: 'serbest', label: 'Serbest gez', icon: '🗺️' },
];

export const BOT_SKINS = ['#ffe0c2', '#ffdbb0', '#f1c27d', '#e0ac69', '#c68863', '#a86b3c', '#8d5524', '#6b4226', '#5c3a21', '#3d2a1c'];
export const BOT_HAIRS = ['#0d0a08', '#2b2118', '#5c3a21', '#8a6a3a', '#b0b0b0', '#e8d98a', '#c81d3f', '#22d3ee', '#ffffff', '#ff2e88', '#4a1d5c', '#3a5f7d'];
export const BOT_MOODS = [
  ['smile', '😊'],
  ['neutral', '😐'],
  ['smirk', '😏'],
  ['open', '😮'],
];

// Meslekler — renk, varsayılan ad ve sözler
export const BOT_JOBS = [
  { id: 'garson', e: '🍽️', n: 'Garson', col: '#22d3ee', names: { erkek: 'Hasan Usta', kadin: 'Ayten Abla' }, lines: ['Çayın demli, sohbetin tatlı! Ne alırsın?', '*Tepsiyi dengeleyip masaya yaklaşır*', 'Bu çay bizden, bir de sohbet!'] },
  { id: 'esnaf', e: '🏪', n: 'Esnaf', col: '#4ade80', names: { erkek: 'Bakkal Şükrü', kadin: 'Nermin Hanım' }, lines: ['Hoş geldin, taze geldi hepsi!', '*Tezgâhı düzeltir*', 'Bereketli olsun, yine bekleriz.'] },
  { id: 'koruma', e: '🛡️', n: 'Koruma', col: '#3b82f6', names: { erkek: 'Kemal Komutan', kadin: 'Komiser Seda' }, lines: ['Kurallar basit: sakin ol, sorun çıkarma.', '*Etrafı süzer*', 'İyi geceler, dikkatli olun.'] },
  { id: 'krupiye', e: '🃏', n: 'Krupiye', col: '#facc15', names: { erkek: 'Viktor', kadin: 'Madam Sofia' }, lines: ['Bahisler açık! Şansını dene.', '*Kartları ustaca karıştırır*', 'Kazanç seninle olsun!'] },
  { id: 'supheli', e: '🕶️', n: 'Şüpheli', col: '#a855f7', names: { erkek: 'Gölge Cemil', kadin: 'Bayan Sis' }, lines: ['Şşş… Aradığın şey bende olabilir.', '*Omzunun üstünden arkaya bakar*', 'Bizi hiç görmedin.'] },
  { id: 'ofis', e: '🗂️', n: 'Sekreter / Ofis', col: '#34d399', names: { erkek: 'Caner', kadin: 'Selin Hanım' }, lines: ['Hoş geldiniz, buyurun.', '*Klavyede hızlıca yazar*', 'Notunuzu müdüre iletirim.'] },
  { id: 'mudur', e: '💼', n: 'Müdür', col: '#f59e0b', names: { erkek: 'Müdür Faruk', kadin: 'Müdire Leyla' }, lines: ['Buyurun, vaktim dar ama dinliyorum.', '*Saatine bakar*', 'Detayları sekreterimle konuşun.'] },
  { id: 'tamirci', e: '🔧', n: 'Oto Tamirci', col: '#fb923c', names: { erkek: 'Usta Recep', kadin: 'Usta Gül' }, lines: ['Araba mı dertli, sen mi?', '*Elini beziyle siler*', 'Yarım saatte hazır!'] },
  { id: 'silahci', e: '🎯', n: 'Silahçı', col: '#ef4444', names: { erkek: 'Cevdet Usta', kadin: 'Silahçı Hatice' }, lines: ['Ruhsatın tamamsa buyur, tezgâh senin.', '*Tezgâhı bezle siler*', 'Sorumlu kullan, güvenli kal.'] },
];
export const BOT_JOB_BY_ID = Object.fromEntries(BOT_JOBS.map((j) => [j.id, j]));

// Kıyafetler: x = avatar alanları (c: clothing, col: clothColor, nk: neckAcc, h: hat,
// hc: hatColor, f: faceAcc, i: heldItem, s: shoeStyle) · ov = kıyafet üstü çizimler
const O = (id, job, e, n, x, ov = []) => ({ id, job, e, n, x: { nk: 'none', h: 'none', hc: '#0d0d0d', f: 'none', i: 'yok', s: 'klasik', ...x }, ov });
export const BOT_OUTFITS = [
  O('cayci', 'garson', '🫖', 'Geleneksel Çaycı', { c: 'vest', col: '#14110f' }, ['tray']),
  O('garson1', 'garson', '🤵', 'Klasik Garson', { c: 'vest', col: '#22262f', nk: 'bow' }, ['apron:#f2efe4']),
  O('gala', 'garson', '🥂', 'Gala Garsonu', { c: 'tuxedo', col: '#22262f', nk: 'bow', i: 'kadeh' }),
  O('plaj', 'garson', '🌴', 'Plaj Garsonu', { c: 'hawaii', col: '#1d5c3a', f: 'sunglasses', s: 'sandalet', i: 'kadeh' }),
  O('diner', 'garson', '🍔', 'Retro Diner', { c: 'tanktop', col: '#e8e6df', h: 'cap', hc: '#c81d3f', s: 'spor' }, ['apron:#c81d3f']),
  O('kasiyer', 'esnaf', '🧾', 'Kasiyer', { c: 'vest', col: '#8a1d1d', nk: 'tie' }, ['badge:KASA:#1d5c3a']),
  O('manav', 'esnaf', '🍎', 'Manav', { c: 'tanktop', col: '#e8e6df', h: 'cap', hc: '#1d5c3a', s: 'spor' }, ['apron:#1d5c3a']),
  O('simitci', 'esnaf', '🥯', 'Simitçi', { c: 'vest', col: '#3a2f1d', h: 'beret', hc: '#3a2f1d' }, ['apron:#e8e6df']),
  O('polis', 'koruma', '👮', 'Polis', { c: 'police', col: '#1d3d5c', h: 'policecap', hc: '#1d3d5c', s: 'bot' }, ['star', 'radio']),
  O('bodyguard', 'koruma', '🕴️', 'Bodyguard', { c: 'suit', col: '#0d0d0d', nk: 'tie', f: 'sunglasses' }, ['radio']),
  O('guvenlik', 'koruma', '🔦', 'Özel Güvenlik', { c: 'vest', col: '#1d3d5c', h: 'cap', s: 'bot' }, ['badge:GÜVENLİK:#8a1d1d', 'radio']),
  O('ozeltim', 'koruma', '🪖', 'Özel Tim', { c: 'leather', col: '#0d0d0d', h: 'helmet', hc: '#2b2b2b', f: 'mask', nk: 'dogtag', s: 'bot' }, ['radio']),
  O('krup1', 'krupiye', '🎩', 'Klasik Krupiye', { c: 'tuxedo', col: '#5c1a24', nk: 'bow' }, ['cards']),
  O('krup2', 'krupiye', '♥️', 'Kırmızı Masa', { c: 'vest', col: '#8a1d1d', nk: 'bow' }, ['cards']),
  O('krup3', 'krupiye', '🌃', 'Neon Gece', { c: 'suit', col: '#4a1d5c', nk: 'chain' }, ['cards']),
  O('trenc', 'supheli', '🕵️', 'Trençkotlu', { c: 'trenchcoat', col: '#3a2f1d', h: 'fedora', f: 'sunglasses', i: 'canta' }),
  O('kapus', 'supheli', '🥷', 'Kapüşonlu', { c: 'hoodie', col: '#22262f', h: 'hoodup', hc: '#22262f', f: 'mask', i: 'para' }),
  O('tuccar', 'supheli', '🚬', 'Gizemli Tüccar', { c: 'leather', col: '#4a1d5c', h: 'beanie', f: 'cigar', nk: 'chain' }),
  O('sekreter', 'ofis', '📎', 'Sekreter', { c: 'suit', col: '#2b3550', nk: 'bow' }, ['clip', 'badge:SEKRETER:#1d5c3a']),
  O('personel', 'ofis', '🖥️', 'Ofis Çalışanı', { c: 'vest', col: '#4a4a4a', nk: 'tie' }, ['badge:PERSONEL:#1d3d5c', 'clip']),
  O('rahat', 'ofis', '☕', 'Rahat Cuma', { c: 'hoodie', col: '#1d3d5c', i: 'telefon', s: 'spor' }, ['badge:STAJYER:#7d7d3a']),
  O('mudur1', 'mudur', '📈', 'Müdür', { c: 'suit', col: '#22262f', nk: 'tie' }, ['badge:MÜDÜR:#b8902a']),
  O('patron', 'mudur', '🥃', 'Patron', { c: 'suit', col: '#0d0d0d', nk: 'chain', f: 'cigar', i: 'kadeh' }),
  O('tatil', 'mudur', '🏝️', 'Tatildeki Patron', { c: 'hawaii', col: '#8a1d1d', f: 'sunglasses', i: 'kadeh', s: 'sandalet' }),
  O('tulum', 'tamirci', '🛠️', 'Mavi Tulum', { c: 'jumpsuit', col: '#1d3d5c', h: 'cap', hc: '#5c1a24', s: 'bot' }, ['oil', 'wrench']),
  O('usta', 'tamirci', '🧰', 'Baş Usta', { c: 'jumpsuit', col: '#7d7d3a', h: 'bandana', hc: '#8a1d1d', s: 'bot' }, ['oil', 'wrench']),
  O('kaporta', 'tamirci', '🔥', 'Kaportacı', { c: 'tanktop', col: '#3d3d3d', h: 'helmet', hc: '#d4af37', f: 'sunglasses', s: 'bot' }, ['oil']),
  O('tezgah', 'silahci', '🏪', 'Dükkân Sahibi', { c: 'vest', col: '#3a2f1d', h: 'cap', hc: '#3a2f1d', i: 'tabanca', s: 'bot' }, ['apron:#8a6a3a']),
  O('avci', 'silahci', '🦌', 'Avcı Usta', { c: 'vest', col: '#1d5c3a', h: 'fedora', hc: '#3a2f1d', s: 'bot' }, ['bandolier']),
  O('taktik', 'silahci', '🕶️', 'Taktik Satıcı', { c: 'jumpsuit', col: '#0d0d0d', h: 'cap', f: 'sunglasses', i: 'tabanca', s: 'bot' }),
];
export const BOT_OUTFIT_BY_ID = Object.fromEntries(BOT_OUTFITS.map((o) => [o.id, o]));

// Her cinsiyet için 6 yüz / saç tipi (v132.1: daha düzgün + havalı tipler).
// Sıra önemli: kayıtlı botlar tipi dizinle (t) tutar — 0–3 eski kayıtlar da geçerli.
const TY = (n, a, hc) => ({ n, a: { eyeShape: 'almond', noseShape: 'straight', eyelash: 'none', ...a }, hc });
export const BOT_TYPES = {
  erkek: [
    TY('Klasik', { hairStyle: 'short', faceShape: 'oval', facialHair: 'none', eyebrowShape: 'straight', build: 'standart' }, '#2b2118'),
    TY('Jilet', { hairStyle: 'undercut', faceShape: 'square', facialHair: 'short', eyebrowShape: 'thick', eyeShape: 'narrow', build: 'standart' }, '#0d0a08'),
    TY('Bıyıklı Usta', { hairStyle: 'slick', faceShape: 'oval', facialHair: 'mustache', eyebrowShape: 'thick', noseShape: 'aquiline', build: 'iri' }, '#2b2118'),
    TY('Sakallı Kel', { hairStyle: 'kel', faceShape: 'square', facialHair: 'full', eyebrowShape: 'thick', eyeShape: 'hooded', build: 'iri' }, '#0d0a08'),
    TY('Yakışıklı', { hairStyle: 'wavy', faceShape: 'oval', facialHair: 'vandyke', eyebrowShape: 'angled', build: 'standart' }, '#5c3a21'),
    TY('Genç', { hairStyle: 'curly', faceShape: 'round', facialHair: 'none', eyebrowShape: 'straight', eyeShape: 'round', noseShape: 'small', build: 'zayif' }, '#2b2118'),
  ],
  kadin: [
    TY('Uzun Düz', { hairStyle: 'long', faceShape: 'oval', facialHair: 'none', eyebrowShape: 'arched', eyelash: 'natural', noseShape: 'small', build: 'standart', lipColor: '#b5525c' }, '#2b2118'),
    TY('Topuz', { hairStyle: 'bun', faceShape: 'heart', facialHair: 'none', eyebrowShape: 'arched', eyelash: 'long', noseShape: 'small', build: 'standart', lipColor: '#9a3f4a' }, '#5c3a21'),
    TY('Kısa Kesim', { hairStyle: 'pixie', faceShape: 'oval', facialHair: 'none', eyebrowShape: 'angled', eyelash: 'natural', noseShape: 'button', build: 'standart', lipColor: '#7a3048' }, '#0d0a08'),
    TY('At Kuyruğu', { hairStyle: 'ponytail', faceShape: 'oval', facialHair: 'none', eyebrowShape: 'arched', eyelash: 'long', eyeShape: 'wide', noseShape: 'small', build: 'standart', lipColor: '#c9636b' }, '#8a6a3a'),
    TY('Kıvırcık', { hairStyle: 'afro', faceShape: 'oval', facialHair: 'none', eyebrowShape: 'thick', eyelash: 'long', noseShape: 'small', build: 'standart', lipColor: '#a8484f' }, '#2b2118'),
    TY('Örgülü', { hairStyle: 'braids', faceShape: 'heart', facialHair: 'none', eyebrowShape: 'arched', eyelash: 'dramatic', noseShape: 'small', build: 'zayif', lipColor: '#8a3a3a' }, '#0d0a08'),
  ],
};

// Kıyafet üstü çizim anahtarları (renk / yazı kısmı avatarShapes'te ayrıca doğrulanır)
export const BOT_OV_KEYS = ['tray', 'apron', 'badge', 'star', 'radio', 'cards', 'clip', 'wrench', 'oil', 'bandolier'];
export const BOT_BADGE_TEXTS = ['GÜVENLİK', 'SEKRETER', 'PERSONEL', 'STAJYER', 'MÜDÜR', 'KASA'];

export const DEFAULT_BOT = Object.freeze({ o: 'cayci', g: 'erkek', t: 2, s: '#c68863', h: null, md: 'smile', n: '', l: [], mv: 'sabit', w: false });

const clip = (v, max) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// İstemciden gelen ayarı temizle (bilinmeyen değer → varsayılan). Sözler kırpılır.
export function cleanBotConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const o = BOT_OUTFIT_BY_ID[r.o] ? r.o : DEFAULT_BOT.o;
  const g = r.g === 'kadin' ? 'kadin' : 'erkek';
  const t = Number.isInteger(r.t) && r.t >= 0 && r.t < BOT_TYPES[g].length ? r.t : 0;
  const s = BOT_SKINS.includes(r.s) ? r.s : DEFAULT_BOT.s;
  const h = BOT_HAIRS.includes(r.h) ? r.h : null;
  const md = BOT_MOODS.some(([m]) => m === r.md) ? r.md : 'smile';
  const n = clip(r.n, BOT_NAME_MAX);
  const l = (Array.isArray(r.l) ? r.l : []).slice(0, BOT_LINES).map((x) => clip(x, BOT_LINE_MAX));
  while (l.length && !l[l.length - 1]) l.pop();
  const mv = BOT_MOVES.some((m) => m.id === r.mv) ? r.mv : 'sabit';
  return { o, g, t, s, h, md, n, l, mv, w: r.w === true };
}

// Yeni konan bot (ayarı yok): mesleğin varsayılan adı ve sözleri
export function botDefaults(cfg) {
  const c = cleanBotConfig(cfg);
  const job = BOT_JOB_BY_ID[BOT_OUTFIT_BY_ID[c.o].job];
  return { name: c.n || job.names[c.g], lines: c.l };
}

// Botun avatarı (oyunun avatar şeması) — yeni bot (ayar yok) varsayılan çaycı
export function botAvatar(cfg) {
  const c = cleanBotConfig(cfg);
  const ty = BOT_TYPES[c.g][c.t];
  const x = BOT_OUTFIT_BY_ID[c.o].x;
  return {
    gender: c.g,
    ...ty.a,
    skin: c.s,
    hairColor: c.h || ty.hc,
    mouthShape: c.md,
    clothing: x.c,
    clothColor: x.col,
    neckAcc: x.nk,
    hat: x.h,
    hatColor: x.hc,
    faceAcc: x.f,
    heldItem: x.i,
    shoeStyle: x.s,
    botOv: BOT_OUTFIT_BY_ID[c.o].ov,
  };
}
// v132.1 — ad etiketi: 'Hasan Usta' → 'Hasan Usta Bot' (zaten "bot" ile bitiyorsa eklenmez)
export const botLabel = (name) => {
  const n = String(name || '').trim();
  return /(^|\s)bot$/i.test(n) ? n : `${n} Bot`.trim();
};
// Garson botun servis sözleri (fotoğrafta balon olarak da kabul edilir)
export const BOT_SERVE_LINES = ['Afiyet olsun!', 'Buyurun, siparişiniz.', 'Taze taze, afiyet olsun!', 'Başka bir şey olursa seslenin.', 'Kusura bakma, olmadı…'];
// Botun söyleyebileceği tüm sözler (yeni bot: mesleğin sözleri)
export function botAllowedLines(raw) {
  const c = cleanBotConfig(raw);
  const own = raw ? c.l.filter(Boolean) : BOT_JOB_BY_ID[BOT_OUTFIT_BY_ID[c.o].job].lines;
  return [...own, ...BOT_SERVE_LINES];
}
export const botJobOf = (cfg) => BOT_JOB_BY_ID[BOT_OUTFIT_BY_ID[cleanBotConfig(cfg).o].job];
