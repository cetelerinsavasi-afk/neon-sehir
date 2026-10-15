// =============================================================================
// v92 — Beat Atölyesi ses motoru (Sixtagram "Şarkı Yap"). Tüm sesler Web Audio
// ile anında sentezlenir — ses dosyası yok. Hem düzenleyici (SongMaker) hem
// akıştaki oynatıcı (SongView) bu motoru kullanır; aynı şarkı her telefonda
// aynı çalar. Prototip "Beat Atölyesi"nin sesleri + v92 ekleri (Darbuka ve
// Arcade setleri; Bağlama, Yaylı, Çan, Pad; Hicaz/Nihavend; ton seçimi).
// =============================================================================
import { SONG_DRUMS, SONG_SCALES, SONG_STEPS, SONG_TRACKS, SONG_ROWS, SONG_SLOTS } from '../../functions/songData.js';

const KITS = {
  klasik: { kick: { f0: 150, f1: 48, dec: 0.3 }, snare: { tone: 190, hp: 1500, dec: 0.2 }, hat: { hp: 7000, dec: 0.05 }, ohat: { hp: 7000, dec: 0.28 }, clap: { bp: 1200, dec: 0.14 }, tom: { f: 150, dec: 0.35 }, perc: { type: 'rim' } },
  t808: { kick: { f0: 115, f1: 36, dec: 0.8 }, snare: { tone: 230, hp: 2500, dec: 0.24 }, hat: { hp: 9000, dec: 0.09 }, ohat: { hp: 8500, dec: 0.4 }, clap: { bp: 1500, dec: 0.22 }, tom: { f: 110, dec: 0.5 }, perc: { type: 'cow' } },
  elektro: { kick: { f0: 210, f1: 55, dec: 0.2, click: true }, snare: { tone: 330, hp: 3500, dec: 0.13 }, hat: { hp: 10500, dec: 0.03 }, ohat: { hp: 10500, dec: 0.18 }, clap: { bp: 2300, dec: 0.09 }, tom: { f: 260, dec: 0.2 }, perc: { type: 'blip' } },
  lofi: { lp: 3000, kick: { f0: 120, f1: 45, dec: 0.35 }, snare: { tone: 170, hp: 1200, dec: 0.22 }, hat: { hp: 5000, dec: 0.06 }, ohat: { hp: 5000, dec: 0.22 }, clap: { bp: 900, dec: 0.16 }, tom: { f: 130, dec: 0.4 }, perc: { type: 'wood' } },
  rock: { kick: { f0: 135, f1: 50, dec: 0.34, click: true }, snare: { tone: 210, hp: 1000, dec: 0.32 }, hat: { hp: 6500, dec: 0.07 }, ohat: { hp: 6500, dec: 0.35 }, clap: { bp: 1000, dec: 0.18 }, tom: { f: 120, dec: 0.5 }, perc: { type: 'cow' } },
  trap: { kick: { f0: 95, f1: 30, dec: 1.0 }, snare: { tone: 280, hp: 3000, dec: 0.18 }, hat: { hp: 11000, dec: 0.025 }, ohat: { hp: 10000, dec: 0.2 }, clap: { bp: 1800, dec: 0.25 }, tom: { f: 200, dec: 0.3 }, perc: { type: 'rim' } },
  // v92 — Darbuka: dum (derin), tek (parlak), ka; zil (parmak zili)
  oryantal: { kick: { f0: 180, f1: 70, dec: 0.28, doum: true }, snare: { tone: 620, hp: 2800, dec: 0.07 }, hat: { hp: 6000, dec: 0.035 }, ohat: { hp: 5200, dec: 0.16 }, clap: { bp: 2600, dec: 0.08 }, tom: { f: 320, dec: 0.16 }, perc: { type: 'zil' } },
  // v92 — Arcade: 8-bit oyun sesleri
  arcade: { chip: true, kick: { f0: 160, f1: 40, dec: 0.18 }, snare: { tone: 300, hp: 2000, dec: 0.12 }, hat: { hp: 9000, dec: 0.03 }, ohat: { hp: 9000, dec: 0.14 }, clap: { bp: 1800, dec: 0.1 }, tom: { f: 220, dec: 0.2 }, perc: { type: 'coin' } },
};
const DRUM_VOL = { kick: 1, snare: 0.75, hat: 0.4, ohat: 0.35, clap: 0.6, tom: 0.8, perc: 0.6 };

