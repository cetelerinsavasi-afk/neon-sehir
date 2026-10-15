import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SONG_STEPS,
  SONG_ROWS,
  SONG_DRUMS,
  SONG_KITS,
  SONG_INSTS,
  SONG_SCALES,
  SONG_NOTE_NAMES,
  SONG_BPM,
  SONG_TITLE_MAX,
  emptySong,
  songHasNotes,
} from '../../../functions/songData.js';
import { startSong, previewDrum, previewNote, demoKit, demoNotes, bit, songLength } from '../../lib/songEngine';
import { createPortal } from 'react-dom';
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
// =============================================================================
const PER_PAGE = 8;
const LETTERS = ['A', 'B', 'C', 'D'];
const PAT_COLORS = ['#ff6f91', '#6aaeff', '#4fe3b3', '#ffd447'];
const TRK_HUES = [260, 150, 195];
const trackColor = (k, row) => `hsl(${TRK_HUES[k] + (row - 3) * 5},78%,${66 - row * 1.8}%)`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const setBit = (mask, s, on) => (on ? mask | (1 << s) : mask & ~(1 << s));
const patHas = (p) => p.d.some(Boolean) || p.t.some((rows) => rows.some(Boolean));

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
  o.i.forEach((v, i) => (n.tr[i].i = v));
  return n;
}

