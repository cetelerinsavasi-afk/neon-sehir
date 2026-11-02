// =============================================================================
// v92 — Beat Atölyesi ses motoru (Sixtagram "Şarkı Yap"). Tüm sesler Web Audio
// ile anında sentezlenir — ses dosyası yok. Hem düzenleyici (SongMaker) hem
// akıştaki oynatıcı (SongView) bu motoru kullanır; aynı şarkı her telefonda
// aynı çalar. Prototip "Beat Atölyesi"nin sesleri + v92 ekleri (Darbuka ve
// Arcade setleri; Bağlama, Yaylı, Çan, Pad; Hicaz/Nihavend; ton seçimi).
// =============================================================================
// v140 — uzun nota (pats[].l), 3 oktav, 5 kanal, 8 bölüm, yankı (rv), 15 yeni enstrüman.
import { SONG_DRUMS, SONG_STEPS, SONG_TRACKS, SONG_INSTS, SONG_ROW_V1_OFFSET, rowDegree, degreePitch, normalizeSong } from '../../functions/songData.js';

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

const BASE_HZ = 261.63;
const pitchHz = (semi) => BASE_HZ * Math.pow(2, semi / 12);
export function noteFreq(song, row) {
  return pitchHz(degreePitch(song.scale, rowDegree(row)) + (song.key || 0));
}
// akor enstrümanlarında tek kutu = ölçekten üçlü (1-3-5. derece)
function noteFreqs(song, inst, row) {
  if (!SONG_INSTS[inst]?.chord) return [noteFreq(song, row)];
  const j = rowDegree(row);
  return [0, 2, 4].map((o) => pitchHz(degreePitch(song.scale, j + o) + (song.key || 0)));
}
// eski (v1) şarkı gelirse çalmadan önce v2'ye çevir (aynı nesne için bir kez)
const normCache = new WeakMap();
function norm(song) {
  if (!song || typeof song !== 'object') return song;
  if (song.v === 2 && Array.isArray(song.pats?.[0]?.l)) return song;
  let n = normCache.get(song);
  if (!n) {
    n = normalizeSong(song);
    normCache.set(song, n);
  }
  return n;
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
  s.loop = true; // v140: uzun notalarda nefes / yay sesi 1 sn'den uzun sürebilir
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

// v140 — yankı: üretilmiş oda yanıtı (bağlam başına bir kez)
const irCache = new WeakMap();
function reverbIR(c) {
  let b = irCache.get(c);
  if (b) return b;
  const len = Math.floor(c.sampleRate * 2.4);
  const pre = Math.floor(c.sampleRate * 0.012);
  b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; // tiz kuyruğu yumuşat
      d[i] = lp * Math.pow(1 - x, 3.4) * (i < pre + 600 ? (i - pre) / 600 : 1);
    }
  }
  irCache.set(c, b);
  return b;
}
const curveCache = new WeakMap();
function driveCurve(amount) {
  let m = curveCache.get(ctx);
  if (!m) {
    m = {};
    curveCache.set(ctx, m);
  }
  if (!m[amount]) {
    const n = 2048;
    const cv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      cv[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    m[amount] = cv;
  }
  return m[amount];
}
// enstrüman başına yankı payı (şarkının "Yankı" ayarıyla çarpılır)
const INST_REV = {
  piyano: 0.5, synth: 0.4, bas: 0.04, gitar: 0.4, marimba: 0.5, org: 0.5, flut: 0.6, chip: 0.3, baglama: 0.45, yayli: 0.8, zil: 0.7, pad: 0.9,
  keman: 0.8, cello: 0.7, epiano: 0.6, koro: 0.9, ney: 0.85, kutu: 0.8, akorpiyano: 0.6, yayliakor: 0.9,
  supersaw: 0.55, pluck: 0.55, bas808: 0.03, acid: 0.15, egitar: 0.35, nefesli: 0.45, akorstab: 0.5,
};

// Bir çalma oturumu: master → kompresör → hoparlör; davul ve 5 kanal ayrı ses; ortak yankı
function createBus(c0 = null) {
  const c = c0 || ac();
  if (!c) return null;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  const master = c.createGain();
  master.gain.value = 0.72;
  master.connect(comp);
  comp.connect(c.destination);
  const verb = c.createConvolver();
  verb.buffer = reverbIR(c);
  const verbOut = c.createGain();
  verbOut.gain.value = 0.9;
  verb.connect(verbOut);
  verbOut.connect(master);
  const drumIn = c.createBiquadFilter();
  drumIn.type = 'lowpass';
  drumIn.frequency.value = 20000;
  const drumOut = c.createGain();
  drumIn.connect(drumOut);
  drumOut.connect(master);
  const drumSend = c.createGain();
  drumSend.gain.value = 0;
  drumOut.connect(drumSend);
  drumSend.connect(verb);
  const trackOut = [];
  const trackSend = [];
  for (let k = 0; k < SONG_TRACKS; k++) {
    const g = c.createGain();
    g.connect(master);
    const sg = c.createGain();
    sg.gain.value = 0;
    g.connect(sg);
    sg.connect(verb);
    trackOut.push(g);
    trackSend.push(sg);
  }
  return {
    master,
    drumIn,
    drumOut,
    trackOut,
    apply(song) {
      const rv = (song.rv ?? 25) / 100;
      drumIn.frequency.value = KITS[song.kit]?.lp || 20000;
      drumOut.gain.value = song.dm ? 0 : song.dv / 80;
      drumSend.gain.value = rv * 0.18;
      for (let k = 0; k < SONG_TRACKS; k++) {
        const t = song.tr[k];
        trackOut[k].gain.value = !t || t.m ? 0 : t.v / 100;
        trackSend[k].gain.value = t ? rv * (INST_REV[t.i] ?? 0.4) : 0;
      }
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

// --- v140: ortak yardımcılar ------------------------------------------------------------------
// Sürekli ses zarfı: atak → (bozulma) → sürdürme → bırakma. Döner: osilatörlerin durma anı
function adsr(g, t, { a = 0.01, d = 0.12, peak, sus = peak, end, r = 0.15 }) {
  const e = Math.max(end, t + a + 0.02);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (sus !== peak) g.gain.setTargetAtTime(Math.max(0.0001, sus), t + a, d / 3);
  g.gain.setTargetAtTime(0.0001, e, r / 5);
  return e + r * 1.3 + 0.05;
}
// titreşim (vibrato): gecikmeli başlar, frekans parametrelerine bağlanır
function vibrato(params, t, stopT, rate, depthHz, delay = 0.2) {
  const lfo = osc('sine', rate, t, stopT - t);
  const lg = ctx.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.setValueAtTime(0, t + delay);
  lg.gain.linearRampToValueAtTime(depthHz, t + delay + 0.35);
  lfo.connect(lg);
  params.forEach((p) => lg.connect(p));
}
function filt(type, freq, q = 0.7, gain = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  if (gain) f.gain.value = gain;
  return f;
}
function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[0];
}
const cents = (c) => Math.pow(2, c / 1200);
// pes enstrümanlar: duyulmayacak kadar alçak notayı oktav yukarı katla
function fold(f, lo, hi) {
  let x = f;
  while (x < lo) x *= 2;
  while (x > hi) x /= 2;
  return x;
}

// v140 — çalma: inst, freqs (akor için birden çok), t, çıkış, süre (sn), held = uzun nota
function playNote(inst, freqs, t, out, dur = 0.2, held = false) {
  if (freqs.length > 1) {
    const cg = ctx.createGain();
    cg.gain.value = inst === 'yayliakor' ? 0.65 : 0.55;
    cg.connect(out);
    const v = inst === 'akorpiyano' ? 'epiano' : inst === 'yayliakor' ? 'ensemble' : 'stab';
    freqs.forEach((f) => voice(v, f, t, cg, dur, held));
    if (inst === 'yayliakor') voice('ensemble', freqs[0] / 2, t, cg, dur, held);
    return;
  }
  voice(inst, freqs[0], t, out, dur, held);
}

function voice(inst, freq, t, out, dur, held) {
  let o;
  let o2;
  let o3;
  let g;
  let f;
  let g2;
  let stopT;
  if (inst === 'piyano') {
    const end = held ? t + dur + 0.6 : t + 0.9;
    o = osc('triangle', freq, t, end - t + 0.1);
    o2 = osc('sine', freq * 2, t, end - t + 0.1);
    g = ctx.createGain();
    env(g, t, 0.5, end, 0.004);
    g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(out);
  } else if (inst === 'synth') {
    const end = held ? t + dur : t + 0.3;
    stopT = held ? end + 0.2 : t + 0.5;
    o = osc('sawtooth', freq, t, stopT - t);
    o2 = osc('sawtooth', freq * 1.006, t, stopT - t);
    f = filt('lowpass', 3200, 4);
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(held ? 1200 : 500, t + 0.3);
    g = ctx.createGain();
    if (held) adsr(g, t, { a: 0.01, peak: 0.2, sus: 0.15, end, r: 0.15 });
    else env(g, t, 0.2, t + 0.42, 0.01);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(out);
  } else if (inst === 'bas') {
    const bf = fold(freq / 4, 28, 2000);
    stopT = held ? t + dur + 0.2 : t + 0.45;
    o = osc('square', bf, t, stopT - t);
    o2 = osc('sine', bf, t, stopT - t);
    f = filt('lowpass', 420, 2);
    g = ctx.createGain();
    if (held) adsr(g, t, { a: 0.006, peak: 0.55, sus: 0.45, end: t + dur, r: 0.1 });
    else env(g, t, 0.55, t + 0.38, 0.006);
    o.connect(f);
    f.connect(g);
    o2.connect(g);
    g.connect(out);
  } else if (inst === 'gitar') {
    const end = held ? t + dur + 0.35 : t + 0.8;
    o = osc('sawtooth', freq, t, end - t + 0.1);
    o2 = osc('triangle', freq, t, end - t + 0.1);
    f = filt('lowpass', 3000, 1);
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    g = ctx.createGain();
    env(g, t, 0.4, end, 0.002);
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
    stopT = held ? t + dur + 0.25 : t + 0.5;
    o = osc('sine', freq, t, stopT - t);
    o2 = osc('sine', freq * 2, t, stopT - t);
    o3 = osc('sine', freq * 3, t, stopT - t);
    g = ctx.createGain();
    if (held) adsr(g, t, { a: 0.015, peak: 0.3, end: t + dur, r: 0.12 });
    else {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.015);
      g.gain.setValueAtTime(0.3, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    }
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
    stopT = held ? t + dur + 0.3 : t + 0.6;
    o = osc('sine', freq * 2, t, stopT - t);
    const lfo = osc('sine', 5.5, t, stopT - t);
    const lg = ctx.createGain();
    lg.gain.value = 7;
    lfo.connect(lg);
    lg.connect(o.frequency);
    g = ctx.createGain();
    if (held) adsr(g, t, { a: 0.06, peak: 0.4, sus: 0.33, end: t + dur, r: 0.15 });
    else {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    }
    o.connect(g);
    g.connect(out);
    const n = noise(t, held ? dur : 0.4);
    f = filt('bandpass', freq * 4, 2);
    g2 = ctx.createGain();
    if (held) adsr(g2, t, { a: 0.04, peak: 0.12, sus: 0.05, end: t + dur, r: 0.1 });
    else env(g2, t, 0.12, t + 0.3, 0.04);
    n.connect(f);
    f.connect(g2);
    g2.connect(out);
  } else if (inst === 'baglama') {
    // bağlama: çift tel (hafif akort farkı), mızrap vuruşu, metalik parlak tını
    // v140: uzun notada tremolo (art arda mızrap) çalar
    const strokes = held ? Math.max(2, Math.round(dur / 0.11)) : 1;
    for (let k = 0; k < strokes; k++) {
      const tk = t + k * (held ? dur / strokes : 0);
      const last = k === strokes - 1;
      const len = held && !last ? dur / strokes + 0.08 : 0.75;
      const amp = k === 0 ? 1 : 0.85;
      [1, 1.004, 2.002].forEach((m, i) => {
        const oo = osc(i === 2 ? 'triangle' : 'sawtooth', freq * m, tk, len);
        const ff = filt('bandpass', freq * 6, 1.4);
        ff.frequency.setValueAtTime(freq * 6, tk);
        ff.frequency.exponentialRampToValueAtTime(freq * 2, tk + 0.3);
        const gg = ctx.createGain();
        env(gg, tk, (i === 2 ? 0.12 : 0.28) * amp, tk + len - 0.1, 0.001);
        oo.connect(ff);
        ff.connect(gg);
        gg.connect(out);
      });
      const n = noise(tk, 0.02);
      f = filt('highpass', 3500);
      g2 = ctx.createGain();
      env(g2, tk, 0.15 * amp, tk + 0.02);
      n.connect(f);
      f.connect(g2);
      g2.connect(out);
    }
  } else if (inst === 'yayli') {
    // yaylı: yavaş giriş, titreşimli üç testere
    stopT = held ? t + dur + 0.4 : t + 0.9;
    const vib = osc('sine', 5.2, t, stopT - t);
    const vg = ctx.createGain();
    vg.gain.value = freq * 0.006;
    vib.connect(vg);
    f = filt('lowpass', 2400);
    g = ctx.createGain();
    if (held) adsr(g, t, { a: 0.12, peak: 0.16, end: t + dur, r: 0.3 });
    else {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.12);
      g.gain.setValueAtTime(0.16, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    }
    [0.997, 1, 1.004].forEach((m) => {
      const oo = osc('sawtooth', freq * m, t, stopT - t);
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
    stopT = held ? t + dur + 0.8 : t + 1.25;
    f = filt('lowpass', 400, 2);
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(2200, t + 0.5);
    g = ctx.createGain();
    if (held) adsr(g, t, { a: 0.25, peak: 0.14, end: t + dur, r: 0.6 });
    else {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    }
    [0.5, 0.995, 1.005].forEach((m) => {
      const oo = osc(m === 0.5 ? 'triangle' : 'sawtooth', freq * m, t, stopT - t);
      oo.connect(f);
    });
    f.connect(g);
    g.connect(out);
  } else if (inst === 'keman' || inst === 'cello') {
    // v140 — keman / çello: yay atağı, gecikmeli vibrato, gövde rezonansı, hafif yay hışırtısı
    const vc = inst === 'cello';
    const fr = vc ? freq / 2 : freq;
    const end = t + Math.max(dur, vc ? 0.28 : 0.22);
    g = ctx.createGain();
    stopT = adsr(g, t, { a: vc ? 0.11 : 0.08, d: 0.2, peak: vc ? 0.2 : 0.15, sus: vc ? 0.17 : 0.125, end, r: vc ? 0.35 : 0.25 });
    const hp = filt('highpass', vc ? 60 : 180);
    const body1 = filt('peaking', vc ? 220 : 450, 1.2, 4);
    const body2 = filt('peaking', vc ? 900 : 2600, 1.4, 3);
    const lp = filt('lowpass', vc ? 2600 : 5200, 0.6);
    chain(hp, body1, body2, lp, g);
    g.connect(out);
    const freqParams = [];
    [-7, 0, 6].forEach((c) => {
      const oo = osc('sawtooth', fr * cents(c), t, stopT - t);
      freqParams.push(oo.frequency);
      oo.connect(hp);
    });
    vibrato(freqParams, t, stopT, vc ? 5 : 5.7, fr * (vc ? 0.005 : 0.0065), held ? 0.22 : 0.12);
    const n = noise(t, stopT - t);
    const nf = filt('bandpass', vc ? 1500 : 3200, 0.8);
    const ng = ctx.createGain();
    adsr(ng, t, { a: 0.03, d: 0.1, peak: 0.03, sus: 0.012, end, r: 0.15 });
    chain(n, nf, ng, out);
  } else if (inst === 'epiano') {
    // v140 — elektrik piyano (FM): sıcak gövde + vuruşta çan tınısı
    const end = held ? t + dur : t + 1.3;
    stopT = end + 0.45;
    const car = osc('sine', freq, t, stopT - t);
    const car2 = osc('sine', freq * 1.0025, t, stopT - t);
    const mod = osc('sine', freq, t, stopT - t);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(freq * 1.6, t);
    mg.gain.setTargetAtTime(freq * 0.2, t, 0.25);
    mod.connect(mg);
    mg.connect(car.frequency);
    mg.connect(car2.frequency);
    const tine = osc('sine', freq * 7.02, t, 0.3);
    const tg = ctx.createGain();
    env(tg, t, 0.05, t + 0.18, 0.001);
    tine.connect(tg);
    tg.connect(out);
    g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.004);
    g.gain.setTargetAtTime(0.0001, t + 0.004, held ? Math.max(0.6, dur * 0.8) : 0.55);
    g.gain.setTargetAtTime(0.0001, end, 0.08);
    const c2 = ctx.createGain();
    c2.gain.value = 0.5;
    car.connect(g);
    car2.connect(c2);
    c2.connect(g);
    g.connect(out);
  } else if (inst === 'koro') {
    // v140 — koro "aaa": testereler → üç formant süzgeci
    const fr = freq;
    const end = t + Math.max(dur, 0.3);
    g = ctx.createGain();
    stopT = adsr(g, t, { a: 0.28, d: 0.3, peak: 0.85, sus: 0.75, end, r: 0.5 });
    const mix = ctx.createGain();
    mix.gain.value = 1;
    [
      [730, 7, 1],
      [1090, 9, 0.55],
      [2440, 11, 0.3],
    ].forEach(([ff, q, a]) => {
      const bp = filt('bandpass', ff, q);
      const bg = ctx.createGain();
      bg.gain.value = a;
      mix.connect(bp);
      bp.connect(bg);
      bg.connect(g);
    });
    g.connect(out);
    const fp = [];
    [-9, -3, 3, 9].forEach((c) => {
      const oo = osc('sawtooth', fr * cents(c), t, stopT - t);
      fp.push(oo.frequency);
      oo.connect(mix);
    });
    vibrato(fp, t, stopT, 4.8, fr * 0.004, 0.3);
  } else if (inst === 'ney') {
    // v140 — ney: nefesli, perdeye kayarak giren, yumuşak titreşimli
    const end = t + Math.max(dur, 0.25);
    g = ctx.createGain();
    stopT = adsr(g, t, { a: 0.12, d: 0.2, peak: 0.42, sus: 0.34, end, r: 0.22 });
    o = osc('triangle', freq * 0.95, t, stopT - t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.1);
    o2 = osc('sine', freq * 2 * 0.95, t, stopT - t);
    o2.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.1);
    const h = ctx.createGain();
    h.gain.value = 0.15;
    const lp = filt('lowpass', 2200, 0.5);
    o.connect(lp);
    o2.connect(h);
    h.connect(lp);
    lp.connect(g);
    g.connect(out);
    vibrato([o.frequency, o2.frequency], t, stopT, 5, freq * 0.005, 0.25);
    const n = noise(t, stopT - t);
    const nf = filt('bandpass', freq * 2, 1.6);
    const ng = ctx.createGain();
    adsr(ng, t, { a: 0.05, d: 0.15, peak: 0.16, sus: 0.09, end, r: 0.2 });
    chain(n, nf, ng, out);
  } else if (inst === 'kutu') {
    // v140 — müzik kutusu: tiz, saf, uzun sönen tel
    const end = t + (held ? Math.max(1.6, dur + 0.6) : 1.6);
    [
      [2, 0.32, end],
      [4.01, 0.06, t + 0.5],
      [7.9, 0.04, t + 0.12],
    ].forEach(([m, a, e]) => {
      const oo = osc('sine', freq * m, t, e - t + 0.05);
      const gg = ctx.createGain();
      env(gg, t, a, e, 0.001);
      oo.connect(gg);
      gg.connect(out);
    });
  } else if (inst === 'ensemble') {
    // yaylı akor sesi: geniş, yumuşak yaylı topluluğu
    const end = t + Math.max(dur, 0.35);
    g = ctx.createGain();
    stopT = adsr(g, t, { a: 0.22, d: 0.3, peak: 0.12, sus: 0.1, end, r: 0.55 });
    const lp = filt('lowpass', 2800, 0.6);
    const hp = filt('highpass', 90);
    chain(hp, lp, g, out);
    const fp = [];
    [-10, 0, 9].forEach((c) => {
      const oo = osc('sawtooth', freq * cents(c), t, stopT - t);
      fp.push(oo.frequency);
      oo.connect(hp);
    });
    vibrato(fp, t, stopT, 5.3, freq * 0.004, 0.25);
  } else if (inst === 'supersaw' || inst === 'stab') {
    // v140 — süper saw: 5 dağıtılmış testere; stab = kısa, filtreli akor vuruşu
    const st = inst === 'stab';
    const end = held ? t + dur : t + (st ? Math.max(0.12, dur * 0.8) : Math.max(0.14, dur * 0.9));
    g = ctx.createGain();
    stopT = adsr(g, t, { a: 0.005, d: 0.15, peak: st ? 0.12 : 0.1, sus: st ? 0.07 : 0.08, end, r: st ? 0.12 : 0.2 });
    const lp = filt('lowpass', 7000, 1.2);
    lp.frequency.setValueAtTime(st ? 6500 : 7000, t);
    lp.frequency.setTargetAtTime(st ? 1500 : 3500, t + 0.01, st ? 0.08 : 0.25);
    const hp = filt('highpass', 140);
    chain(hp, lp, g, out);
    [-20, -9, 0, 8, 19].forEach((c) => osc('sawtooth', freq * cents(c), t, stopT - t).connect(hp));
  } else if (inst === 'pluck') {
    // v140 — pluck: dans müziği tınısı
    const end = held ? t + dur : t + 0.05;
    g = ctx.createGain();
    stopT = adsr(g, t, { a: 0.002, d: held ? 0.5 : 0.35, peak: 0.3, sus: held ? 0.1 : 0.0001, end, r: 0.25 });
    stopT = Math.max(stopT, t + 0.6);
    const lp = filt('lowpass', 5000, 7);
    lp.frequency.setValueAtTime(5500, t);
    lp.frequency.setTargetAtTime(380, t + 0.002, 0.07);
    chain(lp, g, out);
    osc('sawtooth', freq, t, stopT - t).connect(lp);
    o2 = osc('square', freq * 2 * 1.003, t, stopT - t);
    const sq = ctx.createGain();
    sq.gain.value = 0.35;
    chain(o2, sq, lp);
  } else if (inst === 'bas808') {
    // v140 — 808 bas: derin, hafif distorsiyonlu, vuruşta perde düşüşü
    const bf = fold(freq / 4, 36, 110);
    const end = held ? t + dur : t + 0.9;
    g = ctx.createGain();
    if (held) stopT = adsr(g, t, { a: 0.004, d: 0.4, peak: 0.6, sus: 0.45, end, r: 0.12 });
    else {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.004);
      g.gain.setTargetAtTime(0.0001, t + 0.004, 0.3);
      stopT = end + 0.1;
    }
    o = osc('sine', bf * 2.2, t, stopT - t);
    o.frequency.exponentialRampToValueAtTime(bf, t + 0.035);
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(2.5);
    const pre = ctx.createGain();
    pre.gain.value = 0.9;
    chain(o, pre, ws, g, out);
  } else if (inst === 'acid') {
    // v140 — acid bas (303): rezonanslı filtre süpürmesi
    const bf = fold(freq / 2, 45, 260);
    const end = held ? t + dur : t + Math.max(0.1, dur * 0.85);
    g = ctx.createGain();
    stopT = adsr(g, t, { a: 0.003, d: 0.15, peak: 0.22, sus: 0.17, end, r: 0.06 });
    const lp = filt('lowpass', 300, 13);
    lp.frequency.setValueAtTime(bf * 1.5, t);
    lp.frequency.linearRampToValueAtTime(Math.min(3200, bf * 22), t + 0.006);
    lp.frequency.setTargetAtTime(bf * 2.5, t + 0.006, 0.09);
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(1.8);
    chain(osc('sawtooth', bf, t, stopT - t), lp, ws, g, out);
  } else if (inst === 'egitar') {
    // v140 — elektro gitar: distorsiyonlu power chord (kök + beşli + oktav)
    const root = fold(freq / 2, 70, 330);
    const end = held ? t + dur : t + Math.max(0.12, dur * 0.92);
    g = ctx.createGain();
    stopT = adsr(g, t, { a: 0.003, d: 0.3, peak: 0.13, sus: 0.105, end, r: 0.09 });
    const pre = ctx.createGain();
    pre.gain.value = 0.6;
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(12);
    const hp = filt('highpass', 90);
    const mid = filt('peaking', 1500, 1, 4);
    const lp = filt('lowpass', 3600, 0.8);
    chain(pre, ws, hp, mid, lp, g, out);
    [1, 1.4983, 2].forEach((m, i) => {
      const oo = osc('sawtooth', root * m * (i === 1 ? cents(3) : 1), t, stopT - t);
      oo.connect(pre);
    });
  } else if (inst === 'nefesli') {
    // v140 — nefesli (brass): filtre açılarak giren, parlak, güçlü
    const end = held ? t + dur : t + Math.max(0.16, dur * 0.95);
    g = ctx.createGain();
    stopT = adsr(g, t, { a: 0.03, d: 0.15, peak: 0.2, sus: 0.16, end, r: 0.12 });
    const lp = filt('lowpass', 300, 1.5);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(3000, t + 0.05);
    lp.frequency.setTargetAtTime(1700, t + 0.05, 0.12);
    chain(lp, g, out);
    const fp = [];
    [
      [1, 0, 1],
      [1, 7, 0.8],
      [0.5, 0, 0.45],
    ].forEach(([m, c, a]) => {
      const oo = osc('sawtooth', freq * m * cents(c) * 0.98, t, stopT - t);
      oo.frequency.exponentialRampToValueAtTime(freq * m * cents(c), t + 0.04);
      fp.push(oo.frequency);
      const gg = ctx.createGain();
      gg.gain.value = a;
      chain(oo, gg, lp);
    });
    if (held) vibrato(fp, t, stopT, 5.5, freq * 0.004, 0.3);
  } else {
    // chip
    const cf = freq * 2;
    stopT = held ? t + dur + 0.08 : t + 0.3;
    o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(cf, t);
    o.frequency.setValueAtTime(cf * 1.25, t + 0.045);
    o.frequency.setValueAtTime(cf * 1.5, t + 0.09);
    if (held) o.frequency.setValueAtTime(cf, t + 0.135);
    o.start(t);
    o.stop(stopT);
    f = filt('lowpass', 6000);
    g = ctx.createGain();
    if (held) adsr(g, t, { a: 0.003, peak: 0.18, sus: 0.14, end: t + dur, r: 0.05 });
    else env(g, t, 0.18, t + 0.26, 0.003);
    o.connect(f);
    f.connect(g);
    g.connect(out);
  }
}

// bir adımda başlayan notaları çal (uzun notalar l maskesiyle tek ses olarak)
function playStep(song, P, s, t, spb, bus) {
  if (!song.dm) SONG_DRUMS.forEach((d, r) => bit(P.d[r], s) && playDrum(song.kit, d.id, t, bus.drumIn));
  for (let k = 0; k < song.tr.length; k++) {
    if (song.tr[k].m) continue;
    const rows = P.t[k];
    const ties = P.l?.[k];
    if (!rows) continue;
    for (let r = 0; r < rows.length; r++) {
      if (!bit(rows[r], s) || (ties && bit(ties[r], s))) continue;
      let len = 1;
      while (ties && s + len < SONG_STEPS && bit(ties[r], s + len)) len++;
      playNote(song.tr[k].i, noteFreqs(song, song.tr[k].i, r), t, bus.trackOut[k], len * spb, len > 1);
    }
  }
}

// --- önizleme (düzenleyicide kutuya dokununca) ------------------------------------------
let previewBus = null;
function pbus(song) {
  if (!ac()) return null;
  song = norm(song);
  if (!previewBus) previewBus = createBus();
  previewBus.apply(song);
  return previewBus;
}
export function previewDrum(song, row) {
  const b = pbus(song);
  if (!b) return;
  playDrum(song.kit, SONG_DRUMS[row].id, ctx.currentTime + 0.01, b.drumIn);
}
// v140: steps > 1 → uzun nota önizlemesi
export function previewNote(song, track, row, steps = 1) {
  const b = pbus(song);
  if (!b) return;
  const inst = song.tr[track].i;
  const spb = 60 / song.bpm / 4;
  playNote(inst, noteFreqs(song, inst, row), ctx.currentTime + 0.01, b.trackOut[track], Math.max(1, steps) * spb, steps > 1);
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
  const inst = song.tr[track].i;
  const o = SONG_ROW_V1_OFFSET;
  if (SONG_INSTS[inst]?.hold) {
    // uzun notaya uygun enstrüman: iki uzun nota
    [
      [o + 4, 0, 0.55],
      [o + 2, 0.6, 0.8],
    ].forEach(([r, dt, d]) => playNote(inst, noteFreqs(song, inst, r), t + dt, b.trackOut[track], d, true));
    return;
  }
  [o + 6, o + 4, o + 2, o].forEach((r, i) => playNote(inst, noteFreqs(song, inst, r), t + i * 0.16, b.trackOut[track], 0.15, false));
}

// --- sıralayıcı -----------------------------------------------------------------------------
// getSong(): o anki şarkı (düzenleyicide çalarken değişebilir)
// opts: { loop: true (düzenleyici) | false (akış: şarkı 1 kez / bölüm 4 tur),
//         onStep({s, bar, pi}), onEnd(), onStopped() — her durmada (bitiş, başka şarkı, stop) }
let active = null; // aynı anda tek çalan (akışta başka şarkı başlarsa öncekini durdurur)
export function songLength(song) {
  for (let i = (song.song || []).length - 1; i >= 0; i--) if (song.song[i] >= 0) return i + 1;
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
    const song = norm(getSong());
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
        pi = Math.min(song.cp || 0, song.pats.length - 1);
        if (!loop && rounds >= 4) {
          endAt = nextTime;
          break;
        }
      }
      const spb = 60 / song.bpm / 4;
      const t = nextTime + (song.sw && step % 2 === 1 ? spb * 0.3 : 0);
      if (pi >= 0 && song.pats[pi]) playStep(song, song.pats[pi], step, t, spb, bus);
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
export async function renderSong(song0, { sampleRate = 44100 } = {}) {
  const song = norm(song0);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) throw new Error('Bu cihaz ses dosyası oluşturamıyor.');
  stopAllSongs();
  const spb = 60 / song.bpm / 4;
  const steps = songSteps(song);
  const dur = steps.length * spb + 2.8; // son notaların ve yankının sönmesi için pay
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
      if (song.pats[pi]) playStep(song, song.pats[pi], s, t, spb, bus);
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

// v99.4 — Davul Seti eşyası: tek vuruş (ped). row = SONG_DRUMS sırası.
let hitBus = null;
export function hitDrum(row, volume = 0.6) {
  const d = SONG_DRUMS[row];
  if (!d || volume <= 0 || !ac()) return;
  if (!hitBus) hitBus = createBus();
  if (!hitBus) return;
  hitBus.drumOut.gain.value = Math.min(1.2, volume * 1.25);
  playDrum('rock', d.id, ctx.currentTime + 0.005, hitBus.drumIn);
}