export function noteFreq(song, row) {
  const semis = (SONG_SCALES[song.scale] || SONG_SCALES.pent).semis;
  return 261.63 * Math.pow(2, (semis[semis.length - 1 - row] + (song.key || 0)) / 12);
}
export const bit = (mask, s) => ((mask >> s) & 1) === 1;

// --- tek ortak AudioContext (tarayıcı sınırı + mobil kilit açma) -------------------------
let ctx = null;
let noiseBuf = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function env(g, t, peak, endT, attack = 0.002) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, endT);
}
function noise(t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
  return s;
}
function osc(type, freq, t, dur) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(t + dur);
  return o;
}

// Bir çalma oturumu: master → kompresör → hoparlör; davul ve 3 kanal ayrı ses
function createBus(c0 = null) {
  const c = c0 || ac();
  if (!c) return null;
  const comp = c.createDynamicsCompressor();
  const master = c.createGain();
  master.gain.value = 0.8;
  master.connect(comp);
  comp.connect(c.destination);
  const drumIn = c.createBiquadFilter();
  drumIn.type = 'lowpass';
  drumIn.frequency.value = 20000;
  const drumOut = c.createGain();
  drumIn.connect(drumOut);
  drumOut.connect(master);
  const trackOut = [];
  for (let k = 0; k < SONG_TRACKS; k++) {
    const g = c.createGain();
    g.connect(master);
    trackOut.push(g);
  }
  return {
    master,
    drumIn,
    drumOut,
    trackOut,
    apply(song) {
      drumIn.frequency.value = KITS[song.kit]?.lp || 20000;
      drumOut.gain.value = song.dm ? 0 : song.dv / 80;
      song.tr.forEach((t, k) => {
        trackOut[k].gain.value = t.m ? 0 : t.v / 100;
      });
    },
    close() {
      try {
        master.gain.setTargetAtTime(0, c.currentTime, 0.02);
        setTimeout(() => master.disconnect(), 200);
      } catch {
        /* yoksay */
      }
    },
  };
}

