// =============================================================================
// houseAudio.js — Müzik kutusu (3 parça) — tamamen Web Audio ile üretilen müzik,
// ses dosyası yok. Parçalar kullanıcının verdiği jukebox örneğinden alındı.
// Evdeki herkes aynı parçayı duyar (houses/{id}.music sunucuda tutulur).
// =============================================================================

const PCs = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => {
  const m = n.match(/^([A-G])([#b]?)(\d)$/);
  return 12 * (+m[3] + 1) + PCs[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const mel = (str) => {
  const o = {};
  str.trim().split(/\s+/).forEach((tok) => {
    const [n, r] = tok.split('@');
    const [s, l] = r.split(':');
    o[+s] = [midi(n), +l];
  });
  return o;
};

let ac = null;
let master = null;
let comp = null;
let verb = null;
let noiseBuf = null;
let bus = null;
let send = null;
let ambient = [];
let volume = 0.7;

function ensureAudio() {
  if (!ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = volume;
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ac.destination);
    verb = ac.createConvolver();
    const len = Math.floor(ac.sampleRate * 1.8);
    const ib = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ib.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    verb.buffer = ib;
    verb.connect(master);
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.5), ac.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return true;
}
// Tarayıcılar sesi ancak bir dokunuştan sonra açar → ilk dokunuşta kilidi aç.
export function unlockAudio() {
  ensureAudio();
}
export function audioContext() {
  ensureAudio();
  return ac;
}
function makeBus(rev) {
  bus = ac.createGain();
  bus.connect(master);
  send = ac.createGain();
  send.gain.value = rev;
  bus.connect(send);
  send.connect(verb);
}
function dropBus() {
  const b = bus;
  const s = send;
  const am = ambient;
  ambient = [];
  bus = null;
  if (!b) return;
  b.gain.cancelScheduledValues(ac.currentTime);
  b.gain.setTargetAtTime(0, ac.currentTime, 0.06);
  setTimeout(() => {
    am.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* */
      }
    });
    try {
      b.disconnect();
      s.disconnect();
    } catch {
      /* */
    }
  }, 900);
}
function voice(o) {
  if (!bus) return;
  const t = o.t;
  const f = o.f;
  const rel = o.rel ?? 0.1;
  const pk = o.gain;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  let end;
  if (o.pluck) {
    g.gain.linearRampToValueAtTime(pk, t + (o.a || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    end = t + o.dur + 0.05;
  } else {
    const a = o.a || 0.01;
    const hold = Math.max(o.dur, a + 0.01);
    g.gain.linearRampToValueAtTime(pk, t + a);
    g.gain.setValueAtTime(pk, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + hold + rel);
    end = t + hold + rel + 0.05;
  }
  let out = g;
  if (o.lp) {
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = o.q || 1;
    fl.frequency.setValueAtTime(o.lp, t);
    if (o.lpEnd) fl.frequency.exponentialRampToValueAtTime(o.lpEnd, t + (o.lpT || 0.15));
    g.connect(fl);
    out = fl;
  }
  out.connect(bus);
  (o.parts || [[1, 1, o.type || 'sawtooth', 0]]).forEach(([r, rg, ty, dt]) => {
    const os = ac.createOscillator();
    os.type = ty;
    os.frequency.value = f * r;
    os.detune.value = dt;
    const pg = ac.createGain();
    pg.gain.value = rg;
    os.connect(pg);
    pg.connect(g);
    if (o.vib) {
      const l = ac.createOscillator();
      l.frequency.value = 5.3;
      const lg = ac.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(o.vib, t + (o.vibDelay || 0.2) + 0.25);
      l.connect(lg);
      lg.connect(os.detune);
      l.start(t);
      l.stop(end);
    }
    os.start(t);
    os.stop(end);
  });
}
function noiseHit(t, dur, type, freq, q, gain) {
  if (!bus) return;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const a = ac.createGain();
  a.gain.setValueAtTime(gain, t);
  a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(a);
  a.connect(bus);
  s.start(t, Math.random() * 0.8);
  s.stop(t + dur + 0.02);
}
function kick(t, g = 1) {
  if (!bus) return;
  const o = ac.createOscillator();
  const a = ac.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  a.gain.setValueAtTime(g, t);
  a.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  o.connect(a);
  a.connect(bus);
  o.start(t);
  o.stop(t + 0.35);
}
const clap = (t) => {
  [0, 0.011, 0.022].forEach((d) => noiseHit(t + d, 0.02, 'bandpass', 1500, 1.2, 0.3));
  noiseHit(t + 0.03, 0.16, 'bandpass', 1400, 1, 0.24);
};
const hat = (t, open, g) => noiseHit(t, open ? 0.22 : 0.04, 'highpass', 7500, 0.7, g);
const snap = (t) => {
  noiseHit(t, 0.05, 'bandpass', 2300, 4, 0.45);
  noiseHit(t, 0.09, 'bandpass', 1000, 2, 0.2);
};
const brush = (t, g) => noiseHit(t, 0.1, 'highpass', 5500, 0.5, g);
const bassDisco = (t, m, dur) => voice({ t, f: mtof(m), dur, type: 'sawtooth', gain: 0.32, a: 0.005, rel: 0.04, lp: 1400, lpEnd: 260, lpT: 0.12, q: 3 });
const bassUp = (t, m, dur) => voice({ t, f: mtof(m), dur, pluck: 1, gain: 0.6, a: 0.008, lp: 800, parts: [[1, 1, 'triangle', 0], [2, 0.25, 'sine', 0]] });
const bassSoft = (t, m, dur) => voice({ t, f: mtof(m), dur, pluck: 1, gain: 0.5, a: 0.02, parts: [[1, 1, 'sine', 0]] });
const stab = (t, notes, dur) =>
  notes.forEach((m) => voice({ t, f: mtof(m), dur, gain: 0.07, a: 0.004, rel: 0.05, lp: 3400, lpEnd: 1300, lpT: 0.1, parts: [[1, 1, 'sawtooth', -6], [1, 1, 'sawtooth', 6]] }));
const discoLead = (t, m, dur) => voice({ t, f: mtof(m), dur, gain: 0.085, a: 0.01, rel: 0.08, lp: 3800, vib: 14, parts: [[1, 1, 'sawtooth', -9], [1, 0.8, 'square', 9]] });
const trumpet = (t, m, dur) =>
  voice({ t, f: mtof(m), dur, gain: 0.15, a: 0.07, rel: 0.18, lp: 800, lpEnd: 2600, lpT: 0.12, q: 2, vib: 18, vibDelay: 0.25, parts: [[1, 1, 'sawtooth', 0], [1, 0.4, 'square', 5]] });
const rhodes = (t, m, vel, len) =>
  voice({ t, f: mtof(m), dur: len, pluck: 1, gain: 0.2 * vel, a: 0.003, parts: [[1, 1, 'sine', 0], [1, 0.5, 'sine', 5], [2, 0.22, 'sine', 0], [6, 0.05, 'sine', 0]] });
const pad = (t, m, dur) => voice({ t, f: mtof(m), dur, gain: 0.03, a: 1, rel: 1.4, lp: 900, parts: [[1, 1, 'triangle', -7], [1, 1, 'triangle', 7]] });
const flute = (t, m, dur) => voice({ t, f: mtof(m), dur, gain: 0.13, a: 0.09, rel: 0.4, vib: 8, vibDelay: 0.25, parts: [[1, 1, 'sine', 0], [2, 0.12, 'triangle', 0]] });
function startCrackle() {
  const len = ac.sampleRate * 3;
  const b = ac.createBuffer(1, len, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() < 0.0008 ? (Math.random() * 2 - 1) * 0.9 : 0) + (Math.random() * 2 - 1) * 0.004;
  const s = ac.createBufferSource();
  s.buffer = b;
  s.loop = true;
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1200;
  const g = ac.createGain();
  g.gain.value = 0.35;
  s.connect(f);
  f.connect(g);
  g.connect(bus);
  s.start();
  ambient.push(s);
}

const disco = {
  title: 'Kulüp 77', mood: 'Disko', bpm: 118, bars: 8, swing: 0, rev: 0.16, a: '#ff4fb0',
  roots: [45, 38, 43, 48, 45, 38, 40, 45],
  ch: [[57, 60, 64, 67], [62, 65, 69, 72], [59, 62, 65, 67], [60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [59, 62, 64, 68], [57, 60, 64, 67]],
  lead: [
    'E5@0:2 G5@2:2 A5@4:4 E5@10:2 D5@12:4', 'F5@0:2 A5@2:2 C6@4:4 A5@10:2 F5@12:4', 'D5@0:2 F5@2:2 G5@4:4 D5@10:2 B4@12:4',
    'E5@0:2 G5@2:2 B5@4:4 G5@10:2 E5@12:4', 'E5@0:2 G5@2:2 A5@4:4 E5@10:2 D5@12:4', 'F5@0:2 A5@2:2 C6@4:4 A5@10:2 F5@12:4',
    'B4@0:2 D5@2:2 E5@4:4 G#4@10:2 B4@12:4', 'E5@0:2 C5@2:2 A4@4:8',
  ].map(mel),
  step(s, bar, t, sd) {
    if (s % 4 === 0) kick(t, 1);
    if (s === 4 || s === 12) clap(t);
    if (s % 4 === 2) hat(t, true, 0.09);
    else hat(t, false, s % 2 ? 0.03 : 0.05);
    if (s % 2 === 0) bassDisco(t, this.roots[bar] + (s % 4 === 0 ? 0 : 12), sd * 1.7);
    if (s === 15 && bar % 2 === 1) bassDisco(t, this.roots[bar] + 10, sd * 0.9);
    if ([3, 6, 10, 13].includes(s)) stab(t, this.ch[bar], sd * 1.4);
    const L = this.lead[bar][s];
    if (L) discoLead(t, L[0], L[1] * sd * 0.92);
    if (bar === 7 && s >= 13) clap(t);
  },
};
const noir = {
  title: 'Ağır Abi', mood: 'Havalı', bpm: 92, bars: 8, swing: 0.6, rev: 0.26, a: '#e5383b',
  walk: [[38, 41, 45, 42], [43, 46, 48, 44], [45, 49, 52, 39], [38, 41, 45, 42], [38, 41, 45, 42], [43, 46, 48, 44], [45, 49, 52, 39], [38, 41, 45, 41]],
  comp: [[50, 53, 57, 60], [55, 58, 62, 65], [57, 61, 64, 67], [50, 53, 57, 60], [50, 53, 57, 60], [55, 58, 62, 65], [57, 61, 64, 67], [50, 53, 57, 60]],
  lead: ['A4@0:6 D5@8:4 F5@12:4', 'D5@0:6 Bb4@8:4 C5@12:4', 'C#5@0:4 E5@4:4 G5@8:6 F5@14:2', 'D5@0:12', 'F5@0:6 A5@8:4 G5@12:4', 'F5@0:4 D5@4:4 Bb4@8:8', 'C#5@0:4 D5@4:2 E5@6:2 F5@8:4 E5@12:4', 'D5@0:12'].map(mel),
  step(s, bar, t, sd) {
    if (s % 4 === 0) bassUp(t, this.walk[bar][s / 4], sd * 3.7);
    if (s === 0) kick(t, 0.32);
    if (s === 4 || s === 12) snap(t);
    if ([0, 4, 6, 8, 12, 14].includes(s)) brush(t, s === 4 || s === 12 ? 0.07 : 0.045);
    if (s === 0 || s === 6) this.comp[bar].forEach((m, i) => rhodes(t + i * 0.01, m, s === 0 ? 0.55 : 0.4, 0.9));
    const L = this.lead[bar][s];
    if (L) trumpet(t, L[0], L[1] * sd * 0.95);
  },
};
const calm = {
  title: 'Son Kadeh', mood: 'Sakin', bpm: 62, bars: 8, swing: 0, rev: 0.42, crackle: true, a: '#4cc9c0',
  roots: [48, 45, 41, 43, 48, 45, 41, 43],
  ch: [[64, 67, 71, 74], [60, 64, 67, 71], [53, 57, 60, 64], [59, 62, 64, 69], [64, 67, 71, 74], [60, 64, 67, 71], [53, 57, 60, 64], [59, 62, 64, 69]],
  lead: ['E5@0:6 G5@8:4 D5@12:4', 'C5@0:6 B4@8:4 A4@12:4', 'A4@0:6 C5@8:4 E5@12:4', 'D5@0:10 B4@12:4', 'G5@0:6 E5@8:4 C5@12:4', 'E5@0:6 D5@8:4 C5@12:4', 'C5@0:6 A4@8:4 C5@12:4', 'D5@0:6 B4@8:8'].map(mel),
  step(s, bar, t, sd) {
    const ch = this.ch[bar];
    if (s === 0) {
      ch.forEach((m) => pad(t, m - 12, sd * 16));
      bassSoft(t, this.roots[bar], sd * 7);
    }
    if (s === 10) bassSoft(t, this.roots[bar] + 7, sd * 4);
    if (s % 2 === 0) {
      const k = s / 2;
      rhodes(t + Math.random() * 0.012, ch[[0, 1, 2, 3, 2, 1, 2, 1][k]], [0.9, 0.5, 0.55, 0.6, 0.5, 0.45, 0.5, 0.4][k] * (0.9 + Math.random() * 0.2), 2.6);
    }
    const L = this.lead[bar][s];
    if (L) flute(t, L[0], L[1] * sd * 0.95);
  },
};
export const TRACKS = [disco, noir, calm].map((t, i) => ({ index: i, title: t.title, mood: t.mood, color: t.a }));
const tracks = [disco, noir, calm];

let cur = -1;
let playing = false;
let stepIdx = 0;
let nextTime = 0;
let timer = null;

function scheduler() {
  const tr = tracks[cur];
  const sd = 60 / tr.bpm / 4;
  if (nextTime < ac.currentTime - 0.5) nextTime = ac.currentTime + 0.05;
  while (nextTime < ac.currentTime + 0.14) {
    const s = stepIdx % 16;
    const bar = Math.floor(stepIdx / 16) % tr.bars;
    const tt = nextTime + (s % 4 === 2 ? tr.swing * sd : 0);
    tr.step(s, bar, tt, sd);
    stepIdx++;
    nextTime += sd;
  }
}

export function playTrack(i) {
  if (!ensureAudio()) return;
  if (playing && cur === i) return;
  stopMusic();
  cur = i;
  stepIdx = 0;
  const tr = tracks[cur];
  makeBus(tr.rev);
  if (tr.crackle) startCrackle();
  nextTime = ac.currentTime + 0.08;
  playing = true;
  timer = setInterval(scheduler, 25);
}
export function stopMusic() {
  if (!playing) return;
  playing = false;
  clearInterval(timer);
  timer = null;
  dropBus();
}
export function currentTrack() {
  return playing ? cur : null;
}
export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}
export function getVolume() {
  return volume;
}

// Atari için kısa bip
export function beep(freq, dur = 0.06) {
  if (!ensureAudio()) return;
  try {
    const o = ac.createOscillator();
    const v = ac.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    v.gain.value = 0.04;
    o.connect(v);
    v.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  } catch {
    /* */
  }
}
