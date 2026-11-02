import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SONG_STEPS,
  SONG_ROWS,
  SONG_DRUMS,
  SONG_KITS,
  SONG_INSTS,
  SONG_INST_CATS,
  SONG_SCALES,
  SONG_NOTE_NAMES,
  SONG_BPM,
  SONG_TITLE_MAX,
  SONG_PATTERNS,
  SONG_TRACKS,
  SONG_TRACKS_MIN,
  SONG_LETTERS,
  SONG_REVERB_DEF,
  emptySong,
  emptyPattern,
  emptyRows,
  normalizeSong,
  rowPitch,
  fixTie,
  songHasNotes,
  shareModeOf,
} from '../../../functions/songData.js';
import { startSong, previewDrum, previewNote, demoKit, demoNotes, bit, songLength } from '../../lib/songEngine';
import { createPortal } from 'react-dom';
import { songShareInfo } from '../../lib/songShare';
import './SongMaker.css';

// =============================================================================
// v92 — Sixtagram "Şarkı Yap" (Beat Atölyesi). Prototipteki her şey:
//   • 4 bölüm (A–D), 16 kutuluk sıra (şarkı), bölüm kopyala / temizle / sırayı boşalt
//   • 16 adım (1–8 · 9–16 sekmeleri), çalarken sayfayı takip eder, nokta göstergesi
//   • Davul: 7 satır, setler, ses, sessiz · Enstrüman: 3 kanal (her biri ayrı
//     enstrüman, ses, sessiz), 7 nota satırı, ölçek
//   • Dokun / sürükleyerek boya, dokununca ses önizleme, geri al / ileri al (Ctrl+Z)
//   • Bölüm modu / Şarkı modu, Swing, tempo 60–180
// v92 ekleri: Darbuka ve Arcade setleri; Bağlama, Yaylı, Çan, Pad; Hicaz ve
// Nihavend ölçekleri; ton seçimi; hazır ritimler; şarkı adı.
// v140 — 8 bölüm (A–H), 5 kanal, 3 oktav (Tiz / Orta / Pes / Hepsi),
//   tek nota ↔ uzun nota aracı, davul / kanal "Sıfırla" (sadece seçili bölümde),
//   enstrüman grupları (Temel / Duygusal / Hareketli), yankı, 16 adımı birlikte gösterme.
// =============================================================================
const PER_PAGE = 8;
const LETTERS = SONG_LETTERS.split('');
const PAT_COLORS = ['#ff6f91', '#6aaeff', '#4fe3b3', '#ffd447', '#c38bff', '#ff9f5a', '#5fd4ff', '#b8e05a'];
const TRK_HUES = [260, 150, 195, 30, 330];
const trackColor = (k, row) => `hsl(${TRK_HUES[k % TRK_HUES.length] + (row - 11) * 2},78%,${74 - row * 1.4}%)`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const setBit = (mask, s, on) => (on ? mask | (1 << s) : mask & ~(1 << s));
const patHas = (p) => p.d.some(Boolean) || p.t.some((rows) => rows.some(Boolean));
const NEW_TRACK_INST = ['epiano', 'keman', 'pad', 'koro'];
// oktav görünümleri: satır aralıkları (satır 0 = en tiz)
const OCT_VIEWS = [
  { id: 'high', name: 'Tiz ▲', from: 0, to: 7 },
  { id: 'mid', name: 'Orta', from: 8, to: 14 },
  { id: 'low', name: 'Pes ▼', from: 15, to: 21 },
  { id: 'all', name: 'Hepsi', from: 0, to: SONG_ROWS - 1 },
];
// nota sınırları: s adımının ait olduğu notanın başı / sonu (l = devam maskesi)
const noteStart = (l, s) => {
  let a = s;
  while (a > 0 && bit(l, a)) a--;
  return a;
};
const noteEnd = (l, s) => {
  let b = s;
  while (b + 1 < SONG_STEPS && bit(l, b + 1)) b++;
  return b;
};
// satırdaki (t, l) çiftinden s'deki notayı tamamen sil
function delNote(t, l, s) {
  if (!bit(t, s)) return [t, l];
  const a = noteStart(l, s);
  const b = noteEnd(l, s);
  for (let i = a; i <= b; i++) {
    t = setBit(t, i, false);
    l = setBit(l, i, false);
  }
  return [t, fixTie(t, l)];
}
// a..b arasına tek uzun nota koy (çakışan notalar silinir)
function putLong(t, l, a, b) {
  for (let i = a; i <= b; i++) [t, l] = delNote(t, l, i);
  for (let i = a; i <= b; i++) {
    t = setBit(t, i, true);
    l = setBit(l, i, i > a);
  }
  if (b + 1 < SONG_STEPS) l = setBit(l, b + 1, false);
  return [t, fixTie(t, l)];
}