function playDrum(kitId, id, t, out) {
  const kit = KITS[kitId] || KITS.klasik;
  const k = kit[id];
  const v = DRUM_VOL[id];
  let g;
  let o;
  let n;
  let f;
  if (id === 'kick') {
    o = osc(kit.chip ? 'square' : 'sine', k.f0, t, k.dec + 0.05);
    g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(k.f1, t + Math.min(0.12, k.dec * 0.4));
    env(g, t, kit.chip ? v * 0.45 : v, t + k.dec);
    o.connect(g);
    g.connect(out);
    if (k.click || k.doum) {
      n = noise(t, 0.03);
      f = ctx.createBiquadFilter();
      f.type = k.doum ? 'lowpass' : 'highpass';
      f.frequency.value = k.doum ? 900 : 3000;
      g = ctx.createGain();
      env(g, t, k.doum ? 0.35 : 0.5, t + (k.doum ? 0.05 : 0.015));
      n.connect(f);
      f.connect(g);
      g.connect(out);
    }
  } else if (id === 'snare') {
    n = noise(t, k.dec);
    f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = k.hp;
    g = ctx.createGain();
    env(g, t, v, t + k.dec);
    n.connect(f);
    f.connect(g);
    g.connect(out);
    o = osc(kit.chip ? 'square' : 'triangle', k.tone * 1.4, t, 0.15);
    o.frequency.exponentialRampToValueAtTime(k.tone, t + 0.06);
    g = ctx.createGain();
    env(g, t, v * (kit.chip ? 0.35 : 0.8), t + 0.12);
    o.connect(g);
    g.connect(out);
  } else if (id === 'hat' || id === 'ohat') {
    n = noise(t, k.dec);
    f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = k.hp;
    g = ctx.createGain();
    env(g, t, v, t + k.dec);
    n.connect(f);
    f.connect(g);
    g.connect(out);
  } else if (id === 'clap') {
    n = noise(t, k.dec + 0.05);
    f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = k.bp;
    f.Q.value = 1.2;
    g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) {
      g.gain.setValueAtTime(v, t + i * 0.012);
      g.gain.exponentialRampToValueAtTime(0.15 * v, t + i * 0.012 + 0.01);
    }
    g.gain.setValueAtTime(v, t + 0.036);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.036 + k.dec);
    n.connect(f);
    f.connect(g);
    g.connect(out);
  } else if (id === 'tom') {
    o = osc(kit.chip ? 'square' : 'sine', k.f * 1.5, t, k.dec + 0.05);
    g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(k.f * 0.7, t + 0.18);
    env(g, t, kit.chip ? v * 0.4 : v, t + k.dec);
    o.connect(g);
    g.connect(out);
  } else if (id === 'perc') {
    const ty = k.type;
    let o2;
    if (ty === 'rim') {
      o = osc('sine', 1700, t, 0.05);
      g = ctx.createGain();
      env(g, t, v * 0.8, t + 0.03);
      o.connect(g);
      g.connect(out);
      n = noise(t, 0.03);
      f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 4000;
      g = ctx.createGain();
      env(g, t, v * 0.5, t + 0.02);
      n.connect(f);
      f.connect(g);
      g.connect(out);
    } else if (ty === 'cow') {
      o = osc('square', 560, t, 0.3);
      o2 = osc('square', 845, t, 0.3);
      f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 800;
      f.Q.value = 1;
      g = ctx.createGain();
      env(g, t, v * 0.5, t + 0.25);
      o.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(out);
    } else if (ty === 'wood') {
      o = osc('sine', 900, t, 0.1);
      o.frequency.exponentialRampToValueAtTime(700, t + 0.06);
      g = ctx.createGain();
      env(g, t, v, t + 0.08);
      o.connect(g);
      g.connect(out);
      o2 = osc('triangle', 1350, t, 0.08);
      g = ctx.createGain();
      env(g, t, v * 0.5, t + 0.05);
      o2.connect(g);
      g.connect(out);
    } else if (ty === 'zil') {
      // parmak zili: metalik, uzun çınlama
      [2637, 3960, 5280].forEach((fr, i) => {
        const oo = osc('sine', fr, t, 0.7);
        const gg = ctx.createGain();
        env(gg, t, v * [0.35, 0.2, 0.12][i], t + 0.6 - i * 0.12);
        oo.connect(gg);
        gg.connect(out);
      });
    } else if (ty === 'coin') {
      // oyun parası: iki hızlı nota
      o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(988, t);
      o.frequency.setValueAtTime(1319, t + 0.06);
      o.start(t);
      o.stop(t + 0.22);
      g = ctx.createGain();
      env(g, t, v * 0.3, t + 0.2);
      o.connect(g);
      g.connect(out);
    } else {
      o = osc('square', 1300, t, 0.12);
      o.frequency.exponentialRampToValueAtTime(500, t + 0.08);
      g = ctx.createGain();
      env(g, t, v * 0.35, t + 0.09);
      o.connect(g);
      g.connect(out);
    }
  }
}

