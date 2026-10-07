// v77 — Piyano sesi (WebAudio; dosya indirmez). 12 beyaz tuş: Do4 → Sol5.
export const PIANO_KEYS = [
  { n: 'Do', f: 261.63 },
  { n: 'Re', f: 293.66 },
  { n: 'Mi', f: 329.63 },
  { n: 'Fa', f: 349.23 },
  { n: 'Sol', f: 392.0 },
  { n: 'La', f: 440.0 },
  { n: 'Si', f: 493.88 },
  { n: 'Do', f: 523.25 },
  { n: 'Re', f: 587.33 },
  { n: 'Mi', f: 659.25 },
  { n: 'Fa', f: 698.46 },
  { n: 'Sol', f: 783.99 },
];

let ctx = null;
function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function playPianoKey(k, volume = 0.5) {
  const a = ac();
  const key = PIANO_KEYS[k];
  if (!a || !key || volume <= 0) return;
  const t = a.currentTime;
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.35 * volume, t + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  out.connect(a.destination);
  [
    ['triangle', 1, 1],
    ['sine', 2, 0.35],
    ['sine', 3, 0.12],
  ].forEach(([type, mul, g]) => {
    const o = a.createOscillator();
    const og = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(key.f * mul, t);
    og.gain.value = g;
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 1.7);
  });
}
