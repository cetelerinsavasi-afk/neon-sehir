// =============================================================================
// v168 — Senaryonun sesleri ve müziği (dosya yok, hepsi WebAudio ile üretilir → indirme yok).
// Tarayıcı, oyuncu dokunmadan ses çalmaya izin vermez: ilk dokunuşta unlockAudio() çağrılır.
// Her çağrı try/catch içinde — ses açılamasa da senaryo asla durmaz.
// =============================================================================
let ctx = null;
let master = null;
let musicBus = null;
let sfx = null;
let verb = null;
let disposed = false;

function ac() {
  if (ctx) return ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  ctx = new C();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.55;
  musicBus.connect(master);
  sfx = ctx.createGain();
  sfx.gain.value = 1;
  sfx.connect(master);
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.6;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  verb.buffer = ir;
  const vg = ctx.createGain();
  vg.gain.value = 0.35;
  verb.connect(vg).connect(master);
  return ctx;
}
const safe = (fn) => (...a) => {
  try {
    return disposed ? undefined : fn(...a);
  } catch {
    return undefined;
  }
};
export function unlockAudio() {
  disposed = false;
  try {
    ac().resume();
  } catch {
    /* ses yok */
  }
}
const noiseBuf = (sec, shape = 4) => {
  const c = ac();
  const b = c.createBuffer(1, Math.max(1, c.sampleRate * sec), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** shape;
  return b;
};
function noise(sec, { type = 'lowpass', freq = 1800, q = 0.7, vol = 1, shape = 4, when = 0, dest = null, rev = 0 } = {}) {
  const c = ac();
  const s = c.createBufferSource();
  s.buffer = noiseBuf(sec, shape);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(dest || sfx);
  if (rev) {
    const r = c.createGain();
    r.gain.value = rev;
    g.connect(r).connect(verb);
  }
  s.start(c.currentTime + when);
  return { s, f, g };
}
function tone(freq, dur, { type = 'sine', vol = 0.2, when = 0, attack = 0.01, dest = null, glide = null, rev = 0 } = {}) {
  const c = ac();
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(1e-4, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
  o.connect(g).connect(dest || sfx);
  if (rev) {
    const r = c.createGain();
    r.gain.value = rev;
    g.connect(r).connect(verb);
  }
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return o;
}
export const sGun = safe((v = 1) => {
  noise(0.05, { type: 'highpass', freq: 2500, vol: 0.9 * v, shape: 2 });
  noise(0.5, { type: 'lowpass', freq: 1600, vol: 0.95 * v, shape: 4, rev: 0.5 });
  tone(90, 0.18, { vol: 0.5 * v, glide: 40 });
});
export const sRicochet = safe(() => tone(2400 + Math.random() * 1200, 0.32, { vol: 0.07, glide: 900, rev: 0.4 }));
export const sMetal = safe(() => {
  noise(0.08, { type: 'bandpass', freq: 3200, q: 4, vol: 0.5, shape: 3 });
  tone(620 + Math.random() * 200, 0.25, { type: 'triangle', vol: 0.08, glide: 300 });
});
export const sHurt = safe(() => {
  tone(70, 0.35, { vol: 0.6, glide: 40 });
  noise(0.2, { type: 'lowpass', freq: 400, vol: 0.5 });
});
export const sHeart = safe((n = 4, gap = 0.95) => {
  for (let i = 0; i < n; i++) {
    tone(58, 0.16, { vol: 0.55, when: i * gap });
    tone(52, 0.18, { vol: 0.4, when: i * gap + 0.24 });
  }
});
export const sBrake = safe(() => {
  noise(1.1, { type: 'bandpass', freq: 2600, q: 6, vol: 0.18, shape: 1.2 }).f.frequency.exponentialRampToValueAtTime(1500, ac().currentTime + 1.1);
});
export const sDoor = safe(() => {
  noise(0.12, { type: 'lowpass', freq: 500, vol: 0.7, shape: 3 });
  tone(110, 0.12, { vol: 0.3, glide: 70 });
});
export const sTitle = safe(() => {
  [180, 247, 361, 512].forEach((f, i) => tone(f, 2.4, { type: 'triangle', vol: 0.06 / (i + 1), rev: 0.8 }));
  noise(0.15, { type: 'lowpass', freq: 900, vol: 0.6 });
});
export const sDone = safe(() => [784, 988, 1319].forEach((f, i) => tone(f, 0.6, { vol: 0.09, when: i * 0.08, rev: 0.4 })));
export const sChapter = safe(() => {
  tone(55, 2.2, { vol: 0.4, glide: 45, rev: 0.6 });
  noise(1.6, { type: 'lowpass', freq: 500, vol: 0.25, shape: 2, rev: 0.6 });
  tone(880, 1.4, { vol: 0.03, when: 0.1, rev: 1 });
});
export const sLighter = safe(() => {
  noise(0.03, { type: 'highpass', freq: 4000, vol: 0.6, shape: 1 });
  noise(0.6, { type: 'bandpass', freq: 900, q: 0.8, vol: 0.16, shape: 0.6, when: 0.06 });
});
export const sRing = safe(() => {
  for (let i = 0; i < 2; i++) {
    tone(880, 0.5, { vol: 0.14, when: i * 0.9 });
    tone(1320, 0.5, { vol: 0.05, when: i * 0.9 });
  }
});
export const sHangup = safe(() => {
  for (let i = 0; i < 3; i++) tone(425, 0.2, { vol: 0.1, when: i * 0.35, attack: 0.005 });
});
export const sSiren = safe(() => {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sawtooth';
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1800;
  const t = c.currentTime;
  for (let i = 0; i < 12; i++) o.frequency.setValueAtTime(i % 2 ? 620 : 860, t + i * 0.5);
  g.gain.setValueAtTime(1e-4, t);
  g.gain.linearRampToValueAtTime(0.05, t + 1.2);
  g.gain.setValueAtTime(0.05, t + 5);
  g.gain.linearRampToValueAtTime(1e-4, t + 6);
  o.connect(f).connect(g).connect(sfx);
  o.start(t);
  o.stop(t + 6.1);
});
export const sCuffs = safe(() => [0, 0.09, 0.42, 0.5].forEach((w) => noise(0.05, { type: 'highpass', freq: 2500, vol: 0.7, shape: 6, when: w })));
let engineHum = null;
export const sEngine = safe((on) => {
  const c = ac();
  if (on && !engineHum) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 46;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    const g = c.createGain();
    g.gain.value = 1e-4;
    g.gain.linearRampToValueAtTime(0.08, c.currentTime + 0.8);
    o.connect(f).connect(g).connect(sfx);
    o.start();
    engineHum = { o, g };
  } else if (!on && engineHum) {
    const { o, g } = engineHum;
    g.gain.linearRampToValueAtTime(1e-4, c.currentTime + 0.6);
    o.stop(c.currentTime + 0.7);
    engineHum = null;
  }
});

// --- müzik ------------------------------------------------------------------
const note = (n) => 220 * 2 ** (n / 12);
const TRACKS = {
  warm: { bpm: 70, bars: [[-9, -5, -2, 3], [-12, -7, -3, 0], [-7, -3, 0, 5], [-10, -5, -2, 2]], pad: 0.05, arp: 0.04, bass: true },
  tension: { bpm: 60, bars: [[-12, -11, -5], [-12, -10, -5], [-12, -11, -6], [-12, -9, -5]], pad: 0.06, pulse: true, bass: true },
  action: { bpm: 128, bars: [[-12, -5, 0], [-12, -5, 1], [-14, -7, -2], [-12, -5, 0]], pad: 0.035, pulse: true, drums: true, bass: true },
  sad: { bpm: 64, bars: [[0, 3, 7, 12], [-4, 0, 3, 8], [-7, -4, 0, 5], [-5, -1, 2, 7]], pad: 0.035, arp: 0.07, piano: true },
};
let cur = null;
export const music = safe((name, { vol = 1 } = {}) => {
  if (cur?.name === name) return;
  stopMusic(1.2);
  const tr = TRACKS[name];
  if (!tr) return;
  const c = ac();
  const g = c.createGain();
  g.gain.value = 1e-4;
  g.gain.linearRampToValueAtTime(vol, c.currentTime + 1.5);
  g.connect(musicBus);
  const beat = 60 / tr.bpm;
  const bar = beat * 4;
  let next = c.currentTime + 0.05;
  let k = 0;
  const m = { name, g, timer: 0, stopped: false };
  const tick = () => {
    if (m.stopped) return;
    while (next < c.currentTime + 1.2) {
      const ch = tr.bars[k % tr.bars.length];
      const w = next - c.currentTime;
      ch.forEach((n) => tone(note(n), bar * 1.05, { type: 'triangle', vol: tr.pad, when: w, attack: bar * 0.3, dest: g, rev: 0.6 }));
      if (tr.bass) tone(note(ch[0] - 12), bar * 0.95, { vol: 0.12, when: w, attack: 0.05, dest: g });
      if (tr.arp) {
        const steps = tr.piano ? 8 : 4;
        for (let s = 0; s < steps; s++) tone(note(ch[(s * (tr.piano ? 1 : 2)) % ch.length] + (tr.piano && s >= 4 ? 12 : 0) + 12), beat * (tr.piano ? 1.6 : 1.2), { type: tr.piano ? 'sine' : 'triangle', vol: tr.arp, when: w + (bar / steps) * s, attack: 0.005, dest: g, rev: 0.7 });
      }
      if (tr.pulse) for (let s = 0; s < 8; s++) tone(note(ch[0] - 12), beat * 0.35, { type: 'sawtooth', vol: 0.025, when: w + (beat / 2) * s, attack: 0.005, dest: g });
      if (tr.drums) {
        for (let s = 0; s < 4; s++) {
          tone(60, 0.18, { vol: 0.35, when: w + s * beat, glide: 35, dest: g });
          if (s % 2) noise(0.12, { type: 'highpass', freq: 1800, vol: 0.18, when: w + s * beat, dest: g });
          noise(0.03, { type: 'highpass', freq: 6000, vol: 0.06, when: w + s * beat + beat / 2, dest: g });
        }
      }
      next += bar;
      k += 1;
    }
    m.timer = setTimeout(tick, 400);
  };
  tick();
  cur = m;
});
export function stopMusic(fade = 1.5) {
  if (!cur || !ctx) return;
  const m = cur;
  cur = null;
  m.stopped = true;
  clearTimeout(m.timer);
  try {
    m.g.gain.cancelScheduledValues(ctx.currentTime);
    m.g.gain.setValueAtTime(m.g.gain.value, ctx.currentTime);
    m.g.gain.linearRampToValueAtTime(1e-4, ctx.currentTime + fade);
    setTimeout(() => m.g.disconnect(), fade * 1000 + 3000);
  } catch {
    /* yok */
  }
}
// şehirden çıkınca: müzik ve motor sesi kesilir (ses bağlamı açık kalır, bir sonraki sahne hazır)
export function silenceAll() {
  stopMusic(0.3);
  try {
    sEngine(false);
  } catch {
    /* yok */
  }
}