function playNote(inst, freq, t, out) {
  let o;
  let o2;
  let o3;
  let g;
  let f;
  let g2;
  if (inst === 'piyano') {
    o = osc('triangle', freq, t, 1);
    o2 = osc('sine', freq * 2, t, 1);
    g = ctx.createGain();
    env(g, t, 0.5, t + 0.9, 0.004);
    g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(out);
  } else if (inst === 'synth') {
    o = osc('sawtooth', freq, t, 0.5);
    o2 = osc('sawtooth', freq * 1.006, t, 0.5);
    f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    g = ctx.createGain();
    env(g, t, 0.2, t + 0.42, 0.01);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(out);
  } else if (inst === 'bas') {
    const bf = freq / 4;
    o = osc('square', bf, t, 0.45);
    o2 = osc('sine', bf, t, 0.45);
    f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    f.Q.value = 2;
    g = ctx.createGain();
    env(g, t, 0.55, t + 0.38, 0.006);
    o.connect(f);
    f.connect(g);
    o2.connect(g);
    g.connect(out);
  } else if (inst === 'gitar') {
    o = osc('sawtooth', freq, t, 0.9);
    o2 = osc('triangle', freq, t, 0.9);
    f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1;
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    g = ctx.createGain();
    env(g, t, 0.4, t + 0.8, 0.002);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(out);
  } else if (inst === 'marimba') {
    o = osc('sine', freq * 2, t, 0.6);
    o2 = osc('sine', freq * 2 * 3.9, t, 0.15);
    g = ctx.createGain();
    env(g, t, 0.55, t + 0.5, 0.002);
    g2 = ctx.createGain();
    env(g2, t, 0.2, t + 0.09, 0.002);
    o.connect(g);
    g.connect(out);
    o2.connect(g2);
    g2.connect(out);
  } else if (inst === 'org') {
    o = osc('sine', freq, t, 0.5);
    o2 = osc('sine', freq * 2, t, 0.5);
    o3 = osc('sine', freq * 3, t, 0.5);
    g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.015);
    g.gain.setValueAtTime(0.3, t + 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    const h1 = ctx.createGain();
    h1.gain.value = 0.5;
    const h2 = ctx.createGain();
    h2.gain.value = 0.25;
    o.connect(g);
    o2.connect(h1);
    h1.connect(g);
    o3.connect(h2);
    h2.connect(g);
    g.connect(out);
  } else if (inst === 'flut') {
    o = osc('sine', freq * 2, t, 0.6);
    const lfo = osc('sine', 5.5, t, 0.6);
    const lg = ctx.createGain();
    lg.gain.value = 7;
    lfo.connect(lg);
    lg.connect(o.frequency);
    g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g);
    g.connect(out);
    const n = noise(t, 0.4);
    f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq * 4;
    f.Q.value = 2;
    g2 = ctx.createGain();
    env(g2, t, 0.12, t + 0.3, 0.04);
    n.connect(f);
    f.connect(g2);
    g2.connect(out);
  } else if (inst === 'baglama') {
    // bağlama: çift tel (hafif akort farkı), mızrap vuruşu, metalik parlak tını
    [1, 1.004, 2.002].forEach((m, i) => {
      const oo = osc(i === 2 ? 'triangle' : 'sawtooth', freq * m, t, 0.75);
      const ff = ctx.createBiquadFilter();
      ff.type = 'bandpass';
      ff.Q.value = 1.4;
      ff.frequency.setValueAtTime(freq * 6, t);
      ff.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.3);
      const gg = ctx.createGain();
      env(gg, t, i === 2 ? 0.12 : 0.28, t + 0.65, 0.001);
      oo.connect(ff);
      ff.connect(gg);
      gg.connect(out);
    });
    const n = noise(t, 0.02);
    f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3500;
    g2 = ctx.createGain();
    env(g2, t, 0.15, t + 0.02);
    n.connect(f);
    f.connect(g2);
    g2.connect(out);
  } else if (inst === 'yayli') {
    // yaylı: yavaş giriş, titreşimli üç testere
    const vib = osc('sine', 5.2, t, 0.9);
    const vg = ctx.createGain();
    vg.gain.value = freq * 0.006;
    vib.connect(vg);
    f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.12);
    g.gain.setValueAtTime(0.16, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    [0.997, 1, 1.004].forEach((m) => {
      const oo = osc('sawtooth', freq * m, t, 0.9);
      vg.connect(oo.frequency);
      oo.connect(f);
    });
    f.connect(g);
    g.connect(out);
  } else if (inst === 'zil') {
    // çan: uyumsuz kısmi sesler, uzun çınlama
    [
      [1, 0.3, 1.6],
      [2.76, 0.14, 1.0],
      [5.4, 0.07, 0.6],
      [8.93, 0.04, 0.35],
    ].forEach(([m, a, d]) => {
      const oo = osc('sine', freq * 2 * m, t, d + 0.05);
      const gg = ctx.createGain();
      env(gg, t, a, t + d, 0.001);
      oo.connect(gg);
      gg.connect(out);
    });
  } else if (inst === 'pad') {
    // pad: yumuşak, geniş, yavaş açılan filtre
    f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(2200, t + 0.5);
    g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    [0.5, 0.995, 1.005].forEach((m) => {
      const oo = osc(m === 0.5 ? 'triangle' : 'sawtooth', freq * m, t, 1.25);
      oo.connect(f);
    });
    f.connect(g);
    g.connect(out);
  } else {
    // chip
    const cf = freq * 2;
    o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(cf, t);
    o.frequency.setValueAtTime(cf * 1.25, t + 0.045);
    o.frequency.setValueAtTime(cf * 1.5, t + 0.09);
    o.start(t);
    o.stop(t + 0.3);
    f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 6000;
    g = ctx.createGain();
    env(g, t, 0.18, t + 0.26, 0.003);
    o.connect(f);
    f.connect(g);
    g.connect(out);
  }
}