// v93 — Müzik stüdyosu modu: onChange(şarkı) her değişiklikte (otomatik kayıt),
// toolbar (paylaş / indir / projeler), topRight ("Bitti" yerine kayıt durumu), title.
export default function SongMaker({ initial, onCancel, onDone, onChange, toolbar = null, topRight = null, title = '🎵 Beat Atölyesi', subtitle = 'Bölümleri kur, sıraya diz, şarkına dönüştür.', getSongRef = null }) {
  const [song, setSong] = useState(() => (initial?.pats ? clone(initial) : emptySong()));
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
  const [curTrack, setCurTrack] = useState(0);
  const [page, setPage] = useState(0);
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
  const curPat = song.cp || 0;

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
    if (song.mode === 'pattern' || cur.pi === curPat) {
      const p = Math.floor(cur.s / PER_PAGE);
      if (p !== page) setPage(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);
  const showHead = cur.s >= 0 && (song.mode === 'pattern' || cur.pi === curPat);

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
  const dragRef = useRef(null);
  const cellOn = (kind, idx, s) => {
    const P = songRef.current.pats[songRef.current.cp || 0];
    return bit(kind === 'drum' ? P.d[idx] : P.t[curTrack][idx], s);
  };
  const setCellRaw = (kind, idx, s, on) => {
    const next = clone(songRef.current);
    const P = next.pats[next.cp || 0];
    if (kind === 'drum') P.d[idx] = setBit(P.d[idx], s, on);
    else P.t[curTrack][idx] = setBit(P.t[curTrack][idx], s, on);
    songRef.current = next;
    setSong(next);
  };
  const preview = (kind, idx) => {
    if (playerRef.current) return;
    if (kind === 'drum') previewDrum(songRef.current, idx);
    else previewNote(songRef.current, curTrack, idx);
  };
  const cellFromEl = (el) => {
    const c = el?.closest?.('[data-cell]');
    if (!c) return null;
    return { kind: c.dataset.kind, idx: Number(c.dataset.idx), s: Number(c.dataset.s) };
  };
  const onCellDown = (e) => {
    const c = cellFromEl(e.target);
    if (!c) return;
    dragRef.current = { cell: c, last: c, painting: false, value: false, before: snapOf(songRef.current), id: e.pointerId };
  };
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) return;
      const c = cellFromEl(document.elementFromPoint(e.clientX, e.clientY));
      if (!c || (c.s === d.last.s && c.kind === d.last.kind && c.idx === d.last.idx)) return;
      if (c.kind !== d.cell.kind || c.idx !== d.cell.idx) return; // aynı satırda boya
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
        const on = !cellOn(d.cell.kind, d.cell.idx, d.cell.s);
        setCellRaw(d.cell.kind, d.cell.idx, d.cell.s, on);
        commit(d.before, songRef.current);
        if (on) preview(d.cell.kind, d.cell.idx);
      } else commit(d.before, songRef.current);
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
  }, [curTrack, commit]);
  const onCellKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const c = cellFromEl(e.target);
    if (!c) return;
    e.preventDefault();
    const before = snapOf(songRef.current);
    const on = !cellOn(c.kind, c.idx, c.s);
    setCellRaw(c.kind, c.idx, c.s, on);
    commit(before, songRef.current);
    if (on) preview(c.kind, c.idx);
  };

  // --- bölüm / sıra ---
  const pickPattern = (i) => {
    if (copyMode) {
      let did = false;
      if (i !== curPat) did = change((n) => (n.pats[i] = clone(n.pats[n.cp || 0])));
      setCopyMode(false);
      setHint(i !== curPat ? `Bölüm ${LETTERS[curPat]}, bölüm ${LETTERS[i]}'ye kopyalandı.` : '', false, did);
      return;
    }
    tweak((n) => (n.cp = i));
    setPage(0);
    setHint(`Bölüm ${LETTERS[i]} düzenleniyor.`);
  };
  const tapSlot = (i) => change((n) => (n.song[i] = n.song[i] === curPat ? -1 : curPat));
  const clearPattern = () => {
    const did = change((n) => {
      const P = n.pats[n.cp || 0];
      P.d = P.d.map(() => 0);
      P.t = P.t.map((rows) => rows.map(() => 0));
    });
    setHint(`Bölüm ${LETTERS[curPat]} temizlendi.`, false, did);
  };
  const clearSong = () => {
    const did = change((n) => (n.song = n.song.map(() => -1)));
    setHint('Sıra boşaltıldı.', false, did);
  };
  const applyPreset = (key) => {
    const did = change((n) => (n.pats[n.cp || 0].d = [...PRESETS[key].d]));
    setHint(`${PRESETS[key].name} ritmi bölüm ${LETTERS[curPat]}'ye kondu.`, false, did);
    if (!playerRef.current) demoKit(songRef.current);
  };

  const steps = useMemo(() => [0, 1].map((g) => [0, 1, 2, 3].map((c) => page * PER_PAGE + g * 4 + c)), [page]);
  const P = song.pats[curPat];
  const scaleSemis = SONG_SCALES[song.scale].semis;
  const noteLabel = (row) => SONG_NOTE_NAMES[(scaleSemis[scaleSemis.length - 1 - row] + song.key) % 12];
  const trk = song.tr[curTrack];

  const renderRow = ({ kind, idx, label, color, mask }) => (
    <div className="bm-row" key={`${kind}${idx}`} style={{ '--on': color }}>
      <div className="bm-label">{label}</div>
      <div className="bm-cells">
        {steps.map((grp, gi) => (
          <div className="bm-grp" key={gi}>
            {grp.map((s) => (
              <button
                key={s}
                data-cell="1"
                data-kind={kind}
                data-idx={idx}
                data-s={s}
                className={`bm-cell${showHead && cur.s === s ? ' now' : ''}`}
                aria-pressed={bit(mask, s)}
                aria-label={`${label}, adım ${s + 1}`}
              />
            ))}
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
    const out = { ...clone(songRef.current), type: 'song', v: 1 };
    // bölüm modunda seçili bölüm boşsa ilk dolu bölüm çalsın
    if (!patHas(out.pats[out.cp || 0])) out.cp = Math.max(0, out.pats.findIndex(patHas));
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
            {LETTERS.map((l, i) => (
              <button key={l} className={`bm-chip${patHas(song.pats[i]) ? ' filled' : ''}`} role="radio" aria-checked={i === curPat} aria-label={`Bölüm ${l}`} onClick={() => pickPattern(i)}>
                {l}
              </button>
            ))}
          </div>
          <div className="bm-glabel">Sıra (kutuya dokununca seçili bölüm yerleşir)</div>
          <div className="bm-slots">
            {song.song.map((v, i) => (
              <button
                key={i}
                className={`bm-slot${v >= 0 ? ' has' : ''}${playing && song.mode === 'song' && i === cur.bar ? ' now' : ''}`}
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
                setHint(v ? `Bölüm ${LETTERS[curPat]} nereye kopyalansın? Hedef bölüme dokun.` : '', v);
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
        </div>

        <section className={`bm-sec${song.dm ? ' muted' : ''}`}>
          <div className="bm-head">
            <h2>Davul</h2>
            <button className="bm-mute" aria-pressed={song.dm} onClick={() => tweak((n) => (n.dm = !n.dm))}>
              Sessiz
            </button>
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
          <div className="bm-rows">
            {SONG_DRUMS.map((d, i) => (
              renderRow({ kind: 'drum', idx: i, label: d.name, color: d.color, mask: P.d[i] })
            ))}
          </div>
        </section>

        <section className={`bm-sec${trk.m ? ' muted' : ''}`}>
          <div className="bm-head">
            <h2>Enstrüman</h2>
            <button className="bm-mute" aria-pressed={trk.m} onClick={() => tweak((n) => (n.tr[curTrack].m = !n.tr[curTrack].m))}>
              Sessiz
            </button>
          </div>
          <div className="bm-ttabs" role="tablist" aria-label="Kanal">
            {song.tr.map((t, k) => (
              <button key={k} className={`bm-ttab${t.m ? ' off' : ''}`} role="tab" aria-selected={k === curTrack} style={{ '--tc': trackColor(k, 3) }} onClick={() => setCurTrack(k)}>
                Kanal {k + 1}
                <small>{SONG_INSTS[t.i].name}</small>
              </button>
            ))}
          </div>
          <div className="bm-vol">
            <label htmlFor="bmVolMel">Kanal sesi</label>
            <input id="bmVolMel" type="range" min="0" max="100" value={trk.v} onChange={(e) => tweak((n) => (n.tr[curTrack].v = Number(e.target.value)))} />
            <output>{trk.v}</output>
          </div>
          <div className="bm-chips" role="radiogroup" aria-label="Enstrüman">
            {Object.entries(SONG_INSTS).map(([k, v]) => (
              <button
                key={k}
                className="bm-chip"
                role="radio"
                aria-checked={trk.i === k}
                onClick={() => {
                  change((n) => (n.tr[curTrack].i = k));
                  if (!playerRef.current) demoNotes(songRef.current, curTrack);
                }}
              >
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
          </div>
          <div className="bm-rows">
            {[...Array(SONG_ROWS)].map((_, r) => (
              renderRow({ kind: 'mel', idx: r, label: noteLabel(r), color: trackColor(curTrack, r), mask: P.t[curTrack][r] })
            ))}
          </div>
        </section>
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
