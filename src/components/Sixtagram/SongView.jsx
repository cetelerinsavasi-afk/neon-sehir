import { useEffect, useMemo, useRef, useState } from 'react';
import { SONG_INSTS, SONG_KITS, SONG_SCALES, SONG_NOTE_NAMES, songDurationSec } from '../../../functions/songData.js';
import { startSong, bit } from '../../lib/songEngine';
import './SongMaker.css';

// =============================================================================
// v92 — Sixtagram'da paylaşılan şarkı. Ses dosyası yok: şarkı verisi bu cihazda
// Beat Atölyesi motoruyla çalınır (aynı anda tek şarkı çalar). Bölüm modundaki
// şarkı 4 tur, şarkı modundaki şarkı sıradaki bölümlerle bir kez çalar.
// =============================================================================
const PAT_COLORS = ['#ff6f91', '#6aaeff', '#4fe3b3', '#ffd447'];
const fmtSec = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function SongView({ song }) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState({ s: -1, bar: -1, pi: -1, n: 0 });
  const handleRef = useRef(null);
  const songRef = useRef(song);
  songRef.current = song;
  const total = useMemo(() => songDurationSec(song), [song]);
  const stepsTotal = useMemo(() => Math.max(1, Math.round(total / (60 / song.bpm / 4))), [total, song.bpm]);

  useEffect(() => () => handleRef.current?.stop(), []);
  const stop = () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setPlaying(false);
    setPos({ s: -1, bar: -1, pi: -1, n: 0 });
  };
  const play = () => {
    let n = 0;
    const h = startSong(() => songRef.current, {
      loop: false,
      onStep: (q) => {
        n += 1;
        setPos({ ...q, n });
      },
      // bitince ya da başka bir şarkı başlayınca bu kart "durdu" görünür
      onStopped: () => {
        handleRef.current = null;
        setPlaying(false);
        setPos({ s: -1, bar: -1, pi: -1, n: 0 });
      },
    });
    if (!h) return;
    handleRef.current = h;
    setPlaying(true);
  };

  // önizleme şeridi: çalan (ya da ilk dolu) bölümün davul + nota adımları
  const showPat = pos.pi >= 0 ? pos.pi : song.mode === 'song' ? Math.max(0, song.song.find((v) => v >= 0) ?? 0) : song.cp || 0;
  const P = song.pats[showPat] || song.pats[0];
  const lanes = [
    { c: '#ff6f91', m: P.d[0] | P.d[5] },
    { c: '#ff8a5c', m: P.d[1] | P.d[4] },
    { c: '#ffb347', m: P.d[2] | P.d[3] | P.d[6] },
    ...P.t.map((rows, k) => ({ c: ['hsl(260,78%,66%)', 'hsl(150,78%,60%)', 'hsl(195,78%,62%)'][k], m: rows.reduce((a, b) => a | b, 0) })),
  ];
  const insts = [...new Set(song.tr.filter((t, k) => !t.m && P.t[k].some(Boolean)).map((t) => SONG_INSTS[t.i]?.name))].slice(0, 3);
  const pct = playing ? Math.min(100, (pos.n / stepsTotal) * 100) : 0;

  return (
    <div className="sv-card" style={{ '--sv-a': PAT_COLORS[showPat] }}>
      <div className="sv-top">
        <button className="sv-play" aria-label={playing ? 'Durdur' : 'Çal'} onClick={() => (playing ? stop() : play())}>
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
        <div className="sv-meta">
          <b>🎵 {song.title || 'İsimsiz şarkı'}</b>
          <small>
            {song.bpm} tempo · {SONG_KITS[song.kit]?.name} · {SONG_SCALES[song.scale]?.name} {SONG_NOTE_NAMES[song.key || 0]} · {fmtSec(total)}
          </small>
          {insts.length > 0 && (
            <small>
              <br />
              {insts.join(' · ')}
            </small>
          )}
        </div>
      </div>
      <div className="sv-grid" aria-hidden="true">
        {lanes.map((l, li) =>
          [...Array(16)].map((_, s) => <i key={`${li}-${s}`} className={`${bit(l.m, s) ? 'on' : ''}${playing && pos.s === s ? ' now' : ''}`} style={{ '--c': l.c }} />)
        )}
      </div>
      <div className="sv-prog">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