// --- önizleme (düzenleyicide kutuya dokununca) ------------------------------------------
let previewBus = null;
function pbus(song) {
  if (!ac()) return null;
  if (!previewBus) previewBus = createBus();
  previewBus.apply(song);
  return previewBus;
}
export function previewDrum(song, row) {
  const b = pbus(song);
  if (!b) return;
  playDrum(song.kit, SONG_DRUMS[row].id, ctx.currentTime + 0.01, b.drumIn);
}
export function previewNote(song, track, row) {
  const b = pbus(song);
  if (!b) return;
  playNote(song.tr[track].i, noteFreq(song, row), ctx.currentTime + 0.01, b.trackOut[track]);
}
export function demoKit(song) {
  const b = pbus(song);
  if (!b) return;
  const t = ctx.currentTime + 0.02;
  [
    ['kick', 0],
    ['snare', 0.25],
    ['hat', 0.4],
    ['tom', 0.5],
    ['perc', 0.65],
  ].forEach(([id, dt]) => playDrum(song.kit, id, t + dt, b.drumIn));
}
export function demoNotes(song, track) {
  const b = pbus(song);
  if (!b) return;
  const t = ctx.currentTime + 0.02;
  [6, 4, 2, 0].forEach((r, i) => playNote(song.tr[track].i, noteFreq(song, r), t + i * 0.16, b.trackOut[track]));
}

