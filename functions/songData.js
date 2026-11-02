// =============================================================================
// v92 — Sixtagram "Şarkı Yap" (Beat Atölyesi). Ses dosyası YÜKLENMEZ: şarkı
// notaları (bölümler, sıra, enstrümanlar, tempo…) küçük bir veri olarak
// saklanır ve her telefonda aynı sentezleyiciyle yeniden çalınır. Sunucu
// (functions/index.js buildSixtagramAttachment) ve istemci (src/lib/songEngine.js,
// Sixtagram/SongMaker.jsx) bu dosyayı paylaşır.
//
// Biçim v2 (v140): { type:'song', v:2, title, bpm, sw, mode, cp, kit, scale, key, dv, dm, rv,
//          tr:[{i,v,m}]×(3–5), pats:[{d:[7], t:[[22]×kanal], l:[[22]×kanal]}]×(4–8), song:[16] }
//   cp: bölüm modunda çalan bölüm · d / t / l satırları 16 adımlık bit maskesi (0–65535): bit s = s. adım.
//   t: o adımda nota çalıyor · l: o adım bir önceki adımın DEVAMI (uzun nota). Nota başı = t & ~l.
//   rv: yankı (0–100). v1 (eski) biçim: 3 kanal, 4 bölüm, 7 satır, l yok — sanitizeSong /
//   normalizeSong v2'ye çevirir.
// =============================================================================
export const SONG_STEPS = 16;
// v140 — bölüm 4 → 8'e, kanal 3 → 5'e, nota 1 oktavdan 3 oktava çıkabilir. Sıra 16 kutu kalır.
// Eski (v1) şarkılar aynen çalar: normalizeSong eski 7 satırı orta oktava yerleştirir.
export const SONG_PATTERNS_MIN = 4;
export const SONG_PATTERNS = 8; // en fazla
export const SONG_TRACKS_MIN = 3;
export const SONG_TRACKS = 5; // en fazla
export const SONG_SLOTS = 16;
export const SONG_ROWS = 22; // satır 0 = en tiz. Ölçek dizisinde j = 14 - satır (j = 0 → Do)
export const SONG_ROWS_V1 = 7; // v1: tek oktav
export const SONG_ROW_V1_OFFSET = 8; // v1 satır r → v2 satır r + 8
export const SONG_LETTERS = 'ABCDEFGH';
export const SONG_REVERB_DEF = 25;
export const SONG_DRUMS = [
  { id: 'kick', name: 'Kick', color: '#ff6f91' },
  { id: 'snare', name: 'Snare', color: '#ff8a5c' },
  { id: 'hat', name: 'Hi-hat', color: '#ffb347' },
  { id: 'ohat', name: 'Açık hat', color: '#f7c948' },
  { id: 'clap', name: 'Alkış', color: '#f26ca7' },
  { id: 'tom', name: 'Tom', color: '#e05cd6' },
  { id: 'perc', name: 'Perc', color: '#ff7a7a' },
];
export const SONG_KITS = {
  klasik: { name: 'Klasik' },
  t808: { name: '808' },
  elektro: { name: 'Elektro' },
  lofi: { name: 'Lo-fi' },
  rock: { name: 'Rock' },
  trap: { name: 'Trap' },
  oryantal: { name: 'Darbuka' }, // v92 ek
  arcade: { name: 'Arcade' }, // v92 ek
};
// v140 — cat: arayüzdeki grup (temel / duygusal / hareketli) · hold: uzun notaya uygun
// (seçilince araç "Uzun nota"ya geçer) · chord: tek kutu = ölçekten üçlü akor
export const SONG_INST_CATS = [
  { id: 'temel', name: 'Temel' },
  { id: 'duygusal', name: '💜 Duygusal' },
  { id: 'hareketli', name: '⚡ Hareketli' },
];
export const SONG_INSTS = {
  piyano: { name: '🎹 Piyano', cat: 'temel' },
  synth: { name: '🎛️ Synth', cat: 'temel' },
  bas: { name: '🎸 Bas', cat: 'temel' },
  gitar: { name: '🪕 Gitar', cat: 'temel' },
  marimba: { name: '🔔 Marimba', cat: 'temel' },
  org: { name: '⛪ Org', cat: 'temel', hold: true },
  flut: { name: '🪈 Flüt', cat: 'temel', hold: true },
  chip: { name: '👾 Chip', cat: 'temel' },
  baglama: { name: '🪕 Bağlama', cat: 'temel' }, // v92 ek
  yayli: { name: '🎻 Yaylı', cat: 'temel', hold: true }, // v92 ek
  zil: { name: '🛎️ Çan', cat: 'temel' }, // v92 ek
  pad: { name: '🌌 Pad', cat: 'temel', hold: true }, // v92 ek
  // v140 — duygusal
  keman: { name: '🎻 Keman', cat: 'duygusal', hold: true },
  cello: { name: '🎻 Çello', cat: 'duygusal', hold: true },
  epiano: { name: '🎹 Elektrik Piyano', cat: 'duygusal' },
  koro: { name: '🎤 Koro', cat: 'duygusal', hold: true },
  ney: { name: '🪈 Ney', cat: 'duygusal', hold: true },
  kutu: { name: '🎐 Müzik Kutusu', cat: 'duygusal' },
  akorpiyano: { name: '🎹 Akor Piyano', cat: 'duygusal', chord: true },
  yayliakor: { name: '🌅 Yaylı Akor', cat: 'duygusal', hold: true, chord: true },
  // v140 — hareketli
  supersaw: { name: '⚡ Süper Saw', cat: 'hareketli', hold: true },
  pluck: { name: '💎 Pluck', cat: 'hareketli' },
  bas808: { name: '🔊 808 Bas', cat: 'hareketli' },
  acid: { name: '🧪 Acid Bas', cat: 'hareketli' },
  egitar: { name: '🎸 Elektro Gitar', cat: 'hareketli', hold: true },
  nefesli: { name: '🎺 Nefesli', cat: 'hareketli' },
  akorstab: { name: '💥 Akor Stab', cat: 'hareketli', chord: true },
};
// semis: v1 uyumu (eski 7 satır) · oct: bir oktavdaki perdeler — satırlar bu diziyle oktav oktav dizilir
export const SONG_SCALES = {
  pent: { name: 'Pentatonik', semis: [0, 2, 4, 7, 9, 12, 14], oct: [0, 2, 4, 7, 9] },
  major: { name: 'Majör', semis: [0, 2, 4, 5, 7, 9, 11], oct: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Minör', semis: [0, 2, 3, 5, 7, 8, 10], oct: [0, 2, 3, 5, 7, 8, 10] },
  blues: { name: 'Blues', semis: [0, 3, 5, 6, 7, 10, 12], oct: [0, 3, 5, 6, 7, 10] },
  hicaz: { name: 'Hicaz', semis: [0, 1, 4, 5, 7, 8, 10], oct: [0, 1, 4, 5, 7, 8, 10] }, // v92 ek
  nihavend: { name: 'Nihavend', semis: [0, 2, 3, 5, 7, 8, 11], oct: [0, 2, 3, 5, 7, 8, 11] }, // v92 ek
  kurdi: { name: 'Kürdi', semis: [0, 1, 3, 5, 7, 8, 10], oct: [0, 1, 3, 5, 7, 8, 10] }, // v140 ek
  dorian: { name: 'Dorian', semis: [0, 2, 3, 5, 7, 9, 10], oct: [0, 2, 3, 5, 7, 9, 10] }, // v140 ek
};
export const SONG_NOTE_NAMES = ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
export const SONG_BPM = { min: 60, max: 180, def: 100 };
export const SONG_TITLE_MAX = 40;

// v140 — satırın ölçek içi sırası (j: 0 = Do, + tiz, − pes) ve perdesi (Do4'e göre yarım ses)
export const rowDegree = (row) => SONG_ROW_V1_OFFSET + SONG_ROWS_V1 - 1 - row;
export function degreePitch(scale, j) {
  const oct = (SONG_SCALES[scale] || SONG_SCALES.pent).oct;
  const n = oct.length;
  const o = Math.floor(j / n);
  return oct[j - o * n] + 12 * o;
}
export const rowPitch = (scale, row) => degreePitch(scale, rowDegree(row));

const isInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const MASK_MAX = (1 << SONG_STEPS) - 1;
// devam biti ancak o adım ve bir önceki adım doluysa geçerli
export const fixTie = (t, l) => l & t & (t << 1) & MASK_MAX;

export const emptyRows = () => new Array(SONG_ROWS).fill(0);
export function emptyPattern(tracks = SONG_TRACKS_MIN) {
  return { d: new Array(SONG_DRUMS.length).fill(0), t: [...Array(tracks)].map(emptyRows), l: [...Array(tracks)].map(emptyRows) };
}

export function emptySong() {
  const pats = [];
  for (let p = 0; p < SONG_PATTERNS_MIN; p++) pats.push(emptyPattern(SONG_TRACKS_MIN));
  return {
    type: 'song',
    v: 2,
    title: '',
    bpm: SONG_BPM.def,
    sw: false,
    mode: 'pattern',
    cp: 0, // bölüm modunda çalan bölüm
    kit: 'klasik',
    scale: 'minor', // v105: varsayılan ölçek Minör
    key: 0,
    dv: 80,
    dm: false,
    rv: SONG_REVERB_DEF,
    tr: [
      { i: 'piyano', v: 80, m: false },
      { i: 'bas', v: 80, m: false },
      { i: 'synth', v: 80, m: false },
    ],
    pats,
    song: new Array(SONG_SLOTS).fill(-1),
  };
}

export function songHasNotes(s) {
  return (s?.pats || []).some((p) => (p.d || []).some(Boolean) || (p.t || []).some((t) => (t || []).some(Boolean)));
}

// v105 — PAYLAŞIM MODU ekrandaki "Şarkı/Bölüm modu" düğmesinden bağımsız:
//   • sırada (aranje) en az bir bölüm varsa ve sıradaki HER bölüm doluysa → şarkı (aranje) olarak
//   • sıra boşsa ya da sırada boş bir bölüm varsa (ör. C sırada ama C bomboş) → bölüm modu
// Bölüm modunda seçili bölüm boşsa ilk dolu bölüm çalar.
// Döner: { mode, cp, reason: 'arranged' | 'no_arrangement' | 'empty_section', emptyLetters }
const patternHasNotes = (p) => Boolean(p) && ((p.d || []).some(Boolean) || (p.t || []).some((rows) => (rows || []).some(Boolean)));
export function shareModeOf(s) {
  const pats = s?.pats || [];
  const used = (s?.song || []).filter((v) => Number.isInteger(v) && v >= 0);
  const firstFull = Math.max(0, pats.findIndex(patternHasNotes));
  const cp = patternHasNotes(pats[s?.cp || 0]) ? s?.cp || 0 : firstFull;
  if (!used.length) return { mode: 'pattern', cp, reason: 'no_arrangement', emptyLetters: [] };
  const empty = [...new Set(used.filter((v) => !patternHasNotes(pats[v])))].sort();
  if (empty.length) return { mode: 'pattern', cp, reason: 'empty_section', emptyLetters: empty.map((v) => SONG_LETTERS[v] || '?') };
  return { mode: 'song', cp: s?.cp || 0, reason: 'arranged', emptyLetters: [] };
}

// v99.1 — Firestore iç içe dizi kabul etmez (pats[].t = satır dizilerinin dizisi).
// Yazarken her satır { r: [...] } olur; okurken geri açılır. sanitizeSong iki biçimi de alır.
// v140: pats[].l (uzun nota) de aynı şekilde.
const wrapRows = (arr) => (arr || []).map((rows) => ({ r: Array.isArray(rows) ? [...rows] : rows?.r || [] }));
const unwrapRows = (arr) => arr.map((rows) => (Array.isArray(rows) ? rows : rows && Array.isArray(rows.r) ? rows.r : rows));
export function songToDoc(s) {
  if (!s || !Array.isArray(s.pats)) return s;
  return { ...s, pats: s.pats.map((p) => ({ d: [...(p.d || [])], t: wrapRows(p.t), ...(Array.isArray(p.l) ? { l: wrapRows(p.l) } : {}) })) };
}
export function songFromDoc(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.pats)) return s;
  return {
    ...s,
    pats: s.pats.map((p) => {
      if (!p || !Array.isArray(p.t)) return p;
      const o = { ...p, t: unwrapRows(p.t) };
      if (Array.isArray(p.l)) o.l = unwrapRows(p.l);
      return o;
    }),
  };
}

