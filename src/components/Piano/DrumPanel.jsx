import { useEffect, useRef, useState } from 'react';
import { hitDrum } from '../../lib/songEngine';
import { PIANO_NOTE_MIN_MS, pianoHeartbeat, sendNote } from './pianoNet';
import './Piano.css';

// v99.4 — Davul Seti: oturan çalar, mekândaki herkes duyar (piyano altyapısı,
// anahtar `${houseId}_d`). Ped sırası = SONG_DRUMS satırı.
export const DRUM_PADS = [
  { k: 5, n: 'Tom', c: '#e05cd6' },
  { k: 3, n: 'Zil', c: '#f7c948' },
  { k: 6, n: 'Ride', c: '#ff7a7a' },
  { k: 2, n: 'Hi-hat', c: '#ffb347' },
  { k: 1, n: 'Trampet', c: '#ff8a5c' },
  { k: 0, n: 'Bas', c: '#ff6f91' },
];
export const drumKey = (houseId) => `${houseId}_d`;

export default function DrumPanel({ houseId, me, local = false, onClose }) {
  const [lit, setLit] = useState(null);
  const lastSendRef = useRef(0);
  const key = drumKey(houseId);
  useEffect(() => {
    const iv = setInterval(() => pianoHeartbeat(key, me).catch(() => {}), 12_000);
    return () => clearInterval(iv);
  }, [key, me]);
  const hit = (k) => {
    hitDrum(k, 0.7);
    setLit(k);
    setTimeout(() => setLit((c) => (c === k ? null : c)), 120);
    const t = performance.now();
    if (t - lastSendRef.current < PIANO_NOTE_MIN_MS) return;
    lastSendRef.current = t;
    sendNote(key, me.uid, k).catch(() => {});
  };
  return (
    <div className="pn-panel" onClick={(e) => e.stopPropagation()}>
      <div className="pn-head">
        <b>🥁 Davul</b>
        <small className="pn-sub">{local ? 'Bağlantı yok — şu an sadece sen duyuyorsun' : 'Mekândaki herkes duyuyor'}</small>
        <button className="pn-x" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="dr-pads">
        {DRUM_PADS.map((p) => (
          <button
            key={p.k}
            className={`dr-pad${lit === p.k ? ' on' : ''}`}
            style={{ '--pad': p.c }}
            onPointerDown={(e) => {
              e.preventDefault();
              hit(p.k);
            }}
          >
            <span>{p.n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