// --- sıralayıcı -----------------------------------------------------------------------------
// getSong(): o anki şarkı (düzenleyicide çalarken değişebilir)
// opts: { loop: true (düzenleyici) | false (akış: şarkı 1 kez / bölüm 4 tur),
//         onStep({s, bar, pi}), onEnd(), onStopped() — her durmada (bitiş, başka şarkı, stop) }
let active = null; // aynı anda tek çalan (akışta başka şarkı başlarsa öncekini durdurur)
export function songLength(song) {
  for (let i = SONG_SLOTS - 1; i >= 0; i--) if (song.song[i] >= 0) return i + 1;
  return 0;
}
export function startSong(getSong, { loop = true, onStep, onEnd, onStopped } = {}) {
  const c = ac();
  if (!c) return null;
  if (active) active.stop();
  const bus = createBus();
  let step = 0;
  let bar = 0;
  let nextTime = c.currentTime + 0.06;
  let stopped = false;
  let rounds = 0;
  const queue = [];
  let raf = 0;
  let endAt = null;
  const tick = () => {
    const song = getSong();
    bus.apply(song);
    while (!stopped && endAt === null && nextTime < c.currentTime + 0.12) {
      let pi;
      if (song.mode === 'song') {
        const L = songLength(song);
        if (L === 0) bar = 0;
        else if (bar >= L) {
          if (!loop) {
            endAt = nextTime;
            break;
          }
          bar = 0;
        }
        pi = L ? song.song[bar] : -1;
      } else {
        pi = song.cp || 0;
        if (!loop && rounds >= 4) {
          endAt = nextTime;
          break;
        }
      }
      const spb = 60 / song.bpm / 4;
      const t = nextTime + (song.sw && step % 2 === 1 ? spb * 0.3 : 0);
      if (pi >= 0) {
        const P = song.pats[pi];
        if (!song.dm) SONG_DRUMS.forEach((d, r) => bit(P.d[r], step) && playDrum(song.kit, d.id, t, bus.drumIn));
        for (let k = 0; k < SONG_TRACKS; k++) {
          if (song.tr[k].m) continue;
          for (let r = 0; r < SONG_ROWS; r++) if (bit(P.t[k][r], step)) playNote(song.tr[k].i, noteFreq(song, r), t, bus.trackOut[k]);
        }
      }
      queue.push({ s: step, bar, pi, t });
      nextTime += spb;
      step++;
      if (step === SONG_STEPS) {
        step = 0;
        if (song.mode === 'song') bar++;
        else rounds++;
      }
    }
  };
  const timer = setInterval(tick, 25);
  tick();
  const draw = () => {
    if (stopped) return;
    let last = null;
    while (queue.length && queue[0].t <= c.currentTime) last = queue.shift();
    if (last) onStep?.(last);
    if (endAt !== null && c.currentTime >= endAt + 0.4) {
      handle.stop();
      onEnd?.();
      return;
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  const handle = {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      cancelAnimationFrame(raf);
      bus.close();
      if (active === handle) active = null;
      onStopped?.();
    },
    get startedAt() {
      return startedAt;
    },
  };
  const startedAt = c.currentTime;
  active = handle;
  return handle;
}
// --- v93: şarkıyı çevrimdışı ses olarak oluştur (MP3 indirme) ------------------------------
// Akıştaki çalmayla aynı sıra: şarkı modu = sıradaki bölümler bir kez, bölüm modu = 4 tur.
// Sentez fonksiyonları ortak `ctx`yi kullandığı için zamanlama süresince ctx geçici
// olarak çevrimdışı bağlama çevrilir (eşzamanlı; arada başka ses çalınmaz).
export function songSteps(song) {
  const out = [];
  if (song.mode === 'song') {
    const L = songLength(song);
    for (let bar = 0; bar < L; bar++) for (let s = 0; s < SONG_STEPS; s++) out.push({ s, pi: song.song[bar] });
  } else {
    for (let r = 0; r < 4; r++) for (let s = 0; s < SONG_STEPS; s++) out.push({ s, pi: song.cp || 0 });
  }
  return out;
}
export async function renderSong(song, { sampleRate = 44100 } = {}) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) throw new Error('Bu cihaz ses dosyası oluşturamıyor.');
  stopAllSongs();
  const spb = 60 / song.bpm / 4;
  const steps = songSteps(song);
  const dur = steps.length * spb + 1.6; // son notaların sönmesi için pay
  const off = new OAC(2, Math.ceil(dur * sampleRate), sampleRate);
  const saved = { ctx, noiseBuf };
  try {
    ctx = off;
    noiseBuf = off.createBuffer(1, sampleRate, sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const bus = createBus(off);
    bus.apply(song);
    steps.forEach(({ s, pi }, i) => {
      if (pi < 0) return;
      const t = 0.05 + i * spb + (song.sw && s % 2 === 1 ? spb * 0.3 : 0);
      const P = song.pats[pi];
      if (!song.dm) SONG_DRUMS.forEach((dr, r) => bit(P.d[r], s) && playDrum(song.kit, dr.id, t, bus.drumIn));
      for (let k = 0; k < SONG_TRACKS; k++) {
        if (song.tr[k].m) continue;
        for (let r = 0; r < SONG_ROWS; r++) if (bit(P.t[k][r], s)) playNote(song.tr[k].i, noteFreq(song, r), t, bus.trackOut[k]);
      }
    });
  } finally {
    ctx = saved.ctx;
    noiseBuf = saved.noiseBuf;
  }
  return off.startRendering();
}

export function stopAllSongs() {
  if (active) active.stop();
}
export function audioNow() {
  return ctx ? ctx.currentTime : 0;
}