// hazır ritimler (davul satırları: kick, snare, hat, ohat, clap, tom, perc)
const M = (steps) => steps.reduce((m, s) => m | (1 << s), 0);
const PRESETS = {
  pop: { name: 'Pop', d: [M([0, 8, 10]), M([4, 12]), M([0, 2, 4, 6, 8, 10, 12, 14]), 0, 0, 0, 0] },
  hiphop: { name: 'Hip-hop', d: [M([0, 7, 10]), M([4, 12]), M([0, 2, 4, 6, 8, 10, 12, 14]), M([14]), 0, 0, M([11])] },
  trap: { name: 'Trap', d: [M([0, 11]), 0, M([0, 2, 3, 4, 6, 8, 10, 11, 12, 13, 14, 15]), 0, M([8]), 0, 0] },
  halay: { name: 'Halay', d: [M([0, 3, 6, 8, 11, 14]), 0, 0, 0, M([4, 12]), M([2, 10]), M([7, 15])] },
  dans: { name: 'Dans', d: [M([0, 4, 8, 12]), 0, M([2, 6, 10, 14]), M([2, 6, 10, 14]), M([4, 12]), 0, 0] },
};

function snapOf(s) {
  return JSON.stringify({ p: s.pats, s: s.song, k: s.kit, c: s.scale, i: s.tr.map((t) => t.i), key: s.key });
}
function restoreInto(s, str) {
  const o = JSON.parse(str);
  const n = clone(s);
  n.pats = o.p;
  n.song = o.s;
  n.kit = o.k;
  n.scale = o.c;
  n.key = o.key;
  // v140: kanal sayısı değişmiş olabilir — ses / sessiz ayarı aynı sıradaki kanaldan
  n.tr = o.i.map((v, i) => ({ v: 80, m: false, ...(s.tr[i] || {}), i: v }));
  n.cp = Math.min(n.cp || 0, n.pats.length - 1);
  return n;
}

