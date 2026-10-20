// =============================================================================
// v92 — Sixtagram "Şarkı Yap" (Beat Atölyesi). Ses dosyası YÜKLENMEZ: şarkı
// notaları (bölümler, sıra, enstrümanlar, tempo…) küçük bir veri olarak
// saklanır ve her telefonda aynı sentezleyiciyle yeniden çalınır. Sunucu
// (functions/index.js buildSixtagramAttachment) ve istemci (src/lib/songEngine.js,
// Sixtagram/SongMaker.jsx) bu dosyayı paylaşır.
//
// Biçim: { type:'song', v:1, title, bpm, sw, mode, kit, scale, key, dv, dm,
//          tr:[{i,v,m}]×3, pats:[{d:[7], t:[[7]×3]}]×4, song:[16] }
//   cp: bölüm modunda çalan bölüm · d / t satırları 16 adımlık bit maskesi (0–65535): bit s = s. adım dolu.
// =============================================================================
export const SONG_STEPS = 16;
export const SONG_PATTERNS = 4;
export const SONG_TRACKS = 3;
export const SONG_ROWS = 7;
export const SONG_SLOTS = 16;
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
export const SONG_INSTS = {
  piyano: { name: '🎹 Piyano' },
  synth: { name: '🎛️ Synth' },
  bas: { name: '🎸 Bas' },
  gitar: { name: '🪕 Gitar' },
  marimba: { name: '🔔 Marimba' },
  org: { name: '⛪ Org' },
  flut: { name: '🪈 Flüt' },
  chip: { name: '👾 Chip' },
  baglama: { name: '🪕 Bağlama' }, // v92 ek
  yayli: { name: '🎻 Yaylı' }, // v92 ek
  zil: { name: '🛎️ Çan' }, // v92 ek
  pad: { name: '🌌 Pad' }, // v92 ek
};
export const SONG_SCALES = {
  pent: { name: 'Pentatonik', semis: [0, 2, 4, 7, 9, 12, 14] },
  major: { name: 'Majör', semis: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Minör', semis: [0, 2, 3, 5, 7, 8, 10] },
  blues: { name: 'Blues', semis: [0, 3, 5, 6, 7, 10, 12] },
  hicaz: { name: 'Hicaz', semis: [0, 1, 4, 5, 7, 8, 10] }, // v92 ek
  nihavend: { name: 'Nihavend', semis: [0, 2, 3, 5, 7, 8, 11] }, // v92 ek
};
export const SONG_NOTE_NAMES = ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
export const SONG_BPM = { min: 60, max: 180, def: 100 };
export const SONG_TITLE_MAX = 40;

const isInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const MASK_MAX = (1 << SONG_STEPS) - 1;

export function emptySong() {
  const pats = [];
  for (let p = 0; p < SONG_PATTERNS; p++) {
    pats.push({ d: new Array(SONG_DRUMS.length).fill(0), t: [...Array(SONG_TRACKS)].map(() => new Array(SONG_ROWS).fill(0)) });
  }
  return {
    type: 'song',
    v: 1,
    title: '',
    bpm: SONG_BPM.def,
    sw: false,
    mode: 'pattern',
    cp: 0, // bölüm modunda çalan bölüm (A–D)
    kit: 'klasik',
    scale: 'minor', // v105: varsayılan ölçek Minör
    key: 0,
    dv: 80,
    dm: false,
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
  if (empty.length) return { mode: 'pattern', cp, reason: 'empty_section', emptyLetters: empty.map((v) => 'ABCD'[v] || '?') };
  return { mode: 'song', cp: s?.cp || 0, reason: 'arranged', emptyLetters: [] };
}

// Gelen şarkıyı doğrular/temizler. Geçersizse { error } döner.
// v93: allowEmpty → stüdyo projesi taslağı (henüz notası olmayan proje de kaydedilir)
// v99.1 — Firestore iç içe dizi kabul etmez (pats[].t = satır dizilerinin dizisi).
// Yazarken her satır { r: [...] } olur; okurken geri açılır. sanitizeSong iki biçimi de alır.
export function songToDoc(s) {
  if (!s || !Array.isArray(s.pats)) return s;
  return { ...s, pats: s.pats.map((p) => ({ d: [...(p.d || [])], t: (p.t || []).map((rows) => ({ r: Array.isArray(rows) ? [...rows] : rows?.r || [] })) })) };
}
export function songFromDoc(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.pats)) return s;
  return { ...s, pats: s.pats.map((p) => (p && Array.isArray(p.t) ? { ...p, t: p.t.map((rows) => (Array.isArray(rows) ? rows : rows && Array.isArray(rows.r) ? rows.r : rows)) } : p)) };
}

export function sanitizeSong(raw, allowEmpty = false) {
  const d = raw && typeof raw === 'object' ? songFromDoc(raw) : {};
  if (!isInt(d.bpm, SONG_BPM.min, SONG_BPM.max)) return { error: 'Geçersiz tempo.' };
  if (!Object.prototype.hasOwnProperty.call(SONG_KITS, d.kit)) return { error: 'Geçersiz davul seti.' };
  if (!Object.prototype.hasOwnProperty.call(SONG_SCALES, d.scale)) return { error: 'Geçersiz ölçek.' };
  if (!isInt(d.key, 0, 11)) return { error: 'Geçersiz ton.' };
  if (!isInt(d.dv, 0, 100)) return { error: 'Geçersiz ses.' };
  if (d.mode !== 'song' && d.mode !== 'pattern') return { error: 'Geçersiz mod.' };
  const cp = d.cp === undefined ? 0 : d.cp;
  if (!isInt(cp, 0, SONG_PATTERNS - 1)) return { error: 'Geçersiz bölüm.' };
  if (!Array.isArray(d.tr) || d.tr.length !== SONG_TRACKS) return { error: 'Geçersiz kanal.' };
  const tr = [];
  for (const t of d.tr) {
    if (!t || !Object.prototype.hasOwnProperty.call(SONG_INSTS, t.i) || !isInt(t.v, 0, 100)) return { error: 'Geçersiz kanal.' };
    tr.push({ i: t.i, v: t.v, m: t.m === true });
  }
  if (!Array.isArray(d.pats) || d.pats.length !== SONG_PATTERNS) return { error: 'Geçersiz bölüm.' };
  const pats = [];
  for (const p of d.pats) {
    if (!p || !Array.isArray(p.d) || p.d.length !== SONG_DRUMS.length || !p.d.every((m) => isInt(m, 0, MASK_MAX))) return { error: 'Geçersiz bölüm.' };
    if (!Array.isArray(p.t) || p.t.length !== SONG_TRACKS) return { error: 'Geçersiz bölüm.' };
    const t = [];
    for (const rows of p.t) {
      if (!Array.isArray(rows) || rows.length !== SONG_ROWS || !rows.every((m) => isInt(m, 0, MASK_MAX))) return { error: 'Geçersiz bölüm.' };
      t.push([...rows]);
    }
    pats.push({ d: [...p.d], t });
  }
  if (!Array.isArray(d.song) || d.song.length !== SONG_SLOTS || !d.song.every((v) => isInt(v, -1, SONG_PATTERNS - 1))) return { error: 'Geçersiz sıra.' };
  const out = {
    type: 'song',
    v: 1,
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