// Gelen şarkıyı doğrular/temizler ve v2 biçimine çevirir. Geçersizse { error } döner.
// v93: allowEmpty → stüdyo projesi taslağı (henüz notası olmayan proje de kaydedilir)
export function sanitizeSong(raw, allowEmpty = false) {
  const d = raw && typeof raw === 'object' ? songFromDoc(raw) : {};
  if (!isInt(d.bpm, SONG_BPM.min, SONG_BPM.max)) return { error: 'Geçersiz tempo.' };
  if (!Object.prototype.hasOwnProperty.call(SONG_KITS, d.kit)) return { error: 'Geçersiz davul seti.' };
  if (!Object.prototype.hasOwnProperty.call(SONG_SCALES, d.scale)) return { error: 'Geçersiz ölçek.' };
  if (!isInt(d.key, 0, 11)) return { error: 'Geçersiz ton.' };
  if (!isInt(d.dv, 0, 100)) return { error: 'Geçersiz ses.' };
  if (d.mode !== 'song' && d.mode !== 'pattern') return { error: 'Geçersiz mod.' };
  const rv = d.rv === undefined ? SONG_REVERB_DEF : d.rv;
  if (!isInt(rv, 0, 100)) return { error: 'Geçersiz yankı.' };
  if (!Array.isArray(d.tr) || d.tr.length < SONG_TRACKS_MIN || d.tr.length > SONG_TRACKS) return { error: 'Geçersiz kanal.' };
  const tr = [];
  for (const t of d.tr) {
    if (!t || !Object.prototype.hasOwnProperty.call(SONG_INSTS, t.i) || !isInt(t.v, 0, 100)) return { error: 'Geçersiz kanal.' };
    tr.push({ i: t.i, v: t.v, m: t.m === true });
  }
  const T = tr.length;
  if (!Array.isArray(d.pats) || d.pats.length < SONG_PATTERNS_MIN || d.pats.length > SONG_PATTERNS) return { error: 'Geçersiz bölüm.' };
  const okMask = (m) => isInt(m, 0, MASK_MAX);
  const pats = [];
  for (const p of d.pats) {
    if (!p || !Array.isArray(p.d) || p.d.length !== SONG_DRUMS.length || !p.d.every(okMask)) return { error: 'Geçersiz bölüm.' };
    if (!Array.isArray(p.t) || p.t.length !== T) return { error: 'Geçersiz bölüm.' };
    const t = [];
    const l = [];
    for (let k = 0; k < T; k++) {
      const rows = p.t[k];
      if (!Array.isArray(rows) || !rows.every(okMask)) return { error: 'Geçersiz bölüm.' };
      let tRows;
      let lRows;
      if (rows.length === SONG_ROWS_V1) {
        // v1: tek oktav → orta oktava
        tRows = emptyRows();
        rows.forEach((m, r) => (tRows[r + SONG_ROW_V1_OFFSET] = m));
        lRows = emptyRows();
      } else if (rows.length === SONG_ROWS) {
        tRows = [...rows];
        const lr = Array.isArray(p.l) ? p.l[k] : null;
        if (lr != null && (!Array.isArray(lr) || lr.length !== SONG_ROWS || !lr.every(okMask))) return { error: 'Geçersiz bölüm.' };
        lRows = tRows.map((m, r) => (lr ? fixTie(m, lr[r]) : 0));
      } else return { error: 'Geçersiz bölüm.' };
      t.push(tRows);
      l.push(lRows);
    }
    pats.push({ d: [...p.d], t, l });
  }
  const P = pats.length;
  if (!Array.isArray(d.song) || d.song.length !== SONG_SLOTS || !d.song.every((v) => isInt(v, -1, P - 1))) return { error: 'Geçersiz sıra.' };
  const cp = d.cp === undefined ? 0 : d.cp;
  if (!isInt(cp, 0, P - 1)) return { error: 'Geçersiz bölüm.' };
  const out = {
    type: 'song',
    v: 2,
    title: String(typeof d.title === 'string' ? d.title : '')
      .replace(/[\u0000-\u001f]/g, '')
      .trim()
      .slice(0, SONG_TITLE_MAX),
    bpm: d.bpm,
    sw: d.sw === true,
    mode: d.mode,
    cp,
    kit: d.kit,
    scale: d.scale,
    key: d.key,
    dv: d.dv,
    dm: d.dm === true,
    rv,
    tr,
    pats,
    song: [...d.song],
  };
  if (!songHasNotes(out)) {
    if (allowEmpty) return { song: out };
    return { error: 'Boş şarkı paylaşılamaz — önce birkaç kutu doldur.' };
  }
  if (allowEmpty) {
    // proje taslağı: oyuncunun seçtiği mod korunur
    if (out.mode === 'song' && !out.song.some((v) => v >= 0)) out.mode = 'pattern';
    if (!patternHasNotes(out.pats[out.cp])) out.cp = Math.max(0, out.pats.findIndex(patternHasNotes));
    return { song: out };
  }
  // v105: paylaşım — mod aranjeye göre otomatik (bkz. shareModeOf)
  const sm = shareModeOf(out);
  out.mode = sm.mode;
  out.cp = sm.cp;
  return { song: out };
}

// v140 — akıştaki (eski ya da yeni) şarkıyı çalmaya hazır v2 biçimine getirir.
// Doğrulanamayan veri olduğu gibi döner (eski davranış).
export function normalizeSong(s) {
  if (!s || typeof s !== 'object') return s;
  const r = sanitizeSong(s, true);
  if (r.error) return s;
  // sanitize paylaşım modunu korur (allowEmpty), ama boş bölüm seçimini düzeltebilir — akışta istenen bu
  return { ...r.song, mode: s.mode === 'song' || s.mode === 'pattern' ? s.mode : r.song.mode };
}

// Şarkının çalma süresi (sn) — akışta gösterilir. Bölüm modunda 4 tur.
export function songDurationSec(s) {
  const stepSec = 60 / (s?.bpm || SONG_BPM.def) / 4;
  let bars = 4;
  if (s?.mode === 'song') {
    let L = 0;
    (s.song || []).forEach((v, i) => {
      if (v >= 0) L = i + 1;
    });
    bars = Math.max(1, L);
  }
  return bars * SONG_STEPS * stepSec;
}