// v93 — Müzik stüdyosu modu: onChange(şarkı) her değişiklikte (otomatik kayıt),
// toolbar (paylaş / indir / projeler), topRight ("Bitti" yerine kayıt durumu), title.
export default function SongMaker({ initial, onCancel, onDone, onChange, toolbar = null, topRight = null, title = '🎵 Beat Atölyesi', subtitle = 'Bölümleri kur, sıraya diz, şarkına dönüştür.', getSongRef = null }) {
  const [song, setSong] = useState(() => (initial?.pats ? clone(normalizeSong(initial)) : emptySong()));
  const songRef = useRef(song);
  songRef.current = song;
  if (getSongRef) getSongRef.current = () => songRef.current;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    onChangeRef.current?.(song);
  }, [song]);
  const [curTrackRaw, setCurTrack] = useState(0);
  const curTrack = Math.min(curTrackRaw, song.tr.length - 1);
  const [page, setPage] = useState(0); // 0: 1–8 · 1: 9–16 · 2: hepsi (16)
  const [noteMode, setNoteMode] = useState(() => (SONG_INSTS[song.tr[0]?.i]?.hold ? 'long' : 'short'));
  const [octView, setOctView] = useState('mid');
  const [instCat, setInstCat] = useState(() => SONG_INSTS[song.tr[0]?.i]?.cat || 'temel');
  const [copyMode, setCopyMode] = useState(false);
  const [hint, setHintState] = useState({ text: '', undo: false });
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState({ s: -1, bar: -1, pi: -1 });
  const [err, setErr] = useState('');
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const [, setHistTick] = useState(0);
  const playerRef = useRef(null);
  const hintTimer = useRef(0);
  const curPat = Math.min(song.cp || 0, song.pats.length - 1);

  // --- ipucu satırı (geri al butonlu) ---
  const setHint = useCallback((text, keep = false, undoable = false) => {
    setHintState({ text, undo: undoable && Boolean(text) });
    clearTimeout(hintTimer.current);
    if (!keep) hintTimer.current = setTimeout(() => setHintState({ text: '', undo: false }), undoable ? 6000 : 3200);
  }, []);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  // --- geçmiş ---
  const commit = useCallback((before, next) => {
    if (snapOf(next) === before) return false;
    undoRef.current.push(before);
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current.length = 0;
    setHistTick((n) => n + 1);
    return true;
  }, []);
  // change(fn): fn(taslak) şarkıyı değiştirir; geçmişe yazılır
  const change = useCallback(
    (fn) => {
      const before = snapOf(songRef.current);
      const next = clone(songRef.current);
      fn(next);
      songRef.current = next;
      setSong(next);
      return commit(before, next);
    },
    [commit]
  );
  // ayar (geçmişe yazılmaz: ses, sessiz, tempo, swing, mod, seçili bölüm)
  const tweak = useCallback((fn) => {
    const next = clone(songRef.current);
    fn(next);
    songRef.current = next;
    setSong(next);
  }, []);
  const undo = useCallback(() => {
    if (!undoRef.current.length) return;
    redoRef.current.push(snapOf(songRef.current));
    const n = restoreInto(songRef.current, undoRef.current.pop());
    songRef.current = n;
    setSong(n);
    setCopyMode(false);
    setHistTick((x) => x + 1);
    setHint('Geri alındı.');
  }, [setHint]);
  const redo = useCallback(() => {
    if (!redoRef.current.length) return;
    undoRef.current.push(snapOf(songRef.current));
    const n = restoreInto(songRef.current, redoRef.current.pop());
    songRef.current = n;
    setSong(n);
    setCopyMode(false);
    setHistTick((x) => x + 1);
    setHint('İleri alındı.');
  }, [setHint]);

  // --- çalma ---
  const stop = useCallback(() => {
    playerRef.current?.stop();
    playerRef.current = null;
    setPlaying(false);
    setCur({ s: -1, bar: -1, pi: -1 });
  }, []);
  const start = useCallback(() => {
    const s = songRef.current;
    if (s.mode === 'song' && songLength(s) === 0) {
      setHint('Sıra boş. Önce bölümleri kutulara yerleştir.');
      return;
    }
    const h = startSong(() => songRef.current, {
      loop: true,
      onStep: (q) => setCur(q),
    });
    if (!h) {
      setHint('Bu cihazda ses çalınamıyor.');
      return;
    }
    playerRef.current = h;
    setPlaying(true);
  }, [setHint]);
  useEffect(() => () => playerRef.current?.stop(), []);
  useEffect(() => {
    const onVis = () => document.hidden && stop();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [stop]);
  // çalarken sayfa takip
  useEffect(() => {
    if (cur.s < 0) return;
    if (page !== 2 && (song.mode === 'pattern' || cur.pi === curPat)) {
      const p = Math.floor(cur.s / PER_PAGE);
      if (p !== page) setPage(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);
  const showHead = cur.s >= 0 && (song.mode === 'pattern' || cur.pi === curPat);
  const shareInfo = useMemo(() => songShareInfo(song), [song]);

  // --- klavye: Ctrl+Z / Ctrl+Shift+Z ---
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // --- ızgara: dokun ve sürükle ---
  // Davul: dokun = aç/kapa, sürükle = boya. Enstrüman "Tek nota": aynı; dolu kutuya dokununca
  // (uzunsa) notanın tamamı silinir. "Uzun nota": boş kutudan sürükle = o uzunlukta tek nota,
  // dokun = 1 vuruş (4 adım), notanın üstünden sürükle = uzat/kısalt, dokun = sil.
  const dragRef = useRef(null);
  const modeRef = useRef(noteMode);
  modeRef.current = noteMode;
  const curTrackRef = useRef(curTrack);
  curTrackRef.current = curTrack;
  const patOf = (n) => n.pats[Math.min(n.cp || 0, n.pats.length - 1)];
  const cellOn = (kind, idx, s) => {
    const P = patOf(songRef.current);
    return bit(kind === 'drum' ? P.d[idx] : P.t[curTrackRef.current][idx], s);
  };
  // fn(t, l) → [t, l] — seçili kanalın idx satırını değiştirir
  const editRow = (idx, fn) => {
    const next = clone(songRef.current);
    const P = patOf(next);
    const k = curTrackRef.current;
    const [t, l] = fn(P.t[k][idx], P.l[k][idx]);
    P.t[k][idx] = t;
    P.l[k][idx] = fixTie(t, l);
    songRef.current = next;
    setSong(next);
  };
  const setCellRaw = (kind, idx, s, on) => {
    if (kind === 'drum') {
      const next = clone(songRef.current);
      const P = patOf(next);
      P.d[idx] = setBit(P.d[idx], s, on);
      songRef.current = next;
      setSong(next);
      return;
    }
    editRow(idx, (t, l) => (on ? [setBit(t, s, true), setBit(l, s, false)] : [setBit(t, s, false), l]));
  };
  const rowTL = (idx) => {
    const P = patOf(songRef.current);
    const k = curTrackRef.current;
    return [P.t[k][idx], P.l[k][idx]];
  };
  const preview = (kind, idx, steps = 1) => {
    if (playerRef.current) return;
    if (kind === 'drum') previewDrum(songRef.current, idx);
    else previewNote(songRef.current, curTrackRef.current, idx, steps);
  };
  const cellFromEl = (el) => {
    const c = el?.closest?.('[data-cell]');
    if (!c) return null;
    return { kind: c.dataset.kind, idx: Number(c.dataset.idx), s: Number(c.dataset.s) };
  };
  const onCellDown = (e) => {
    const c = cellFromEl(e.target);
    if (!c) return;
    const long = c.kind === 'mel' && modeRef.current === 'long';
    const d = { cell: c, last: c, painting: false, value: false, before: snapOf(songRef.current), id: e.pointerId, long };
    if (long) {
      const [t, l] = rowTL(c.idx);
      d.base = [t, l];
      // dolu notanın üstünden başlarsa: o notayı uzat / kısalt
      if (bit(t, c.s)) d.resize = { a: noteStart(l, c.s) };
    }
    dragRef.current = d;
  };
  // tek dokunuş (sürüklemeden)
  const tapCell = (c) => {
    if (c.kind === 'drum') {
      const on = !cellOn('drum', c.idx, c.s);
      setCellRaw('drum', c.idx, c.s, on);
      if (on) preview('drum', c.idx);
      return;
    }
    const [t] = rowTL(c.idx);
    if (bit(t, c.s)) {
      editRow(c.idx, (tt, ll) => delNote(tt, ll, c.s));
      return;
    }
    if (modeRef.current === 'long') {
      // 1 vuruş (4 adım); sonraki notadan ya da ölçü sonundan önce biter
      let b = c.s;
      while (b + 1 < SONG_STEPS && b - c.s < 3 && !bit(t, b + 1)) b++;
      editRow(c.idx, (tt, ll) => putLong(tt, ll, c.s, b));
      preview('mel', c.idx, b - c.s + 1);
    } else {
      setCellRaw('mel', c.idx, c.s, true);
      preview('mel', c.idx);
    }
  };
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) return;
      const c = cellFromEl(document.elementFromPoint(e.clientX, e.clientY));
      if (!c || (c.s === d.last.s && c.kind === d.last.kind && c.idx === d.last.idx)) return;
      if (c.kind !== d.cell.kind || c.idx !== d.cell.idx) return; // aynı satırda
      if (d.long) {
        d.painting = true;
        const [t0, l0] = d.base;
        if (d.resize) {
          const a = d.resize.a;
          const b = Math.max(a, c.s);
          editRow(c.idx, () => {
            const [t1, l1] = delNote(t0, l0, a);
            return putLong(t1, l1, a, b);
          });
        } else {
          const a = Math.min(d.cell.s, c.s);
          const b = Math.max(d.cell.s, c.s);
          editRow(c.idx, () => putLong(t0, l0, a, b));
        }
        d.last = c;
        return;
      }
      if (!d.painting) {
        d.painting = true;
        d.value = !cellOn(d.cell.kind, d.cell.idx, d.cell.s);
        setCellRaw(d.cell.kind, d.cell.idx, d.cell.s, d.value);
        preview(d.cell.kind, d.cell.idx);
      }
      const lo = Math.min(d.last.s, c.s);
      const hi = Math.max(d.last.s, c.s);
      for (let s = lo; s <= hi; s++) setCellRaw(c.kind, c.idx, s, d.value);
      d.last = c;
    };
    const end = (e, cancelled) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) return;
      dragRef.current = null;
      if (!d.painting) {
        if (cancelled) return; // sayfa kaydırıldı: dokunuş sayılmaz
        tapCell(d.cell);
        commit(d.before, songRef.current);
      } else {
        if (d.long) {
          const [t, l] = rowTL(d.cell.idx);
          const s0 = d.resize ? d.resize.a : Math.min(d.cell.s, d.last.s);
          if (bit(t, s0)) preview('mel', d.cell.idx, noteEnd(l, s0) - s0 + 1);
        }
        commit(d.before, songRef.current);
      }
    };
    const up = (e) => end(e, false);
    const cancel = (e) => end(e, true);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit]);
  const onCellKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const c = cellFromEl(e.target);
    if (!c) return;
    e.preventDefault();
    const before = snapOf(songRef.current);
    tapCell(c);
    commit(before, songRef.current);
  };

  // --- bölüm / sıra ---
  const pickPattern = (i) => {
    if (copyMode) {
      let did = false;
      if (i !== curPat) did = change((n) => (n.pats[i] = clone(n.pats[curPat])));
      setCopyMode(false);
      setHint(i !== curPat ? `Bölüm ${LETTERS[curPat]}, bölüm ${LETTERS[i]}'ye kopyalandı.` : '', false, did);
      return;
    }
    tweak((n) => (n.cp = i));
    setHint(`Bölüm ${LETTERS[i]} düzenleniyor.`);
  };
  // v140 — yeni bölüm (en fazla 8). Kopyalama modundaysa seçili bölümün kopyası olur.
  const addPattern = () => {
    if (song.pats.length >= SONG_PATTERNS) return;
    const i = song.pats.length;
    const copy = copyMode;
    const did = change((n) => {
      n.pats.push(copy ? clone(n.pats[curPat]) : emptyPattern(n.tr.length));
      n.cp = i;
    });
    setCopyMode(false);
    setHint(copy ? `Bölüm ${LETTERS[curPat]}, yeni bölüm ${LETTERS[i]}'ye kopyalandı.` : `Yeni bölüm ${LETTERS[i]} eklendi.`, false, did);
  };
  const tapSlot = (i) => change((n) => (n.song[i] = n.song[i] === curPat ? -1 : curPat));
  const clearPattern = () => {
    const did = change((n) => {
      const P = n.pats[curPat];
      P.d = P.d.map(() => 0);
      P.t = P.t.map((rows) => rows.map(() => 0));
      P.l = P.l.map((rows) => rows.map(() => 0));
    });
    setHint(`Bölüm ${LETTERS[curPat]} temizlendi.`, false, did);
  };
  // v140 — Sıfırla: sadece SEÇİLİ bölümdeki davullar / seçili kanal
  const resetDrums = () => {
    const did = change((n) => (n.pats[curPat].d = n.pats[curPat].d.map(() => 0)));
    setHint(did ? `Bölüm ${LETTERS[curPat]}'deki davullar silindi.` : `Bölüm ${LETTERS[curPat]}'de davul yok.`, false, did);
  };
  const resetTrack = () => {
    const did = change((n) => {
      n.pats[curPat].t[curTrack] = emptyRows();
      n.pats[curPat].l[curTrack] = emptyRows();
    });
    setHint(did ? `Bölüm ${LETTERS[curPat]}'de Kanal ${curTrack + 1} silindi.` : `Bölüm ${LETTERS[curPat]}'de Kanal ${curTrack + 1} zaten boş.`, false, did);
  };
  const clearSong = () => {
    const did = change((n) => (n.song = n.song.map(() => -1)));
    setHint('Sıra boşaltıldı.', false, did);
  };
  const applyPreset = (key) => {
    const did = change((n) => (n.pats[curPat].d = [...PRESETS[key].d]));
    setHint(`${PRESETS[key].name} ritmi bölüm ${LETTERS[curPat]}'ye kondu.`, false, did);
    if (!playerRef.current) demoKit(songRef.current);
  };
  // --- kanallar (v140: 3 → 5) ---
  const selectTrack = (k) => {
    setCurTrack(k);
    const inst = SONG_INSTS[song.tr[k].i];
    setNoteMode(inst?.hold ? 'long' : 'short');
    setInstCat(inst?.cat || 'temel');
  };
  const addTrack = () => {
    if (song.tr.length >= SONG_TRACKS) return;
    const k = song.tr.length;
    const used = new Set(song.tr.map((t) => t.i));
    const inst = NEW_TRACK_INST.find((i) => !used.has(i)) || 'epiano';
    change((n) => {
      n.tr.push({ i: inst, v: 80, m: false });
      n.pats.forEach((p) => {
        p.t.push(emptyRows());
        p.l.push(emptyRows());
      });
    });
    setCurTrack(k);
    setNoteMode(SONG_INSTS[inst].hold ? 'long' : 'short');
    setInstCat(SONG_INSTS[inst].cat);
    setHint(`Kanal ${k + 1} eklendi (${SONG_INSTS[inst].name}).`);
  };
  const removeTrack = () => {
    if (song.tr.length <= SONG_TRACKS_MIN || curTrack < SONG_TRACKS_MIN) return;
    const k = curTrack;
    const did = change((n) => {
      n.tr.splice(k, 1);
      n.pats.forEach((p) => {
        p.t.splice(k, 1);
        p.l.splice(k, 1);
      });
    });
    selectTrack(k - 1);
    setHint(`Kanal ${k + 1} kaldırıldı.`, false, did);
  };
  const pickInst = (k) => {
    change((n) => (n.tr[curTrack].i = k));
    const hold = Boolean(SONG_INSTS[k].hold);
    setNoteMode(hold ? 'long' : 'short');
    if (hold && noteMode !== 'long') setHint('Uzun notaya uygun enstrüman: "Uzun nota" açıldı. Satırda sürükle, ne kadar sürüklersen o kadar uzun çalar.');
    if (!playerRef.current) demoNotes(songRef.current, curTrack);
  };

  const steps = useMemo(
    () => (page === 2 ? [0, 1, 2, 3].map((g) => [0, 1, 2, 3].map((c) => g * 4 + c)) : [0, 1].map((g) => [0, 1, 2, 3].map((c) => page * PER_PAGE + g * 4 + c))),
    [page]
  );
  const P = song.pats[curPat];
  const noteLabel = (row) => {
    const p = rowPitch(song.scale, row) + song.key;
    return (
      <>
        {SONG_NOTE_NAMES[((p % 12) + 12) % 12]}
        <sub>{4 + Math.floor(p / 12)}</sub>
      </>
    );
  };
  const trk = song.tr[curTrack];
  const view = OCT_VIEWS.find((v) => v.id === octView) || OCT_VIEWS[1];
  const viewHas = (v) => P.t[curTrack].some((m, r) => m && r >= v.from && r <= v.to);
  const melRows = [];
  for (let r = view.from; r <= view.to; r++) melRows.push(r);

  const renderRow = ({ kind, idx, label, color, mask, ties = 0 }) => (
    <div className={`bm-row${kind === 'mel' && rowPitch(song.scale, idx) % 12 === 0 ? ' tonic' : ''}`} key={`${kind}${idx}`} style={{ '--on': color }}>
      <div className="bm-label">{label}</div>
      <div className="bm-cells">
        {steps.map((grp, gi) => (
          <div className="bm-grp" key={gi}>
            {grp.map((s, ci) => {
              const on = bit(mask, s);
              const cl = on && bit(ties, s) && ci + gi > 0;
              const cr = on && s + 1 < SONG_STEPS && bit(ties, s + 1) && !(gi === steps.length - 1 && ci === grp.length - 1);
              return (
                <button
                  key={s}
                  data-cell="1"
                  data-kind={kind}
                  data-idx={idx}
                  data-s={s}
                  className={`bm-cell${showHead && cur.s === s ? ' now' : ''}${cl ? ' cl' : ''}${cr ? ' cr' : ''}${ci === 0 ? ' gs' : ''}`}
                  aria-pressed={on}
                  aria-label={`${typeof label === 'string' ? label : 'Nota'}, adım ${s + 1}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const finish = () => {
    if (!songHasNotes(songRef.current)) {
      setErr('Boş şarkı paylaşılamaz — önce birkaç kutu doldur.');
      return;
    }
    stop();
    const out = { ...clone(songRef.current), type: 'song', v: 2 };
    // v105: paylaşım modu aranjeye göre (songData.shareModeOf)
    const sm = shareModeOf(out);
    out.mode = sm.mode;
    out.cp = sm.cp;
    onDone?.(out);
  };

  // v92.3 — Gönderi penceresinin arka planı tıklanınca kapanıyor; React olayları
  // portal içinden de üst bileşene kabarcıklandığı için burada durduruyoruz.
  const halt = (e) => e.stopPropagation();
  return createPortal(
    <div className="bm-root" role="dialog" aria-label="Şarkı yap" onClick={halt} onPointerDown={halt} onMouseDown={halt} onTouchStart={halt}>
      <div className="bm-top">
        <button
          className="bm-x"
          onClick={() => {
            stop();
            onCancel?.();
          }}
        >
          ✕
        </button>
        <div className="bm-top-title">
          <b>{title}</b>
          <small>{subtitle}</small>
        </div>
        {topRight || (
          <button className="bm-done" onClick={finish}>
            Bitti ✓
          </button>
        )}
      </div>

      <main className="bm-app" onPointerDown={onCellDown} onKeyDown={onCellKey}>
        <input
          className="bm-name"
          maxLength={SONG_TITLE_MAX}
          placeholder="Şarkının adı (isteğe bağlı)"
          value={song.title}
          onChange={(e) => tweak((n) => (n.title = e.target.value))}
        />
        {err && <p className="bm-err">{err}</p>}
        {toolbar}

        <section className="bm-sec">
          <div className="bm-head">
            <h2>Şarkı</h2>
          </div>
          <div className="bm-glabel">Bölüm</div>
          <div className="bm-chips bm-pchips" role="radiogroup" aria-label="Bölüm">
            {song.pats.map((p, i) => (
              <button
                key={i}
                className={`bm-chip${patHas(p) ? ' filled' : ''}`}
                role="radio"
                aria-checked={i === curPat}
                aria-label={`Bölüm ${LETTERS[i]}`}
                style={{ '--pc': PAT_COLORS[i] }}
                onClick={() => pickPattern(i)}
              >
                {LETTERS[i]}
              </button>
            ))}
            {song.pats.length < SONG_PATTERNS && (
              <button className="bm-chip add" aria-label="Yeni bölüm ekle" title="Yeni bölüm ekle" onClick={addPattern}>
                +
              </button>
            )}
          </div>
          <div className="bm-glabel">Sıra (kutuya dokununca seçili bölüm yerleşir)</div>
          <div className="bm-slots">
            {song.song.map((v, i) => (
              <button
                key={i}
                className={`bm-slot${v >= 0 ? ' has' : ''}${v >= 0 && !patHas(song.pats[v]) ? ' empty-pat' : ''}${playing && song.mode === 'song' && i === cur.bar ? ' now' : ''}`}
                style={v >= 0 ? { background: PAT_COLORS[v] } : undefined}
                aria-label={`Sıra ${i + 1}: ${v >= 0 ? `Bölüm ${LETTERS[v]}` : 'boş'}`}
                onClick={() => tapSlot(i)}
              >
                {v >= 0 ? LETTERS[v] : '+'}
              </button>
            ))}
          </div>
          <div className="bm-acts">
            <button
              className="bm-mini"
              aria-pressed={copyMode}
              onClick={() => {
                const v = !copyMode;
                setCopyMode(v);
                setHint(v ? `Bölüm ${LETTERS[curPat]} nereye kopyalansın? Hedef bölüme (ya da + ile yeni bölüme) dokun.` : '', v);
              }}
            >
              Bölümü kopyala
            </button>
            <button className="bm-mini" onClick={clearPattern}>
              Bölümü temizle
            </button>
            <button className="bm-mini" onClick={clearSong}>
              Sırayı boşalt
            </button>
          </div>
          {/* v105: paylaşınca nasıl çalacağı — mod düğmesinden bağımsız, aranjeye göre */}
          {songHasNotes(song) && (
            <div className={`bm-shareinfo ${shareInfo.mode}`}>
              <span className="bm-shareinfo-ic">{shareInfo.icon}</span>
              <span>
                <b>{shareInfo.title}</b>
                <small>{shareInfo.detail}</small>
              </span>
            </div>
          )}
          <div className="bm-note" aria-live="polite">
            {hint.text}
            {hint.undo && (
              <button className="bm-mini inline" onClick={undo}>
                Geri al
              </button>
            )}
          </div>
        </section>

        <div className="bm-dots" aria-hidden="true">
          {[...Array(SONG_STEPS)].map((_, i) => (
            <i key={i} className={showHead && i === cur.s ? 'on' : ''} />
          ))}
        </div>
        <div className="bm-tabs" role="tablist" aria-label="Adımlar">
          <button className="bm-tab" role="tab" aria-selected={page === 0} onClick={() => setPage(0)}>
            Adım 1–8
          </button>
          <button className="bm-tab" role="tab" aria-selected={page === 1} onClick={() => setPage(1)}>
            Adım 9–16
          </button>
          <button className="bm-tab" role="tab" aria-selected={page === 2} onClick={() => setPage(2)} title="16 adımın hepsi bir arada (uzun notalar için rahat)">
            Hepsi
          </button>
        </div>

        <div className={page === 2 ? 'bm-wide' : undefined}>
          <section className={`bm-sec${song.dm ? ' muted' : ''}`}>
            <div className="bm-head">
              <h2>
                Davul <small className="bm-sub">Bölüm {LETTERS[curPat]}</small>
              </h2>
              <span className="bm-head-btns">
                <button className="bm-mute" onClick={resetDrums} title={`Bölüm ${LETTERS[curPat]}'deki tüm davulları sil`}>
                  Sıfırla
                </button>
                <button className="bm-mute" aria-pressed={song.dm} onClick={() => tweak((n) => (n.dm = !n.dm))}>
                  Sessiz
                </button>
              </span>
            </div>
            <div className="bm-chips" role="radiogroup" aria-label="Davul seti">
              {Object.entries(SONG_KITS).map(([k, v]) => (
                <button
                  key={k}
                  className="bm-chip"
                  role="radio"
                  aria-checked={song.kit === k}
                  onClick={() => {
                    change((n) => (n.kit = k));
                    if (!playerRef.current) demoKit(songRef.current);
                  }}
                >
                  {v.name}
                </button>
              ))}
            </div>
            <div className="bm-vol">
              <label htmlFor="bmVolDrum">Ses</label>
              <input id="bmVolDrum" type="range" min="0" max="100" value={song.dv} onChange={(e) => tweak((n) => (n.dv = Number(e.target.value)))} />
              <output>{song.dv}</output>
            </div>
            <div className="bm-glabel">Hazır ritim (seçili bölüme)</div>
            <div className="bm-chips">
              {Object.entries(PRESETS).map(([k, v]) => (
                <button key={k} className="bm-chip sm" onClick={() => applyPreset(k)}>
                  🥁 {v.name}
                </button>
              ))}
            </div>
            <div className="bm-rows">{SONG_DRUMS.map((d, i) => renderRow({ kind: 'drum', idx: i, label: d.name, color: d.color, mask: P.d[i] }))}</div>
          </section>

          <section className={`bm-sec${trk.m ? ' muted' : ''}`}>
            <div className="bm-head">
              <h2>
                Enstrüman <small className="bm-sub">Bölüm {LETTERS[curPat]}</small>
              </h2>
              <span className="bm-head-btns">
                <button className="bm-mute" onClick={resetTrack} title={`Bölüm ${LETTERS[curPat]}'de Kanal ${curTrack + 1}'in notalarını sil`}>
                  Sıfırla
                </button>
                <button className="bm-mute" aria-pressed={trk.m} onClick={() => tweak((n) => (n.tr[curTrack].m = !n.tr[curTrack].m))}>
                  Sessiz
                </button>
              </span>
            </div>
            <div className="bm-ttabs" role="tablist" aria-label="Kanal">
              {song.tr.map((t, k) => (
                <button key={k} className={`bm-ttab${t.m ? ' off' : ''}`} role="tab" aria-selected={k === curTrack} style={{ '--tc': trackColor(k, 11) }} onClick={() => selectTrack(k)}>
                  Kanal {k + 1}
                  <small>{SONG_INSTS[t.i].name}</small>
                </button>
              ))}
              {song.tr.length < SONG_TRACKS && (
                <button className="bm-ttab add" aria-label="Kanal ekle" title="Kanal ekle" onClick={addTrack}>
                  +<small>Kanal</small>
                </button>
              )}
            </div>
            <div className="bm-vol">
              <label htmlFor="bmVolMel">Kanal sesi</label>
              <input id="bmVolMel" type="range" min="0" max="100" value={trk.v} onChange={(e) => tweak((n) => (n.tr[curTrack].v = Number(e.target.value)))} />
              <output>{trk.v}</output>
            </div>
            <div className="bm-cats" role="tablist" aria-label="Enstrüman grubu">
              {SONG_INST_CATS.map((c) => (
                <button key={c.id} className="bm-cat" role="tab" aria-selected={instCat === c.id} onClick={() => setInstCat(c.id)}>
                  {c.name}
                  {SONG_INSTS[trk.i]?.cat === c.id && instCat !== c.id ? ' •' : ''}
                </button>
              ))}
            </div>
            <div className="bm-chips" role="radiogroup" aria-label="Enstrüman">
              {Object.entries(SONG_INSTS)
                .filter(([, v]) => v.cat === instCat)
                .map(([k, v]) => (
                  <button key={k} className="bm-chip" role="radio" aria-checked={trk.i === k} onClick={() => pickInst(k)}>
                    {v.name}
                  </button>
                ))}
            </div>
            <div className="bm-glabel">Ölçek (tüm kanallar için)</div>
            <div className="bm-chips" role="radiogroup" aria-label="Ölçek">
              {Object.entries(SONG_SCALES).map(([k, v]) => (
                <button
                  key={k}
                  className="bm-chip"
                  role="radio"
                  aria-checked={song.scale === k}
                  onClick={() => {
                    change((n) => (n.scale = k));
                    if (!playerRef.current) demoNotes(songRef.current, curTrack);
                  }}
                >
                  {v.name}
                </button>
              ))}
            </div>
            <div className="bm-key">
              <span className="bm-glabel">Ton</span>
              <button
                className="bm-mini"
                aria-label="Tonu düşür"
                onClick={() => {
                  change((n) => (n.key = (n.key + 11) % 12));
                  if (!playerRef.current) demoNotes(songRef.current, curTrack);
                }}
              >
                ◀
              </button>
              <b>{SONG_NOTE_NAMES[song.key]}</b>
              <button
                className="bm-mini"
                aria-label="Tonu yükselt"
                onClick={() => {
                  change((n) => (n.key = (n.key + 1) % 12));
                  if (!playerRef.current) demoNotes(songRef.current, curTrack);
                }}
              >
                ▶
              </button>
              <span className="bm-grow" />
              {song.tr.length > SONG_TRACKS_MIN && curTrack >= SONG_TRACKS_MIN && (
                <button className="bm-mini" onClick={removeTrack}>
                  Kanalı kaldır
                </button>
              )}
            </div>
            <div className="bm-vol">
              <label htmlFor="bmRev">Yankı</label>
              <input id="bmRev" type="range" min="0" max="100" value={song.rv ?? SONG_REVERB_DEF} onChange={(e) => tweak((n) => (n.rv = Number(e.target.value)))} />
              <output>{song.rv ?? SONG_REVERB_DEF}</output>
            </div>

            <div className="bm-tool" role="radiogroup" aria-label="Nota uzunluğu">
              <button role="radio" aria-checked={noteMode === 'short'} onClick={() => setNoteMode('short')}>
                <span className="bm-tool-ic">▪</span> Tek nota
              </button>
              <button role="radio" aria-checked={noteMode === 'long'} onClick={() => setNoteMode('long')}>
                <span className="bm-tool-ic long">▬</span> Uzun nota
              </button>
            </div>
            <p className="bm-tool-help">
              {noteMode === 'long'
                ? 'Satırda sürükle: ne kadar sürüklersen nota o kadar uzun çalar. Dokunmak 1 vuruşluk nota koyar; notayı tutup sürükleyerek uzatırsın, dokununca silinir.'
                : 'Her kutu kısa, tek bir vuruş çalar. Sürükleyerek art arda boyayabilirsin.'}
            </p>
            <div className="bm-oct" role="radiogroup" aria-label="Oktav">
              <span className="bm-glabel">Oktav</span>
              {OCT_VIEWS.map((v) => (
                <button key={v.id} className={`bm-chip sm${v.id !== octView && v.id !== 'all' && viewHas(v) ? ' filled' : ''}`} role="radio" aria-checked={octView === v.id} onClick={() => setOctView(v.id)}>
                  {v.name}
                </button>
              ))}
            </div>
            <div className={`bm-rows${octView === 'all' ? ' dense' : ''}`}>
              {melRows.map((r) => renderRow({ kind: 'mel', idx: r, label: noteLabel(r), color: trackColor(curTrack, r), mask: P.t[curTrack][r], ties: P.l[curTrack][r] }))}
            </div>
          </section>
        </div>
      </main>

      <div className="bm-bar">
        <div className="bm-bar-in">
          <div className="bm-tools">
            <button className="bm-mini" disabled={!undoRef.current.length} onClick={undo} aria-label="Geri al">
              ↶ Geri
            </button>
            <button className="bm-mini" disabled={!redoRef.current.length} onClick={redo} aria-label="İleri al">
              ↷ İleri
            </button>
            <span className="bm-grow" />
            <button
              className="bm-mini"
              aria-pressed={song.mode === 'song'}
              onClick={() => {
                const m = song.mode === 'song' ? 'pattern' : 'song';
                tweak((n) => (n.mode = m));
                setHint(m === 'song' ? 'Şarkı modu: sıradaki bölümler baştan sona çalar.' : 'Bölüm modu: seçili bölüm döngüde çalar.');
              }}
            >
              {song.mode === 'song' ? 'Şarkı modu' : 'Bölüm modu'}
            </button>
            <button className="bm-mini" aria-pressed={song.sw} onClick={() => tweak((n) => (n.sw = !n.sw))}>
              Swing
            </button>
          </div>
          <div className="bm-main">
            <button className="bm-play" aria-pressed={playing} aria-label="Çal / Durdur" onClick={() => (playing ? stop() : start())}>
              {playing ? (
                <svg viewBox="0 0 24 24">
                  <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
                </svg>
              )}
            </button>
            <div className="bm-tempo">
              <button aria-label="Yavaşlat" onClick={() => tweak((n) => (n.bpm = Math.max(SONG_BPM.min, n.bpm - 5)))}>
                −
              </button>
              <output>
                {song.bpm}
                <small>tempo</small>
              </output>
              <button aria-label="Hızlandır" onClick={() => tweak((n) => (n.bpm = Math.min(SONG_BPM.max, n.bpm + 5)))}>
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
