import { useEffect, useRef, useState } from 'react';
import { PIANO_KEYS, playPianoKey } from './pianoSynth';
import { PIANO_NOTE_MIN_MS, pianoHeartbeat, sendNote } from './pianoNet';
import './Piano.css';

// v77 — Piyano klavyesi (çalan kişi). 12 tuş; tuş sıklığı sınırlı (spam/gecikme).
export default function PianoPanel({ houseId, me, local = false, onClose }) {
  const [lit, setLit] = useState(null);
  const lastRef = useRef(0);
  useEffect(() => {
    const iv = setInterval(() => pianoHeartbeat(houseId, me).catch(() => {}), 12_000);
    return () => clearInterval(iv);
  }, [houseId, me]);
  const press = (k) => {
    const t = performance.now();
    if (t - lastRef.current < PIANO_NOTE_MIN_MS) return;
    lastRef.current = t;
    playPianoKey(k, 0.6);
    setLit(k);
    setTimeout(() => setLit((c) => (c === k ? null : c)), 160);
    sendNote(houseId, me.uid, k).catch(() => {});
  };
  return (
    <div className="pn-panel" onClick={(e) => e.stopPropagation()}>
      <div className="pn-head">
        <b>🎹 Piyano</b>
        <small className="pn-sub">{local ? 'Bağlantı yok — şu an sadece sen duyuyorsun' : 'Mekândaki herkes duyuyor'}</small>
        <button className="pn-x" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="pn-keys">
        {PIANO_KEYS.map((key, i) => (
          <button
            key={i}
            className={`pn-key${lit === i ? ' on' : ''}${i >= 7 ? ' hi' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              press(i);
            }}
          >
            <span>{key.n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
